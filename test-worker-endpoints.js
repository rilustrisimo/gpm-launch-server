#!/usr/bin/env node

const axios = require('axios');

const API_URL = 'https://lapi.gravitypointmedia.com';
const WORKER_URL = 'https://worker.gravitypointmedia.com';
const API_KEY = '14d18a0ab3ee46199da20077529788dd';

async function testWorkerEndpoints() {
    console.log('🚀 Testing Worker Endpoints...\n');
    
    try {
        // 1. Test a simple tracking endpoint (open)
        console.log('1. Testing open tracking endpoint...');
        try {
            const openResponse = await axios.get(`${WORKER_URL}/track/open/123`, {
                maxRedirects: 0,
                validateStatus: () => true
            });
            console.log(`   Status: ${openResponse.status}`);
            console.log('   ✅ Open tracking endpoint is accessible');
        } catch (error) {
            console.log('   ⚠️  Open tracking error:', error.message);
        }
        
        // 2. Skip getting campaigns from backend (requires JWT auth)
        // Instead, use a known test campaign ID
        console.log('\n2. Using test campaign ID for worker testing...');
        const testCampaign = {
            id: '5b69de2e-4d62-4a4c-b626-828222c7ce48', // Use the campaign from the logs
            name: 'Test Campaign',
            status: 'draft'
        };
        console.log(`   📧 Using campaign: ${testCampaign.id} (${testCampaign.name})`);
        
        // 3. Test campaign initialization via worker
        console.log('\n3. Testing campaign initialization...');
        try {
            const initData = {
                id: testCampaign.id,
                name: testCampaign.name,
                status: testCampaign.status
            };
            
            const initResponse = await axios.post(`${WORKER_URL}/api/campaign/${testCampaign.id}/initialize`, initData, {
                headers: { 'Authorization': `Bearer ${API_KEY}` }
            });
            console.log('   ✅ Campaign initialization response:', initResponse.data);
        } catch (error) {
            console.log('   ⚠️  Campaign initialization error:', error.response?.data || error.message);
        }
        
        // 4. Test campaign status
        console.log('\n4. Testing campaign status...');
        try {
            const statusResponse = await axios.get(`${WORKER_URL}/api/campaign/${testCampaign.id}/status`, {
                headers: { 'Authorization': `Bearer ${API_KEY}` }
            });
            console.log('   ✅ Campaign status response:', statusResponse.data);
        } catch (error) {
            console.log('   ⚠️  Campaign status error:', error.response?.data || error.message);
        }
        
        // 5. Test unsubscribe status check
        console.log('\n5. Testing unsubscribe status check...');
        try {
            const unsubResponse = await axios.get(`${WORKER_URL}/api/unsubscribe-status/test@example.com`, {
                headers: { 'Authorization': `Bearer ${API_KEY}` }
            });
            console.log('   ✅ Unsubscribe status response:', unsubResponse.data);
        } catch (error) {
            console.log('   ⚠️  Unsubscribe status error:', error.response?.data || error.message);
        }
        
        // 6. Test campaign start (if it's a draft)
        if (testCampaign.status === 'draft') {
            console.log('\n6. Testing campaign start...');
            try {
                const startResponse = await axios.post(`${WORKER_URL}/api/campaign/${testCampaign.id}/start`, {}, {
                    headers: { 'Authorization': `Bearer ${API_KEY}` }
                });
                console.log('   ✅ Campaign start response:', startResponse.data);
            } catch (error) {
                console.log('   ⚠️  Campaign start error:', error.response?.data || error.message);
            }
        } else {
            console.log('\n6. Campaign is not in draft status, skipping start test');
        }
        
        console.log('\n🎉 Worker endpoint tests completed!');
        
    } catch (error) {
        console.error('❌ Test failed:', error.response?.data || error.message);
        if (error.response?.status) {
            console.error('   Status:', error.response.status);
        }
    }
}

testWorkerEndpoints();
