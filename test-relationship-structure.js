const { Campaign, Template, ContactList, Contact, User } = require('./src/models');

async function testRelationshipStructure() {
  try {
    console.log('Testing relationship structure...');
    
    // Test if we can load a campaign with its contact list and contacts
    const campaign = await Campaign.findOne({
      include: [
        {
          model: Template,
          as: 'template'
        },
        {
          model: ContactList,
          as: 'contactList',
          include: [
            {
              model: Contact,
              as: 'contacts',
              attributes: ['id', 'email', 'firstName', 'lastName']
            }
          ]
        }
      ]
    });

    if (campaign) {
      console.log('✅ Campaign found:', campaign.id);
      console.log('✅ Template:', campaign.template ? campaign.template.id : 'not found');
      console.log('✅ ContactList:', campaign.contactList ? campaign.contactList.id : 'not found');
      console.log('✅ Contacts in list:', campaign.contactList && campaign.contactList.contacts ? campaign.contactList.contacts.length : 0);
      
      if (campaign.contactList && campaign.contactList.contacts && campaign.contactList.contacts.length > 0) {
        console.log('✅ Sample contact:', {
          id: campaign.contactList.contacts[0].id,
          email: campaign.contactList.contacts[0].email,
          firstName: campaign.contactList.contacts[0].firstName,
          lastName: campaign.contactList.contacts[0].lastName
        });
      }
    } else {
      console.log('❌ No campaigns found');
    }

    // Test contact list separately
    const contactList = await ContactList.findOne({
      include: [
        {
          model: Contact,
          as: 'contacts',
          attributes: ['id', 'email', 'firstName', 'lastName']
        }
      ]
    });

    if (contactList) {
      console.log('✅ ContactList found:', contactList.id);
      console.log('✅ Contacts in list:', contactList.contacts ? contactList.contacts.length : 0);
    } else {
      console.log('❌ No contact lists found');
    }

    // Test contact structure
    const contact = await Contact.findOne({
      include: [
        {
          model: ContactList,
          as: 'lists',
          attributes: ['id', 'name']
        }
      ]
    });

    if (contact) {
      console.log('✅ Contact found:', contact.email);
      console.log('✅ Lists for contact:', contact.lists ? contact.lists.length : 0);
    } else {
      console.log('❌ No contacts found');
    }

    console.log('\nDatabase relationship structure test completed!');
    
  } catch (error) {
    console.error('❌ Error testing relationship structure:', error.message);
    console.error(error.stack);
  }
}

testRelationshipStructure()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
