// filepath: /Users/eyorsogood/Sites/launch.gravitypointmedia.com/server/src/routes/validation.js
const express = require('express');
const router = express.Router();
const validationService = require('../services/validationService');

/**
 * Check MX records for a domain
 * POST /api/validate/mx
 */
router.post('/mx', async (req, res) => {
  const { domain } = req.body;
  const result = await validationService.validateMx(domain);
  
  if (!result.success) {
    return res.status(400).json(result);
  }
  
  return res.json(result);
});

/**
 * Check if email already exists
 * POST /api/validate/duplicate
 */
router.post('/duplicate', async (req, res) => {
  const { email } = req.body;
  const result = await validationService.checkDuplicate(email);
  
  if (!result.success) {
    return res.status(400).json(result);
  }
  
  return res.json(result);
});

/**
 * Validate a single email
 * POST /api/validate/email
 */
router.post('/email', async (req, res) => {
  const { email } = req.body;
  const result = await validationService.validateEmail(email);
  
  if (!result.success && result.message) {
    return res.status(400).json(result);
  }
  
  return res.json(result);
});

/**
 * Batch validate multiple emails
 * POST /api/validate/batch
 */
router.post('/batch', async (req, res) => {
  const { emails } = req.body;
  const result = await validationService.validateBatch(emails);
  
  if (!result.success) {
    return res.status(500).json(result);
  }
  
  return res.json(result);
});

module.exports = router;