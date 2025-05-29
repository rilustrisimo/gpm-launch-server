const { Campaign } = require('../models');
const { createError } = require('../utils/error');
const campaignService = require('./campaignService');

class SchedulerService {
  /**
   * Schedule a campaign for future sending
   * @param {string} campaignId - Campaign ID
   * @param {Date} scheduledFor - When to send the campaign
   * @returns {Promise<Campaign>} - Updated campaign
   */
  async scheduleCampaign(campaignId, scheduledFor) {
    try {
      const campaign = await Campaign.findByPk(campaignId);
      
      if (!campaign) {
        throw createError('Campaign not found', 404);
      }
      
      if (campaign.status !== 'draft') {
        throw createError('Only draft campaigns can be scheduled', 400);
      }
      
      // Update campaign with schedule
      await campaign.update({
        status: 'scheduled',
        scheduledFor
      });
      
      // Schedule the actual sending
      this.scheduleCampaignSending(campaignId, scheduledFor);
      
      return campaign;
    } catch (error) {
      if (error.status) throw error;
      throw createError('Failed to schedule campaign', 500, error);
    }
  }
  
  /**
   * Schedule the actual campaign sending
   * @param {string} campaignId - Campaign ID
   * @param {Date} scheduledFor - When to send
   */
  async scheduleCampaignSending(campaignId, scheduledFor) {
    const delay = scheduledFor.getTime() - Date.now();
    
    if (delay < 0) {
      throw createError('Cannot schedule campaign in the past', 400);
    }
    
    // Use setTimeout for scheduling
    setTimeout(async () => {
      try {
        await campaignService.sendCampaign(campaignId);
      } catch (error) {
        console.error('Error sending scheduled campaign:', error);
        // Update campaign status to failed
        await Campaign.update(
          { status: 'draft' },
          { where: { id: campaignId } }
        );
      }
    }, delay);
  }
  
  /**
   * Cancel a scheduled campaign
   * @param {string} campaignId - Campaign ID
   * @returns {Promise<Campaign>} - Updated campaign
   */
  async cancelScheduledCampaign(campaignId) {
    try {
      const campaign = await Campaign.findByPk(campaignId);
      
      if (!campaign) {
        throw createError('Campaign not found', 404);
      }
      
      if (campaign.status !== 'scheduled') {
        throw createError('Only scheduled campaigns can be cancelled', 400);
      }
      
      // Update campaign status back to draft
      await campaign.update({
        status: 'draft',
        scheduledFor: null
      });
      
      return campaign;
    } catch (error) {
      if (error.status) throw error;
      throw createError('Failed to cancel scheduled campaign', 500, error);
    }
  }
  
  /**
   * Get all scheduled campaigns
   * @returns {Promise<Campaign[]>} - List of scheduled campaigns
   */
  async getScheduledCampaigns() {
    try {
      return await Campaign.findAll({
        where: {
          status: 'scheduled'
        },
        order: [['scheduledFor', 'ASC']]
      });
    } catch (error) {
      throw createError('Failed to get scheduled campaigns', 500, error);
    }
  }
}

module.exports = new SchedulerService(); 