// Test creating a turtle send campaign to verify the system works
const { Campaign, User, Template, ContactList } = require('./src/models');
require('dotenv').config();

async function testTurtleCampaign() {
  try {
    console.log('Testing turtle campaign creation...');
    
    // Find a user to use for testing
    const user = await User.findOne({ limit: 1 });
    if (!user) {
      console.log('No users found in database');
      return;
    }
    
    // Find a template to use
    const template = await Template.findOne({ where: { userId: user.id }, limit: 1 });
    if (!template) {
      console.log('No templates found for user');
      return;
    }
    
    // Find a contact list to use
    const contactList = await ContactList.findOne({ where: { userId: user.id }, limit: 1 });
    if (!contactList) {
      console.log('No contact lists found for user');
      return;
    }
    
    console.log(`Found user: ${user.email}`);
    console.log(`Found template: ${template.name}`);
    console.log(`Found contact list: ${contactList.name}`);
    
    // Create a test turtle campaign
    const campaign = await Campaign.create({
      userId: user.id,
      name: 'Test Turtle Campaign',
      subject: 'Test Turtle Send',
      templateId: template.id,
      contactListId: contactList.id,
      status: 'draft',
      sendingMode: 'turtle',
      emailsPerMinute: 5,
      maxConcurrentBatches: 1,
      totalRecipients: 0,
      sent: 0,
      delivered: 0,
      opens: 0,
      clicks: 0,
      unsubscribes: 0,
      bounces: 0,
      complaints: 0
    });
    
    console.log(`✅ Successfully created turtle campaign: ${campaign.id}`);
    console.log(`   Name: ${campaign.name}`);
    console.log(`   Sending Mode: ${campaign.sendingMode}`);
    console.log(`   Emails per minute: ${campaign.emailsPerMinute}`);
    
    // Try to retrieve it
    const retrieved = await Campaign.findOne({
      where: { id: campaign.id },
      attributes: ['id', 'name', 'sendingMode', 'emailsPerMinute', 'status']
    });
    
    if (retrieved) {
      console.log('✅ Campaign retrieved successfully');
      console.log(`   Retrieved sending mode: ${retrieved.sendingMode}`);
    } else {
      console.log('❌ Failed to retrieve campaign');
    }
    
    // Clean up - delete the test campaign
    await campaign.destroy();
    console.log('✅ Test campaign cleaned up');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error testing turtle campaign:', error);
    process.exit(1);
  }
}

testTurtleCampaign();
