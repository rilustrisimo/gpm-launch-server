/**
 * Test Campaign Sender Fields
 * 
 * This script checks if a campaign has the correct sender fields set
 */

require('dotenv').config();
const { Campaign } = require('./src/models');

async function testCampaignSenderFields() {
  try {
    console.log('\n🔍 Checking Campaign Sender Fields\n');
    
    // Get the most recent campaign
    const campaign = await Campaign.findOne({
      order: [['createdAt', 'DESC']]
    });
    
    if (!campaign) {
      console.log('❌ No campaigns found in database');
      return;
    }
    
    console.log('📧 Campaign Details:');
    console.log('─'.repeat(60));
    console.log(`ID:           ${campaign.id}`);
    console.log(`Name:         ${campaign.name}`);
    console.log(`Subject:      ${campaign.subject}`);
    console.log(`Status:       ${campaign.status}`);
    console.log('');
    console.log('👤 Sender Information:');
    console.log('─'.repeat(60));
    console.log(`From Name:    ${campaign.fromName || '(not set - will use default)'}`);
    console.log(`From Email:   ${campaign.fromEmail || '(not set - will use default)'}`);
    console.log(`Reply-To:     ${campaign.replyToEmail || '(not set - will use default)'}`);
    console.log('');
    
    // Check what will actually be sent
    const actualFromName = campaign.fromName || process.env.FROM_NAME || 'Gravity Point Media';
    const actualFromEmail = campaign.fromEmail || process.env.FROM_EMAIL || 'support@send.gravitypointmedia.com';
    const actualReplyTo = campaign.replyToEmail || process.env.REPLY_TO_EMAIL || 'support@gravitypointmedia.com';
    
    console.log('✉️  Actual Email Headers (what recipients will see):');
    console.log('─'.repeat(60));
    console.log(`From:         ${actualFromName} <${actualFromEmail}>`);
    console.log(`Reply-To:     ${actualReplyTo}`);
    console.log('');
    
    // Verify if it's using Manito Manita
    if (campaign.fromName === 'Manito Manita' && campaign.fromEmail === 'info@manitomanita.com') {
      console.log('✅ SUCCESS: Campaign is configured to use Manito Manita sender!');
    } else if (campaign.fromName === 'Gravity Point Media') {
      console.log('ℹ️  INFO: Campaign is using Gravity Point Media sender (default)');
    } else if (!campaign.fromName) {
      console.log('⚠️  WARNING: Campaign has no sender fields set - using defaults');
      console.log('   To use Manito Manita, edit the campaign and select the preset');
    } else {
      console.log(`ℹ️  INFO: Campaign is using custom sender: ${campaign.fromName}`);
    }
    
    console.log('');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    process.exit(0);
  }
}

// Run the test
testCampaignSenderFields();
