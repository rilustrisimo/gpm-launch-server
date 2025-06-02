'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Add tracking-related columns to the Contact table
    await queryInterface.addColumn('Contacts', 'lastOpened', {
      type: Sequelize.DATE,
      allowNull: true
    });
    
    await queryInterface.addColumn('Contacts', 'lastClicked', {
      type: Sequelize.DATE,
      allowNull: true
    });
    
    await queryInterface.addColumn('Contacts', 'lastClickedLink', {
      type: Sequelize.TEXT,
      allowNull: true
    });
    
    await queryInterface.addColumn('Contacts', 'lastDelivered', {
      type: Sequelize.DATE,
      allowNull: true
    });
    
    await queryInterface.addColumn('Contacts', 'unsubscribed', {
      type: Sequelize.BOOLEAN,
      defaultValue: false
    });
    
    await queryInterface.addColumn('Contacts', 'unsubscribedAt', {
      type: Sequelize.DATE,
      allowNull: true
    });
    
    await queryInterface.addColumn('Contacts', 'hasBounced', {
      type: Sequelize.BOOLEAN,
      defaultValue: false
    });
    
    await queryInterface.addColumn('Contacts', 'bounceType', {
      type: Sequelize.STRING,
      allowNull: true
    });
    
    await queryInterface.addColumn('Contacts', 'lastBouncedAt', {
      type: Sequelize.DATE,
      allowNull: true
    });
    
    await queryInterface.addColumn('Contacts', 'hasComplained', {
      type: Sequelize.BOOLEAN,
      defaultValue: false
    });
    
    await queryInterface.addColumn('Contacts', 'complaintType', {
      type: Sequelize.STRING,
      allowNull: true
    });
    
    await queryInterface.addColumn('Contacts', 'lastComplainedAt', {
      type: Sequelize.DATE,
      allowNull: true
    });
  },

  async down(queryInterface, Sequelize) {
    // Remove the columns in reverse order
    await queryInterface.removeColumn('Contacts', 'lastComplainedAt');
    await queryInterface.removeColumn('Contacts', 'complaintType');
    await queryInterface.removeColumn('Contacts', 'hasComplained');
    await queryInterface.removeColumn('Contacts', 'lastBouncedAt');
    await queryInterface.removeColumn('Contacts', 'bounceType');
    await queryInterface.removeColumn('Contacts', 'hasBounced');
    await queryInterface.removeColumn('Contacts', 'unsubscribedAt');
    await queryInterface.removeColumn('Contacts', 'unsubscribed');
    await queryInterface.removeColumn('Contacts', 'lastDelivered');
    await queryInterface.removeColumn('Contacts', 'lastClickedLink');
    await queryInterface.removeColumn('Contacts', 'lastClicked');
    await queryInterface.removeColumn('Contacts', 'lastOpened');
  }
};
