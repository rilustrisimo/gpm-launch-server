const { Campaign, Template, ContactList, CampaignStat, Contact, User, sequelize } = require('../models');
const { Op, Transaction } = require('sequelize');
const { validationResult } = require('express-validator');
const schedulerService = require('../services/schedulerService');
const sesService = require('../services/sesService');

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
      if (error.response) {
        console.warn(`  Response status: ${error.response.status}`);
        console.warn(`  Response data:`, error.response.data);
      }
      
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
 * @param {Array} recipients - Batch of recipients to include (optional, for batching)
 * @returns {Object} - Formatted campaign data for worker
 */
const prepareCampaignDataForWorker = (campaign, recipients = null) => {
  if (!campaign || !campaign.template || !campaign.contactList) {
    throw new Error('Campaign data incomplete');
  }

  // Use provided recipients or all contacts
  const recipientsList = recipients || campaign.contactList.contacts || [];

  return {
    id: campaign.id,
    name: campaign.name,
    subject: campaign.subject,
    sendingMode: campaign.sendingMode || 'normal',
    emailsPerMinute: campaign.emailsPerMinute,
    maxConcurrentBatches: campaign.maxConcurrentBatches || 10,
    fromName: campaign.fromName || 'Gravity Point Media',
    fromEmail: campaign.fromEmail || 'support@send.gravitypointmedia.com',
    replyToEmail: campaign.replyToEmail || 'support@gravitypointmedia.com',
    template: {
      id: campaign.template.id,
      subject: campaign.subject || campaign.template.subject,
      content: campaign.template.html || campaign.template.content
    },
    recipients: recipientsList.map(contact => ({
      id: contact.id,
      email: contact.email,
      firstName: contact.firstName || '',
      lastName: contact.lastName || ''
      // Removed metadata to reduce payload size for large campaigns
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
    const { 
      name, 
      subject, 
      templateId, 
      contactListId, 
      scheduledFor,
      sendingMode = 'normal',
      emailsPerMinute,
      maxConcurrentBatches = 10,
      fromName,
      fromEmail,
      replyToEmail
    } = req.body;

    // Validate turtle send parameters
    if (sendingMode === 'turtle') {
      if (!emailsPerMinute || emailsPerMinute < 1 || emailsPerMinute > 600) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'For turtle mode, emailsPerMinute must be between 1 and 600'
        });
      }
    }

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
      scheduledFor: scheduledFor || null,
      sendingMode,
      emailsPerMinute,
      maxConcurrentBatches,
      fromName: fromName || 'Gravity Point Media',
      fromEmail: fromEmail || 'support@send.gravitypointmedia.com',
      replyToEmail: replyToEmail || 'support@gravitypointmedia.com'
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
    const { name, subject, templateId, contactListId, scheduledFor, status, fromName, fromEmail, replyToEmail } = req.body;

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
      scheduledFor: scheduledFor !== undefined ? scheduledFor : campaign.scheduledFor,
      fromName: fromName !== undefined ? fromName : campaign.fromName,
      fromEmail: fromEmail !== undefined ? fromEmail : campaign.fromEmail,
      replyToEmail: replyToEmail !== undefined ? replyToEmail : campaign.replyToEmail
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
          ],
          order: [['createdAt', 'ASC']]
        }
      ]
    });

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found or access denied'
      });
    }

    // Get all campaign statistics records for this campaign
    const recipients = campaign.stats || [];
    
    // Calculate stats from actual database records
    const actualStats = {
      totalRecipients: recipients.length,
      sent: recipients.filter(r => r.sent).length,
      delivered: recipients.filter(r => r.delivered).length,
      opened: recipients.filter(r => r.opened).length,
      clicked: recipients.filter(r => r.clicked).length,
      bounced: recipients.filter(r => r.bounced).length,
      openRate: recipients.length > 0 ? Math.round((recipients.filter(r => r.opened).length / recipients.length) * 100) : 0,
      clickRate: recipients.length > 0 ? Math.round((recipients.filter(r => r.clicked).length / recipients.length) * 100) : 0,
    };

    // Calculate progress based on actual records
    const progress = actualStats.totalRecipients > 0 ? Math.round((actualStats.sent / actualStats.totalRecipients) * 100) : 0;
    
    // Auto-update campaign status if complete
    let currentStatus = campaign.status;
    let shouldMarkComplete = false;
    
    // Check various completion scenarios
    if (!['completed', 'stopped'].includes(campaign.status)) {
      // Scenario 1: Progress is 100% (all emails sent)
      if (progress >= 100 && actualStats.totalRecipients > 0) {
        shouldMarkComplete = true;
        console.log(`Campaign ${campaign.id} is 100% complete (${actualStats.sent}/${actualStats.totalRecipients} sent)`);
      }
      
      // Scenario 2: For turtle campaigns, check if no more emails are pending
      else if (campaign.sendingMode === 'turtle' && actualStats.totalRecipients > 0) {
        const pendingEmails = actualStats.totalRecipients - actualStats.sent;
        
        if (pendingEmails === 0) {
          shouldMarkComplete = true;
          console.log(`Turtle campaign ${campaign.id} completed - no pending emails`);
        }
      }
      
      // Scenario 3: Campaign was sending/processing but all contacts have been processed
      else if (['sending', 'processing'].includes(campaign.status) && actualStats.totalRecipients > 0) {
        const processedCount = actualStats.sent + actualStats.bounced;
        if (processedCount >= actualStats.totalRecipients) {
          shouldMarkComplete = true;
          console.log(`Campaign ${campaign.id} completed - all contacts processed (${processedCount}/${actualStats.totalRecipients})`);
        }
      }
    }
    
    // Update status to completed if any completion scenario is met
    if (shouldMarkComplete) {
      await campaign.update({ status: 'completed', updatedAt: new Date() });
      currentStatus = 'completed';
      console.log(`Auto-updated campaign ${campaign.id} status to completed (progress: ${progress}%)`);
    }

    // Prepare local/computed stats for fallback
    const computedStats = {
      totalRecipients: campaign.totalRecipients || 0,
      sent: campaign.stats.filter(stat => stat.sent).length,
      delivered: campaign.stats.filter(stat => stat.delivered).length,
      opened: campaign.stats.filter(stat => stat.opened).length,
      clicked: campaign.stats.filter(stat => stat.clicked).length,
      bounced: campaign.stats.filter(stat => stat.bounced).length,
      openRate: campaign.openRate || 0,
      clickRate: campaign.clickRate || 0,
    };

    // For active campaigns, try to fetch the latest stats from the worker
    let workerStats = null;
    let workerProgress = null;
    
    if (['processing', 'sending', 'completed'].includes(currentStatus)) {
      try {
        const workerResponse = await workerClient.get(`/api/campaign/${campaign.id}/status`);
        
        if (workerResponse.data && workerResponse.data.success) {
          workerStats = workerResponse.data.stats;
          workerProgress = workerResponse.data.progress;
          
          // Synchronize status if different and worker shows completion
          if (workerResponse.data.status === 'completed' && currentStatus !== 'completed') {
            await campaign.update({ status: 'completed' });
            currentStatus = 'completed';
            console.log(`Synchronized campaign status from worker: ${campaign.status} -> completed`);
          }
        }
      } catch (workerError) {
        console.warn('Could not fetch worker stats, using database records:', workerError.message);
        // Continue with database records if worker is unavailable
      }
    }

    // Determine which stats to use based on data availability
    let effectiveStats = actualStats;
    let effectiveProgress = progress;
    
    // If we have no database records but worker has stats, use worker stats
    if (actualStats.totalRecipients === 0 && workerStats && workerStats.totalRecipients > 0) {
      effectiveStats = workerStats;
      effectiveProgress = workerProgress || 0;
    } else if (actualStats.totalRecipients === 0 && computedStats.totalRecipients > 0) {
      // Fall back to computed stats if no database records
      effectiveStats = computedStats;
      effectiveProgress = computedStats.totalRecipients > 0 ? 
        Math.round((computedStats.sent / computedStats.totalRecipients) * 100) : 0;
    }

    return res.status(200).json({
      success: true,
      campaign: {
        id: campaign.id,
        name: campaign.name,
        status: currentStatus,
        scheduledFor: campaign.scheduledFor,
        sentAt: campaign.sentAt,
        sendingMode: campaign.sendingMode,
        emailsPerMinute: campaign.emailsPerMinute,
        initializedAt: workerStats?.initializedAt,
        startedAt: workerStats?.startedAt,
        completedAt: workerStats?.completedAt
      },
      stats: effectiveStats,
      progress: effectiveProgress,
      recipients: recipients.map(r => ({
        id: r.id,
        email: r.contact?.email,
        firstName: r.contact?.firstName,
        lastName: r.contact?.lastName,
        sent: r.sent,
        delivered: r.delivered,
        opened: r.opened,
        clicked: r.clicked,
        bounced: r.bounced,
        sentAt: r.sentAt,
        deliveredAt: r.deliveredAt,
        openedAt: r.openedAt,
        clickedAt: r.clickedAt,
        bouncedAt: r.bouncedAt
      }))
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
  const transaction = await sequelize.transaction({
    isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED
  });
  
  console.log(`🚀 Starting sendCampaignNow for campaign ${req.params.id}`);
  console.log(`📊 Worker URL: ${WORKER_URL}`);
  console.log(`🔑 Worker API Key configured: ${WORKER_API_KEY ? 'YES' : 'NO'}`);
  
  try {
    console.log(`📋 Loading campaign ${req.params.id} with contacts...`);
    const campaign = await Campaign.findOne({
      where: {
        id: req.params.id,
        userId: req.user.id
      },
      include: [
        {
          model: Template,
          as: 'template',
          required: true
        },
        {
          model: ContactList,
          as: 'contactList',
          required: true,
          include: [
            {
              model: Contact,
              as: 'contacts',
              attributes: ['id', 'email', 'firstName', 'lastName'],
              required: false
            }
          ]
        }
      ],
      transaction
    });
    
    console.log(`📋 Campaign loaded: ${campaign ? 'YES' : 'NO'}`);
    if (campaign) {
      console.log(`📋 Has template: ${campaign.template ? 'YES' : 'NO'}`);
      console.log(`📋 Has contactList: ${campaign.contactList ? 'YES' : 'NO'}`);
      console.log(`📋 Contact count: ${campaign.contactList?.contacts?.length || 0}`);
    }

    if (!campaign) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Campaign not found or access denied'
      });
    }
    
    if (!campaign.template) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Campaign template not found'
      });
    }
    
    if (!campaign.contactList) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Campaign contact list not found'
      });
    }
    
    if (!campaign.contactList.contacts || campaign.contactList.contacts.length === 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'No contacts found in the contact list'
      });
    }

    if (!['draft', 'scheduled', 'stopped'].includes(campaign.status)) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Only draft, scheduled, or stopped campaigns can be sent immediately'
      });
    }

    // Create CampaignStat records for tracking (for all campaigns)
    console.log(`📊 Setting up campaign ${campaign.id} with ${campaign.contactList.contacts.length} contacts (mode: ${campaign.sendingMode || 'normal'})`);
    
    // Check if CampaignStat records already exist (for resume functionality)
    const existingStats = await CampaignStat.count({
      where: { campaignId: campaign.id },
      transaction
    });

    if (existingStats === 0) {
      // For large campaigns (>500), skip upfront CampaignStat creation to avoid timeout
      // The worker will create them as emails are sent
      if (campaign.contactList.contacts.length > 500) {
        console.log(`⚡ Large campaign detected (${campaign.contactList.contacts.length} contacts) - CampaignStats will be created by worker during send`);
      } else {
        // Create CampaignStat records for tracking (small campaigns only)
        const campaignStats = campaign.contactList.contacts.map(contact => ({
          campaignId: campaign.id,
          contactId: contact.id,
          sent: false,
          delivered: false,
          opened: false,
          clicked: false,
          bounced: false,
          createdAt: new Date(),
          updatedAt: new Date()
        }));

        console.log(`📦 Creating ${campaignStats.length} CampaignStat records...`);
        
        // Bulk create in batches to avoid database timeouts
        const BATCH_SIZE = 500;
        for (let i = 0; i < campaignStats.length; i += BATCH_SIZE) {
          const batch = campaignStats.slice(i, i + BATCH_SIZE);
          await CampaignStat.bulkCreate(batch, { transaction });
          console.log(`  ✓ Created batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(campaignStats.length/BATCH_SIZE)} (${batch.length} records)`);
        }
        
        console.log(`✅ Created ${campaignStats.length} CampaignStat records for campaign ${campaign.id}`);
      }
    } else {
      console.log(`� Found ${existingStats} existing CampaignStat records for campaign ${campaign.id} (resuming)`);
    }

    // ALL CAMPAIGNS - Send through worker (including turtle mode)
    console.log(`⚡ Preparing campaign ${campaign.id} for worker`);
    console.log(`📧 Campaign details: ${campaign.name}, Mode: ${campaign.sendingMode || 'normal'}, Contacts: ${campaign.contactList.contacts.length}`);

    // Prepare campaign data for the worker using our helper function
    let campaignData;
    try {
      campaignData = prepareCampaignDataForWorker(campaign);
      console.log(`📦 Campaign data prepared for worker:`, {
        id: campaignData.id,
        recipientCount: campaignData.recipients.length,
        sendingMode: campaignData.sendingMode,
        emailsPerMinute: campaignData.emailsPerMinute,
        hasFromName: !!campaignData.fromName,
        hasFromEmail: !!campaignData.fromEmail
      });
    } catch (prepareError) {
      await transaction.rollback();
      console.error(`❌ Error preparing campaign data:`, prepareError);
      return res.status(500).json({
        success: false,
        message: 'Error preparing campaign data',
        error: prepareError.message
      });
    }

    try {
      const BATCH_SIZE = 100; // Smaller batches to avoid Durable Object storage limits
      const allRecipients = campaign.contactList.contacts || [];
      const totalRecipients = allRecipients.length;
      const totalBatches = Math.ceil(totalRecipients / BATCH_SIZE);
      
      console.log(`🔄 Step 1: Initializing campaign ${campaign.id} in worker with ${totalBatches} batches...`);
      console.log(`📧 Total recipients: ${totalRecipients}, Batch size: ${BATCH_SIZE}`);
      
      // Send recipients in batches
      for (let i = 0; i < totalBatches; i++) {
        const start = i * BATCH_SIZE;
        const end = Math.min(start + BATCH_SIZE, totalRecipients);
        const recipientBatch = allRecipients.slice(start, end);
        
        // Prepare campaign data with this batch of recipients
        const batchData = prepareCampaignDataForWorker(campaign, recipientBatch);
        const batchPayloadSize = JSON.stringify(batchData).length;
        
        console.log(`📦 Batch ${i + 1}/${totalBatches}: ${recipientBatch.length} recipients, Payload: ${(batchPayloadSize / 1024).toFixed(2)} KB`);
        
        // Initialize or append to campaign in worker
        const endpoint = i === 0 
          ? `/api/campaign/${campaign.id}/initialize` 
          : `/api/campaign/${campaign.id}/append-recipients`;
        
        await executeWithRetry(
          () => workerClient.post(endpoint, batchData),
          `${i === 0 ? 'Initialize' : 'Append to'} campaign ${campaign.id} (batch ${i + 1}/${totalBatches})`
        );
        
        console.log(`  ✅ Batch ${i + 1}/${totalBatches} sent successfully`);
      }
      
      console.log(`✅ Step 1 Complete: Campaign initialized with all ${totalRecipients} recipients in ${totalBatches} batches`);
      
      console.log(`🔄 Step 2: Starting campaign ${campaign.id} in worker...`);
      // 2. Start the campaign processing with retry mechanism
      const startResponse = await executeWithRetry(
        () => workerClient.post(`/api/campaign/${campaign.id}/start`),
        `Start campaign ${campaign.id}`
      );

      console.log(`✅ Step 2 Complete: Campaign started in worker`, startResponse.data);

      // Update campaign status in database
      await campaign.update({
        status: 'sending',
        sentAt: new Date()
      }, { transaction });

      await transaction.commit();

      console.log(`🎉 Campaign ${campaign.id} successfully started through worker`);

      return res.status(200).json({
        success: true,
        message: `Campaign sending started successfully ${campaign.sendingMode === 'turtle' ? '(turtle mode)' : ''}`,
        campaign: {
          id: campaign.id,
          name: campaign.name,
          status: 'sending',
          sentAt: campaign.sentAt,
          sendingMode: campaign.sendingMode,
          emailsPerMinute: campaign.emailsPerMinute
        },
        workerStatus: startResponse.data
      });
    } catch (workerError) {
      await transaction.rollback();
      console.error(`❌ Worker send error for campaign ${campaign.id}:`, workerError);
      console.error(`❌ Error details:`, {
        message: workerError.message,
        response: workerError.response?.data,
        status: workerError.response?.status,
        stack: workerError.stack
      });
      return res.status(500).json({
        success: false,
        message: 'Error sending campaign through worker',
        error: workerError.message,
        details: workerError.response?.data || workerError.message,
        workerError: workerError.response?.data
      });
    }
  } catch (error) {
    await transaction.rollback();
    console.error('❌ Send campaign error:', error);
    console.error('❌ Error stack:', error.stack);
    return res.status(500).json({
      success: false,
      message: 'Error sending campaign',
      error: error.message,
      details: error.stack?.split('\n').slice(0, 3).join('\n')
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

    // All campaigns (including turtle) go through worker
    console.log(`🛑 Stopping campaign ${campaign.id} (mode: ${campaign.sendingMode || 'normal'}) via worker`);

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

      console.log(`✅ Campaign ${campaign.id} stopped successfully via worker`);

      return res.status(200).json({
        success: true,
        message: `Campaign stopped successfully ${campaign.sendingMode === 'turtle' ? '(turtle mode)' : ''}`,
        campaign: {
          id: campaign.id,
          name: campaign.name,
          status: 'stopped',
          sendingMode: campaign.sendingMode
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

/**
 * Update individual recipient status in CampaignStats
 * Called by worker after each email send to keep database in sync
 */
exports.updateRecipient = async (req, res) => {
  try {
    const { id: campaignId } = req.params;
    const { contactId, sent, sentAt, delivered, deliveredAt, messageId } = req.body;
    
    console.log(`📊 Updating recipient ${contactId} for campaign ${campaignId}`);
    
    // Validate required parameters
    if (!contactId) {
      return res.status(400).json({
        success: false,
        message: 'Contact ID is required'
      });
    }
    
    // Update the CampaignStat record
    const [updatedRows] = await CampaignStat.update({
      sent: sent !== undefined ? sent : false,
      sentAt: sentAt || null,
      delivered: delivered !== undefined ? delivered : false,
      deliveredAt: deliveredAt || null,
      messageId: messageId || null,
      updatedAt: new Date()
    }, {
      where: { 
        campaignId, 
        contactId 
      }
    });
    
    if (updatedRows === 0) {
      console.warn(`⚠️ No CampaignStat record found for campaign ${campaignId}, contact ${contactId}`);
      return res.status(404).json({
        success: false,
        message: 'CampaignStat record not found'
      });
    }
    
    console.log(`✅ Successfully updated recipient ${contactId} in database`);
    
    res.json({ 
      success: true, 
      updated: true,
      campaignId,
      contactId
    });
  } catch (error) {
    console.error('❌ Error updating recipient:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update recipient',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Update campaign stats from calculated values
 * Called by worker after calculating stats from contacts
 */
exports.updateCampaignStats = async (req, res) => {
  try {
    const { id: campaignId } = req.params;
    const { 
      sent, 
      delivered, 
      bounces, 
      complaints, 
      unsubscribes, 
      opens, 
      clicks 
    } = req.body;
    
    console.log(`📊 Updating campaign stats for campaign ${campaignId}`);
    
    // Find the campaign
    const campaign = await Campaign.findByPk(campaignId);
    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found'
      });
    }
    
    // Prepare update data with only defined values
    const updateData = {};
    if (sent !== undefined) updateData.sent = sent;
    if (delivered !== undefined) updateData.delivered = delivered;
    if (bounces !== undefined) updateData.bounces = bounces;
    if (complaints !== undefined) updateData.complaints = complaints;
    if (unsubscribes !== undefined) updateData.unsubscribes = unsubscribes;
    if (opens !== undefined) updateData.opens = opens;
    if (clicks !== undefined) updateData.clicks = clicks;
    
    // Update the campaign
    await campaign.update(updateData);
    
    console.log(`✅ Successfully updated campaign stats for campaign ${campaignId}`);
    
    res.json({ 
      success: true, 
      message: 'Campaign stats updated successfully',
      campaignId,
      updatedStats: updateData
    });
  } catch (error) {
    console.error('❌ Error updating campaign stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update campaign stats',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Calculate campaign stats from contact data
 * Called by worker to get real-time stats from the database
 */
exports.calculateCampaignStats = async (req, res) => {
  try {
    const { id: campaignId } = req.params;
    const { contactListId, calculateFromContacts = true } = req.body;
    
    console.log(`📊 Calculating stats for campaign ${campaignId} from contacts`);
    
    // Find the campaign
    const campaign = await Campaign.findByPk(campaignId);
    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found'
      });
    }
    
    // Use the campaign's contact list if not provided
    const listId = contactListId || campaign.contactListId;
    
    if (calculateFromContacts) {
      // Calculate stats directly from CampaignStat records using simple Sequelize
      const allStats = await CampaignStat.findAll({
        where: { campaignId },
        attributes: [
          'sent', 'delivered', 'opened', 'clicked', 'bounced'
        ]
      });
      
      const calculatedStats = {
        total: allStats.length,
        sent: allStats.filter(s => s.sent === true).length,
        delivered: allStats.filter(s => s.delivered === true).length,
        opened: allStats.filter(s => s.opened === true).length,
        clicked: allStats.filter(s => s.clicked === true).length,
        bounced: allStats.filter(s => s.bounced === true).length,
        unsubscribes: 0, // Not tracked in CampaignStats table
        complaints: 0   // Not tracked in CampaignStats table
      };
      
      console.log(`✅ Calculated stats for campaign ${campaignId}:`, calculatedStats);
      
      return res.json({
        success: true,
        stats: calculatedStats
      });
    }
    
    // Fallback to existing campaign stats
    return res.json({
      success: true,
      stats: {
        total: campaign.totalRecipients || 0,
        sent: campaign.sent || 0,
        delivered: campaign.delivered || 0,
        opened: campaign.opens || 0,
        clicked: campaign.clicks || 0,
        bounced: campaign.bounces || 0,
        unsubscribes: campaign.unsubscribes || 0,
        complaints: campaign.complaints || 0
      }
    });
    
  } catch (error) {
    console.error('❌ Error calculating campaign stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to calculate campaign stats',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get campaign data for worker (no user context required)
 * Called by worker with API key authentication
 */
exports.getCampaignForWorker = async (req, res) => {
  try {
    const campaign = await Campaign.findByPk(req.params.id, {
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
    }

    res.json({
      success: true,
      campaign
    });
  } catch (error) {
    console.error('❌ Error retrieving campaign for worker:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving campaign'
    });
  }
};

/**
 * Get verified email identities from AWS SES
 */
exports.getVerifiedIdentities = async (req, res) => {
  try {
    const identities = await sesService.getVerifiedIdentities();
    
    return res.status(200).json({
      success: true,
      identities
    });
  } catch (error) {
    console.error('Error fetching verified identities:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching verified email identities',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};