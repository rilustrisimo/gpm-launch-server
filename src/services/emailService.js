const AWS = require('aws-sdk');
const { createError } = require('../utils/error');
const crypto = require('crypto');

class EmailService {
  constructor() {
    this.ses = new AWS.SES({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      }
    });
  }

  /**
   * Generate an unsubscribe token
   * @param {string} email - Recipient email
   * @param {string} campaignId - Campaign ID
   * @returns {string} - Unsubscribe token
   */
  generateUnsubscribeToken(email, campaignId) {
    const data = `${email}:${campaignId}:${process.env.UNSUBSCRIBE_SECRET}`;
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Add unsubscribe link to HTML content
   * @param {string} html - Original HTML content
   * @param {string} email - Recipient email
   * @param {string} campaignId - Campaign ID
   * @returns {string} - HTML with unsubscribe link
   */
  addUnsubscribeLink(html, email, campaignId) {
    const token = this.generateUnsubscribeToken(email, campaignId);
    const unsubscribeUrl = `${process.env.WORKER_URL}/unsubscribe/${token}?email=${encodeURIComponent(email)}&campaignId=${encodeURIComponent(campaignId)}`;
    
    const unsubscribeHtml = `
      <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666;">
        <p>You’re receiving this email because we thought this tool might be useful. If you’d prefer not to receive future messages, you can <a href="${unsubscribeUrl}" style="color: #666;">unsubscribe here</a>.</p>
      </div>
    `;
    
    return html + unsubscribeHtml;
  }

  /**
   * Send an email using AWS SES
   * @param {Object} options - Email options
   * @param {string} options.to - Recipient email
   * @param {string} options.subject - Email subject
   * @param {string} options.html - HTML content
   * @param {string} options.text - Plain text content
   * @param {string} options.from - Sender email
   * @param {string} options.campaignId - Campaign ID for tracking
   * @param {string} options.contactId - Contact ID for tracking
   * @returns {Promise<Object>} - SES send result
   */
  async sendEmail({ to, subject, html, text, from, campaignId, contactId }) {
    try {
      // Add unsubscribe link with token - still needed for custom unsubscribe handling
      const enhancedHtml = this.addUnsubscribeLink(html, to, campaignId);

      // Create the message with AWS SES
      const params = {
        Source: from,
        Destination: {
          ToAddresses: [to]
        },
        Message: {
          Subject: {
            Data: subject,
            Charset: 'UTF-8'
          },
          Body: {
            Html: {
              Data: enhancedHtml,
              Charset: 'UTF-8'
            },
            Text: {
              Data: text || this.stripHtml(enhancedHtml),
              Charset: 'UTF-8'
            }
          }
        },
        // Configuration set must be set up in AWS SES with event publishing enabled
        ConfigurationSetName: process.env.AWS_SES_CONFIGURATION_SET,
        // Add tags for tracking which campaign and contact this email is associated with
        Tags: [
          {
            Name: 'campaignId',
            Value: campaignId || 'unknown'
          },
          {
            Name: 'contactId',
            Value: contactId || 'unknown'
          }
        ]
      };

      const result = await this.ses.sendEmail(params).promise();
      return result;
    } catch (error) {
      console.error('SES send error:', error);
      throw createError('Failed to send email', 500, error);
    }
  }

  /**
   * Strip HTML tags from content
   * @param {string} html - HTML content
   * @returns {string} - Plain text content
   */
  stripHtml(html) {
    return html.replace(/<[^>]*>/g, '');
  }

  /**
   * Verify an email address with SES
   * @param {string} email - Email to verify
   * @returns {Promise<Object>} - Verification result
   */
  async verifyEmail(email) {
    try {
      const params = {
        EmailAddress: email
      };
      const result = await this.ses.verifyEmailIdentity(params).promise();
      return result;
    } catch (error) {
      console.error('SES verify error:', error);
      throw createError('Failed to verify email', 500, error);
    }
  }

  /**
   * Get email sending statistics
   * @returns {Promise<Object>} - SES sending statistics
   */
  async getSendingStatistics() {
    try {
      const result = await this.ses.getSendStatistics().promise();
      return result;
    } catch (error) {
      console.error('SES stats error:', error);
      throw createError('Failed to get sending statistics', 500, error);
    }
  }
}

module.exports = new EmailService();