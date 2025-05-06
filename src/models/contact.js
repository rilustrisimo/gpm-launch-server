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
    }
  }, {
    sequelize,
    modelName: 'Contact'
  });
  
  return Contact;
}; 