'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('Campaigns', 'fromName', {
      type: Sequelize.STRING,
      allowNull: true,
      defaultValue: 'Gravity Point Media'
    });

    await queryInterface.addColumn('Campaigns', 'fromEmail', {
      type: Sequelize.STRING,
      allowNull: true,
      defaultValue: 'support@send.gravitypointmedia.com'
    });

    await queryInterface.addColumn('Campaigns', 'replyToEmail', {
      type: Sequelize.STRING,
      allowNull: true,
      defaultValue: 'support@gravitypointmedia.com'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('Campaigns', 'fromName');
    await queryInterface.removeColumn('Campaigns', 'fromEmail');
    await queryInterface.removeColumn('Campaigns', 'replyToEmail');
  }
};
