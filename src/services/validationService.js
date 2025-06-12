const dns = require('dns');
const net = require('net');
const { promisify } = require('util');
const disposableEmailDomains = require('disposable-email-domains');
const { validate } = require('deep-email-validator');
const { Contact, ContactList } = require('../models');

// Promisify DNS functions
const resolveMx = promisify(dns.resolveMx);

// Configure DNS servers - using multiple reliable DNS providers
dns.setServers([
  '8.8.8.8',    // Google DNS
  '1.1.1.1',    // Cloudflare DNS
  '9.9.9.9',    // Quad9 DNS
  '208.67.222.222' // OpenDNS
]);

// Helper function to perform DNS lookup with retry
async function dnsLookupWithRetry(domain, retries = 3, timeout = 5000) {
  let lastError = null;
  
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      // Create a promise that resolves with DNS lookup result or rejects after timeout
      const result = await Promise.race([
        resolveMx(domain),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('DNS lookup timeout')), timeout)
        )
      ]);
      
      return result; // Return successful result
    } catch (error) {
      lastError = error;
      // If it's not the last attempt, try with a different DNS server
      if (attempt < retries - 1) {
        const currentServers = dns.getServers();
        // Rotate DNS servers for next attempt
        dns.setServers([...currentServers.slice(1), currentServers[0]]);
        await new Promise(resolve => setTimeout(resolve, 200)); // Small delay between retries
      }
    }
  }
  
  throw lastError; // All attempts failed
}

// Custom SMTP validation function for detailed responses
async function performDetailedSmtpCheck(email, mxRecord, port = 25, customTimeout = 5000) {
  return new Promise((resolve) => {
    const timeout = customTimeout;
    const [localPart, domain] = email.split('@');
    
    // Create socket connection
    const socket = new net.Socket();
    let responses = [];
    let currentStep = 'connect';
    let smtpResponse = '';
    
    const cleanup = () => {
      socket.removeAllListeners();
      if (socket.readable || socket.writable) {
        socket.destroy();
      }
    };
    
    const timeoutId = setTimeout(() => {
      cleanup();
      resolve({
        valid: false,
        response: 'Connection timeout',
        step: currentStep,
        responses: responses,
        error: 'SMTP_TIMEOUT',
        port: port
      });
    }, timeout);
    
    socket.setTimeout(timeout);
    
    socket.on('data', (data) => {
      const response = data.toString().trim();
      responses.push(`${currentStep}: ${response}`);
      smtpResponse = response;
      
      const responseCode = response.substring(0, 3);
      
      try {
        switch (currentStep) {
          case 'connect':
            if (responseCode === '220') {
              currentStep = 'ehlo';
              socket.write('EHLO validation.check\r\n');
            } else {
              cleanup();
              clearTimeout(timeoutId);
              resolve({
                valid: false,
                response: response,
                step: currentStep,
                responses: responses,
                error: 'CONNECT_FAILED',
                port: port
              });
            }
            break;
            
          case 'ehlo':
            if (responseCode === '250') {
              currentStep = 'mail_from';
              socket.write('MAIL FROM:<test@validation.check>\r\n');
            } else {
              cleanup();
              clearTimeout(timeoutId);
              resolve({
                valid: false,
                response: response,
                step: currentStep,
                responses: responses,
                error: 'EHLO_FAILED',
                port: port
              });
            }
            break;
            
          case 'mail_from':
            if (responseCode === '250') {
              currentStep = 'rcpt_to';
              socket.write(`RCPT TO:<${email}>\r\n`);
            } else {
              cleanup();
              clearTimeout(timeoutId);
              resolve({
                valid: false,
                response: response,
                step: currentStep,
                responses: responses,
                error: 'MAIL_FROM_FAILED',
                port: port
              });
            }
            break;
            
          case 'rcpt_to':
            currentStep = 'quit';
            socket.write('QUIT\r\n');
            
            // This is the critical response that tells us if the email exists
            if (responseCode === '250') {
              cleanup();
              clearTimeout(timeoutId);
              resolve({
                valid: true,
                response: response,
                step: 'rcpt_to',
                responses: responses,
                error: null,
                port: port
              });
            } else {
              cleanup();
              clearTimeout(timeoutId);
              resolve({
                valid: false,
                response: response,
                step: 'rcpt_to',
                responses: responses,
                error: 'RCPT_TO_FAILED',
                port: port
              });
            }
            break;
            
          case 'quit':
            cleanup();
            clearTimeout(timeoutId);
            // We already resolved in rcpt_to step
            break;
        }
      } catch (error) {
        cleanup();
        clearTimeout(timeoutId);
        resolve({
          valid: false,
          response: `Error processing response: ${error.message}`,
          step: currentStep,
          responses: responses,
          error: 'PROCESSING_ERROR',
          port: port
        });
      }
    });
    
    socket.on('error', (error) => {
      cleanup();
      clearTimeout(timeoutId);
      resolve({
        valid: false,
        response: `Socket error: ${error.message}`,
        step: currentStep,
        responses: responses,
        error: 'SOCKET_ERROR',
        port: port
      });
    });
    
    socket.on('timeout', () => {
      cleanup();
      clearTimeout(timeoutId);
      resolve({
        valid: false,
        response: 'Socket timeout',
        step: currentStep,
        responses: responses,
        error: 'SOCKET_TIMEOUT',
        port: port
      });
    });
    
    socket.on('close', () => {
      cleanup();
      clearTimeout(timeoutId);
      // If we reach here without resolving, it means connection was closed unexpectedly
      resolve({
        valid: false,
        response: 'Connection closed unexpectedly',
        step: currentStep,
        responses: responses,
        error: 'CONNECTION_CLOSED',
        port: port
      });
    });
    
    // Start the connection
    try {
      socket.connect(port, mxRecord);
    } catch (error) {
      cleanup();
      clearTimeout(timeoutId);
      resolve({
        valid: false,
        response: `Connection failed: ${error.message}`,
        step: 'connect',
        responses: responses,
        error: 'CONNECTION_FAILED',
        port: port
      });
    }
  });
}

