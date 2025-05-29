const { Campaign, Template, ContactList, CampaignStat, Contact, User, sequelize } = require('../models');
const { Op } = require('sequelize');
const { validationResult } = require('express-validator');
const schedulerService = require('../services/schedulerService');

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

    // Create campaign
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

    // Don't allow deleting campaigns that are currently sending
    if (campaign.status === 'sending') {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete a campaign that is currently sending'
      });
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

    const stats = {
      totalRecipients: campaign.totalRecipients,
      sent: campaign.stats.filter(stat => stat.sent).length,
      delivered: campaign.stats.filter(stat => stat.delivered).length,
      opened: campaign.stats.filter(stat => stat.opened).length,
      clicked: campaign.stats.filter(stat => stat.clicked).length,
      bounced: campaign.stats.filter(stat => stat.bounced).length,
      openRate: campaign.openRate,
      clickRate: campaign.clickRate,
    };

    return res.status(200).json({
      success: true,
      campaign: {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        scheduledFor: campaign.scheduledFor,
        sentAt: campaign.sentAt
      },
      stats,
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
      }
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

    // Schedule the campaign
    const scheduledCampaign = await schedulerService.scheduleCampaign(
      campaign.id,
      new Date(scheduledFor)
    );

    return res.status(200).json({
      success: true,
      campaign: scheduledCampaign
    });
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

    // Cancel the scheduled campaign
    const cancelledCampaign = await schedulerService.cancelScheduledCampaign(campaign.id);

    return res.status(200).json({
      success: true,
      campaign: cancelledCampaign
    });
  } catch (error) {
    console.error('Cancel schedule error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error cancelling scheduled campaign',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};