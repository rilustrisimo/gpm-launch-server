/**
 * Test the API endpoint for getting verified identities
 */

const express = require('express');
const campaignController = require('./src/controllers/campaign.controller');

// Mock request and response
const mockReq = {};
const mockRes = {
  status: (code) => ({
    json: (data) => {
      console.log(`Response Status: ${code}`);
      console.log('Response Data:', JSON.stringify(data, null, 2));
      return mockRes;
    }
  })
};

console.log('🧪 Testing API Endpoint - Get Verified Identities\n');

campaignController.getVerifiedIdentities(mockReq, mockRes)
  .then(() => {
    console.log('\n✅ API endpoint test completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ API endpoint test failed:', error);
    process.exit(1);
  });
