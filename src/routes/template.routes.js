const express = require('express');
const { body } = require('express-validator');
const templateController = require('../controllers/template.controller');
const { auth } = require('../middleware/auth.middleware');
const { validateTemplate } = require('../middleware/template.middleware');

const router = express.Router();

// Apply auth middleware to all routes
router.use(auth);

// Get all templates
router.get('/', templateController.getTemplates);

// Get template by ID
router.get('/:id', templateController.getTemplate);

// Preview template
router.get('/:id/preview', templateController.previewTemplate);

// Create a new template
router.post('/', validateTemplate, templateController.createTemplate);

// Update a template
router.put('/:id', validateTemplate, templateController.updateTemplate);

// Delete a template
router.delete('/:id', templateController.deleteTemplate);

module.exports = router; 