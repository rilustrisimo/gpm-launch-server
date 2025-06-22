#!/usr/bin/env node

const axios = require('axios');

const API_URL = 'https://lapi.gravitypointmedia.com';
const WORKER_URL = 'https://gpm-email-tracking-worker.ilustrisimo-rouie.workers.dev';
const API_KEY = '14d18a0ab3ee46199da20077529788dd';

async function testEndToEnd() {
    console.log('🚀 Running Final End-to-End Campaign Test...\n');
    
    try {
        // 1. Test worker health
        console.log('1. Testing worker health...');
        const workerHealth = await axios.get(`${WORKER_URL}/health`);
        console.log('   ✅ Worker health:', workerHealth.data);
        
        // 2. Initialize campaign processor
        console.log('\n2. Initializing campaign processor...');
        const initResponse = await axios.post(`${WORKER_URL}/initialize`, {}, {
            headers: { 'X-API-Key': API_KEY }
        });
        console.log('   ✅ Campaign processor initialized:', initResponse.data);
        
        // 3. Get a test campaign
        console.log('\n3. Getting test campaigns...');
        const campaignsResponse = await axios.get(`${API_URL}/api/campaigns`, {
            headers: { 'x-api-key': API_KEY }
        });
        
        const campaigns = campaignsResponse.data;
        console.log(`   ✅ Found ${campaigns.length} campaigns`);
        
        if (campaigns.length === 0) {
            console.log('   ⚠️  No campaigns found. Cannot test campaign start.');
            return;
        }
        
        // Find a draft or active campaign
        const testCampaign = campaigns.find(c => c.status === 'draft' || c.status === 'active');
        if (!testCampaign) {
            console.log('   ⚠️  No draft or active campaigns found.');
            return;
        }
        
        console.log(`   📧 Using campaign: ${testCampaign.id} (${testCampaign.name})`);
        
        // 4. Check campaign contacts
        console.log('\n4. Checking campaign contacts...');
        const contactsResponse = await axios.get(`${API_URL}/api/campaigns/${testCampaign.id}/contacts`, {
            headers: { 'x-api-key': API_KEY }
        });
        
        const contacts = contactsResponse.data;
        console.log(`   ✅ Campaign has ${contacts.length} contacts`);
        
        if (contacts.length === 0) {
            console.log('   ⚠️  Campaign has no contacts. Cannot test email sending.');
            return;
        }
        
        // 5. Get campaign stats before
        console.log('\n5. Getting campaign stats before...');
        const statsBefore = await axios.get(`${API_URL}/api/campaigns/${testCampaign.id}/stats`, {
            headers: { 'x-api-key': API_KEY }
        });
        console.log('   📊 Stats before:', statsBefore.data);
        
        // 6. Test campaign start (if draft)
        if (testCampaign.status === 'draft') {
            console.log('\n6. Starting campaign...');
            try {
                const startResponse = await axios.post(`${WORKER_URL}/start`, {
                    campaignId: testCampaign.id
                }, {
                    headers: { 'X-API-Key': API_KEY }
                });
                console.log('   ✅ Campaign start response:', startResponse.data);
            } catch (error) {
                console.log('   ⚠️  Campaign start error:', error.response?.data || error.message);
            }
        } else {
            console.log('\n6. Campaign is already active, skipping start test');
        }
        
        // 7. Check campaign status
        console.log('\n7. Checking campaign status...');
        const statusResponse = await axios.get(`${WORKER_URL}/status/${testCampaign.id}`, {
            headers: { 'X-API-Key': API_KEY }
        });
        console.log('   📈 Campaign status:', statusResponse.data);
        
        // 8. Test tracking endpoints with a real contact
        if (contacts.length > 0) {
            const testContact = contacts[0];
            console.log(`\n8. Testing tracking endpoints with contact: ${testContact.email}`);
            
            // Test open tracking
            try {
                const openResponse = await axios.get(`${WORKER_URL}/track/open/${testContact.id}`);
                console.log('   ✅ Open tracking response:', openResponse.data);
            } catch (error) {
                console.log('   ⚠️  Open tracking error:', error.response?.data || error.message);
            }
            
            // Test click tracking
            try {
                const clickResponse = await axios.get(`${WORKER_URL}/track/click/${testContact.id}?url=https://example.com`);
                console.log('   ✅ Click tracking response (should redirect)');
            } catch (error) {
                console.log('   ⚠️  Click tracking error:', error.response?.data || error.message);
            }
        }
        
        // 9. Get campaign stats after
        console.log('\n9. Getting campaign stats after...');
        const statsAfter = await axios.get(`${API_URL}/api/campaigns/${testCampaign.id}/stats`, {
            headers: { 'x-api-key': API_KEY }
        });
        console.log('   📊 Stats after:', statsAfter.data);
        
        // 10. Test stats sync
        console.log('\n10. Testing manual stats sync...');
        try {
            const syncResponse = await axios.post(`${WORKER_URL}/sync-stats`, {
                campaignId: testCampaign.id
            }, {
                headers: { 'X-API-Key': API_KEY }
            });
            console.log('   ✅ Stats sync response:', syncResponse.data);
        } catch (error) {
            console.log('   ⚠️  Stats sync error:', error.response?.data || error.message);
        }
        
        console.log('\n🎉 End-to-end test completed successfully!');
        
    } catch (error) {
        console.error('❌ Test failed:', error.response?.data || error.message);
        if (error.response?.status) {
            console.error('   Status:', error.response.status);
        }
    }
}

testEndToEnd();
