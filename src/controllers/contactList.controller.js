const { ContactList, Contact, Campaign, sequelize } = require('../models');
const { Op } = require('sequelize');
const { validationResult } = require('express-validator');

// Get all contact lists for the current user
exports.getContactLists = async (req, res) => {
  try {
    const { search } = req.query;
    let whereClause = { userId: req.user.id };
    
    // Filter by search term if provided
    if (search) {
      whereClause = {
        ...whereClause,
        [Op.or]: [
          { name: { [Op.like]: `%${search}%` } },
          { description: { [Op.like]: `%${search}%` } }
        ]
      };
    }

    const contactLists = await ContactList.findAll({
      where: whereClause,
      order: [['createdAt', 'DESC']]
    });

    return res.status(200).json({
      success: true,
      contactLists
    });
  } catch (error) {
    console.error('Get contact lists error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error retrieving contact lists',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get contact list by ID
exports.getContactList = async (req, res) => {
  try {
    const contactList = await ContactList.findOne({
      where: {
        id: req.params.id,
        userId: req.user.id
      }
    });

    if (!contactList) {
      return res.status(404).json({
        success: false,
        message: 'Contact list not found or access denied'
      });
    }

    return res.status(200).json({
      success: true,
      contactList
    });
  } catch (error) {
    console.error('Get contact list error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error retrieving contact list',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get contacts in a list
exports.getContactListContacts = async (req, res) => {
  try {
    const { search, status } = req.query;
    const { page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    const contactList = await ContactList.findOne({
      where: {
        id: req.params.id,
        userId: req.user.id
      }
    });

    if (!contactList) {
      return res.status(404).json({
        success: false,
        message: 'Contact list not found or access denied'
      });
    }

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

    const { count, rows: contacts } = await Contact.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: ContactList,
          as: 'lists',
          where: { id: contactList.id },
          attributes: [],
          through: { attributes: [] }
        }
      ],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['email', 'ASC']]
    });

    return res.status(200).json({
      success: true,
      contactList: {
        id: contactList.id,
        name: contactList.name,
        description: contactList.description,
        count: contactList.count
      },
      contacts,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Get contact list contacts error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error retrieving contacts in list',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Create a new contact list
exports.createContactList = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    const { name, description } = req.body;

    const contactList = await ContactList.create({
      userId: req.user.id,
      name,
      description,
      count: 0,
      lastUpdated: new Date()
    });

    return res.status(201).json({
      success: true,
      message: 'Contact list created successfully',
      contactList
    });
  } catch (error) {
    console.error('Create contact list error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error creating contact list',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Update a contact list
exports.updateContactList = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    const { name, description } = req.body;

    const contactList = await ContactList.findOne({
      where: {
        id: req.params.id,
        userId: req.user.id
      }
    });

    if (!contactList) {
      return res.status(404).json({
        success: false,
        message: 'Contact list not found or access denied'
      });
    }

    await contactList.update({
      name: name || contactList.name,
      description: description !== undefined ? description : contactList.description,
      lastUpdated: new Date()
    });

    return res.status(200).json({
      success: true,
      message: 'Contact list updated successfully',
      contactList
    });
  } catch (error) {
    console.error('Update contact list error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error updating contact list',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Delete a contact list
exports.deleteContactList = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const contactList = await ContactList.findOne({
      where: {
        id: req.params.id,
        userId: req.user.id
      },
      transaction
    });

    if (!contactList) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Contact list not found or access denied'
      });
    }

    // Check if the list is used in any campaigns
    const campaignsUsingList = await Campaign.findOne({
      where: {
        contactListId: contactList.id
      },
      transaction
    });

    if (campaignsUsingList) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Cannot delete contact list that is used in campaigns'
      });
    }

    await contactList.destroy({ transaction });
    await transaction.commit();

    return res.status(200).json({
      success: true,
      message: 'Contact list deleted successfully'
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Delete contact list error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error deleting contact list',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Add contacts to a list
exports.addContactsToList = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const transaction = await sequelize.transaction();

  try {
    const { contactIds } = req.body;

    const contactList = await ContactList.findOne({
      where: {
        id: req.params.id,
        userId: req.user.id
      },
      transaction
    });

    if (!contactList) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Contact list not found or access denied'
      });
    }

    if (!contactIds || contactIds.length === 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'No contacts provided'
      });
    }

    // Get the contacts
    const contacts = await Contact.findAll({
      where: {
        id: { [Op.in]: contactIds }
      },
      transaction
    });

    if (contacts.length === 0) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'No valid contacts found'
      });
    }

    // Add contacts to the list
    await contactList.addContacts(contacts, { transaction });

    // Update list count and lastUpdated
    await contactList.update({
      count: contactList.count + contacts.length,
      lastUpdated: new Date()
    }, { transaction });

    await transaction.commit();

    return res.status(200).json({
      success: true,
      message: `${contacts.length} contacts added to list successfully`,
      contactList: {
        id: contactList.id,
        name: contactList.name,
        count: contactList.count + contacts.length
      }
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Add contacts to list error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error adding contacts to list',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Remove contacts from a list
exports.removeContactsFromList = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const transaction = await sequelize.transaction();

  try {
    const { contactIds } = req.body;

    const contactList = await ContactList.findOne({
      where: {
        id: req.params.id,
        userId: req.user.id
      },
      transaction
    });

    if (!contactList) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Contact list not found or access denied'
      });
    }

    if (!contactIds || contactIds.length === 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'No contacts provided'
      });
    }

    // Get the contacts
    const contacts = await Contact.findAll({
      where: {
        id: { [Op.in]: contactIds }
      },
      include: [
        {
          model: ContactList,
          as: 'lists',
          where: { id: contactList.id },
          attributes: [],
          through: { attributes: [] }
        }
      ],
      transaction
    });

    if (contacts.length === 0) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'No valid contacts found in the list'
      });
    }

    // Remove contacts from the list
    await contactList.removeContacts(contacts, { transaction });

    // Update list count and lastUpdated
    await contactList.update({
      count: Math.max(0, contactList.count - contacts.length),
      lastUpdated: new Date()
    }, { transaction });

    await transaction.commit();

    return res.status(200).json({
      success: true,
      message: `${contacts.length} contacts removed from list successfully`,
      contactList: {
        id: contactList.id,
        name: contactList.name,
        count: Math.max(0, contactList.count - contacts.length)
      }
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Remove contacts from list error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error removing contacts from list',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}; 