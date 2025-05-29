const { Template, Campaign } = require('../models');
const { Op } = require('sequelize');
const { validationResult } = require('express-validator');
const { processTemplateContent } = require('../middleware/template.middleware');

// Get all templates
exports.getTemplates = async (req, res) => {
  try {
    const { search, category } = req.query;
    const { page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    
    let whereClause = { userId: req.user.id };
    
    // Filter by search term if provided
    if (search) {
      whereClause = {
        ...whereClause,
        [Op.or]: [
          { name: { [Op.like]: `%${search}%` } },
          { description: { [Op.like]: `%${search}%` } }
        ]
      };
    }
    
    // Filter by category if provided
    if (category) {
      whereClause.category = category;
    }

    // Use findAndCountAll to get both the rows and total count
    const { count, rows: templates } = await Template.findAndCountAll({
      where: whereClause,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']]
    });

    return res.status(200).json({
      success: true,
      templates,
      total: count,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Get templates error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error retrieving templates',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get template by ID
exports.getTemplate = async (req, res) => {
  try {
    const template = await Template.findOne({
      where: {
        id: req.params.id,
        userId: req.user.id
      }
    });

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template not found'
      });
    }

    return res.status(200).json({
      success: true,
      template
    });
  } catch (error) {
    console.error('Get template error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error retrieving template',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Create a new template
exports.createTemplate = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    const { name, description, category, subject, content, thumbnail } = req.body;

    const template = await Template.create({
      userId: req.user.id,
      name,
      description,
      category,
      subject,
      content,
      thumbnail,
      usageCount: 0
    });

    return res.status(201).json({
      success: true,
      message: 'Template created successfully',
      template
    });
  } catch (error) {
    console.error('Create template error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error creating template',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Update a template
exports.updateTemplate = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    const { name, description, category, subject, content, thumbnail } = req.body;

    const template = await Template.findOne({
      where: {
        id: req.params.id,
        userId: req.user.id
      }
    });

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template not found or access denied'
      });
    }

    await template.update({
      name: name || template.name,
      description: description !== undefined ? description : template.description,
      category: category !== undefined ? category : template.category,
      subject: subject || template.subject,
      content: content || template.content,
      thumbnail: thumbnail !== undefined ? thumbnail : template.thumbnail
    });

    return res.status(200).json({
      success: true,
      message: 'Template updated successfully',
      template
    });
  } catch (error) {
    console.error('Update template error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error updating template',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Delete a template
exports.deleteTemplate = async (req, res) => {
  try {
    const template = await Template.findOne({
      where: {
        id: req.params.id,
        userId: req.user.id
      }
    });

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template not found or access denied'
      });
    }

    // Check if template is used in any campaigns
    const campaignsUsingTemplate = await Campaign.findOne({
      where: {
        templateId: template.id
      }
    });

    if (campaignsUsingTemplate) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete template that is used in campaigns'
      });
    }

    await template.destroy();

    return res.status(200).json({
      success: true,
      message: 'Template deleted successfully'
    });
  } catch (error) {
    console.error('Delete template error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error deleting template',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Preview template with contact data
exports.previewTemplate = async (req, res) => {
  try {
    const template = await Template.findOne({
      where: {
        id: req.params.id,
        userId: req.user.id
      }
    });

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template not found'
      });
    }

    // Sample contact data for preview
    const sampleContact = {
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@example.com',
      company: 'Example Corp'
    };

    const processedContent = processTemplateContent(template.content, sampleContact);
    const processedSubject = processTemplateContent(template.subject, sampleContact);

    return res.status(200).json({
      success: true,
      preview: {
        subject: processedSubject,
        content: processedContent
      }
    });
  } catch (error) {
    console.error('Preview template error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error previewing template',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Increment template usage count
exports.incrementUsage = async (templateId) => {
  try {
    const template = await Template.findByPk(templateId);
    if (template) {
      await template.update({
        usageCount: template.usageCount + 1,
        lastUsed: new Date()
      });
    }
  } catch (error) {
    console.error('Increment template usage error:', error);
  }
};