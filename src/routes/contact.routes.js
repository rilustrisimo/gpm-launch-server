const express = require('express');
const { body } = require('express-validator');
const contactController = require('../controllers/contact.controller');
const { auth, validateApiKey } = require('../middleware/auth.middleware');
const ContactList = require('../models/contactList');

const router = express.Router();

// Get contact by email (for SES webhook) - uses API key auth
router.get('/by-email/:email', validateApiKey, contactController.getContactByEmail);

// Apply auth middleware to all other routes
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
    body('phone').optional(),
    body('status').optional().isIn(['active', 'unsubscribed', 'bounced']).withMessage('Invalid status value'),
    body('metadata').optional(),
    body('listId').optional().isUUID().withMessage('List ID must be a valid UUID'),
    body('listId').optional().custom(async (value) => {
      if (value) {
        const list = await ContactList.findByPk(value);
        if (!list) {
          throw new Error('Contact list not found');
        }
      }
      return true;
    })
  ],
  contactController.createContact
);

// Update a contact
router.put(
  '/:id',
  [
    body('firstName').optional(),
    body('lastName').optional(),
    body('phone').optional(),
    body('status').optional().isIn(['active', 'unsubscribed', 'bounced']).withMessage('Invalid status value'),
    body('metadata').optional(),
    body('listId').optional().isUUID().withMessage('List ID must be a valid UUID'),
    body('listId').optional().custom(async (value) => {
      if (value) {
        const list = await ContactList.findByPk(value);
        if (!list) {
          throw new Error('Contact list not found');
        }
      }
      return true;
    })
  ],
  contactController.updateContact
);

// Delete a contact
router.delete('/:id', contactController.deleteContact);

// Import contacts
router.post(
  '/import',
  [
    body('contacts').isArray().withMessage('Contacts must be an array'),
    body('contacts.*.email').isEmail().withMessage('Invalid email address'),
    body('contacts.*.firstName').optional(),
    body('contacts.*.lastName').optional(),
    body('contacts.*.phone').optional(),
    body('contacts.*.status').optional().isIn(['active', 'unsubscribed', 'bounced']).withMessage('Invalid status value'),
    body('contacts.*.metadata').optional(),
    body('listId').optional().isUUID().withMessage('List ID must be a valid UUID'),
    body('listId').optional().custom(async (value) => {
      if (value) {
        const list = await ContactList.findByPk(value);
        if (!list) {
          throw new Error('Contact list not found');
        }
      }
      return true;
    })
  ],
  contactController.importContacts
);

module.exports = router; 