// DNS-based email validation (checking for email-specific records)
async function performDnsEmailValidation(email, domain) {
  try {
    const [localPart] = email.split('@');
    
    // Check for SPF records (indicates the domain sends emails)
    const txtRecords = await new Promise((resolve, reject) => {
      dns.resolveTxt(domain, (err, records) => {
        if (err) resolve([]); // Don't fail on TXT lookup errors
        else resolve(records);
      });
    });
    
    const hasSPF = txtRecords.some(record => 
      record.join('').toLowerCase().includes('v=spf1')
    );
    
    const hasDMARC = txtRecords.some(record => 
      record.join('').toLowerCase().includes('v=dmarc1')
    );
    
    // Check for DKIM records (another email authentication method)
    const dkimSelectors = ['default', 'google', 'k1', 'selector1', 'selector2'];
    let hasDKIM = false;
    
    for (const selector of dkimSelectors) {
      try {
        await new Promise((resolve, reject) => {
          dns.resolveTxt(`${selector}._domainkey.${domain}`, (err, records) => {
            if (!err && records && records.length > 0) {
              hasDKIM = true;
            }
            resolve();
          });
        });
        if (hasDKIM) break;
      } catch (error) {
        // Continue checking other selectors
      }
    }
    
    return {
      hasSPF,
      hasDMARC,
      hasDKIM,
      emailCapable: hasSPF || hasDMARC || hasDKIM,
      score: (hasSPF ? 1 : 0) + (hasDMARC ? 1 : 0) + (hasDKIM ? 1 : 0)
    };
  } catch (error) {
    return {
      hasSPF: false,
      hasDMARC: false,
      hasDKIM: false,
      emailCapable: false,
      score: 0,
      error: error.message
    };
  }
}

// Check for catch-all email configuration
async function checkCatchAllEmail(domain, mxRecord) {
  try {
    // Try a random email address to see if the domain accepts all emails
    const randomEmail = `nonexistent-${Date.now()}@${domain}`;
    const result = await performDetailedSmtpCheck(randomEmail, mxRecord, 25, 3000);
    
    return {
      isCatchAll: result.valid,
      response: result.response,
      reliable: !result.valid // If catch-all is false, SMTP validation is more reliable
    };
  } catch (error) {
    return {
      isCatchAll: false,
      response: error.message,
      reliable: true,
      error: true
    };
  }
}

// Alternative SMTP validation using different ports (587, 465)
async function tryAlternativeSmtpPorts(email, mxRecord) {
  const ports = [587, 465, 2525]; // Common alternative SMTP ports
  
  for (const port of ports) {
    try {
      const result = await performDetailedSmtpCheck(email, mxRecord, port, 3000); // 3s timeout for alternatives
      if (result.valid) {
        return {
          ...result,
          alternativePort: port,
          method: 'alternative_smtp'
        };
      }
    } catch (error) {
      // Continue to next port
      continue;
    }
  }
  
  return null; // No alternative ports worked
}

