const { Campaign } = require('./src/models');

async function checkAndResetCampaign() {
  try {
    const campaignId = '5b69de2e-4d62-4a4c-b626-828222c7ce48';
    
    console.log('🔍 Checking campaign status...');
    const campaign = await Campaign.findByPk(campaignId);
    
    if (!campaign) {
      console.log('❌ Campaign not found');
      return;
    }
    
    console.log('📊 Current campaign status:', {
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      sentAt: campaign.sentAt,
      contactListId: campaign.contactListId
    });
    
    if (campaign.status === 'completed' || campaign.status === 'sending') {
      console.log('🔄 Resetting campaign status to stopped for testing...');
      await campaign.update({ 
        status: 'stopped',
        sentAt: null 
      });
      console.log('✅ Campaign status reset to stopped');
    } else {
      console.log('✅ Campaign status is already suitable for restart');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
  
  process.exit(0);
}

checkAndResetCampaign();
