const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ContactListContacts extends Model {
    static associate(models) {
      // define associations here
    }
  }
  
  ContactListContacts.init({
    contactListId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'ContactLists',
        key: 'id'
      },
      primaryKey: true
    },
    contactId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'Contacts',
        key: 'id'
      },
      primaryKey: true
    },
    addedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    sequelize,
    modelName: 'ContactListContacts',
    tableName: 'ContactListContacts'
  });
  
  return ContactListContacts;
}; 