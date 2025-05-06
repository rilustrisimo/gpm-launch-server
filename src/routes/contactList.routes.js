const express = require('express');
const { body } = require('express-validator');
const contactListController = require('../controllers/contactList.controller');
const { auth } = require('../middleware/auth.middleware');

const router = express.Router();

// Apply auth middleware to all routes
router.use(auth);

// Get all contact lists
router.get('/', contactListController.getContactLists);

// Get contact list by ID
router.get('/:id', contactListController.getContactList);

// Get contacts in a list
router.get('/:id/contacts', contactListController.getContactListContacts);

// Create a new contact list
router.post(
  '/',
  [
    body('name', 'Contact list name is required').notEmpty(),
    body('description').optional()
  ],
  contactListController.createContactList
);

// Update a contact list
router.put(
  '/:id',
  [
    body('name').optional(),
    body('description').optional()
  ],
  contactListController.updateContactList
);

// Delete a contact list
router.delete('/:id', contactListController.deleteContactList);

// Add contacts to a list
router.post(
  '/:id/contacts',
  [
    body('contactIds', 'contactIds array is required').isArray().notEmpty()
  ],
  contactListController.addContactsToList
);

// Remove contacts from a list
router.delete(
  '/:id/contacts',
  [
    body('contactIds', 'contactIds array is required').isArray().notEmpty()
  ],
  contactListController.removeContactsFromList
);

module.exports = router; 