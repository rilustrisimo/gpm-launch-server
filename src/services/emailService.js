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
    const unsubscribeUrl = `${process.env.TRACKING_URL}/unsubscribe/${token}?email=${encodeURIComponent(email)}`;
    
    const unsubscribeHtml = `
      <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666;">
        <p>If you no longer wish to receive these emails, you can <a href="${unsubscribeUrl}" style="color: #666;">unsubscribe here</a>.</p>
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
   * @param {string} options.trackingId - Unique tracking ID for this email
   * @param {string} options.campaignId - Campaign ID for unsubscribe functionality
   * @returns {Promise<Object>} - SES send result
   */
  async sendEmail({ to, subject, html, text, from, trackingId, campaignId }) {
    try {
      // Add tracking pixel to HTML content
      const trackingPixel = `<img src="${process.env.TRACKING_URL}/track/open/${trackingId}" width="1" height="1" alt="" />`;
      let enhancedHtml = html + trackingPixel;

      // Add unsubscribe link
      enhancedHtml = this.addUnsubscribeLink(enhancedHtml, to, campaignId);

      // Convert links to tracking links
      const enhancedHtmlWithTracking = this.addClickTracking(enhancedHtml, trackingId);

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
              Data: enhancedHtmlWithTracking,
              Charset: 'UTF-8'
            },
            Text: {
              Data: text || this.stripHtml(enhancedHtmlWithTracking),
              Charset: 'UTF-8'
            }
          }
        },
        ConfigurationSetName: process.env.AWS_SES_CONFIGURATION_SET
      };

      const result = await this.ses.sendEmail(params).promise();
      return result;
    } catch (error) {
      console.error('SES send error:', error);
      throw createError('Failed to send email', 500, error);
    }
  }

  /**
   * Add click tracking to all links in HTML content
   * @param {string} html - Original HTML content
   * @param {string} trackingId - Unique tracking ID
   * @returns {string} - HTML with tracking links
   */
  addClickTracking(html, trackingId) {
    return html.replace(
      /<a\s+(?:[^>]*?\s+)?href="([^"]*)"([^>]*)>/g,
      (match, url, attributes) => {
        // Don't track unsubscribe links
        if (url.includes('/unsubscribe/')) {
          return match;
        }
        const trackingUrl = `${process.env.TRACKING_URL}/track/click/${trackingId}?url=${encodeURIComponent(url)}`;
        return `<a href="${trackingUrl}"${attributes}>`;
      }
    );
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