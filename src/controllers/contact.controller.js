const { Contact, ContactList, ContactListContacts, sequelize } = require('../models');
const { Op } = require('sequelize');
const { validationResult } = require('express-validator');

// Get all contacts
exports.getContacts = async (req, res) => {
  try {
    const { search, status } = req.query;
    const { page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    
    let whereClause = {};
    
    // Filter by search term if provided
    if (search) {
      whereClause = {
        [Op.or]: [
          { email: { [Op.like]: `%${search}%` } },
          { firstName: { [Op.like]: `%${search}%` } },
          { lastName: { [Op.like]: `%${search}%` } }
        ]
      };
    }
    
    // Filter by status if provided
    if (status) {
      whereClause.status = status;
    }

    // Use findAndCountAll to get both total count and paginated results
    const { count, rows: contacts } = await Contact.findAndCountAll({
      where: whereClause,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']]
    });

    return res.status(200).json({
      success: true,
      contacts,
      total: count,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Get contacts error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error retrieving contacts',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get contact by ID
exports.getContact = async (req, res) => {
  try {
    const contact = await Contact.findByPk(req.params.id, {
      include: [
        {
          model: ContactList,
          as: 'lists',
          attributes: ['id', 'name', 'description'],
          through: { attributes: [] }
        }
      ]
    });

    if (!contact) {
      return res.status(404).json({
        success: false,
        message: 'Contact not found'
      });
    }

    return res.status(200).json({
      success: true,
      contact
    });
  } catch (error) {
    console.error('Get contact error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error retrieving contact',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Create a new contact
exports.createContact = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { email, firstName, lastName, phone, status, metadata, listId } = req.body;

    // Use validation service directly instead of HTTP requests
    const validationService = require('../services/validationService');
    const validationResult = await validationService.validateEmail(email);
    
    if (!validationResult.success || !validationResult.isValid) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: `Email validation failed: ${validationResult.reason || 'Invalid email'}`,
      });
    }

    // Check if contact already exists
    const existingContact = await Contact.findOne({
      where: { email },
      transaction
    });

    if (existingContact) {
      await transaction.rollback();
      return res.status(409).json({
        success: false,
        message: 'Contact with this email already exists',
        contact: existingContact
      });
    }

    // Create the contact
    const contact = await Contact.create({
      email,
      firstName,
      lastName,
      phone,
      status: status || 'active',
      metadata
    }, { transaction });


    if (listId) {
      const list = await ContactList.findByPk(listId, { transaction });
      if (!list) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: 'Contact list not found'
        });
      }

      // Create the association using the through model with timestamps
      await contact.addList(list, { 
        transaction,
        through: { 
          createdAt: new Date(),
          updatedAt: new Date() 
        }
      });
      
      // Verify that the association was created
      const contactLists = await contact.getLists({ transaction });
      
      // Update list count
      await list.update({
        count: list.count + 1,
        lastUpdated: new Date()
      }, { transaction });
    }

    await transaction.commit();

    // Fetch the contact with its list associations
    const createdContact = await Contact.findByPk(contact.id, {
      include: [
        {
          model: ContactList,
          as: 'lists',
          attributes: ['id', 'name', 'description'],
          through: { attributes: [] }
        }
      ]
    });

    res.status(201).json({
      success: true,
      contact: createdContact
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Error creating contact:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error creating contact'
    });
  }
};

