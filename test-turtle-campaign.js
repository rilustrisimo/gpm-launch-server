#!/usr/bin/env node

/**
 * Create and Test Turtle Send Campaign
 * 
 * This script creates a turtle send campaign with a small test list
 * and monitors the sending process to identify bottlenecks.
 */

const { Campaign, Template, ContactList, Contact, User, sequelize } = require('./src/models');
const axios = require('axios');

// Worker configuration
const WORKER_URL = process.env.WORKER_URL || 'https://worker.gravitypointmedia.com';
const WORKER_API_KEY = process.env.WORKER_API_KEY || '14d18a0ab3ee46199da20077529788dd';

const workerClient = axios.create({
  baseURL: WORKER_URL,
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${WORKER_API_KEY}`
  },
  validateStatus: function (status) {
    return status < 500;
  }
});

async function createAndTestTurtleCampaign() {
  const transaction = await sequelize.transaction();
  
  try {
    console.log('🐢 Creating and Testing Turtle Send Campaign');
    console.log('=============================================\n');

    // Step 1: Create test user
    console.log('1. Setting up test data...');
    const [testUser] = await User.findOrCreate({
      where: { email: 'turtle-test@example.com' },
      defaults: {
        firstName: 'Turtle',
        lastName: 'Test',
        email: 'turtle-test@example.com',
        password: 'hashedpassword'
      },
      transaction
    });

    // Step 2: Create test template
    const [testTemplate] = await Template.findOrCreate({
      where: { name: 'Turtle Test Template' },
      defaults: {
        name: 'Turtle Test Template',
        subject: 'Turtle Send Test',
        content: '<p>Hello {{firstName}}, this is a turtle send test!</p>',
        userId: testUser.id
      },
      transaction
    });

    // Step 3: Create test contacts
    const testContacts = [];
    for (let i = 1; i <= 5; i++) {
      const [contact] = await Contact.findOrCreate({
        where: { email: `turtle-test${i}@example.com` },
        defaults: {
          firstName: `Turtle${i}`,
          lastName: 'Test',
          email: `turtle-test${i}@example.com`,
          userId: testUser.id
        },
        transaction
      });
      testContacts.push(contact);
    }

    // Step 4: Create test contact list
    const [testContactList] = await ContactList.findOrCreate({
      where: { name: 'Turtle Test List' },
      defaults: {
        name: 'Turtle Test List',
        description: 'Test list for turtle send debugging',
        userId: testUser.id,
        count: testContacts.length
      },
      transaction
    });

    // Add contacts to the list
    for (const contact of testContacts) {
      await testContactList.addContact(contact, { transaction });
    }

    console.log('   ✅ Test data created');
    console.log(`   👤 User: ${testUser.email}`);
    console.log(`   📧 Template: ${testTemplate.name}`);
    console.log(`   📋 Contact List: ${testContactList.name} (${testContacts.length} contacts)`);

    // Step 5: Create turtle send campaign
    console.log('\n2. Creating turtle send campaign...');
    const turtleCampaign = await Campaign.create({
      userId: testUser.id,
      name: 'Turtle Send Debug Test',
      subject: 'Turtle Send Test - 10 emails/minute',
      templateId: testTemplate.id,
      contactListId: testContactList.id,
      totalRecipients: testContacts.length,
      status: 'draft',
      sendingMode: 'turtle',
      emailsPerMinute: 10, // Slow rate for debugging
      maxConcurrentBatches: 1
    }, { transaction });

    await transaction.commit();

    console.log('   ✅ Turtle campaign created');
    console.log(`   🐢 Campaign ID: ${turtleCampaign.id}`);
    console.log(`   📧 Rate: ${turtleCampaign.emailsPerMinute} emails/minute`);
    console.log(`   📊 Recipients: ${turtleCampaign.totalRecipients}`);
    console.log(`   ⏱️  Expected duration: ${Math.ceil(turtleCampaign.totalRecipients / (turtleCampaign.emailsPerMinute / 60))} seconds`);

    // Step 6: Load campaign with associations for worker
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
              as: 'contacts',
              attributes: ['id', 'email', 'firstName', 'lastName']
            }
          ]
        }
      ]
    });

    // Step 7: Prepare campaign data for worker
    console.log('\n3. Preparing campaign data for worker...');
    const campaignData = {
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
      recipients: (campaignWithAssociations.contactList.contacts || []).map(contact => ({
        id: contact.id,
        email: contact.email,
        firstName: contact.firstName,
        lastName: contact.lastName,
        metadata: contact.metadata || {}
      })),
      status: 'initialized',
      initializedAt: new Date().toISOString()
    };

    console.log('   ✅ Campaign data prepared');
    console.log(`   📊 Template: ${campaignData.template.subject}`);
    console.log(`   👥 Recipients: ${campaignData.recipients.length}`);
    console.log(`   🐢 Mode: ${campaignData.sendingMode} (${campaignData.emailsPerMinute}/min)`);

    // Step 8: Initialize campaign in worker
    console.log('\n4. Initializing campaign in worker...');
    try {
      const initResponse = await workerClient.post(`/api/campaign/${turtleCampaign.id}/initialize`, campaignData);
      
      if (initResponse.status === 200 && initResponse.data.success) {
        console.log('   ✅ Campaign initialized in worker');
        console.log('   📊 Worker response:', initResponse.data);
      } else {
        console.log(`   ❌ Worker initialization failed (${initResponse.status}):`, initResponse.data);
        return;
      }
    } catch (error) {
      console.log('   ❌ Worker initialization error:', error.message);
      return;
    }

    // Step 9: Start campaign in worker
    console.log('\n5. Starting campaign in worker...');
    try {
      const startResponse = await workerClient.post(`/api/campaign/${turtleCampaign.id}/start`);
      
      if (startResponse.status === 200 && startResponse.data.success) {
        console.log('   ✅ Campaign started in worker');
        console.log('   📊 Worker response:', startResponse.data);
        
        // Update campaign status in database
        await turtleCampaign.update({
          status: 'sending',
          sentAt: new Date()
        });
        
        console.log('   ✅ Campaign status updated to sending');
      } else {
        console.log(`   ❌ Worker start failed (${startResponse.status}):`, startResponse.data);
        return;
      }
    } catch (error) {
      console.log('   ❌ Worker start error:', error.message);
      return;
    }

    // Step 10: Monitor campaign progress
    console.log('\n6. Monitoring campaign progress...');
    console.log('   ⏱️  Monitoring for 2 minutes...');
    
    const monitoringDuration = 120000; // 2 minutes
    const checkInterval = 10000; // 10 seconds
    const startTime = Date.now();
    
    while (Date.now() - startTime < monitoringDuration) {
      await new Promise(resolve => setTimeout(resolve, checkInterval));
      
      try {
        const statusResponse = await workerClient.get(`/api/campaign/${turtleCampaign.id}/status`);
        
        if (statusResponse.status === 200 && statusResponse.data.success) {
          const stats = statusResponse.data.stats || {};
          const progress = statusResponse.data.progress || 0;
          const status = statusResponse.data.status || 'unknown';
          
          const elapsed = Math.floor((Date.now() - startTime) / 1000);
          console.log(`   📊 [${elapsed}s] Status: ${status}, Progress: ${progress}%, Sent: ${stats.sent || 0}/${campaignData.recipients.length}`);
          
          if (status === 'completed') {
            console.log('   🎉 Campaign completed!');
            break;
          }
        } else {
          console.log(`   ⚠️  Status check failed (${statusResponse.status}):`, statusResponse.data);
        }
      } catch (error) {
        console.log(`   ❌ Status check error: ${error.message}`);
      }
    }

    // Step 11: Final status check
    console.log('\n7. Final status check...');
    try {
      const finalResponse = await workerClient.get(`/api/campaign/${turtleCampaign.id}/status`);
      
      if (finalResponse.status === 200) {
        console.log('   📊 Final worker status:', finalResponse.data);
      } else {
        console.log(`   ⚠️  Final status check failed (${finalResponse.status}):`, finalResponse.data);
      }
    } catch (error) {
      console.log('   ❌ Final status check error:', error.message);
    }

    // Step 12: Check database status
    console.log('\n8. Checking database status...');
    await turtleCampaign.reload();
    console.log(`   📊 Database status: ${turtleCampaign.status}`);
    console.log(`   📊 Sent at: ${turtleCampaign.sentAt}`);
    console.log(`   📊 Updated at: ${turtleCampaign.updatedAt}`);

    console.log('\n🎯 TEST COMPLETE');
    console.log('================');
    console.log(`✅ Campaign created: ${turtleCampaign.id}`);
    console.log(`🐢 Turtle mode: ${turtleCampaign.emailsPerMinute} emails/minute`);
    console.log(`📧 Recipients: ${turtleCampaign.totalRecipients}`);
    console.log(`📊 Final status: ${turtleCampaign.status}`);
    
    console.log('\n💡 To monitor further:');
    console.log(`curl -H "Authorization: Bearer ${WORKER_API_KEY}" "${WORKER_URL}/api/campaign/${turtleCampaign.id}/status"`);

  } catch (error) {
    await transaction.rollback();
    console.error('❌ Test failed:', error);
    console.error('Stack:', error.stack);
  }
}

// Run the test
createAndTestTurtleCampaign();