// Enhanced email syntax and pattern validation
function performAdvancedEmailValidation(email) {
  const [localPart, domain] = email.split('@');
  
  // Check for suspicious patterns that might indicate fake emails
  const suspiciousPatterns = [
    /^\d+$/, // Only numbers
    /^[a-z]$/, // Single character
    /^.{1,2}$/, // Too short (1-2 chars)
    /^.{65,}$/, // Too long (65+ chars)
    /\.{2,}/, // Multiple consecutive dots
    /^\./, // Starts with dot
    /\.$/, // Ends with dot
    /[+]{2,}/, // Multiple plus signs
    /[-]{3,}/, // Multiple consecutive hyphens
  ];
  
  const localPartIsSuspicious = suspiciousPatterns.some(pattern => pattern.test(localPart));
  
  return {
    valid: !localPartIsSuspicious,
    localPart,
    domain,
    suspicious: localPartIsSuspicious,
    reason: localPartIsSuspicious ? 'Suspicious email pattern detected' : 'Advanced validation passed'
  };
}

// Fallback validation for environments with SMTP restrictions
async function performFallbackValidation(email, validationResult) {
  const domain = email.split('@')[1].toLowerCase();
  
  // First, perform advanced email pattern validation
  const advancedValidation = performAdvancedEmailValidation(email);
  if (!advancedValidation.valid) {
    return {
      valid: false,
      risk: 'high',
      reason: 'SUSPICIOUS_PATTERN',
      response: advancedValidation.reason,
      fallback: true
    };
  }
  
  // Check if it's a known major provider
  const majorProviders = [
    'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'live.com',
    'icloud.com', 'aol.com', 'protonmail.com', 'me.com', 'mac.com',
    'msn.com', 'comcast.net', 'verizon.net', 'att.net', 'sbcglobal.net'
  ];
  
  if (majorProviders.includes(domain)) {
    // For major providers, if basic validation passes, try alternative SMTP ports first
    if (validationResult.valid && 
        validationResult.validators.regex.valid && 
        validationResult.validators.mx.valid && 
        validationResult.validators.disposable.valid) {
      
      // Try alternative SMTP validation methods
      try {
        const mxRecord = await exports.validateMx(domain);
        if (mxRecord.success) {
          // First, try alternative SMTP ports
          const alternativeResult = await tryAlternativeSmtpPorts(email, mxRecord.mxRecord);
          if (alternativeResult && alternativeResult.valid) {
            return {
              valid: true,
              risk: 'low',
              reason: 'ALTERNATIVE_SMTP_SUCCESS',
              response: `Validated via port ${alternativeResult.alternativePort}`,
              fallback: true,
              method: alternativeResult.method
            };
          }
          
          // If alternative SMTP fails, try DNS-based validation
          const dnsValidation = await performDnsEmailValidation(email, domain);
          if (dnsValidation.emailCapable && dnsValidation.score >= 2) {
            return {
              valid: true,
              risk: 'medium',
              reason: 'DNS_EMAIL_CAPABLE',
              response: `Domain has email capabilities (SPF: ${dnsValidation.hasSPF}, DMARC: ${dnsValidation.hasDMARC}, DKIM: ${dnsValidation.hasDKIM})`,
              fallback: true,
              method: 'dns_validation',
              dnsScore: dnsValidation.score
            };
          }
        }
      } catch (error) {
        // Alternative methods failed, continue to basic fallback
      }
      
      // If alternative SMTP fails, use basic validation with higher risk
      return {
        valid: true,
        risk: 'medium', // Higher risk since we couldn't verify mailbox existence
        reason: 'MAJOR_PROVIDER_BASIC_FALLBACK',
        response: `${domain} is major provider but mailbox existence unverified`,
        fallback: true,
        warning: 'Mailbox existence not verified due to SMTP restrictions'
      };
    }
  }
  
  // For other domains, require stricter validation or fail
  return {
    valid: false,
    risk: 'high',
    reason: 'SMTP_REQUIRED',
    response: 'SMTP validation required for unknown domain',
    fallback: true
  };
}

// Check if SMTP port 25 is accessible
async function testSmtpConnectivity() {
  return new Promise((resolve) => {
    const socket = net.createConnection(25, 'gmail-smtp-in.l.google.com');
    const timeout = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, 3000);
    
    socket.on('connect', () => {
      clearTimeout(timeout);
      socket.destroy();
      resolve(true);
    });
    
    socket.on('error', () => {
      clearTimeout(timeout);
      resolve(false);
    });
  });
}

