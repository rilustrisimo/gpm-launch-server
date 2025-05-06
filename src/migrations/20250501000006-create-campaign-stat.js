'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('CampaignStats', {
      id: {
        allowNull: false,
        primaryKey: true,
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4
      },
      campaignId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'Campaigns',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      contactId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'Contacts',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      sent: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      delivered: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      opened: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      clicked: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      bounced: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      sentAt: {
        type: Sequelize.DATE
      },
      deliveredAt: {
        type: Sequelize.DATE
      },
      openedAt: {
        type: Sequelize.DATE
      },
      clickedAt: {
        type: Sequelize.DATE
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });
  },
  
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('CampaignStats');
  }
}; 