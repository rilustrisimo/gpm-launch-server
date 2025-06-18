const { Campaign, Template, ContactList, Contact, ContactListContacts, User } = require('./src/models');

async function testContactListData() {
  try {
    console.log('Testing contact list data...');
    
    // Count total contacts
    const totalContacts = await Contact.count();
    console.log(`📊 Total contacts in system: ${totalContacts}`);
    
    // Count total contact lists
    const totalContactLists = await ContactList.count();
    console.log(`📊 Total contact lists: ${totalContactLists}`);
    
    // Count contact list associations
    const totalAssociations = await ContactListContacts.count();
    console.log(`📊 Total contact-list associations: ${totalAssociations}`);
    
    // Get some sample data
    const sampleContacts = await Contact.findAll({
      limit: 5,
      attributes: ['id', 'email', 'firstName', 'lastName']
    });
    
    console.log('\n📋 Sample contacts:');
    sampleContacts.forEach(contact => {
      console.log(`  - ${contact.email} (${contact.firstName} ${contact.lastName})`);
    });
    
    const sampleLists = await ContactList.findAll({
      limit: 5,
      attributes: ['id', 'name', 'count']
    });
    
    console.log('\n📋 Sample contact lists:');
    sampleLists.forEach(list => {
      console.log(`  - ${list.name} (count: ${list.count})`);
    });
    
    // Get associations
    const associations = await ContactListContacts.findAll({
      limit: 10,
      attributes: ['contactListId', 'contactId']
    });
    
    console.log('\n📋 Sample associations:');
    associations.forEach(assoc => {
      console.log(`  - List: ${assoc.contactListId} -> Contact: ${assoc.contactId}`);
    });
    
    // Try to find a contact list with contacts
    const listWithContacts = await ContactList.findOne({
      include: [
        {
          model: Contact,
          as: 'contacts',
          attributes: ['id', 'email', 'firstName', 'lastName']
        }
      ],
      order: [['count', 'DESC']]
    });
    
    if (listWithContacts && listWithContacts.contacts && listWithContacts.contacts.length > 0) {
      console.log('\n✅ Found list with contacts:');
      console.log(`  List: ${listWithContacts.name} (${listWithContacts.contacts.length} contacts)`);
      listWithContacts.contacts.slice(0, 3).forEach(contact => {
        console.log(`    - ${contact.email}`);
      });
    } else {
      console.log('\n❌ No contact lists have contacts assigned');
    }
    
    console.log('\nContact list data test completed!');
    
  } catch (error) {
    console.error('❌ Error testing contact list data:', error.message);
    console.error(error.stack);
  }
}

testContactListData()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