// Check for common domains with known MX records
const knownDomains = {
  // Google services
  'gmail.com': ['aspmx.l.google.com'],
  'googlemail.com': ['aspmx.l.google.com'],
  'google.com': ['aspmx.l.google.com'],
  
  // Microsoft services
  'hotmail.com': ['hotmail-com.olc.protection.outlook.com'],
  'outlook.com': ['outlook-com.olc.protection.outlook.com'],
  'live.com': ['live-com.olc.protection.outlook.com'],
  'msn.com': ['msn-com.olc.protection.outlook.com'],
  'microsoft.com': ['microsoft-com.mail.protection.outlook.com'],
  'office365.com': ['office365-com.mail.protection.outlook.com'],
  
  // Yahoo services
  'yahoo.com': ['mta7.am0.yahoodns.net', 'mta6.am0.yahoodns.net'],
  'yahoo.co.uk': ['mta6.am0.yahoodns.net'],
  'yahoo.co.in': ['mta5.am0.yahoodns.net'],
  'yahoo.ca': ['mta7.am0.yahoodns.net'],
  'yahoo.com.au': ['mta7.am0.yahoodns.net'],
  'ymail.com': ['mta7.am0.yahoodns.net'],
  'rocketmail.com': ['mta6.am0.yahoodns.net'],
  
  // Apple services
  'icloud.com': ['mx1.mail.icloud.com'],
  'me.com': ['mx1.mail.icloud.com'],
  'mac.com': ['mx1.mail.icloud.com'],
  'apple.com': ['mail-in.apple.com'],
  
  // Other major providers
  'aol.com': ['mx.aol.com'],
  'comcast.net': ['mx1.comcast.net'],
  'att.net': ['mx1.att.mail.gq1.yahoo.com'],
  'verizon.net': ['mx.verizon.yahoo.com'],
  'protonmail.com': ['mail.protonmail.ch'],
  'pm.me': ['mail.protonmail.ch'],
  'zoho.com': ['mx.zoho.com'],
  'gmx.com': ['mx00.gmx.com'],
  'gmx.net': ['mx00.gmx.net'],
  'mail.com': ['mx00.mail.com'],
  'fastmail.com': ['in1-smtp.messagingengine.com'],
  'yandex.com': ['mx.yandex.ru'],
  'yandex.ru': ['mx.yandex.ru'],
  
  // Workforce email providers
  'ibm.com': ['mx0a-001b2d01.pphosted.com'],
  'oracle.com': ['mx1.oraclemail.com'],
  'salesforce.com': ['mx.salesforce.com'],
  'sap.com': ['mx.sap.mail.onmicrosoft.com'],
  'adobe.com': ['adobe-com.mail.protection.outlook.com'],
  
  // ISP emails
  'cox.net': ['coxmail.com'],
  'charter.net': ['charter.net'],
  'earthlink.net': ['mx.earthlink.net'],
  'sbcglobal.net': ['mx.att.mail.gq1.yahoo.com'],
  'bellsouth.net': ['mx.att.mail.gq1.yahoo.com'],
  'sky.com': ['mx.sky.com'],
  'btinternet.com': ['mail.bt.lon5.cpcloud.co.uk'],
  'telus.net': ['mx.telus.net'],
  'rogers.com': ['mx.rogers.com'],
  
  // Telecommunications companies
  't-online.de': ['mx00.t-online.de'],
  'orange.fr': ['mxrel1.orange.fr'],
  'free.fr': ['mx1.free.fr'],
  'wanadoo.fr': ['mxrel1.orange.fr'],
  'sfr.fr': ['mx.sfr.fr'],
  'telefonica.es': ['mx.telefonica.es'],
  'o2.co.uk': ['mx.o2.co.uk'],
  
  // Educational domains
  'edu': ['aspmx.l.google.com'],  // Many educational institutions use Google
  'ac.uk': ['aspmx.l.google.com'], // UK academic institutions
};

/**
 * Check MX records for a domain
 */
