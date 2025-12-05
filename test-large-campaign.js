/**
 * Test script to debug large campaign sending issues
 */

require('dotenv').config();
const axios = require('axios');

const API_URL = process.env.API_URL || 'https://lapi.gravitypointmedia.com';
const TOKEN = process.argv[2]; // Pass JWT token as argument
const CAMPAIGN_ID = process.argv[3]; // Pass campaign ID as argument

if (!TOKEN || !CAMPAIGN_ID) {
  console.error('Usage: node test-large-campaign.js <JWT_TOKEN> <CAMPAIGN_ID>');
  process.exit(1);
}

async function testCampaignSend() {
  console.log('🧪 Testing large campaign send...');
  console.log(`📊 API URL: ${API_URL}`);
  console.log(`📋 Campaign ID: ${CAMPAIGN_ID}`);
  
  try {
    console.log(`\n🔄 Sending campaign...`);
    const response = await axios.post(
      `${API_URL}/api/campaigns/${CAMPAIGN_ID}/send-now`,
      {},
      {
        headers: {
          'Authorization': `Bearer ${TOKEN}`,
          'Content-Type': 'application/json'
        },
        timeout: 60000 // 60 second timeout
      }
    );
    
    console.log(`\n✅ Success!`);
    console.log(JSON.stringify(response.data, null, 2));
    
  } catch (error) {
    console.error(`\n❌ Error sending campaign:`);
    console.error(`Status: ${error.response?.status}`);
    console.error(`Status Text: ${error.response?.statusText}`);
    console.error(`\nError Data:`);
    console.error(JSON.stringify(error.response?.data, null, 2));
    console.error(`\nError Message: ${error.message}`);
    
    if (error.code === 'ECONNABORTED') {
      console.error('\n⏱️ Request timed out - campaign might be too large');
    }
  }
}

testCampaignSend();
