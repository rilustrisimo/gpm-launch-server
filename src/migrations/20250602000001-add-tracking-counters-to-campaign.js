'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Add tracking-related counters to the Campaign table
    await queryInterface.addColumn('Campaigns', 'sent', {
      type: Sequelize.INTEGER,
      defaultValue: 0
    });
    
    await queryInterface.addColumn('Campaigns', 'delivered', {
      type: Sequelize.INTEGER,
      defaultValue: 0
    });
    
    await queryInterface.addColumn('Campaigns', 'opens', {
      type: Sequelize.INTEGER,
      defaultValue: 0
    });
    
    await queryInterface.addColumn('Campaigns', 'clicks', {
      type: Sequelize.INTEGER,
      defaultValue: 0
    });
    
    await queryInterface.addColumn('Campaigns', 'unsubscribes', {
      type: Sequelize.INTEGER,
      defaultValue: 0
    });
    
    await queryInterface.addColumn('Campaigns', 'bounces', {
      type: Sequelize.INTEGER,
      defaultValue: 0
    });
    
    await queryInterface.addColumn('Campaigns', 'complaints', {
      type: Sequelize.INTEGER,
      defaultValue: 0
    });
  },

  async down(queryInterface, Sequelize) {
    // Remove the columns in reverse order
    await queryInterface.removeColumn('Campaigns', 'complaints');
    await queryInterface.removeColumn('Campaigns', 'bounces');
    await queryInterface.removeColumn('Campaigns', 'unsubscribes');
    await queryInterface.removeColumn('Campaigns', 'clicks');
    await queryInterface.removeColumn('Campaigns', 'opens');
    await queryInterface.removeColumn('Campaigns', 'delivered');
    await queryInterface.removeColumn('Campaigns', 'sent');
  }
};
