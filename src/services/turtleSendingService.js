const { Campaign, CampaignStat, Contact, Template } = require('../models');

class TurtleSendingService {
  constructor() {
    this.activeCampaigns = new Map(); // Track active turtle campaigns
    this.emailService = null; // Will be lazy-loaded
  }

  /**
   * Lazy load email service to avoid dependency issues
   */
  getEmailService() {
    if (!this.emailService) {
      try {
        this.emailService = require('./emailService');
      } catch (error) {
        console.warn('EmailService not available, using mock service:', error.message);
        // Mock email service for testing
        this.emailService = {
          send: async (options) => ({ MessageId: 'mock-' + Date.now() }),
          addUnsubscribeLink: (html, email, campaignId) => html + '\n<p>Unsubscribe link placeholder</p>'
        };
      }
    }
    return this.emailService;
  }

  /**
   * Start turtle sending process for a campaign
   * @param {Object} campaign - Campaign instance with associations
   */
  async startTurtleSending(campaign) {
    if (this.activeCampaigns.has(campaign.id)) {
      console.log(`Turtle sending already active for campaign ${campaign.id}`);
      return;
    }

    const emailsPerMinute = campaign.emailsPerMinute || 30;
    const delayBetweenEmails = (60 * 1000) / emailsPerMinute; // Convert to milliseconds
    
    console.log(`🐢 Starting turtle send for campaign ${campaign.id}: ${emailsPerMinute} emails/min`);
    
    // Mark as active
    this.activeCampaigns.set(campaign.id, {
      status: 'sending',
      startedAt: new Date(),
      emailsPerMinute
    });

    try {
      await this._processTurtleCampaign(campaign, delayBetweenEmails);
    } catch (error) {
      console.error(`Error in turtle sending for campaign ${campaign.id}:`, error);
      this.activeCampaigns.delete(campaign.id);
      
      // Update campaign status to stopped on error
      await campaign.update({ status: 'stopped' });
    }
  }

  /**
   * Stop turtle sending for a campaign
   * @param {string} campaignId - Campaign ID
   */
  async stopTurtleSending(campaignId) {
    if (this.activeCampaigns.has(campaignId)) {
      this.activeCampaigns.get(campaignId).status = 'stopped';
      console.log(`🛑 Stopping turtle send for campaign ${campaignId}`);
    }
  }

  /**
   * Check if a campaign is actively sending
   * @param {string} campaignId - Campaign ID
   * @returns {boolean}
   */
  isActivelySending(campaignId) {
    return this.activeCampaigns.has(campaignId) && 
           this.activeCampaigns.get(campaignId).status === 'sending';
  }

  /**
   * Get turtle sending status for a campaign
   * @param {string} campaignId - Campaign ID
   * @returns {Object|null}
   */
  getTurtleStatus(campaignId) {
    return this.activeCampaigns.get(campaignId) || null;
  }

