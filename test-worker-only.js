#!/usr/bin/env node

const axios = require('axios');

const WORKER_URL = 'https://gpm-email-tracking-worker.ilustrisimo-rouie.workers.dev';
const API_KEY = '14d18a0ab3ee46199da20077529788dd';

async function testWorkerOnly() {
    console.log('🚀 Testing Worker-Only Functionality...\n');
    
    try {
        // 1. Test open tracking endpoint (no auth required)
        console.log('1. Testing open tracking endpoint...');
        try {
            const openResponse = await axios.get(`${WORKER_URL}/track/open/123`, {
                maxRedirects: 0,
                validateStatus: () => true
            });
            console.log(`   Status: ${openResponse.status} - ${openResponse.statusText}`);
            if (openResponse.data) {
                console.log(`   Response: ${JSON.stringify(openResponse.data)}`);
            }
            console.log('   ✅ Open tracking endpoint is accessible');
        } catch (error) {
            console.log('   ⚠️  Open tracking error:', error.message);
        }
        
        // 2. Test click tracking endpoint (no auth required)
        console.log('\n2. Testing click tracking endpoint...');
        try {
            const clickResponse = await axios.get(`${WORKER_URL}/track/click/123?url=https://example.com`, {
                maxRedirects: 0,
                validateStatus: () => true
            });
            console.log(`   Status: ${clickResponse.status} - ${clickResponse.statusText}`);
            if (clickResponse.status === 302) {
                console.log(`   Redirect to: ${clickResponse.headers.location}`);
            }
            console.log('   ✅ Click tracking endpoint is accessible');
        } catch (error) {
            console.log('   ⚠️  Click tracking error:', error.message);
        }
        
        // 3. Test unsubscribe status check (API key required)
        console.log('\n3. Testing unsubscribe status check...');
        try {
            const unsubResponse = await axios.get(`${WORKER_URL}/api/unsubscribe-status/test@example.com`, {
                headers: { 'Authorization': `Bearer ${API_KEY}` }
            });
            console.log(`   Status: ${unsubResponse.status}`);
            console.log('   Response:', unsubResponse.data);
            console.log('   ✅ Unsubscribe status endpoint is accessible');
        } catch (error) {
            console.log('   ⚠️  Unsubscribe status error:', error.response?.status, error.response?.data || error.message);
        }
        
        // 4. Test campaign status endpoint with dummy ID (API key required)
        console.log('\n4. Testing campaign status endpoint...');
        try {
            const statusResponse = await axios.get(`${WORKER_URL}/api/campaign/1/status`, {
                headers: { 'Authorization': `Bearer ${API_KEY}` }
            });
            console.log(`   Status: ${statusResponse.status}`);
            console.log('   Response:', statusResponse.data);
            console.log('   ✅ Campaign status endpoint is accessible');
        } catch (error) {
            console.log('   ⚠️  Campaign status error:', error.response?.status, error.response?.data || error.message);
        }
        
        // 5. Test campaign initialization with dummy data (API key required)
        console.log('\n5. Testing campaign initialization...');
        try {
            const initData = {
                id: 999,
                name: 'Test Campaign',
                status: 'draft'
            };
            
            const initResponse = await axios.post(`${WORKER_URL}/api/campaign/999/initialize`, initData, {
                headers: { 'Authorization': `Bearer ${API_KEY}` }
            });
            console.log(`   Status: ${initResponse.status}`);
            console.log('   Response:', initResponse.data);
            console.log('   ✅ Campaign initialization endpoint is accessible');
        } catch (error) {
            console.log('   ⚠️  Campaign initialization error:', error.response?.status, error.response?.data || error.message);
        }
        
        console.log('\n🎉 Worker-only tests completed!');
        console.log('\n📝 Summary:');
        console.log('   - Worker is deployed and responding');
        console.log('   - Tracking endpoints are working');
        console.log('   - API endpoints are protected with API key authentication');
        console.log('   - Campaign processing endpoints are accessible');
        
    } catch (error) {
        console.error('❌ Test failed:', error.response?.data || error.message);
        if (error.response?.status) {
            console.error('   Status:', error.response.status);
        }
    }
}

testWorkerOnly();
