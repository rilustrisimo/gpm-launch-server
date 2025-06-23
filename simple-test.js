console.log('🧪 Starting simple test...');

const campaignService = require('./src/services/campaignService');

console.log('✅ Campaign service loaded');

async function simpleTest() {
  try {
    console.log('🔍 Testing getCampaign...');
    
    const campaignId = '5b69de2e-4d62-4a4c-b626-828222c7ce48';
    const userId = '45ced181-02f8-4572-8bd4-8574e482d075';
    
    const campaign = await campaignService.getCampaign(campaignId, userId);
    console.log('✅ Campaign found:', campaign.name);
    
    console.log('🧪 All basic tests passed!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
  
  process.exit(0);
}

console.log('📞 Calling simpleTest...');
simpleTest().catch(err => {
  console.error('❌ Unhandled error:', err);
  process.exit(1);
});