  /**
   * Internal method to process turtle campaign
   * @private
   */
  async _processTurtleCampaign(campaign, delayBetweenEmails) {
    // Get pending recipients
    const pendingRecipients = await CampaignStat.findAll({
      where: { 
        campaignId: campaign.id, 
        sent: false 
      },
      include: [{ 
        model: Contact,
        as: 'contact',
        attributes: ['id', 'email', 'firstName', 'lastName']
      }],
      order: [['createdAt', 'ASC']]
    });

    console.log(`🐢 Processing ${pendingRecipients.length} pending emails for campaign ${campaign.id}`);

    for (let i = 0; i < pendingRecipients.length; i++) {
      const recipient = pendingRecipients[i];
      
      // Check if campaign was stopped
      const campaignStatus = this.activeCampaigns.get(campaign.id);
      if (!campaignStatus || campaignStatus.status === 'stopped') {
        console.log(`🛑 Campaign ${campaign.id} was stopped, halting turtle send`);
        break;
      }

      // Also check database status
      const currentCampaign = await Campaign.findByPk(campaign.id);
      if (currentCampaign.status === 'stopped') {
        console.log(`🛑 Campaign ${campaign.id} status changed to stopped in database`);
        this.activeCampaigns.get(campaign.id).status = 'stopped';
        break;
      }

      try {
        // Send email
        await this._sendTurtleEmail(recipient, campaign);
        
        // Update record as sent
        await recipient.update({ 
          sent: true, 
          sentAt: new Date() 
        });

        console.log(`✅ Sent email ${i + 1}/${pendingRecipients.length} for campaign ${campaign.id} to ${recipient.contact.email}`);
        
        // Wait before sending next email (except for the last one)
        if (i < pendingRecipients.length - 1) {
          await new Promise(resolve => setTimeout(resolve, delayBetweenEmails));
        }
        
      } catch (error) {
        console.error(`❌ Failed to send email to ${recipient.contact.email}:`, error);
        
        // Mark as bounced if send failed
        await recipient.update({ 
          bounced: true, 
          bouncedAt: new Date() 
        });
      }
    }

    // Check if campaign is complete
    const remainingCount = await CampaignStat.count({
      where: { campaignId: campaign.id, sent: false }
    });

    if (remainingCount === 0) {
      await campaign.update({ status: 'completed' });
      console.log(`🎉 Campaign ${campaign.id} completed via turtle sending`);
    }

    // Remove from active campaigns
    this.activeCampaigns.delete(campaign.id);
  }

  /**
   * Send individual turtle email with tracking
   * @private
   */
  async _sendTurtleEmail(recipient, campaign) {
    // Get template
    const template = await Template.findByPk(campaign.templateId);
    if (!template) {
      throw new Error(`Template ${campaign.templateId} not found`);
    }

    const contact = recipient.contact;
    
    // Generate tracking URLs
    const baseUrl = process.env.APP_URL || process.env.SERVER_URL || 'http://localhost:5000';
    const trackingPixelUrl = `${baseUrl}/api/tracking/open/${campaign.id}/${contact.id}`;
    const clickTrackingBase = `${baseUrl}/api/tracking/click/${campaign.id}/${contact.id}`;
    
    // Process template with contact data
    let emailContent = template.html || template.content || '';
    emailContent = emailContent
      .replace(/\{\{firstName\}\}/g, contact.firstName || '')
      .replace(/\{\{lastName\}\}/g, contact.lastName || '')
      .replace(/\{\{email\}\}/g, contact.email || '')
      .replace(/\{\{name\}\}/g, `${contact.firstName || ''} ${contact.lastName || ''}`.trim());

    // Add tracking pixel
    emailContent += `<img src="${trackingPixelUrl}" width="1" height="1" style="display:none;">`;
    
    // Replace links with click tracking
    emailContent = emailContent.replace(
      /<a\s+([^>]*?)href=["']([^"']+)["']([^>]*?)>/gi,
      `<a $1href="${clickTrackingBase}?url=$2"$3>`
    );

    // Add unsubscribe link
    const emailService = this.getEmailService();
    emailContent = emailService.addUnsubscribeLink(emailContent, contact.email, campaign.id);

    // Use campaign's sender information or fall back to environment variables
    const fromName = campaign.fromName || process.env.FROM_NAME || 'Gravity Point Media';
    const fromEmail = campaign.fromEmail || process.env.FROM_EMAIL || 'support@send.gravitypointmedia.com';
    const replyToEmail = campaign.replyToEmail || process.env.REPLY_TO_EMAIL || 'support@gravitypointmedia.com';

    // Send email
    const result = await emailService.send({
      to: contact.email,
      subject: campaign.subject,
      html: emailContent,
      from: `${fromName} <${fromEmail}>`,
      replyTo: replyToEmail
    });

    // If email service confirms delivery, update record
    if (result && result.MessageId) {
      await recipient.update({ 
        delivered: true, 
        deliveredAt: new Date() 
      });
    }

    return result;
  }
}

// Export singleton instance
module.exports = new TurtleSendingService();
