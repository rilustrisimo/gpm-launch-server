/**
 * Tracking Routes
 * 
 * API routes for tracking data updates from the worker
 * IMPORTANT: These routes use API key validation, NOT JWT auth
 */

const express = require('express');
const router = express.Router();
const trackingController = require('../controllers/tracking.controller');
const { validateApiKey } = require('../middleware/auth.middleware');

// WORKER AUTH: All tracking routes use API key authentication, not JWT
// Each route explicitly uses validateApiKey to prevent auth middleware confusion
router.post('/update', validateApiKey, trackingController.updateTracking);
router.post('/batch-update', validateApiKey, trackingController.updateBatchTracking);
router.post('/contacts/unsubscribe', validateApiKey, trackingController.updateUnsubscribe);
router.post('/contacts/bounce', validateApiKey, trackingController.recordBounce);
router.post('/contacts/complaint', validateApiKey, trackingController.recordComplaint);
router.post('/campaign/status', validateApiKey, trackingController.updateCampaignStatus);

module.exports = router;
