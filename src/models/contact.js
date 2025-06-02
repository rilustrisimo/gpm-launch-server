const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Contact extends Model {
    static associate(models) {
      // define associations here
      Contact.belongsToMany(models.ContactList, {
        through: 'ContactListContacts',
        foreignKey: 'contactId',
        otherKey: 'contactListId',
        as: 'lists'
      });
    }
  }
  
  Contact.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true
      }
    },
    firstName: {
      type: DataTypes.STRING
    },
    lastName: {
      type: DataTypes.STRING
    },
    status: {
      type: DataTypes.ENUM('active', 'unsubscribed', 'bounced'),
      defaultValue: 'active'
    },
    company: {
      type: DataTypes.STRING
    },
    metadata: {
      type: DataTypes.JSON
    },
    lastEngagement: {
      type: DataTypes.DATE
    },
    lastOpened: {
      type: DataTypes.DATE
    },
    lastClicked: {
      type: DataTypes.DATE
    },
    lastClickedLink: {
      type: DataTypes.TEXT
    },
    lastDelivered: {
      type: DataTypes.DATE
    },
    unsubscribed: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    unsubscribedAt: {
      type: DataTypes.DATE
    },
    hasBounced: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    bounceType: {
      type: DataTypes.STRING
    },
    lastBouncedAt: {
      type: DataTypes.DATE
    },
    hasComplained: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    complaintType: {
      type: DataTypes.STRING
    },
    lastComplainedAt: {
      type: DataTypes.DATE
    }
  }, {
    sequelize,
    modelName: 'Contact'
  });
  
  return Contact;
}; 