const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class CampaignStat extends Model {
    static associate(models) {
      // define associations here
      CampaignStat.belongsTo(models.Campaign, {
        foreignKey: 'campaignId',
        as: 'campaign'
      });
      
      CampaignStat.belongsTo(models.Contact, {
        foreignKey: 'contactId',
        as: 'contact'
      });
    }
  }
  
  CampaignStat.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    campaignId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'Campaigns',
        key: 'id'
      }
    },
    contactId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'Contacts',
        key: 'id'
      }
    },
    sent: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    delivered: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    opened: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    clicked: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    bounced: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    sentAt: {
      type: DataTypes.DATE
    },
    deliveredAt: {
      type: DataTypes.DATE
    },
    openedAt: {
      type: DataTypes.DATE
    },
    clickedAt: {
      type: DataTypes.DATE
    }
  }, {
    sequelize,
    modelName: 'CampaignStat'
  });
  
  return CampaignStat;
}; 