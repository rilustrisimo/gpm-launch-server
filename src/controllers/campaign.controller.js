const { Campaign, Template, ContactList, CampaignStat, Contact, User, sequelize } = require('../models');
const { Op } = require('sequelize');
const { validationResult } = require('express-validator');
const schedulerService = require('../services/schedulerService');
const axios = require('axios');

// Worker configuration
const WORKER_URL = process.env.WORKER_URL || 'https://worker.gravitypointmedia.com';
const WORKER_API_KEY = process.env.WORKER_API_KEY;
const MAX_RETRIES = 3; // Maximum retry attempts for worker communication
const RETRY_DELAY = 1000; // Delay between retries in milliseconds

if (!WORKER_API_KEY) {
  console.error('WARNING: WORKER_API_KEY environment variable is not set!');
}

// Helper function to make authenticated requests to the worker
const workerClient = axios.create({
  baseURL: WORKER_URL,
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${WORKER_API_KEY}`
  },
  validateStatus: function (status) {
    return status < 500; // Resolve only if the status code is less than 500
  }
});

/**
 * Execute a worker API call with retry logic
 * @param {Function} apiCall - The API call function to execute
 * @param {string} operation - Name of operation for logging
 * @param {number} maxRetries - Maximum number of retry attempts
 * @returns {Promise} - API response
 */
const executeWithRetry = async (apiCall, operation, maxRetries = MAX_RETRIES) => {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      console.log(`${operation}: Attempt ${attempt + 1}/${maxRetries + 1}`);
      const response = await apiCall();
      
      // Check for unsuccessful response
      if (response.data && !response.data.success) {
        const errorMessage = response.data.message || `HTTP ${response.status}: ${response.statusText || 'Unknown error'}`;
        console.warn(`${operation} returned non-success: ${errorMessage}`);
        
        // If this was the last attempt, throw an error
        if (attempt === maxRetries) {
          throw new Error(`Operation '${operation}' failed after ${maxRetries + 1} attempts: ${errorMessage}`);
        }
      } else {
        // Success, return the response
        return response;
      }
    } catch (error) {
      lastError = error;
      console.warn(`${operation} attempt ${attempt + 1} failed: ${error.message}`);
      
      // If this was the last attempt, rethrow the error
      if (attempt === maxRetries) {
        throw new Error(`Operation '${operation}' failed after ${maxRetries + 1} attempts: ${error.message}`);
      }
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
    }
  }
  
  // This should never be reached due to the throw in the loop, but just in case
  throw lastError;
};

/**
 * Helper function to prepare campaign data for worker
 * @param {Object} campaign - Campaign model instance with associations loaded
 * @returns {Object} - Formatted campaign data for worker
 */
const prepareCampaignDataForWorker = (campaign) => {
  if (!campaign || !campaign.template || !campaign.contactList) {
    throw new Error('Campaign data incomplete');
  }

  return {
    id: campaign.id,
    name: campaign.name,
    subject: campaign.subject,
    template: {
      id: campaign.template.id,
      subject: campaign.subject || campaign.template.subject,
      content: campaign.template.html || campaign.template.content
    },
    recipients: (campaign.contactList.contacts || []).map(contact => ({
      id: contact.id,
      email: contact.email,
      firstName: contact.firstName,
      lastName: contact.lastName,
      metadata: contact.metadata || {}
    })),
    status: 'initialized',
    initializedAt: new Date().toISOString()
  };
};

// Get all campaigns
exports.getCampaigns = async (req, res) => {
  try {
    const { status, search } = req.query;
    const { page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    
    let whereClause = { userId: req.user.id };
    
    // Filter by status if provided
    if (status && status !== 'all') {
      whereClause.status = status;
    }
    
    // Filter by search term if provided
    if (search) {
      whereClause.name = { [Op.like]: `%${search}%` };
    }

    // Use findAndCountAll to get both the rows and total count
    const { count, rows: campaigns } = await Campaign.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: Template,
          as: 'template',
          attributes: ['id', 'name']
        },
        {
          model: ContactList,
          as: 'contactList',
          attributes: ['id', 'name', 'count']
        }
      ],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']]
    });

    return res.status(200).json({
      success: true,
      campaigns,
      total: count,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Get campaigns error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error retrieving campaigns',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get campaign by ID
exports.getCampaign = async (req, res) => {
  try {
    const campaign = await Campaign.findOne({ 
      where: { 
        id: req.params.id,
        userId: req.user.id
      },
      include: [
        {
          model: Template,
          as: 'template',
          attributes: { exclude: ['createdAt', 'updatedAt'] }
        },
        {
          model: ContactList,
          as: 'contactList',
          attributes: { exclude: ['createdAt', 'updatedAt'] }
        }
      ]
    });

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found'
      });
    }      // If campaign is active or completed, fetch real-time stats from the worker
    if (['processing', 'sending', 'completed', 'stopped'].includes(campaign.status)) {
      try {
        // Get status with retry mechanism
        const workerResponse = await executeWithRetry(
          () => workerClient.get(`/api/campaign/${campaign.id}/status`),
          `Fetch status for campaign ${campaign.id}`,
          1 // Only retry once for status checks to avoid delay
        );
        
        if (workerResponse.data && workerResponse.data.success) {
          // Merge worker stats with campaign data
          campaign.dataValues.workerStats = workerResponse.data.stats;
          campaign.dataValues.workerStatus = workerResponse.data.status;
          campaign.dataValues.progress = workerResponse.data.progress;
          
          // Synchronize status if different
          if (
            workerResponse.data.status && 
            workerResponse.data.status !== campaign.status && 
            ['sending', 'processing', 'completed', 'stopped'].includes(workerResponse.data.status)
          ) {
            // Update local database to match worker status
            console.log(`Synchronizing campaign status from worker: ${campaign.status} -> ${workerResponse.data.status}`);
            await campaign.update({ status: workerResponse.data.status });
          }
        }
      } catch (workerError) {
        console.error('Worker stats fetch error:', workerError);
        // Continue with local data if worker is unavailable
      }
    }

    return res.status(200).json({
      success: true,
      campaign
    });
  } catch (error) {
    console.error('Get campaign error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error retrieving campaign',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Create a new campaign
exports.createCampaign = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const transaction = await sequelize.transaction();

  try {
    const { name, subject, templateId, contactListId, scheduledFor } = req.body;

    // Check if template exists and belongs to user
    const template = await Template.findOne({
      where: {
        id: templateId,
        userId: req.user.id
      }
    });

    if (!template) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Template not found or access denied'
      });
    }

    // Check if contact list exists and belongs to user
    const contactList = await ContactList.findOne({
      where: {
        id: contactListId,
        userId: req.user.id
      }
    });

    if (!contactList) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Contact list not found or access denied'
      });
    }

    // Create campaign - use status values compatible with worker
    const campaign = await Campaign.create({
      userId: req.user.id,
      name,
      subject,
      templateId,
      contactListId,
      totalRecipients: contactList.count,
      status: scheduledFor ? 'scheduled' : 'draft',
      scheduledFor: scheduledFor || null
    }, { transaction });

    // Update template usage data
    await template.update({
      usageCount: template.usageCount + 1,
      lastUsed: new Date()
    }, { transaction });

    await transaction.commit();

    return res.status(201).json({
      success: true,
      message: 'Campaign created successfully',
      campaign
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Create campaign error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error creating campaign',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Update a campaign
exports.updateCampaign = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const transaction = await sequelize.transaction();

  try {
    const { name, subject, templateId, contactListId, scheduledFor, status } = req.body;

    // Check if campaign exists and belongs to user
    const campaign = await Campaign.findOne({
      where: {
        id: req.params.id,
        userId: req.user.id
      }
    });

    if (!campaign) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Campaign not found or access denied'
      });
    }

    // Don't allow editing of completed campaigns
    if (campaign.status === 'completed') {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Cannot edit a completed campaign'
      });
    }

    // Check if template exists and belongs to user if changed
    if (templateId && templateId !== campaign.templateId) {
      const template = await Template.findOne({
        where: {
          id: templateId,
          userId: req.user.id
        }
      });

      if (!template) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: 'Template not found or access denied'
        });
      }

      // Update template usage data
      await template.update({
        usageCount: template.usageCount + 1,
        lastUsed: new Date()
      }, { transaction });
    }

    // Check if contact list exists and belongs to user if changed
    if (contactListId && contactListId !== campaign.contactListId) {
      const contactList = await ContactList.findOne({
        where: {
          id: contactListId,
          userId: req.user.id
        }
      });

      if (!contactList) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: 'Contact list not found or access denied'
        });
      }

      // Update recipient count
      req.body.totalRecipients = contactList.count;
    }

    // Update campaign
    const updatedCampaign = await campaign.update({
      name: name || campaign.name,
      subject: subject || campaign.subject,
      templateId: templateId || campaign.templateId,
      contactListId: contactListId || campaign.contactListId,
      totalRecipients: req.body.totalRecipients || campaign.totalRecipients,
      status: status || campaign.status,
      scheduledFor: scheduledFor !== undefined ? scheduledFor : campaign.scheduledFor
    }, { transaction });

    await transaction.commit();

    // If campaign is being updated and was previously active, stop it in the worker
    if (['processing', 'sending', 'scheduled'].includes(campaign.status)) {
      try {
        // Stop the campaign in the worker
        await executeWithRetry(
          () => workerClient.post(`/api/campaign/${updatedCampaign.id}/stop`),
          `Stop campaign ${updatedCampaign.id} for update`
        );
        
        // Update campaign status to stopped
        await updatedCampaign.update({
          status: 'stopped'
        });
        
        console.log(`Campaign ${updatedCampaign.id} stopped due to update`);
      } catch (workerError) {
        console.warn('Worker stop campaign failed during update:', workerError.message);
        // Even if worker stop fails, we still set the campaign to stopped status
        await updatedCampaign.update({
          status: 'stopped'
        });
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Campaign updated successfully',
      campaign: updatedCampaign
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Update campaign error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error updating campaign',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Delete a campaign
exports.deleteCampaign = async (req, res) => {
  try {
    const campaign = await Campaign.findOne({
      where: {
        id: req.params.id,
        userId: req.user.id
      }
    });

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found or access denied'
      });
    }

    // If the campaign is sending, try to stop it in the worker first
    if (campaign.status === 'sending' || campaign.status === 'processing') {
      try {
        // Try to stop the campaign in the worker
        const stopResponse = await workerClient.post(`/api/campaign/${campaign.id}/stop`);
        
        if (stopResponse.data && stopResponse.data.success) {
          console.log(`Campaign ${campaign.id} stopped in worker before deletion`);
        } else {
          console.error('Failed to stop campaign in worker:', stopResponse.data);
          return res.status(400).json({
            success: false,
            message: 'Cannot delete campaign - failed to stop sending process'
          });
        }
      } catch (workerError) {
        console.error('Worker stop error:', workerError);
        return res.status(400).json({
          success: false,
          message: 'Cannot delete campaign - active campaign could not be stopped'
        });
      }
    }

    // Clean up campaign data from worker
    try {
      // Delete campaign data from worker's KV storage
      await workerClient.delete(`/api/campaign/${campaign.id}`);
    } catch (cleanupError) {
      // Log but continue with deletion
      console.warn(`Failed to clean up worker data for campaign ${campaign.id}:`, cleanupError.message);
    }

    await campaign.destroy();

    return res.status(200).json({
      success: true,
      message: 'Campaign deleted successfully'
    });
  } catch (error) {
    console.error('Delete campaign error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error deleting campaign',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get campaign statistics
exports.getCampaignStats = async (req, res) => {
  try {
    const campaign = await Campaign.findOne({
      where: {
        id: req.params.id,
        userId: req.user.id
      },
      include: [
        {
          model: CampaignStat,
          as: 'stats',
          include: [
            {
              model: Contact,
              as: 'contact',
              attributes: ['id', 'email', 'firstName', 'lastName']
            }
          ]
        }
      ]
    });

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found or access denied'
      });
    }

    // Prepare local stats
    const localStats = {
      totalRecipients: campaign.totalRecipients,
      sent: campaign.stats.filter(stat => stat.sent).length,
      delivered: campaign.stats.filter(stat => stat.delivered).length,
      opened: campaign.stats.filter(stat => stat.opened).length,
      clicked: campaign.stats.filter(stat => stat.clicked).length,
      bounced: campaign.stats.filter(stat => stat.bounced).length,
      openRate: campaign.openRate,
      clickRate: campaign.clickRate,
    };

    // For active campaigns, fetch the latest stats from the worker
    if (['processing', 'sending', 'completed'].includes(campaign.status)) {
      try {
        const workerResponse = await workerClient.get(`/api/campaign/${campaign.id}/status`);
        
        if (workerResponse.data && workerResponse.data.success) {
          // Use worker stats as they're more up-to-date
          return res.status(200).json({
            success: true,
            campaign: {
              id: campaign.id,
              name: campaign.name,
              status: workerResponse.data.status || campaign.status,
              scheduledFor: campaign.scheduledFor,
              sentAt: campaign.sentAt,
              initializedAt: workerResponse.data.stats.initializedAt,
              startedAt: workerResponse.data.stats.startedAt,
              completedAt: workerResponse.data.stats.completedAt
            },
            stats: {
              ...localStats,
              ...workerResponse.data.stats,
              // Calculate correct percentages
              openRate: workerResponse.data.stats.openRate || localStats.openRate,
              clickRate: workerResponse.data.stats.clickRate || localStats.clickRate
            },
            progress: workerResponse.data.progress || 0,
            recipients: campaign.stats // Keep detailed recipient data from database
          });
        }
      } catch (workerError) {
        console.warn('Could not fetch worker stats, using local data:', workerError.message);
        // Continue with local data if worker is unavailable
      }
    }

    // Return local stats as fallback
    return res.status(200).json({
      success: true,
      campaign: {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        scheduledFor: campaign.scheduledFor,
        sentAt: campaign.sentAt
      },
      stats: localStats,
      recipients: campaign.stats
    });
  } catch (error) {
    console.error('Get campaign stats error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error retrieving campaign statistics',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Schedule a campaign
exports.scheduleCampaign = async (req, res) => {
  try {
    const { scheduledFor } = req.body;
    
    if (!scheduledFor) {
      return res.status(400).json({
        success: false,
        message: 'Scheduled date is required'
      });
    }

    const campaign = await Campaign.findOne({
      where: {
        id: req.params.id,
        userId: req.user.id
      },
      include: [
        {
          model: Template,
          as: 'template'
        },
        {
          model: ContactList,
          as: 'contactList',
          include: [
            {
              model: Contact,
              as: 'contacts',
              attributes: ['id', 'email', 'firstName', 'lastName']
            }
          ]
        }
      ]
    });

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found or access denied'
      });
    }

    if (campaign.status !== 'draft') {
      return res.status(400).json({
        success: false,
        message: 'Only draft campaigns can be scheduled'
      });
    }

    // 1. Initialize campaign in the worker using our helper function
    const campaignData = prepareCampaignDataForWorker(campaign);

    try {
      // Initialize the campaign in the worker with retry mechanism
      const initResponse = await executeWithRetry(
        () => workerClient.post(`/api/campaign/${campaign.id}/initialize`, campaignData),
        `Initialize campaign ${campaign.id} for scheduling`
      );

      // 2. Schedule the campaign in the database
      const scheduledCampaign = await schedulerService.scheduleCampaign(
        campaign.id,
        new Date(scheduledFor)
      );

      // 3. Add to the worker's scheduler
      await workerClient.put(`/api/scheduled_campaign:${campaign.id}`, {
        scheduledFor: new Date(scheduledFor).toISOString()
      });

      return res.status(200).json({
        success: true,
        campaign: scheduledCampaign,
        workerStatus: initResponse.data
      });
    } catch (workerError) {
      console.error('Worker initialization error:', workerError);
      return res.status(500).json({
        success: false,
        message: 'Error initializing campaign in worker',
        error: process.env.NODE_ENV === 'development' ? workerError.message : undefined
      });
    }
  } catch (error) {
    console.error('Schedule campaign error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error scheduling campaign',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Cancel a scheduled campaign
exports.cancelSchedule = async (req, res) => {
  try {
    const campaign = await Campaign.findOne({
      where: {
        id: req.params.id,
        userId: req.user.id
      }
    });

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found or access denied'
      });
    }

    if (campaign.status !== 'scheduled') {
      return res.status(400).json({
        success: false,
        message: 'Only scheduled campaigns can be cancelled'
      });
    }

    try {
      // Remove from worker's scheduler with retry mechanism
      await executeWithRetry(
        () => workerClient.delete(`/api/scheduled_campaign:${campaign.id}`),
        `Cancel scheduled campaign ${campaign.id}`
      );
      
      // Cancel in the database
      const cancelledCampaign = await schedulerService.cancelScheduledCampaign(campaign.id);

      return res.status(200).json({
        success: true,
        campaign: cancelledCampaign
      });
    } catch (workerError) {
      console.warn('Worker cancel error (continuing with local cancel):', workerError);
      // Continue with local cancellation if worker is unavailable
      const cancelledCampaign = await schedulerService.cancelScheduledCampaign(campaign.id);
      
      return res.status(200).json({
        success: true,
        campaign: cancelledCampaign,
        workerWarning: 'Campaign canceled in database, but worker notification failed'
      });
    }
  } catch (error) {
    console.error('Cancel schedule error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error cancelling scheduled campaign',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Send campaign immediately
exports.sendCampaignNow = async (req, res) => {
  try {
    const campaign = await Campaign.findOne({
      where: {
        id: req.params.id,
        userId: req.user.id
      },
      include: [
        {
          model: Template,
          as: 'template'
        },
        {
          model: ContactList,
          as: 'contactList',
          include: [
            {
              model: Contact,
              as: 'contacts',
              attributes: ['id', 'email', 'firstName', 'lastName']
            }
          ]
        }
      ]
    });

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found or access denied'
      });
    }

    if (!['draft', 'scheduled'].includes(campaign.status)) {
      return res.status(400).json({
        success: false,
        message: 'Only draft or scheduled campaigns can be sent immediately'
      });
    }

    // Prepare campaign data for the worker using our helper function
    const campaignData = prepareCampaignDataForWorker(campaign);

    try {
      // 1. Initialize the campaign in the worker with retry mechanism
      const initResponse = await executeWithRetry(
        () => workerClient.post(`/api/campaign/${campaign.id}/initialize`, campaignData),
        `Initialize campaign ${campaign.id}`
      );
      
      // 2. Start the campaign processing with retry mechanism
      const startResponse = await executeWithRetry(
        () => workerClient.post(`/api/campaign/${campaign.id}/start`),
        `Start campaign ${campaign.id}`
      );

      // Update campaign status in database
      await campaign.update({
        status: 'sending',
        sentAt: new Date()
      });

      return res.status(200).json({
        success: true,
        message: 'Campaign sending started successfully',
        campaign: {
          id: campaign.id,
          name: campaign.name,
          status: 'sending',
          sentAt: campaign.sentAt
        },
        workerStatus: startResponse.data
      });
    } catch (workerError) {
      console.error('Worker send error:', workerError);
      return res.status(500).json({
        success: false,
        message: 'Error sending campaign through worker',
        error: process.env.NODE_ENV === 'development' ? workerError.message : undefined
      });
    }
  } catch (error) {
    console.error('Send campaign error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error sending campaign',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Stop a sending campaign
exports.stopCampaign = async (req, res) => {
  try {
    const campaign = await Campaign.findOne({
      where: {
        id: req.params.id,
        userId: req.user.id
      }
    });

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found or access denied'
      });
    }

    // Only allow stopping campaigns that are currently sending or processing
    if (!['sending', 'processing'].includes(campaign.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot stop campaign with status: ${campaign.status}`
      });
    }

    try {
      // Stop the campaign in the worker with retry mechanism
      const stopResponse = await executeWithRetry(
        () => workerClient.post(`/api/campaign/${campaign.id}/stop`),
        `Stop campaign ${campaign.id}`
      );

      // Update campaign status in database
      await campaign.update({
        status: 'stopped',
        updatedAt: new Date()
      });

      return res.status(200).json({
        success: true,
        message: 'Campaign stopped successfully',
        campaign: {
          id: campaign.id,
          name: campaign.name,
          status: 'stopped'
        },
        workerStatus: stopResponse.data
      });
    } catch (workerError) {
      console.error('Worker stop error:', workerError);
      return res.status(500).json({
        success: false,
        message: 'Error stopping campaign through worker',
        error: process.env.NODE_ENV === 'development' ? workerError.message : undefined
      });
    }
  } catch (error) {
    console.error('Stop campaign error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error stopping campaign',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};