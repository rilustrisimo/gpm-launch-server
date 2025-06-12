'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Add turtle send configuration fields to Campaign table
    await queryInterface.addColumn('Campaigns', 'sendingMode', {
      type: Sequelize.ENUM('normal', 'turtle'),
      defaultValue: 'normal',
      allowNull: false
    });
    
    await queryInterface.addColumn('Campaigns', 'emailsPerMinute', {
      type: Sequelize.INTEGER,
      defaultValue: null, // null means use system default
      allowNull: true
    });
    
    await queryInterface.addColumn('Campaigns', 'maxConcurrentBatches', {
      type: Sequelize.INTEGER,
      defaultValue: 10, // normal mode default
      allowNull: false
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('Campaigns', 'maxConcurrentBatches');
    await queryInterface.removeColumn('Campaigns', 'emailsPerMinute');
    await queryInterface.removeColumn('Campaigns', 'sendingMode');
  }
};
