const express = require('express');
const statsController = require('../controllers/stats.controller');
const { auth } = require('../middleware/auth.middleware');

const router = express.Router();

// Apply auth middleware to all routes
router.use(auth);

// Get dashboard statistics
router.get('/dashboard', statsController.getDashboardStats);

// Get campaign performance statistics
router.get('/campaigns', statsController.getCampaignStats);

// Get contact growth statistics
router.get('/contacts', statsController.getContactGrowthStats);

module.exports = router; 