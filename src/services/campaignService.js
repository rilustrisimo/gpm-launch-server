// filepath: /Users/eyorsogood/Sites/launch.gravitypointmedia.com/server/src/services/campaignService.js
const { Campaign, ContactList, Template, Contact, CampaignStat } = require('../models');
const { Op } = require('sequelize');

/**
 * Campaign Service - Handles business logic for email campaigns and 
 * provides integration with Cloudflare Workers for scalable campaign processing
 */
class CampaignService {
  /**
   * Create a new campaign
   */
  async createCampaign(userId, campaignData) {
    try {
      // Create the campaign record in the database
      const campaign = await Campaign.create({
        userId,
        ...campaignData,
        status: 'draft'
      });
      
      return campaign;
    } catch (error) {
      throw createError('Failed to create campaign', 500, error);
    }
  }

  /**
   * Recalculate campaign stats from CampaignStat records and update the campaign
   */
  async recalculateCampaignStats(campaignId) {
    try {
      // Get all campaign stats for this campaign
      const stats = await CampaignStat.findAll({
        where: { campaignId }
      });

      // Calculate aggregated stats
      const sent = stats.filter(stat => stat.sent).length;
      const delivered = stats.filter(stat => stat.delivered).length;
      const opens = stats.filter(stat => stat.opened).length;
      const clicks = stats.filter(stat => stat.clicked).length;
      const bounces = stats.filter(stat => stat.bounced).length;

      // Get unsubscribes and complaints from contacts
      // We need to join with contacts to get unsubscribes and complaints
      // since these are tracked on the Contact model, not CampaignStat
      const contactIds = stats.map(stat => stat.contactId);
      const contacts = await Contact.findAll({
        where: {
          id: { [Op.in]: contactIds }
        }
      });

      const unsubscribes = contacts.filter(contact => contact.unsubscribed).length;
      const complaints = contacts.filter(contact => contact.hasComplained).length;

      // Calculate rates
      const openRate = sent > 0 ? (opens / sent) * 100 : 0;
      const clickRate = sent > 0 ? (clicks / sent) * 100 : 0;

      // Update the campaign with the calculated stats
      await Campaign.update({
        totalRecipients: stats.length,
        sent,
        delivered,
        opens,
        clicks,
        bounces,
        unsubscribes,
        complaints,
        openRate: Math.round(openRate * 100) / 100, // Round to 2 decimal places
        clickRate: Math.round(clickRate * 100) / 100
      }, {
        where: { id: campaignId }
      });

      return {
        totalRecipients: stats.length,
        sent,
        delivered,
        opens,
        clicks,
        bounces,
        unsubscribes,
        complaints,
        openRate,
        clickRate
      };
    } catch (error) {
      console.error('Error recalculating campaign stats:', error);
      throw createError('Failed to recalculate campaign stats', 500, error);
    }
  }

  /**
   * Get campaign by ID with up-to-date stats
   */
  async getCampaign(campaignId, userId) {
    try {
      const campaign = await Campaign.findOne({
        where: { id: campaignId, userId },
        include: [
          { model: Template, as: 'template' },
          { model: ContactList, as: 'contactList' }
        ]
      });
      
      if (!campaign) {
        throw createError('Campaign not found', 404);
      }
      
      // Recalculate and update stats from CampaignStat records
      await this.recalculateCampaignStats(campaignId);
      
      // Fetch the campaign again to get the updated stats
      const updatedCampaign = await Campaign.findOne({
        where: { id: campaignId, userId },
        include: [
          { model: Template, as: 'template' },
          { model: ContactList, as: 'contactList' }
        ]
      });
      
      return updatedCampaign;
    } catch (error) {
      if (error.status) throw error;
      throw createError('Failed to fetch campaign', 500, error);
    }
  }

  /**
   * Schedule a campaign for sending
   */
  async scheduleCampaign(campaignId, userId, scheduledFor) {
    try {
      const campaign = await this.getCampaign(campaignId, userId);
      
      if (['sending', 'completed'].includes(campaign.status)) {
        throw createError('Campaign already in progress or completed', 400);
      }
      
      await campaign.update({
        status: 'scheduled',
        scheduledFor
      });
      
      return campaign;
    } catch (error) {
      if (error.status) throw error;
      throw createError('Failed to schedule campaign', 500, error);
    }
  }

  /**
   * Send a campaign immediately or process a scheduled campaign
   * This integrates with the Cloudflare Worker
   */
  async sendCampaign(campaignId, userId) {
    try {
      const campaign = await this.getCampaign(campaignId, userId);
      
      if (campaign.status === 'sending') {
        throw createError('Campaign is already being sent', 400);
      }
      
      if (campaign.status === 'completed') {
        throw createError('Campaign has already been sent', 400);
      }
      
      // Update status to sending
      await campaign.update({ status: 'sending' });
      
      // Fetch all required data
      const contactList = await ContactList.findByPk(campaign.contactListId);
      if (!contactList) {
        throw createError('Contact list not found', 404);
      }
      
      const template = await Template.findByPk(campaign.templateId);
      if (!template) {
        throw createError('Template not found', 404);
      }
      
      // Fetch contacts for this list - only fresh ones
      const contacts = await this.getFreshContacts(campaign.contactListId);
      
      // Filter out unsubscribed contacts
      const activeContacts = await this.filterUnsubscribedContacts(contacts);
      
      // Create normalized campaign data for the worker
      const workerCampaignData = {
        id: campaign.id.toString(),
        name: campaign.name,
        subject: campaign.subject,
        template: {
          id: template.id,
          subject: template.subject,
          content: template.content
        },
        recipients: activeContacts.map(contact => ({
          id: contact.id,
          email: contact.email,
          firstName: contact.firstName,
          lastName: contact.lastName,
          customFields: contact.customFields
        }))
      };
      
      // Initialize the campaign in the worker
      const workerResponse = await this.initializeWorkerCampaign(
        campaign.id.toString(), 
        workerCampaignData
      );
      
      if (!workerResponse.ok) {
        throw createError('Failed to initialize worker campaign', 500);
      }
      
      // Start the campaign processing
      const startResponse = await this.startWorkerCampaign(campaign.id.toString());
      
      if (!startResponse.ok) {
        throw createError('Failed to start worker campaign', 500);
      }
      
      // The worker is now processing the campaign asynchronously.
      // We'll update the campaign status via webhooks or status polling.
      return { 
        success: true, 
        message: 'Campaign started successfully',
        stats: {
          totalContacts: contacts.length,
          activeContacts: activeContacts.length,
          unsubscribedContacts: contacts.length - activeContacts.length
        }
      };
    } catch (error) {
      // Roll back campaign status if there was an error
      if (campaignId) {
        const campaign = await Campaign.findByPk(campaignId);
        if (campaign && campaign.status === 'sending') {
          await campaign.update({ status: 'draft' });
        }
      }
      
      if (error.status) throw error;
      throw createError('Failed to send campaign', 500, error);
    }
  }

