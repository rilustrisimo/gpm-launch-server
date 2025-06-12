#!/usr/bin/env node

/**
 * Simple Turtle Send Test
 * 
 * This script tests the turtle send functionality directly with worker communication
 * to identify bottlenecks in the sending process.
 */

const axios = require('axios');

// Worker configuration
const WORKER_URL = process.env.WORKER_URL || 'https://worker.gravitypointmedia.com';
const WORKER_API_KEY = process.env.WORKER_API_KEY || '14d18a0ab3ee46199da20077529788dd';

const workerClient = axios.create({
  baseURL: WORKER_URL,
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${WORKER_API_KEY}`
  },
  validateStatus: function (status) {
    return status < 500;
  }
});

async function testTurtleSendDirectly() {
  try {
    console.log('🐢 Simple Turtle Send Test');
    console.log('===========================\n');

    // Step 1: Create mock campaign data
    console.log('1. Creating mock turtle campaign data...');
    const campaignId = 'turtle-test-' + Date.now();
    const campaignData = {
      id: campaignId,
      name: 'Turtle Send Test',
      subject: 'Test Subject',
      sendingMode: 'turtle',
      emailsPerMinute: 20, // 20 emails per minute for testing
      maxConcurrentBatches: 1,
      template: {
        id: 'template-test',
        subject: 'Test Subject',
        content: '<p>Hello {{firstName}}, this is a test!</p>'
      },
      recipients: [
        { id: 'contact-1', email: 'test1@example.com', firstName: 'Test1', lastName: 'User' },
        { id: 'contact-2', email: 'test2@example.com', firstName: 'Test2', lastName: 'User' },
        { id: 'contact-3', email: 'test3@example.com', firstName: 'Test3', lastName: 'User' },
        { id: 'contact-4', email: 'test4@example.com', firstName: 'Test4', lastName: 'User' },
        { id: 'contact-5', email: 'test5@example.com', firstName: 'Test5', lastName: 'User' }
      ],
      status: 'initialized',
      initializedAt: new Date().toISOString()
    };

    console.log('   ✅ Mock campaign created');
    console.log(`   🐢 Campaign ID: ${campaignId}`);
    console.log(`   📧 Rate: ${campaignData.emailsPerMinute} emails/minute`);
    console.log(`   📊 Recipients: ${campaignData.recipients.length}`);
    console.log(`   ⏱️  Expected duration: ${Math.ceil(campaignData.recipients.length / (campaignData.emailsPerMinute / 60))} seconds`);

    // Step 2: Initialize campaign in worker
    console.log('\n2. Initializing campaign in worker...');
    try {
      const initResponse = await workerClient.post(`/api/campaign/${campaignId}/initialize`, campaignData);
      
      if (initResponse.status === 200 && initResponse.data.success) {
        console.log('   ✅ Campaign initialized in worker');
        console.log('   📊 Worker response:', initResponse.data);
      } else {
        console.log(`   ❌ Worker initialization failed (${initResponse.status}):`, initResponse.data);
        return;
      }
    } catch (error) {
      console.log('   ❌ Worker initialization error:', error.message);
      return;
    }

    // Step 3: Start campaign in worker
    console.log('\n3. Starting campaign in worker...');
    try {
      const startResponse = await workerClient.post(`/api/campaign/${campaignId}/start`);
      
      if (startResponse.status === 200 && startResponse.data.success) {
        console.log('   ✅ Campaign started in worker');
        console.log('   📊 Worker response:', startResponse.data);
      } else {
        console.log(`   ❌ Worker start failed (${startResponse.status}):`, startResponse.data);
        return;
      }
    } catch (error) {
      console.log('   ❌ Worker start error:', error.message);
      return;
    }

    // Step 4: Monitor campaign progress for 2 minutes
    console.log('\n4. Monitoring campaign progress...');
    console.log('   ⏱️  Monitoring for 3 minutes to see sending behavior...');
    
    const monitoringDuration = 180000; // 3 minutes
    const checkInterval = 10000; // 10 seconds
    const startTime = Date.now();
    let lastStats = null;
    
    while (Date.now() - startTime < monitoringDuration) {
      await new Promise(resolve => setTimeout(resolve, checkInterval));
      
      try {
        const statusResponse = await workerClient.get(`/api/campaign/${campaignId}/status`);
        
        if (statusResponse.status === 200 && statusResponse.data.success) {
          const stats = statusResponse.data.stats || {};
          const progress = statusResponse.data.progress || 0;
          const status = statusResponse.data.status || 'unknown';
          
          const elapsed = Math.floor((Date.now() - startTime) / 1000);
          const sent = stats.sent || 0;
          const delivered = stats.delivered || 0;
          
          // Calculate rate
          let rate = 0;
          if (lastStats && lastStats.sent !== sent) {
            rate = (sent - lastStats.sent) / (checkInterval / 1000 / 60); // emails per minute
          }
          
          console.log(`   📊 [${elapsed}s] Status: ${status}, Progress: ${progress.toFixed(1)}%, Sent: ${sent}/${campaignData.recipients.length}, Delivered: ${delivered}, Rate: ${rate.toFixed(1)}/min`);
          
          lastStats = { sent, delivered, timestamp: Date.now() };
          
          if (status === 'completed') {
            console.log('   🎉 Campaign completed!');
            break;
          }
          
          if (status === 'stopped' || status === 'failed') {
            console.log(`   ⚠️  Campaign stopped with status: ${status}`);
            break;
          }
        } else {
          console.log(`   ⚠️  Status check failed (${statusResponse.status}):`, statusResponse.data);
        }
      } catch (error) {
        console.log(`   ❌ Status check error: ${error.message}`);
      }
    }

    // Step 5: Final status check
    console.log('\n5. Final status check...');
    try {
      const finalResponse = await workerClient.get(`/api/campaign/${campaignId}/status`);
      
      if (finalResponse.status === 200) {
        console.log('   📊 Final worker status:', JSON.stringify(finalResponse.data, null, 2));
      } else {
        console.log(`   ⚠️  Final status check failed (${finalResponse.status}):`, finalResponse.data);
      }
    } catch (error) {
      console.log('   ❌ Final status check error:', error.message);
    }

    // Step 6: Try to stop campaign for cleanup
    console.log('\n6. Stopping campaign for cleanup...');
    try {
      const stopResponse = await workerClient.post(`/api/campaign/${campaignId}/stop`);
      
      if (stopResponse.status === 200 && stopResponse.data.success) {
        console.log('   ✅ Campaign stopped successfully');
      } else {
        console.log(`   ⚠️  Stop failed (${stopResponse.status}):`, stopResponse.data);
      }
    } catch (error) {
      console.log('   ❌ Stop error:', error.message);
    }

    console.log('\n🎯 TEST RESULTS');
    console.log('===============');
    console.log(`✅ Campaign tested: ${campaignId}`);
    console.log(`🐢 Turtle mode: ${campaignData.emailsPerMinute} emails/minute`);
    console.log(`📧 Recipients: ${campaignData.recipients.length}`);
    
    console.log('\n💡 Analysis:');
    console.log('- Check if campaign actually processed emails');
    console.log('- Verify turtle timing is working as expected');
    console.log('- Look for bottlenecks in the processing logic');
    console.log('- Monitor worker logs for errors');

  } catch (error) {
    console.error('❌ Test failed:', error);
    console.error('Stack:', error.stack);
  }
}

// Run the test
testTurtleSendDirectly();
