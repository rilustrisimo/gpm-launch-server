'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Using MySQL/MariaDB syntax for altering ENUM column
    await queryInterface.sequelize.query(`
      ALTER TABLE Campaigns 
      MODIFY COLUMN status ENUM('draft', 'scheduled', 'sending', 'processing', 'completed', 'stopped')
      DEFAULT 'draft'
    `);
  },

  async down(queryInterface, Sequelize) {
    // Using MySQL/MariaDB syntax for reverting ENUM column
    // NOTE: This may fail if data with 'stopped' or 'processing' status exists
    await queryInterface.sequelize.query(`
      ALTER TABLE Campaigns 
      MODIFY COLUMN status ENUM('draft', 'scheduled', 'sending', 'completed')
      DEFAULT 'draft'
    `);
  }
};
