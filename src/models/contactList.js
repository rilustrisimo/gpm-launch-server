const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ContactList extends Model {
    static associate(models) {
      // define associations here
      ContactList.belongsTo(models.User, {
        foreignKey: 'userId',
        as: 'user'
      });
      
      ContactList.hasMany(models.Campaign, {
        foreignKey: 'contactListId',
        as: 'campaigns'
      });
      
      ContactList.belongsToMany(models.Contact, {
        through: 'ContactListContacts',
        foreignKey: 'contactListId',
        otherKey: 'contactId',
        as: 'contacts'
      });
    }
  }
  
  ContactList.init({
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
    description: {
      type: DataTypes.TEXT
    },
    count: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    lastUpdated: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    sequelize,
    modelName: 'ContactList'
  });
  
  return ContactList;
}; 