// Update a contact
exports.updateContact = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { firstName, lastName, phone, status, metadata, listId } = req.body;

    const contact = await Contact.findByPk(req.params.id, {
      include: [
        {
          model: ContactList,
          as: 'lists',
          through: { attributes: [] }
        }
      ],
      transaction
    });

    if (!contact) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Contact not found'
      });
    }

    // Update contact details
    await contact.update({
      firstName: firstName !== undefined ? firstName : contact.firstName,
      lastName: lastName !== undefined ? lastName : contact.lastName,
      phone: phone !== undefined ? phone : contact.phone,
      status: status || contact.status,
      metadata: metadata !== undefined ? metadata : contact.metadata
    }, { transaction });

    // Handle list assignment
    if (listId !== undefined) {
      // Get current lists
      const currentLists = await contact.getLists({ transaction });
      const currentListIds = currentLists.map(list => list.id);

      // If new list is different from current list
      if (!currentListIds.includes(listId)) {
        // Remove from all current lists
        if (currentLists.length > 0) {
          await contact.removeLists(currentLists, { transaction });
          
          // Update old lists' counts
          for (const oldList of currentLists) {
            await oldList.update({
              count: Math.max(0, oldList.count - 1),
              lastUpdated: new Date()
            }, { transaction });
          }
        }

        // Add to new list if listId is provided
        if (listId) {
          const newList = await ContactList.findByPk(listId, { transaction });
          if (!newList) {
            await transaction.rollback();
            return res.status(404).json({
              success: false,
              message: 'New contact list not found'
            });
          }

          // Add to new list with timestamps
          await contact.addList(newList, { 
            transaction,
            through: { 
              createdAt: new Date(),
              updatedAt: new Date() 
            }
          });

          // Update new list count
          await newList.update({
            count: newList.count + 1,
            lastUpdated: new Date()
          }, { transaction });
        }
      }
    }

    await transaction.commit();

    // Fetch updated contact with list associations
    const updatedContact = await Contact.findByPk(req.params.id, {
      include: [
        {
          model: ContactList,
          as: 'lists',
          attributes: ['id', 'name', 'description'],
          through: { attributes: [] }
        }
      ]
    });

    return res.status(200).json({
      success: true,
      message: 'Contact updated successfully',
      contact: updatedContact
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Update contact error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error updating contact',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Delete a contact
exports.deleteContact = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const contact = await Contact.findByPk(req.params.id, {
      include: [
        {
          model: ContactList,
          as: 'lists',
          through: { attributes: [] }
        }
      ],
      transaction
    });

    if (!contact) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Contact not found'
      });
    }

    // Update list counts
    if (contact.lists && contact.lists.length > 0) {
      for (const list of contact.lists) {
        await list.update({ 
          count: Math.max(0, list.count - 1), 
          lastUpdated: new Date() 
        }, { transaction });
      }
    }

    await contact.destroy({ transaction });
    await transaction.commit();

    return res.status(200).json({
      success: true,
      message: 'Contact deleted successfully'
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Delete contact error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error deleting contact',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Import multiple contacts
exports.importContacts = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { contacts, listId } = req.body;
    
    if (!Array.isArray(contacts)) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Contacts must be an array'
      });
    }

    // Check if list exists if listId is provided
    let list = null;
    if (listId) {
      list = await ContactList.findByPk(listId, { transaction });
      if (!list) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: 'Contact list not found'
        });
      }
      console.log('Found list:', list.id);
    }

    // Extract all emails for batch validation
    const emails = contacts.map(contact => contact.email);
    
    // Use validation service directly instead of HTTP requests
    const validationService = require('../services/validationService');
    const validationResults = await validationService.validateBatch(emails, listId);
    
    if (!validationResults.success) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Email validation failed',
      });
    }
    
    // Create a map of email validation results for quick lookup
    const emailValidationMap = new Map();
    validationResults.results.forEach(result => {
      emailValidationMap.set(result.email, result);
    });

    const results = {
      success: true,
      count: 0,
      failed: []
    };

    // Process each contact
    for (const contactData of contacts) {
      try {
        // Check if email is valid using the validation result from the batch
        const validationResult = emailValidationMap.get(contactData.email);
        
        if (!validationResult || !validationResult.success || !validationResult.isValid) {
          results.failed.push({
            contact: contactData,
            reason: validationResult ? validationResult.reason || 'Email validation failed' : 'Email validation failed'
          });
          continue;
        }
        
        // Check for existing contact in the same list
        const existingContact = await Contact.findOne({
          where: { email: contactData.email },
          include: [{
            model: ContactList,
            as: 'lists',
            where: listId ? { id: listId } : {},
            required: listId ? true : false
          }],
          transaction
        });

        if (existingContact) {
          results.failed.push({
            contact: contactData,
            reason: listId 
              ? 'Email already exists in this list'
              : 'Email already exists in the system'
          });
          continue;
        }

        // Create the contact
        const contact = await Contact.create({
          email: contactData.email,
          firstName: contactData.firstName,
          lastName: contactData.lastName,
          phone: contactData.phone,
          status: contactData.status || 'active',
          metadata: contactData.metadata
        }, { transaction });

        // Add to list if specified - with explicit timestamp values
        if (list) {
          await contact.addList(list, { 
            transaction,
            through: { 
              createdAt: new Date(),
              updatedAt: new Date() 
            }
          });
          results.count++;
        }
      } catch (error) {
        console.error('Error processing contact:', contactData.email, error);
        results.failed.push({
          contact: contactData,
          reason: error.message || 'Failed to create contact'
        });
      }
    }

    // Get the actual count of contacts in the list after adding new contacts
    if (list && results.count > 0) {
      // Get the actual count from the database instead of relying on in-memory value
      const currentCount = await Contact.count({
        include: [
          {
            model: ContactList,
            as: 'lists',
            where: { id: list.id },
            attributes: []
          }
        ],
        transaction
      });

      // Update list count with accurate count from database
      await list.update({
        count: currentCount,
        lastUpdated: new Date()
      }, { transaction });
    }

    await transaction.commit();

    return res.status(200).json(results);
  } catch (error) {
    await transaction.rollback();
    console.error('Import contacts error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error importing contacts',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get contact by email
exports.getContactByEmail = async (req, res) => {
  try {
    const { email } = req.params;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email parameter is required'
      });
    }

    const contact = await Contact.findOne({
      where: { email: email.toLowerCase() },
      attributes: ['id', 'email', 'firstName', 'lastName', 'status'],
      include: [
        {
          model: ContactList,
          as: 'lists',
          attributes: ['id', 'name'],
          through: { attributes: [] }
        }
      ]
    });

    if (!contact) {
      return res.status(404).json({
        success: false,
        message: 'Contact not found'
      });
    }

    return res.status(200).json({
      success: true,
      contact
    });
  } catch (error) {
    console.error('Get contact by email error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error retrieving contact by email',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};