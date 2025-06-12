/**
 * Test Real Turtle Send Campaign
 * This script creates and sends a real turtle campaign to verify the complete flow
 */

const { Campaign, Template, ContactList, Contact, User, sequelize } = require('./src/models');

async function testRealTurtleSend() {
  console.log('🐢 Testing Real Turtle Send Campaign\n');
  
  try {
    // 1. Find or create test user
    console.log('1. Setting up test user...');
    const [testUser] = await User.findOrCreate({
      where: { email: 'turtle-test@example.com' },
      defaults: {
        firstName: 'Turtle',
        lastName: 'Test',
        email: 'turtle-test@example.com',
        password: 'hashedpassword'
      }
    });
    console.log(`   ✓ User: ${testUser.email} (ID: ${testUser.id})`);

    // 2. Find or create test template  
    console.log('\n2. Setting up test template...');
    const [testTemplate] = await Template.findOrCreate({
      where: { name: 'Real Turtle Test Template' },
      defaults: {
        name: 'Real Turtle Test Template',
        subject: 'Real Turtle Test Email',
        html: '<h1>Hello {{firstName}}!</h1><p>This is a real turtle send test email.</p>',
        content: 'Hello {{firstName}}! This is a real turtle send test email.',
        userId: testUser.id
      }
    });
    console.log(`   ✓ Template: ${testTemplate.name} (ID: ${testTemplate.id})`);

    // 3. Create test contacts
    console.log('\n3. Creating test contacts...');
    const testContacts = [];
    for (let i = 1; i <= 5; i++) {
      const [contact] = await Contact.findOrCreate({
        where: { email: `turtle${i}@example.com` },
        defaults: {
          firstName: `Turtle${i}`,
          lastName: 'Test',
          email: `turtle${i}@example.com`,
          userId: testUser.id
        }
      });
      testContacts.push(contact);
    }
    console.log(`   ✓ Created ${testContacts.length} test contacts`);

    // 4. Create test contact list and associate contacts
    console.log('\n4. Creating test contact list...');
    const [testContactList] = await ContactList.findOrCreate({
      where: { name: 'Real Turtle Test List' },
      defaults: {
        name: 'Real Turtle Test List',
        description: 'Real turtle test contact list',
        userId: testUser.id,
        count: testContacts.length
      }
    });
    console.log(`   ✓ Contact List: ${testContactList.name} (ID: ${testContactList.id})`);
    
    // Associate contacts with the contact list
    console.log('   • Associating contacts with contact list...');
    for (const contact of testContacts) {
      try {
        await testContactList.addContact(contact);
      } catch (error) {
        // Contact might already be associated, skip if duplicate error
        if (!error.message.includes('PRIMARY')) {
          throw error;
        }
      }
    }
    console.log(`   ✓ Associated ${testContacts.length} contacts with contact list`);

    // 5. Create turtle campaign
    console.log('\n5. Creating turtle campaign...');
    const turtleCampaign = await Campaign.create({
      name: 'Real Turtle Send Test Campaign',
      subject: 'Real Turtle Test Email',
      templateId: testTemplate.id,
      contactListId: testContactList.id,
      userId: testUser.id,
      totalRecipients: testContacts.length,
      sendingMode: 'turtle',
      emailsPerMinute: 12, // 1 email every 5 seconds
      maxConcurrentBatches: 1,
      status: 'draft'
    });
    
    console.log(`   ✓ Campaign created: ${turtleCampaign.name}`);
    console.log(`   ✓ Campaign ID: ${turtleCampaign.id}`);
    console.log(`   ✓ Sending Mode: ${turtleCampaign.sendingMode}`);
    console.log(`   ✓ Rate: ${turtleCampaign.emailsPerMinute} emails/minute`);
    console.log(`   ✓ Status: ${turtleCampaign.status}`);
    
    // Calculate expected timing
    const delayBetweenEmails = (60 * 1000) / turtleCampaign.emailsPerMinute;
    const totalTimeMs = (testContacts.length - 1) * delayBetweenEmails;
    const totalTimeMinutes = totalTimeMs / (60 * 1000);
    
    console.log(`\n📊 Campaign Analysis:`);
    console.log(`   • Total recipients: ${testContacts.length}`);
    console.log(`   • Rate: ${turtleCampaign.emailsPerMinute} emails/minute`);
    console.log(`   • Delay between emails: ${delayBetweenEmails / 1000} seconds`);
    console.log(`   • Estimated completion time: ${totalTimeMinutes.toFixed(2)} minutes`);

    // 6. Load campaign with associations for worker
    console.log('\n6. Loading campaign with associations...');
    const campaignWithAssociations = await Campaign.findByPk(turtleCampaign.id, {
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
              as: 'contacts'
            }
          ]
        }
      ]
    });
    
    if (!campaignWithAssociations) {
      throw new Error('Failed to load campaign with associations');
    }
    
    console.log(`   ✓ Campaign loaded with ${campaignWithAssociations.contactList.contacts.length} contacts`);

    // 7. Test worker data preparation
    console.log('\n7. Testing worker data preparation...');
    const workerData = {
      id: campaignWithAssociations.id,
      name: campaignWithAssociations.name,
      subject: campaignWithAssociations.subject,
      sendingMode: campaignWithAssociations.sendingMode || 'normal',
      emailsPerMinute: campaignWithAssociations.emailsPerMinute,
      maxConcurrentBatches: campaignWithAssociations.maxConcurrentBatches || 10,
      template: {
        id: campaignWithAssociations.template.id,
        subject: campaignWithAssociations.subject || campaignWithAssociations.template.subject,
        content: campaignWithAssociations.template.html || campaignWithAssociations.template.content
      },
      recipients: campaignWithAssociations.contactList.contacts.map(contact => ({
        id: contact.id,
        email: contact.email,
        firstName: contact.firstName,
        lastName: contact.lastName,
        metadata: contact.metadata || {}
      }))
    };
    
    console.log(`   ✓ Worker data prepared`);
    console.log(`   ✓ Recipients: ${workerData.recipients.length}`);
    console.log(`   ✓ Template content: ${workerData.template.content.substring(0, 50)}...`);
    
    // 8. Test worker communication (if worker is available)
    console.log('\n8. Testing worker communication...');
    const WORKER_URL = process.env.WORKER_URL || 'https://worker.gravitypointmedia.com';
    const WORKER_API_KEY = process.env.WORKER_API_KEY;
    
    if (!WORKER_API_KEY) {
      console.log('   ❌ No WORKER_API_KEY found in environment');
      console.log('   ⚠️  Skipping worker communication test');
    } else {
      try {
        const axios = require('axios');
        
        // Test worker health
        const healthResponse = await axios.get(`${WORKER_URL}/health`, {
          headers: {
            'Authorization': `Bearer ${WORKER_API_KEY}`
          },
          timeout: 5000
        });
        
        console.log(`   ✓ Worker health check: ${healthResponse.status}`);
        
        // Initialize campaign in worker
        const initResponse = await axios.post(`${WORKER_URL}/api/campaign/${turtleCampaign.id}/initialize`, workerData, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${WORKER_API_KEY}`
          },
          timeout: 10000
        });
        
        console.log(`   ✓ Campaign initialized in worker: ${initResponse.status}`);
        console.log(`   ✓ Worker response: ${JSON.stringify(initResponse.data)}`);
        
        // Start campaign in worker (THIS WILL ACTUALLY SEND EMAILS)
        console.log('\n⚠️  READY TO START TURTLE SEND CAMPAIGN');
        console.log('   This will actually send emails to the test contacts.');
        console.log('   Campaign will send at 12 emails/minute (1 every 5 seconds)');
        console.log('   Total time: ~25 seconds for 5 emails');
        
        // Uncomment the lines below to actually start the campaign
        /*
        const startResponse = await axios.post(`${WORKER_URL}/api/campaign/${turtleCampaign.id}/start`, {}, {
          headers: {
            'Authorization': `Bearer ${WORKER_API_KEY}`
          },
          timeout: 10000
        });
        
        console.log(`   ✓ Campaign started in worker: ${startResponse.status}`);
        console.log(`   ✓ Worker response: ${JSON.stringify(startResponse.data)}`);
        
        // Update campaign status
        await turtleCampaign.update({ status: 'sending' });
        console.log(`   ✓ Campaign status updated to: sending`);
        */
        
      } catch (workerError) {
        console.log(`   ❌ Worker communication failed: ${workerError.message}`);
        console.log(`   ⚠️  Worker may not be available or configured`);
      }
    }

    // 9. Cleanup option
    console.log('\n9. Cleanup...');
    console.log('   Campaign created but not sent (for safety)');
    console.log(`   To delete test campaign: Campaign.destroy({ where: { id: '${turtleCampaign.id}' } })`);
    
    console.log('\n✅ Real Turtle Send Test Complete!');
    console.log('\n📝 Summary:');
    console.log(`   • Campaign ID: ${turtleCampaign.id}`);
    console.log(`   • Sending Mode: ${turtleCampaign.sendingMode}`);
    console.log(`   • Rate: ${turtleCampaign.emailsPerMinute} emails/minute`);
    console.log(`   • Recipients: ${testContacts.length}`);
    console.log(`   • Worker data prepared: ✓`);
    console.log(`   • Ready to send: ${WORKER_API_KEY ? '✓' : '❌ (no API key)'}`);
    
    return turtleCampaign;
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    throw error;
  }
}

// Run the test
if (require.main === module) {
  testRealTurtleSend()
    .then(() => {
      console.log('\n🎉 Test completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Test failed:', error);
      process.exit(1);
    });
}

module.exports = { testRealTurtleSend };
