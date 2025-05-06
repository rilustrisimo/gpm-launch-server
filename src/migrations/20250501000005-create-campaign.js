'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Campaigns', {
      id: {
        allowNull: false,
        primaryKey: true,
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4
      },
      userId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'Users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      subject: {
        type: Sequelize.STRING,
        allowNull: false
      },
      templateId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'Templates',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      contactListId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'ContactLists',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      status: {
        type: Sequelize.ENUM('draft', 'scheduled', 'sending', 'completed'),
        defaultValue: 'draft'
      },
      scheduledFor: {
        type: Sequelize.DATE
      },
      sentAt: {
        type: Sequelize.DATE
      },
      totalRecipients: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      openRate: {
        type: Sequelize.FLOAT,
        defaultValue: 0
      },
      clickRate: {
        type: Sequelize.FLOAT,
        defaultValue: 0
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
    await queryInterface.dropTable('Campaigns');
  }
}; 