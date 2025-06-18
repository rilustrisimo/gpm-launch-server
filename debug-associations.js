const { Campaign, Template, ContactList, Contact, ContactListContacts, sequelize } = require('./src/models');

async function debugAssociations() {
  try {
    console.log('Debugging associations...');
    
    // Direct SQL query to check the join table
    const rawAssociations = await sequelize.query(`
      SELECT clc.contactListId, clc.contactId, 
             cl.name as listName, 
             c.email as contactEmail
      FROM ContactListContacts clc
      JOIN ContactLists cl ON cl.id = clc.contactListId
      JOIN Contacts c ON c.id = clc.contactId
      LIMIT 10
    `, { type: sequelize.QueryTypes.SELECT });
    
    console.log('\n📋 Raw associations from database:');
    rawAssociations.forEach(assoc => {
      console.log(`  - ${assoc.listName}: ${assoc.contactEmail}`);
    });
    
    // Try different ways to load the association
    console.log('\n🔍 Testing different association loading methods:');
    
    // Method 1: Include with explicit through
    try {
      const list1 = await ContactList.findOne({
        include: [
          {
            model: Contact,
            as: 'contacts',
            through: { attributes: [] },
            attributes: ['id', 'email']
          }
        ]
      });
      console.log(`✅ Method 1 - Contacts in list: ${list1?.contacts?.length || 0}`);
    } catch (error) {
      console.log(`❌ Method 1 failed: ${error.message}`);
    }
    
    // Method 2: Find specific list and get contacts
    try {
      const specificList = await ContactList.findOne({
        where: { name: 'Turtle Test List' }
      });
      
      if (specificList) {
        const contacts = await specificList.getContacts();
        console.log(`✅ Method 2 - Contacts via getContacts(): ${contacts.length}`);
        if (contacts.length > 0) {
          console.log(`    First contact: ${contacts[0].email}`);
        }
      }
    } catch (error) {
      console.log(`❌ Method 2 failed: ${error.message}`);
    }
    
    // Method 3: Check model associations
    console.log('\n🔍 Model associations:');
    console.log('ContactList associations:', Object.keys(ContactList.associations || {}));
    console.log('Contact associations:', Object.keys(Contact.associations || {}));
    
    // Method 4: Try manual join
    try {
      const manualQuery = await ContactList.findAll({
        attributes: ['id', 'name'],
        include: [
          {
            model: Contact,
            as: 'contacts',
            attributes: ['id', 'email'],
            through: { 
              model: ContactListContacts,
              attributes: []
            }
          }
        ],
        limit: 1
      });
      
      console.log(`✅ Method 4 - Manual join contacts: ${manualQuery[0]?.contacts?.length || 0}`);
    } catch (error) {
      console.log(`❌ Method 4 failed: ${error.message}`);
    }
    
  } catch (error) {
    console.error('❌ Error debugging associations:', error.message);
    console.error(error.stack);
  }
}

debugAssociations()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
