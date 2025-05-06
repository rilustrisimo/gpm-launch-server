const express = require('express');
const { body } = require('express-validator');
const contactController = require('../controllers/contact.controller');
const { auth } = require('../middleware/auth.middleware');

const router = express.Router();

// Apply auth middleware to all routes
router.use(auth);

// Get all contacts
router.get('/', contactController.getContacts);

// Get contact by ID
router.get('/:id', contactController.getContact);

// Create a new contact
router.post(
  '/',
  [
    body('email', 'Please include a valid email').isEmail(),
    body('firstName').optional(),
    body('lastName').optional(),
    body('company').optional(),
    body('status').optional().isIn(['active', 'unsubscribed', 'bounced']).withMessage('Invalid status value'),
    body('metadata').optional(),
    body('listIds').optional().isArray().withMessage('listIds must be an array')
  ],
  contactController.createContact
);

// Update a contact
router.put(
  '/:id',
  [
    body('firstName').optional(),
    body('lastName').optional(),
    body('company').optional(),
    body('status').optional().isIn(['active', 'unsubscribed', 'bounced']).withMessage('Invalid status value'),
    body('metadata').optional(),
    body('listIds').optional().isArray().withMessage('listIds must be an array')
  ],
  contactController.updateContact
);

// Delete a contact
router.delete('/:id', contactController.deleteContact);

module.exports = router; 