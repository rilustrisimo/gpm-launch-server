const express = require('express');
const { body } = require('express-validator');
const campaignController = require('../controllers/campaign.controller');
const { auth } = require('../middleware/auth.middleware');

const router = express.Router();

// Apply auth middleware to all routes
router.use(auth);

// Get all campaigns
router.get('/', campaignController.getCampaigns);

// Get campaign by ID
router.get('/:id', campaignController.getCampaign);

// Get campaign statistics
router.get('/:id/stats', campaignController.getCampaignStats);

// Create a new campaign
router.post(
  '/',
  [
    body('name', 'Campaign name is required').notEmpty().trim(),
    body('subject', 'Subject line is required').notEmpty().trim(),
    body('templateId', 'Template ID is required').notEmpty().isUUID().withMessage('Invalid Template ID format'),
    body('contactListId', 'Contact list ID is required').notEmpty().isUUID().withMessage('Invalid Contact List ID format'),
    body('scheduledFor').optional().isISO8601().withMessage('Invalid date format for scheduledFor')
  ],
  campaignController.createCampaign
);

// Update a campaign
router.put(
  '/:id',
  [
    body('name').optional().trim(),
    body('subject').optional().trim(),
    body('templateId').optional().isUUID().withMessage('Invalid Template ID format'),
    body('contactListId').optional().isUUID().withMessage('Invalid Contact List ID format'),
    body('status').optional().isIn(['draft', 'scheduled', 'sending', 'completed']).withMessage('Invalid status value'),
    body('scheduledFor').optional().isISO8601().withMessage('Invalid date format for scheduledFor')
  ],
  campaignController.updateCampaign
);

// Delete a campaign
router.delete('/:id', campaignController.deleteCampaign);

// Schedule a campaign
router.post('/:id/schedule', campaignController.scheduleCampaign);

// Cancel a scheduled campaign
router.post('/:id/cancel-schedule', campaignController.cancelSchedule);

module.exports = router;