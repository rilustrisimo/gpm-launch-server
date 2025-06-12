const dns = require('dns');
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
  if (!validationResult || validationResult.valid) {
    return { risk: 'low', classification: 'deliverable', reason: 'SMTP validation passed' };
  }

  const reason = validationResult.reason?.toLowerCase() || '';
  const smtpResponse = validationResult.smtp?.response?.toLowerCase() || '';
  
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
  ];

  // Check for high-risk patterns
  for (const pattern of highRiskPatterns) {
    if (reason.includes(pattern) || smtpResponse.includes(pattern)) {
      return {
        risk: 'high',
        classification: 'undeliverable',
        reason: `High-risk SMTP response: ${pattern}`,
        smtpDetails: { response: smtpResponse, validationReason: reason }
      };
    }
  }

  // Check for medium-risk patterns
  for (const pattern of mediumRiskPatterns) {
    if (reason.includes(pattern) || smtpResponse.includes(pattern)) {
      return {
        risk: 'medium',
        classification: 'risky',
        reason: `Medium-risk SMTP response: ${pattern}`,
        smtpDetails: { response: smtpResponse, validationReason: reason }
      };
    }
  }

  // Check for low-risk patterns
  for (const pattern of lowRiskPatterns) {
    if (reason.includes(pattern) || smtpResponse.includes(pattern)) {
      return {
        risk: 'low',
        classification: 'unknown',
        reason: `Low-risk SMTP response: ${pattern}`,
        smtpDetails: { response: smtpResponse, validationReason: reason }
      };
    }
  }

  // Default to medium risk for unknown SMTP failures
  return {
    risk: 'medium',
    classification: 'risky',
    reason: `Unknown SMTP failure: ${reason}`,
    smtpDetails: { response: smtpResponse, validationReason: reason }
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
        // Perform comprehensive SMTP check for known domains
        const validationResult = await validate({
          email,
          validateRegex: false, // Already validated above
          validateMx: false,    // Skip MX - we know it's valid
          validateTypo: false,  // Skip typo check for known domains
          validateDisposable: false, // Skip disposable - known domains are trusted
          validateSMTP: true    // Detailed SMTP check
        });

        console.log(`SMTP validation result for known domain ${normalizedDomain}:`, validationResult);

        // Classify SMTP response for risk assessment
        const smtpClassification = classifySmtpResponse(validationResult);

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
          smtpCheck: validationResult.valid ? 'passed' : 'failed',
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

    // Enhanced validation for unknown domains with stricter SMTP analysis
    const validationResult = await validate({
      email,
      validateRegex: false, // Already validated above
      validateMx: true,
      validateTypo: true,
      validateDisposable: true,
      validateSMTP: true
    });

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

    // Additional SMTP risk assessment even for passed validation
    const smtpClassification = classifySmtpResponse(validationResult);

    // For unknown domains, reject medium and high-risk emails
    if (smtpClassification.risk === 'high' || 
        (smtpClassification.risk === 'medium' && smtpClassification.classification === 'risky')) {
      return {
        success: false,
        isValid: false,
        reason: `Email failed risk assessment: ${smtpClassification.reason}`,
        riskLevel: smtpClassification.risk,
        classification: smtpClassification.classification,
        smtpDetails: smtpClassification.smtpDetails
      };
    }

    // All checks passed with acceptable risk level
    return {
      success: true,
      isValid: true,
      status: 'Valid',
      reason: 'Email passed all validation checks',
      riskLevel: smtpClassification.risk,
      classification: smtpClassification.classification,
      smtpDetails: smtpClassification.smtpDetails
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