const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Campaign extends Model {
    static associate(models) {
      // define associations here
      Campaign.belongsTo(models.User, {
        foreignKey: 'userId',
        as: 'user'
      });
      
      Campaign.belongsTo(models.Template, {
        foreignKey: 'templateId',
        as: 'template'
      });
      
      Campaign.belongsTo(models.ContactList, {
        foreignKey: 'contactListId',
        as: 'contactList'
      });
      
      Campaign.hasMany(models.CampaignStat, {
        foreignKey: 'campaignId',
        as: 'stats'
      });
    }
  }
  
  Campaign.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'Users',
        key: 'id'
      }
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    subject: {
      type: DataTypes.STRING,
      allowNull: false
    },
    templateId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'Templates',
        key: 'id'
      }
    },
    contactListId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'ContactLists',
        key: 'id'
      }
    },
    status: {
      type: DataTypes.ENUM('draft', 'scheduled', 'sending', 'completed'),
      defaultValue: 'draft'
    },
    scheduledFor: {
      type: DataTypes.DATE
    },
    sentAt: {
      type: DataTypes.DATE
    },
    totalRecipients: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    openRate: {
      type: DataTypes.FLOAT,
      defaultValue: 0
    },
    clickRate: {
      type: DataTypes.FLOAT,
      defaultValue: 0
    }
  }, {
    sequelize,
    modelName: 'Campaign'
  });
  
  return Campaign;
}; 