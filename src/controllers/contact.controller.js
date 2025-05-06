const { Contact, ContactList, ContactListContacts, sequelize } = require('../models');
const { Op } = require('sequelize');
const { validationResult } = require('express-validator');

// Get all contacts
exports.getContacts = async (req, res) => {
  try {
    const { search, status } = req.query;
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

    const contacts = await Contact.findAll({
      where: whereClause,
      order: [['createdAt', 'DESC']]
    });

    return res.status(200).json({
      success: true,
      contacts
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
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    const { email, firstName, lastName, company, status, metadata, listIds } = req.body;

    // Check if contact already exists
    const existingContact = await Contact.findOne({ where: { email } });
    if (existingContact) {
      return res.status(409).json({
        success: false,
        message: 'Contact with this email already exists',
        contact: existingContact
      });
    }

    const contact = await Contact.create({
      email,
      firstName,
      lastName,
      company,
      status: status || 'active',
      metadata
    });

    // Add contact to lists if provided
    if (listIds && listIds.length > 0) {
      const contactLists = await ContactList.findAll({
        where: {
          id: { [Op.in]: listIds },
          userId: req.user.id
        }
      });

      if (contactLists.length > 0) {
        await contact.addLists(contactLists);
        
        // Update list counts
        for (const list of contactLists) {
          await list.update({ count: list.count + 1, lastUpdated: new Date() });
        }
      }
    }

    return res.status(201).json({
      success: true,
      message: 'Contact created successfully',
      contact
    });
  } catch (error) {
    console.error('Create contact error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error creating contact',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Update a contact
exports.updateContact = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    const { firstName, lastName, company, status, metadata, listIds } = req.body;

    const contact = await Contact.findByPk(req.params.id);

    if (!contact) {
      return res.status(404).json({
        success: false,
        message: 'Contact not found'
      });
    }

    await contact.update({
      firstName: firstName !== undefined ? firstName : contact.firstName,
      lastName: lastName !== undefined ? lastName : contact.lastName,
      company: company !== undefined ? company : contact.company,
      status: status || contact.status,
      metadata: metadata !== undefined ? metadata : contact.metadata
    });

    // Update contact lists if provided
    if (listIds) {
      const transaction = await sequelize.transaction();
      
      try {
        // Get existing lists for this contact
        const currentLists = await contact.getLists({ transaction });
        const currentListIds = currentLists.map(list => list.id);
        
        // Find lists to add (not in current lists)
        const listsToAdd = listIds.filter(id => !currentListIds.includes(id));
        
        // Find lists to remove (in current lists but not in new list)
        const listsToRemove = currentListIds.filter(id => !listIds.includes(id));
        
        if (listsToAdd.length > 0) {
          const newLists = await ContactList.findAll({
            where: {
              id: { [Op.in]: listsToAdd },
              userId: req.user.id
            },
            transaction
          });
          
          if (newLists.length > 0) {
            await contact.addLists(newLists, { transaction });
            
            // Update list counts
            for (const list of newLists) {
              await list.update({ 
                count: list.count + 1, 
                lastUpdated: new Date() 
              }, { transaction });
            }
          }
        }
        
        if (listsToRemove.length > 0) {
          const removeLists = await ContactList.findAll({
            where: {
              id: { [Op.in]: listsToRemove }
            },
            transaction
          });
          
          if (removeLists.length > 0) {
            await contact.removeLists(removeLists, { transaction });
            
            // Update list counts
            for (const list of removeLists) {
              await list.update({ 
                count: Math.max(0, list.count - 1), 
                lastUpdated: new Date() 
              }, { transaction });
            }
          }
        }
        
        await transaction.commit();
      } catch (error) {
        await transaction.rollback();
        throw error;
      }
    }

    // Get updated contact with lists
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