const { Campaign, Template, ContactList, Contact } = require('./src/models');

async function testCompleteFlow() {
  console.log('🔍 Testing Complete Data Flow\n');
  
  try {
    // Get the latest campaign
    const campaign = await Campaign.findOne({
      order: [['createdAt', 'DESC']],
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
    
    if (!campaign) {
      console.log('❌ No campaigns found');
      process.exit(1);
    }
    
    console.log('📧 Latest Campaign:');
    console.log('   ID:', campaign.id);
    console.log('   Name:', campaign.name);
    console.log('   Status:', campaign.status);
    console.log('   Sending Mode:', campaign.sendingMode || 'normal');
    console.log('   Emails Per Minute:', campaign.emailsPerMinute);
    console.log('');
    
    console.log('👤 Sender Information (from database):');
    console.log('   From Name:', campaign.fromName || '❌ NOT SET');
    console.log('   From Email:', campaign.fromEmail || '❌ NOT SET');
    console.log('   Reply-To Email:', campaign.replyToEmail || '❌ NOT SET');
    console.log('');
    
    // Simulate what prepareCampaignDataForWorker does
    const campaignDataForWorker = {
      id: campaign.id,
      name: campaign.name,
      subject: campaign.subject,
      sendingMode: campaign.sendingMode || 'normal',
      emailsPerMinute: campaign.emailsPerMinute,
      maxConcurrentBatches: campaign.maxConcurrentBatches || 10,
      fromName: campaign.fromName || 'Gravity Point Media',
      fromEmail: campaign.fromEmail || 'support@send.gravitypointmedia.com',
      replyToEmail: campaign.replyToEmail || 'support@gravitypointmedia.com',
      template: {
        id: campaign.template.id,
        subject: campaign.subject || campaign.template.subject,
        content: campaign.template.html || campaign.template.content
      },
      recipients: (campaign.contactList.contacts || []).map(contact => ({
        id: contact.id,
        email: contact.email,
        firstName: contact.firstName,
        lastName: contact.lastName,
        metadata: contact.metadata || {}
      })),
      status: 'initialized',
      initializedAt: new Date().toISOString()
    };
    
    console.log('📦 Data Prepared for Worker:');
    console.log('   From Name:', campaignDataForWorker.fromName);
    console.log('   From Email:', campaignDataForWorker.fromEmail);
    console.log('   Reply-To Email:', campaignDataForWorker.replyToEmail);
    console.log('   Recipients:', campaignDataForWorker.recipients.length);
    console.log('');
    
    // Simulate what the worker would create for the email
    const mockRecipient = campaignDataForWorker.recipients[0];
    const fromHeader = `${campaignDataForWorker.fromName} <${campaignDataForWorker.fromEmail}>`;
    
    console.log('✉️  Simulated Email (what worker would send):');
    console.log('   To:', mockRecipient.email);
    console.log('   From:', fromHeader);
    console.log('   Reply-To:', campaignDataForWorker.replyToEmail);
    console.log('   Subject:', campaignDataForWorker.template.subject);
    console.log('');
    
    // Check if it would send with Manito Manita
    if (campaignDataForWorker.fromName === 'Manito Manita' && 
        campaignDataForWorker.fromEmail === 'info@manitomanita.com') {
      console.log('✅ SUCCESS: Campaign would send with Manito Manita sender!');
    } else if (campaignDataForWorker.fromName === 'Gravity Point Media' || 
               campaignDataForWorker.fromEmail === 'support@send.gravitypointmedia.com') {
      console.log('⚠️  WARNING: Campaign would send with default Gravity Point Media sender!');
      console.log('');
      console.log('❓ Troubleshooting:');
      console.log('   1. Was the campaign created with sender presets?');
      console.log('   2. Check if database has the correct sender values');
      console.log('   3. Create a NEW campaign after server restart');
    } else {
      console.log('✅ Campaign configured with custom sender');
    }
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

testCompleteFlow();