exports.validateMx = async (domain) => {
  if (!domain) {
    return {
      success: false,
      message: 'Domain is required'
    };
  }
  
  // Normalize domain to lowercase
  const normalizedDomain = domain.toLowerCase();
  
  // Check if it's a known domain with reliable MX records
  if (knownDomains[normalizedDomain]) {
    return {
      success: true,
      mxRecord: knownDomains[normalizedDomain][0],
      note: 'Using cached MX record for known domain'
    };
  }

  try {
    // Use enhanced DNS lookup with retry
    const mxRecords = await dnsLookupWithRetry(normalizedDomain);
    
    if (!mxRecords || mxRecords.length === 0) {
      return {
        success: false,
        message: 'No MX records found'
      };
    }

    // Sort by priority (lowest first) and return the primary MX record
    mxRecords.sort((a, b) => a.priority - b.priority);
    
    return {
      success: true,
      mxRecord: mxRecords[0].exchange
    };
  } catch (error) {
    // Handle common error cases
    const errorCode = error.code || '';
    let errorMessage = error.message || 'Unknown error';
    let success = false;
    
    // Special handling for common domains even if DNS lookup fails
    if (normalizedDomain.endsWith('gmail.com') || 
        normalizedDomain.endsWith('yahoo.com') || 
        normalizedDomain.endsWith('hotmail.com') ||
        normalizedDomain.endsWith('outlook.com') ||
        normalizedDomain.endsWith('icloud.com')) {
      return {
        success: true,
        mxRecord: `assumed-mx-for-${normalizedDomain}`,
        note: 'Assuming valid MX for major email provider despite lookup issues'
      };
    }
    
    // Specific error handling
    if (errorCode === 'ENOTFOUND' || errorCode === 'NXDOMAIN') {
      errorMessage = 'Domain not found or invalid';
    } else if (errorCode === 'ETIMEOUT' || errorMessage.includes('timeout')) {
      // For timeout errors on domains that look valid, we might want to give benefit of doubt
      if (/\.[a-z]{2,}$/.test(normalizedDomain)) { // Check if domain has a valid TLD pattern
        success = true;
        errorMessage = `DNS timeout, but domain looks valid: ${normalizedDomain}`;
        return {
          success: true,
          mxRecord: `assumed-mx-for-${normalizedDomain}`,
          note: 'Assuming valid due to DNS timeout on potentially valid domain'
        };
      } else {
        errorMessage = `DNS lookup timeout for ${normalizedDomain}`;
      }
    }

    return {
      success,
      message: `MX lookup failed: ${errorMessage}`
    };
  }
};

/**
 * Check if email already exists in the same list
 */
exports.checkDuplicate = async (email, listId) => {
  if (!email) {
    return {
      success: false,
      message: 'Email is required'
    };
  }

  try {
    // Use Sequelize to check for duplicates in the same list
    const existingContact = await Contact.findOne({
      where: { email },
      include: [{
        model: ContactList,
        as: 'lists',
        where: listId ? { id: listId } : {},
        required: listId ? true : false
      }]
    });

    return {
      success: true,
      isDuplicate: !!existingContact
    };
  } catch (error) {
    console.error('Duplicate check error:', error);
    return {
      success: false,
      message: 'Failed to check for duplicate email'
    };
  }
};

// Helper function to classify SMTP response and determine risk level
function classifySmtpResponse(validationResult) {
  if (!validationResult) {
    return { risk: 'high', classification: 'error', reason: 'No SMTP validation result' };
  }

  if (validationResult.valid) {
    return { risk: 'low', classification: 'deliverable', reason: 'SMTP validation passed' };
  }

  const reason = validationResult.reason?.toLowerCase() || '';
  const smtpResponse = validationResult.response?.toLowerCase() || '';
  const error = validationResult.error || '';
  
  // High-risk responses that should be marked as invalid
  const highRiskPatterns = [
    'user unknown',
    'user not found',
    'no such user',
    'recipient unknown',
    'invalid recipient',
    'mailbox not found',
    'mailbox unavailable',
    'address rejected',
    'user does not exist',
    'no mailbox here',
    'account disabled',
    'account suspended',
    'mailbox disabled',
    'recipient rejected',
    '550 5.1.1', // User unknown
    '550 5.4.1', // Recipient address rejected
    '551 5.1.1', // User not local
    '553 5.1.2', // Address rejected
    'rcpt_to_failed', // Our custom error
  ];

  // Medium-risk responses that are risky but might be temporary
  const mediumRiskPatterns = [
    'mailbox full',
    'quota exceeded',
    'insufficient storage',
    'over quota',
    'mailbox temporarily disabled',
    'try again later',
    'temporary failure',
    'deferred',
    'greylist',
    'rate limit',
    'too many recipients',
    '450 4.2.2', // Mailbox full
    '452 4.2.2', // Insufficient storage
    '421 4.2.1', // Service not available
    'ehlo_failed',
    'mail_from_failed',
  ];

  // Low-risk responses that might indicate delivery issues but email exists
  const lowRiskPatterns = [
    'timeout',
    'connection refused',
    'network unreachable',
    'dns',
    'mx record',
    'service unavailable',
    'connection timeout',
    'smtp timeout',
    'smtp_timeout',
    'socket_timeout',
    'connection_closed',
    'connect_failed',
  ];

  // High-risk socket and connection errors (moved from low-risk)
  const highRiskConnectionPatterns = [
    'socket_error',
    'enotfound',
    'getaddrinfo enotfound',
  ];

  // Check for high-risk patterns
  for (const pattern of highRiskPatterns) {
    if (reason.includes(pattern) || smtpResponse.includes(pattern) || error.toLowerCase().includes(pattern)) {
      return {
        risk: 'high',
        classification: 'undeliverable',
        reason: `High-risk SMTP response: ${pattern}`,
        smtpDetails: { 
          response: smtpResponse, 
          validationReason: reason,
          error: error,
          step: validationResult.step,
          responses: validationResult.responses
        }
      };
    }
  }

  // Check for high-risk connection patterns
  for (const pattern of highRiskConnectionPatterns) {
    if (reason.includes(pattern) || smtpResponse.includes(pattern) || error.toLowerCase().includes(pattern)) {
      return {
        risk: 'high',
        classification: 'undeliverable',
        reason: `High-risk connection error: ${pattern}`,
        smtpDetails: { 
          response: smtpResponse, 
          validationReason: reason,
          error: error,
          step: validationResult.step,
          responses: validationResult.responses
        }
      };
    }
  }

  // Check for medium-risk patterns
  for (const pattern of mediumRiskPatterns) {
    if (reason.includes(pattern) || smtpResponse.includes(pattern) || error.toLowerCase().includes(pattern)) {
      return {
        risk: 'medium',
        classification: 'risky',
        reason: `Medium-risk SMTP response: ${pattern}`,
        smtpDetails: { 
          response: smtpResponse, 
          validationReason: reason,
          error: error,
          step: validationResult.step,
          responses: validationResult.responses
        }
      };
    }
  }

  // Check for low-risk patterns
  for (const pattern of lowRiskPatterns) {
    if (reason.includes(pattern) || smtpResponse.includes(pattern) || error.toLowerCase().includes(pattern)) {
      return {
        risk: 'low',
        classification: 'unknown',
        reason: `Low-risk SMTP response: ${pattern}`,
        smtpDetails: { 
          response: smtpResponse, 
          validationReason: reason,
          error: error,
          step: validationResult.step,
          responses: validationResult.responses
        }
      };
    }
  }

  // Default to medium risk for unknown SMTP failures
  return {
    risk: 'medium',
    classification: 'risky',
    reason: `Unknown SMTP failure: ${reason || error || 'Unknown error'}`,
    smtpDetails: { 
      response: smtpResponse, 
      validationReason: reason,
      error: error,
      step: validationResult.step,
      responses: validationResult.responses
    }
  };
}

