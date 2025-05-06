const express = require('express');
const { body } = require('express-validator');
const templateController = require('../controllers/template.controller');
const { auth } = require('../middleware/auth.middleware');

const router = express.Router();

// Apply auth middleware to all routes
router.use(auth);

// Get all templates
router.get('/', templateController.getTemplates);

// Get template by ID
router.get('/:id', templateController.getTemplate);

// Create a new template
router.post(
  '/',
  [
    body('name', 'Template name is required').notEmpty(),
    body('subject', 'Subject line is required').notEmpty(),
    body('content', 'Content is required').notEmpty(),
    body('description').optional(),
    body('category').optional(),
    body('thumbnail').optional().isURL().withMessage('Thumbnail must be a valid URL')
  ],
  templateController.createTemplate
);

// Update a template
router.put(
  '/:id',
  [
    body('name').optional(),
    body('subject').optional(),
    body('content').optional(),
    body('description').optional(),
    body('category').optional(),
    body('thumbnail').optional().isURL().withMessage('Thumbnail must be a valid URL')
  ],
  templateController.updateTemplate
);

// Delete a template
router.delete('/:id', templateController.deleteTemplate);

module.exports = router; 