  /**
   * Get fresh contacts for a contact list (those with lastEngagement = NULL and status = 'active')
   * This ensures that when restarting a campaign, only previously unengaged contacts are sent
   */
  async getFreshContacts(contactListId) {
    try {
      // First verify the contact list exists
      const contactList = await ContactList.findByPk(contactListId);
      if (!contactList) {
        throw createError('Contact list not found', 404);
      }

      // Use Sequelize to find contacts with proper many-to-many filtering
      const freshContacts = await Contact.findAll({
        include: [{
          model: ContactList,
          as: 'lists',
          where: { id: contactListId },
          through: { 
            attributes: [] // Exclude junction table attributes from results
          }
        }],
        where: {
          [Op.and]: [
            { lastEngagement: { [Op.is]: null } },
            { status: 'active' }
          ]
        }
      });

      return freshContacts;
    } catch (error) {
      if (error.status) throw error;
      throw createError('Failed to fetch fresh contacts', 500, error);
    }
  }

  /**
   * Filter out unsubscribed contacts
   */
  async filterUnsubscribedContacts(contacts) {
    const workerUrl = process.env.WORKER_URL || 'https://worker.gravitypointmedia.com';
    const activeContacts = [];

    for (const contact of contacts) {
      try {
        const response = await fetch(`${workerUrl}/api/unsubscribe-status/${contact.email}`, {
          headers: {
            'Authorization': `Bearer ${process.env.WORKER_API_KEY}`
          }
        });

        if (!response.ok) {
          // If there's an error checking status, include the contact to be safe
          activeContacts.push(contact);
          continue;
        }

        const data = await response.json();
        if (!data.unsubscribed) {
          activeContacts.push(contact);
        }
      } catch (error) {
        console.error(`Error checking unsubscribe status for ${contact.email}:`, error);
        // Include the contact if there's an error checking status
        activeContacts.push(contact);
      }
    }

    return activeContacts;
  }

  /**
   * Check the status of a campaign being processed by a worker
   */
  async checkCampaignStatus(campaignId, userId) {
    try {
      const campaign = await this.getCampaign(campaignId, userId);
      
      if (campaign.status !== 'sending') {
        return { 
          status: campaign.status,
          campaign
        };
      }
      
      // Get worker status
      const workerStatus = await this.getWorkerCampaignStatus(campaignId.toString());
      
      if (!workerStatus.ok) {
        throw createError('Failed to get worker campaign status', 500);
      }
      
      const status = await workerStatus.json();
      
      // Update campaign in database if completed
      if (status.status === 'completed' && campaign.status !== 'completed') {
        const completedAt = status.stats.completedAt ? new Date(status.stats.completedAt) : new Date();
        
        await campaign.update({
          status: 'completed',
          sentAt: completedAt,
          clickRate: status.stats.clicked / status.stats.total * 100 || 0
        });
      }
      
      return {
        status: status.status,
        stats: status.stats,
        progress: status.progress,
        campaign
      };
    } catch (error) {
      if (error.status) throw error;
      throw createError('Failed to check campaign status', 500, error);
    }
  }
  
  /**
   * Integration methods for Cloudflare Workers
   */
  
  // Initialize a campaign in the worker
  async initializeWorkerCampaign(campaignId, campaignData) {
    const workerUrl = process.env.WORKER_URL || 'https://worker.gravitypointmedia.com';
    
    return fetch(`${workerUrl}/api/campaign/${campaignId}/initialize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.WORKER_API_KEY}`
      },
      body: JSON.stringify(campaignData)
    });
  }
  
  // Start processing a campaign
  async startWorkerCampaign(campaignId) {
    const workerUrl = process.env.WORKER_URL || 'https://worker.gravitypointmedia.com';
    
    return fetch(`${workerUrl}/api/campaign/${campaignId}/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.WORKER_API_KEY}`
      }
    });
  }
  
  // Get campaign status from worker
  async getWorkerCampaignStatus(campaignId) {
    const workerUrl = process.env.WORKER_URL || 'https://worker.gravitypointmedia.com';
    
    return fetch(`${workerUrl}/api/campaign/${campaignId}/status`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.WORKER_API_KEY}`
      }
    });
  }
}

// Add the missing createError function
function createError(message, status = 500, originalError = null) {
  const error = new Error(message);
  error.status = status;
  error.originalError = originalError;
  return error;
}

module.exports = new CampaignService();