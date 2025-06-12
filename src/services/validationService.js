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
async function performDetailedSmtpCheck(email, mxRecord) {
  return new Promise((resolve) => {
    const timeout = 15000; // 15 second timeout
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
        error: 'SMTP_TIMEOUT'
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
                error: 'CONNECT_FAILED'
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
                error: 'EHLO_FAILED'
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
                error: 'MAIL_FROM_FAILED'
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
                error: null
              });
            } else {
              cleanup();
              clearTimeout(timeoutId);
              resolve({
                valid: false,
                response: response,
                step: 'rcpt_to',
                responses: responses,
                error: 'RCPT_TO_FAILED'
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
          error: 'PROCESSING_ERROR'
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
        error: 'SOCKET_ERROR'
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
        error: 'SOCKET_TIMEOUT'
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
        error: 'CONNECTION_CLOSED'
      });
    });
    
    // Start the connection
    try {
      socket.connect(25, mxRecord);
    } catch (error) {
      cleanup();
      clearTimeout(timeoutId);
      resolve({
        valid: false,
        response: `Connection failed: ${error.message}`,
        step: 'connect',
        responses: responses,
        error: 'CONNECTION_FAILED'
      });
    }
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
    'socket_error',
    'connection_closed',
    'connect_failed',
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
 * Validate a single email - Enhanced version with advanced SMTP risk classification
 */
exports.validateEmail = async (email) => {
  if (!email) {
    return {
      success: false,
      message: 'Email is required'
    };
  }

  try {
    // Basic syntax validation (lightweight check first)
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

    // Check for test emails (fast string check)
    const testPatterns = ['test', 'sample', 'example', 'demo', 'dummy', 'temp', 'fake'];
    if (testPatterns.some(pattern => email.toLowerCase().includes(pattern))) {
      return {
        success: false,
        isValid: false,
        reason: 'Test emails are not allowed'
      };
    }
    
    // Enhanced validation for known domains with detailed SMTP analysis
    if (knownDomains[normalizedDomain]) {
      try {
        // Get MX record for custom SMTP check
        const mxRecord = knownDomains[normalizedDomain][0];
        
        // Perform our custom detailed SMTP check
        const smtpResult = await performDetailedSmtpCheck(email, mxRecord);
        
        console.log(`Detailed SMTP validation result for known domain ${normalizedDomain}:`, smtpResult);

        // Classify SMTP response for risk assessment
        const smtpClassification = classifySmtpResponse(smtpResult);

        // For known domains, be more lenient but still classify risk
        if (smtpClassification.risk === 'high' && smtpClassification.classification === 'undeliverable') {
          return {
            success: false,
            isValid: false,
            reason: `Known domain but email undeliverable: ${smtpClassification.reason}`,
            riskLevel: smtpClassification.risk,
            classification: smtpClassification.classification,
            smtpDetails: smtpClassification.smtpDetails
          };
        }

        // For medium and low risk, mark as valid but include risk information
        return {
          success: true,
          isValid: true,
          status: 'Valid',
          reason: `Known domain: ${smtpClassification.reason}`,
          riskLevel: smtpClassification.risk,
          classification: smtpClassification.classification,
          smtpCheck: smtpResult.valid ? 'passed' : 'failed',
          smtpDetails: smtpClassification.smtpDetails
        };

      } catch (error) {
        // If SMTP check fails due to timeout/error, still accept known domains but mark as unknown risk
        return {
          success: true,
          isValid: true,
          status: 'Valid',
          reason: 'Known domain (SMTP check failed due to technical issues)',
          riskLevel: 'low',
          classification: 'unknown',
          smtpCheck: 'error',
          smtpError: error.message
        };
      }
    }

    // Enhanced validation for unknown domains (no SMTP - we use our custom implementation)
    const validationResult = await validate({
      email,
      validateRegex: false, // Already validated above
      validateMx: true,
      validateTypo: true,
      validateDisposable: true,
      validateSMTP: false   // Disabled - using our custom SMTP validation
    });

    // If basic validation passes, perform our custom SMTP check
    if (validationResult.valid) {
      try {
        // Get MX records for SMTP check
        const mxResult = await exports.validateMx(domain);
        
        if (mxResult.success && mxResult.mxRecord) {
          const smtpResult = await performDetailedSmtpCheck(email, mxResult.mxRecord);
          console.log(`Detailed SMTP validation result for unknown domain ${normalizedDomain}:`, smtpResult);
          
          const smtpClassification = classifySmtpResponse(smtpResult);
          
          // For unknown domains, reject medium and high-risk emails
          if (smtpClassification.risk === 'high' || 
              (smtpClassification.risk === 'medium' && smtpClassification.classification === 'risky')) {
            return {
              success: false,
              isValid: false,
              reason: `Email failed SMTP risk assessment: ${smtpClassification.reason}`,
              riskLevel: smtpClassification.risk,
              classification: smtpClassification.classification,
              smtpDetails: smtpClassification.smtpDetails
            };
          }

          // SMTP passed with acceptable risk
          return {
            success: true,
            isValid: true,
            status: 'Valid',
            reason: 'Email passed all validation checks including SMTP',
            riskLevel: smtpClassification.risk,
            classification: smtpClassification.classification,
            smtpCheck: smtpResult.valid ? 'passed' : 'failed',
            smtpDetails: smtpClassification.smtpDetails
          };
        } else {
          // No MX record found, but basic validation passed
          return {
            success: false,
            isValid: false,
            reason: 'No valid MX record found for domain',
            riskLevel: 'high',
            classification: 'undeliverable'
          };
        }
      } catch (error) {
        console.error('Custom SMTP validation error:', error);
        // If our SMTP check fails, fall back to basic validation result
        return {
          success: true,
          isValid: true,
          status: 'Valid',
          reason: 'Basic validation passed (SMTP check failed)',
          riskLevel: 'medium',
          classification: 'unknown',
          smtpCheck: 'error',
          smtpError: error.message
        };
      }
    }

    // For unknown domains, apply stricter validation
    if (!validationResult.valid) {
      const smtpClassification = classifySmtpResponse(validationResult);
      
      return {
        success: false,
        isValid: false,
        reason: validationResult.reason,
        riskLevel: smtpClassification.risk,
        classification: smtpClassification.classification,
        smtpDetails: smtpClassification.smtpDetails
      };
    }

    // If we reach here, basic validation passed but we already performed SMTP check above
    // This should not happen in the normal flow
    return {
      success: true,
      isValid: true,
      status: 'Valid',
      reason: 'Email passed basic validation checks',
      riskLevel: 'low',
      classification: 'deliverable'
    };

  } catch (error) {
    console.error('Email validation error:', error);
    return {
      success: false,
      isValid: false,
      reason: 'Email validation failed: ' + error.message,
      riskLevel: 'high',
      classification: 'error'
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