/**
 * AWS SES Service
 * Handles AWS SES operations like fetching verified identities
 */

const crypto = require('crypto');

class SESService {
  constructor() {
    this.awsRegion = process.env.AWS_REGION || 'us-east-1';
    this.awsAccessKeyId = process.env.AWS_ACCESS_KEY_ID;
    this.awsSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

    if (!this.awsAccessKeyId || !this.awsSecretAccessKey) {
      console.warn('WARNING: AWS credentials not configured for SES service');
    }
  }

  /**
   * Get list of verified email identities from AWS SES
   * @returns {Promise<Array>} Array of verified email addresses
   */
  async getVerifiedIdentities() {
    try {
      if (!this.awsAccessKeyId || !this.awsSecretAccessKey) {
        // Return default verified emails if no AWS credentials configured
        return [
          'support@send.gravitypointmedia.com',
          'info@manitomanita.com'
        ];
      }

      const service = 'ses';
      const host = `email.${this.awsRegion}.amazonaws.com`;
      const region = this.awsRegion;
      const accessKey = this.awsAccessKeyId;
      const secretKey = this.awsSecretAccessKey;

      // Create timestamp and date for AWS signature
      const now = new Date();
      const amzDate = now.toISOString().replace(/[:\-]|\.\d{3}/g, '');
      const dateStamp = amzDate.substr(0, 8);

      // Create the request payload for ListIdentities
      const payload = JSON.stringify({
        IdentityType: 'EmailAddress',
        MaxItems: 100
      });

      // Create canonical request
      const method = 'POST';
      const uri = '/';
      const queryString = '';
      const canonicalHeaders = `host:${host}\nx-amz-date:${amzDate}\nx-amz-target:AWSSimpleEmailServiceV2.ListEmailIdentities\n`;
      const signedHeaders = 'host;x-amz-date;x-amz-target';
      const payloadHash = this.sha256(payload);
      const canonicalRequest = `${method}\n${uri}\n${queryString}\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

      // Create string to sign
      const algorithm = 'AWS4-HMAC-SHA256';
      const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
      const stringToSign = `${algorithm}\n${amzDate}\n${credentialScope}\n${this.sha256(canonicalRequest)}`;

      // Calculate signature
      const signingKey = this.getSignatureKey(secretKey, dateStamp, region, service);
      const signature = this.hmacSha256Hex(signingKey, stringToSign);

      // Create authorization header
      const authorizationHeader = `${algorithm} Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

      // Make the request
      const fetch = (await import('node-fetch')).default;
      const response = await fetch(`https://${host}/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-amz-json-1.0',
          'X-Amz-Date': amzDate,
          'X-Amz-Target': 'AWSSimpleEmailServiceV2.ListEmailIdentities',
          'Authorization': authorizationHeader
        },
        body: payload
      });

      if (!response.ok) {
        console.error('AWS SES API error:', response.status, await response.text());
        // Return default emails if API call fails
        return [
          'support@send.gravitypointmedia.com',
          'info@manitomanita.com'
        ];
      }

      const data = await response.json();
      
      console.log('📧 AWS SES Response:', JSON.stringify(data, null, 2));
      
      // Extract email addresses from the response
      const identities = data.EmailIdentities || [];
      const emailAddresses = identities
        .filter(identity => identity.IdentityType === 'EMAIL_ADDRESS' && identity.VerificationStatus === 'SUCCESS')
        .map(identity => identity.IdentityName);

      console.log('✅ Verified emails from AWS:', emailAddresses);

      // Always include default emails if not present
      const defaultEmails = [
        'support@send.gravitypointmedia.com',
        'info@manitomanita.com'
      ];
      
      defaultEmails.forEach(email => {
        if (!emailAddresses.includes(email)) {
          emailAddresses.push(email);
        }
      });

      return emailAddresses;

    } catch (error) {
      console.error('Error fetching verified identities:', error);
      // Return default emails if there's an error
      return [
        'support@send.gravitypointmedia.com',
        'info@manitomanita.com'
      ];
    }
  }

  /**
   * Helper function to create SHA256 hash
   */
  sha256(message) {
    return crypto.createHash('sha256').update(message).digest('hex');
  }

  /**
   * Helper function to create HMAC SHA256
   */
  hmacSha256(key, message) {
    return crypto.createHmac('sha256', key).update(message).digest();
  }

  /**
   * Helper function to create HMAC SHA256 hex
   */
  hmacSha256Hex(key, message) {
    return crypto.createHmac('sha256', key).update(message).digest('hex');
  }

  /**
   * Helper function to create AWS signature key
   */
  getSignatureKey(key, dateStamp, regionName, serviceName) {
    const kDate = this.hmacSha256('AWS4' + key, dateStamp);
    const kRegion = this.hmacSha256(kDate, regionName);
    const kService = this.hmacSha256(kRegion, serviceName);
    const kSigning = this.hmacSha256(kService, 'aws4_request');
    return kSigning;
  }
}

module.exports = new SESService();
