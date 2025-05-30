/**
 * Tracking Routes
 * 
 * API routes for tracking data updates from the worker
 */

const express = require('express');
const router = express.Router();
const trackingController = require('../controllers/tracking.controller');
const authMiddleware = require('../middleware/auth.middleware');

// All routes require API key authentication
router.use(authMiddleware.validateApiKey);

// Tracking data endpoints
router.post('/update', trackingController.updateTracking);
router.post('/batch-update', trackingController.updateBatchTracking);
router.post('/contacts/unsubscribe', trackingController.updateUnsubscribe);
router.post('/contacts/bounce', trackingController.recordBounce);
router.post('/contacts/complaint', trackingController.recordComplaint);

module.exports = router;