/**
 * Validate a single email - STRICT VERSION: Always check mailbox existence via SMTP
 */
exports.validateEmail = async (email) => {
  if (!email) {
    return {
      success: false,
      message: 'Email is required'
    };
  }

  try {
    // STEP 1: Basic syntax validation (lightweight check first)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return {
        success: false,
        isValid: false,
        reason: 'Invalid email format'
      };
    }

    const [localPart, domain] = email.split('@');
    const normalizedDomain = domain.toLowerCase();

    // STEP 2: Check for obvious test/fake emails (immediate rejection)
    const testPatterns = [
      /test.*test/i,           // test123test, testtest, etc.
      /sample.*email/i,        // sample.email, sampleemail
      /example\.(com|org|net)/i, // example.com, example.org domains
      /demo.*@/i,              // demo emails
      /dummy.*@/i,             // dummy emails  
      /temp.*@/i,              // temp emails
      /fake.*@/i,              // fake emails
      /noreply@/i,             // noreply emails
      /no-reply@/i             // no-reply emails
    ];
    
    if (testPatterns.some(pattern => pattern.test(email))) {
      return {
        success: false,
        isValid: false,
        reason: 'Test or system emails are not allowed'
      };
    }

    // STEP 3: Get MX record (use cached for known domains, lookup for unknown)
    let mxRecord = null;
    let isKnownDomain = false;
    
    if (knownDomains[normalizedDomain]) {
      // Known domain - use cached MX but still validate the mailbox
      mxRecord = knownDomains[normalizedDomain][0];
      isKnownDomain = true;
      console.log(`Using cached MX record for known domain ${normalizedDomain}: ${mxRecord}`);
    } else {
      // Unknown domain - perform full MX lookup and basic validation
      console.log(`Performing MX lookup for unknown domain: ${normalizedDomain}`);
      
      try {
        const mxResult = await exports.validateMx(normalizedDomain);
        
        if (!mxResult.success) {
          return {
            success: false,
            isValid: false,
            reason: `No valid MX record found: ${mxResult.message}`,
            riskLevel: 'high',
            classification: 'undeliverable',
            step: 'mx_validation'
          };
        }
        
        mxRecord = mxResult.mxRecord;
        
        // For unknown domains, also do basic validation (disposable, typo checks)
        const basicValidation = await validate({
          email,
          validateRegex: false, // Already validated above
          validateMx: false,    // We already did MX validation above
          validateTypo: true,
          validateDisposable: true,
          validateSMTP: false   // We'll do our own SMTP validation
        });

        if (!basicValidation.valid) {
          return {
            success: false,
            isValid: false,
            reason: basicValidation.reason || 'Failed basic validation',
            riskLevel: 'medium',
            classification: 'risky',
            step: 'basic_validation'
          };
        }
        
      } catch (error) {
        return {
          success: false,
          isValid: false,
          reason: `MX validation failed: ${error.message}`,
          riskLevel: 'high',
          classification: 'error',
          step: 'mx_validation'
        };
      }
    }

    // STEP 4: MANDATORY SMTP MAILBOX CHECK - NO EXCEPTIONS
    console.log(`🔍 Performing MANDATORY SMTP mailbox check for ${email} using MX: ${mxRecord}`);
    
    let smtpResult = null;
    let smtpClassification = null;
    
    try {
      // Always perform detailed SMTP check to verify mailbox existence
      smtpResult = await performDetailedSmtpCheck(email, mxRecord, 25, 8000); // 8 second timeout
      console.log(`SMTP validation result for ${email}:`, {
        valid: smtpResult.valid,
        error: smtpResult.error,
        response: smtpResult.response,
        step: smtpResult.step
      });
      
      // Classify the SMTP response for risk assessment
      smtpClassification = classifySmtpResponse(smtpResult);
      
    } catch (error) {
      console.error(`SMTP check failed for ${email}:`, error);
      smtpResult = {
        valid: false,
        error: 'SMTP_CHECK_ERROR',
        response: error.message,
        step: 'smtp_error'
      };
      smtpClassification = {
        risk: 'high',
        classification: 'error',
        reason: `SMTP check failed: ${error.message}`
      };
    }

    // STEP 5: Handle SMTP results - TRY ALTERNATIVE METHODS IF PRIMARY FAILS
    if (!smtpResult.valid) {
      const connectivityIssue = (
        smtpResult.error === 'SMTP_TIMEOUT' || 
        smtpResult.error === 'CONNECTION_FAILED' || 
        smtpResult.error === 'SOCKET_TIMEOUT' || 
        smtpResult.error === 'CONNECTION_CLOSED' ||
        smtpResult.error === 'SOCKET_ERROR'
      );
      
      if (connectivityIssue) {
        console.log(`⚠️  Primary SMTP failed for ${email}, trying alternative methods...`);
        
        // Try alternative SMTP ports (587, 465, 2525)
        try {
          const alternativeResult = await tryAlternativeSmtpPorts(email, mxRecord);
          if (alternativeResult && alternativeResult.valid) {
            console.log(`✅ Alternative SMTP port ${alternativeResult.alternativePort} succeeded for ${email}`);
            return {
              success: true,
              isValid: true,
              status: 'Valid',
              reason: `Mailbox verified via alternative SMTP port ${alternativeResult.alternativePort}`,
              riskLevel: 'low',
              classification: 'deliverable',
              smtpCheck: 'alternative_port_success',
              smtpDetails: {
                port: alternativeResult.alternativePort,
                response: alternativeResult.response,
                method: alternativeResult.method
              }
            };
          }
        } catch (altError) {
          console.log(`❌ Alternative SMTP ports also failed for ${email}`);
        }
        
        // Try DNS-based email capability check (SPF, DMARC, DKIM)
        try {
          const dnsValidation = await performDnsEmailValidation(email, normalizedDomain);
          console.log(`DNS validation for ${email}:`, dnsValidation);
          
          if (dnsValidation.emailCapable && dnsValidation.score >= 2) {
            console.log(`✅ DNS validation succeeded for ${email} with score ${dnsValidation.score}/3`);
            
            // STRICT VALIDATION: Reject ALL domains (known or unknown) without SMTP verification
            console.log(`❌ Rejecting ${email} - requires SMTP mailbox verification but connectivity failed (DNS score: ${dnsValidation.score}/3)`);
            return {
              success: false,
              isValid: false,
              reason: `Mailbox verification required but SMTP connectivity failed (DNS score: ${dnsValidation.score}/3)`,
              riskLevel: 'high',
              classification: 'unknown',
              smtpCheck: 'verification_required',
              dnsValidation: dnsValidation,
              domainType: isKnownDomain ? 'known' : 'unknown'
            };
          }
        } catch (dnsError) {
          console.log(`❌ DNS validation also failed for ${email}`);
        }
        
        // Final decision: STRICT VALIDATION - Reject ALL domains without SMTP verification
        console.log(`❌ Rejecting ${email} (${isKnownDomain ? 'known' : 'unknown'} domain) - mailbox verification required but failed`);
        return {
          success: false,
          isValid: false,
          reason: `Mailbox verification required but SMTP connectivity failed`,
          riskLevel: 'high',
          classification: 'unknown',
          smtpCheck: 'verification_required',
          domainType: isKnownDomain ? 'known' : 'unknown',
          smtpDetails: {
            error: smtpResult.error,
            response: smtpResult.response,
            step: smtpResult.step
          }
        };
      } else {
        // SMTP failed with definitive negative response (user not found, etc.)
        console.log(`❌ SMTP returned definitive negative response for ${email}`);
        return {
          success: false,
          isValid: false,
          reason: `Mailbox does not exist: ${smtpClassification.reason}`,
          riskLevel: smtpClassification.risk,
          classification: smtpClassification.classification,
          smtpCheck: 'mailbox_not_found',
          smtpDetails: smtpClassification.smtpDetails
        };
      }
    }

    // STEP 6: SMTP validation succeeded - verify risk level
    if (smtpResult.valid && smtpClassification.risk === 'low') {
      console.log(`✅ SMTP validation passed for ${email} - mailbox exists and is deliverable`);
      return {
        success: true,
        isValid: true,
        status: 'Valid',
        reason: `Mailbox verified and confirmed deliverable: ${smtpClassification.reason}`,
        riskLevel: smtpClassification.risk,
        classification: smtpClassification.classification,
        smtpCheck: 'verified_deliverable',
        smtpDetails: smtpClassification.smtpDetails
      };
    } else if (smtpResult.valid && smtpClassification.risk === 'medium') {
      // STRICT VALIDATION: Reject ALL emails with medium risk SMTP responses
      console.log(`❌ Rejecting ${email} (${isKnownDomain ? 'known' : 'unknown'} domain) due to medium risk SMTP response`);
      return {
        success: false,
        isValid: false,
        reason: `Medium risk SMTP response indicates delivery concerns: ${smtpClassification.reason}`,
        riskLevel: smtpClassification.risk,
        classification: smtpClassification.classification,
        smtpCheck: 'delivery_concerns',
        domainType: isKnownDomain ? 'known' : 'unknown',
        smtpDetails: smtpClassification.smtpDetails
      };
    } else {
      // SMTP validation passed but risk is high
      console.log(`❌ Rejecting ${email} due to high risk SMTP response`);
      return {
        success: false,
        isValid: false,
        reason: `High risk SMTP response: ${smtpClassification.reason}`,
        riskLevel: smtpClassification.risk,
        classification: smtpClassification.classification,
        smtpCheck: 'high_risk',
        smtpDetails: smtpClassification.smtpDetails
      };
    }

  } catch (error) {
    console.error('Email validation error:', error);
    return {
      success: false,
      isValid: false,
      reason: 'Email validation failed due to technical error: ' + error.message,
      riskLevel: 'high',
      classification: 'error',
      step: 'validation_error'
    };
  }
};

/**
 * Batch validate multiple emails
 */
exports.validateBatch = async (emails, listId) => {
  if (!Array.isArray(emails)) {
    return {
      success: false,
      message: 'Emails array is required'
    };
  }

  console.log('Starting batch validation with listId:', listId);
  console.log('Number of emails to validate:', emails.length);

  try {
    const results = await Promise.all(
      emails.map(async (email) => {
        try {
          // Check for duplicates in the same list
          const duplicateCheck = await exports.checkDuplicate(email, listId);

          if (duplicateCheck.success && duplicateCheck.isDuplicate) {
            return {
              email,
              success: false,
              isValid: false,
              reason: 'Email already exists in the system'
            };
          }

          // Validate email format and other checks
          const result = await exports.validateEmail(email);

          return {
            email,
            ...result
          };
        } catch (error) {
          console.error('Error validating email:', email, error);
          return {
            email,
            success: false,
            isValid: false,
            reason: error.message
          };
        }
      })
    );

    const validCount = results.filter(r => r.isValid).length;
    const invalidCount = results.filter(r => !r.isValid).length;
    console.log('Batch validation complete:', {
      total: results.length,
      valid: validCount,
      invalid: invalidCount
    });

    return {
      success: true,
      results
    };
  } catch (error) {
    console.error('Batch validation error:', error);
    return {
      success: false,
      message: 'Batch validation failed: ' + error.message
    };
  }
};

// Export the connectivity test for external use
exports.testSmtpConnectivity = testSmtpConnectivity;

// Export performance fallback validation for external use  
exports.performFallbackValidation = performFallbackValidation;