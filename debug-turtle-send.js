#!/usr/bin/env node

/**
 * Debug Turtle Send Issues
 * 
 * This script investigates the turtle send bottleneck where campaigns
 * get stuck at 1 email per minute with only 2 deliveries out of 5 emails.
 */

const { Campaign, Template, ContactList, Contact, User } = require('./src/models');
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
    return status < 500; // Resolve only if the status code is less than 500
  }
});

async function debugTurtleSendIssues() {
  try {
    console.log('🐢 Debug Turtle Send Issues');
    console.log('================================\n');

    // Step 1: Test worker connectivity
    console.log('1. Testing worker connectivity...');
    try {
      const response = await workerClient.get('/test');
      console.log('   ✅ Worker is accessible');
      console.log('   📊 Worker status:', response.data);
    } catch (error) {
      console.log('   ❌ Worker connectivity failed:', error.message);
      return;
    }

    // Step 2: Check for existing turtle campaigns
    console.log('\n2. Checking for existing turtle campaigns...');
    const turtleCampaigns = await Campaign.findAll({
      where: { sendingMode: 'turtle' },
      include: [
        {
          model: Template,
          as: 'template',
          attributes: ['id', 'name']
        },
        {
          model: ContactList,
          as: 'contactList',
          attributes: ['id', 'name', 'count']
        }
      ],
      order: [['createdAt', 'DESC']],
      limit: 5
    });

    console.log(`   📋 Found ${turtleCampaigns.length} turtle campaigns`);
    
    if (turtleCampaigns.length > 0) {
      console.log('\n   Recent turtle campaigns:');
      turtleCampaigns.forEach(campaign => {
        console.log(`   🐢 ${campaign.name}`);
        console.log(`      ID: ${campaign.id}`);
        console.log(`      Status: ${campaign.status}`);
        console.log(`      Rate: ${campaign.emailsPerMinute}/min`);
        console.log(`      Max Batches: ${campaign.maxConcurrentBatches}`);
        console.log(`      Recipients: ${campaign.totalRecipients}`);
        console.log(`      Created: ${campaign.createdAt}`);
        if (campaign.sentAt) {
          console.log(`      Sent: ${campaign.sentAt}`);
        }
        console.log('');
      });

      // Step 3: Check worker status for active campaigns
      console.log('3. Checking worker status for active turtle campaigns...');
      for (const campaign of turtleCampaigns.filter(c => ['sending', 'processing'].includes(c.status))) {
        try {
          console.log(`\n   🔍 Checking campaign ${campaign.id} (${campaign.name})`);
          const statusResponse = await workerClient.get(`/api/campaign/${campaign.id}/status`);
          
          if (statusResponse.status === 200) {
            console.log('   ✅ Worker response:', statusResponse.data);
          } else if (statusResponse.status === 404) {
            console.log('   ⚠️  Campaign not found in worker (may have completed or stopped)');
          } else {
            console.log(`   ❌ Worker returned status ${statusResponse.status}:`, statusResponse.data);
          }
        } catch (error) {
          console.log(`   ❌ Error checking worker status: ${error.message}`);
        }
      }
    }

    // Step 4: Test worker communication endpoints
    console.log('\n4. Testing worker communication endpoints...');
    
    // Test campaign status update endpoint on server
    console.log('\n   🧪 Testing server status update endpoint...');
    try {
      const SERVER_URL = process.env.API_URL || 'https://lapi.gravitypointmedia.com';
      const testStatusUpdate = await axios.post(
        `${SERVER_URL}/api/tracking/campaign/status`,
        {
          campaignId: 'debug-test-123',
          status: 'processing',
          stats: { sent: 1, delivered: 1 }
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${WORKER_API_KEY}`
          },
          validateStatus: () => true
        }
      );
      
      if (testStatusUpdate.status === 200) {
        console.log('   ✅ Server status update endpoint working');
      } else if (testStatusUpdate.status === 404) {
        console.log('   ⚠️  Campaign not found (expected for test)');
      } else if (testStatusUpdate.status === 405) {
        console.log('   ❌ Method not allowed (405) - THIS IS THE ISSUE!');
        console.log('   🔧 Response:', testStatusUpdate.data);
      } else {
        console.log(`   ❌ Server status update failed (${testStatusUpdate.status}):`, testStatusUpdate.data);
      }
    } catch (error) {
      console.log('   ❌ Server status update test failed:', error.message);
    }

    // Step 5: Check for campaign processor configuration issues
    console.log('\n5. Checking campaign processor configuration...');
    
    // Check if there are campaigns stuck in processing
    const stuckCampaigns = await Campaign.findAll({
      where: { 
        status: ['sending', 'processing'],
        updatedAt: {
          [require('sequelize').Op.lt]: new Date(Date.now() - 30 * 60 * 1000) // 30 minutes ago
        }
      }
    });

    if (stuckCampaigns.length > 0) {
      console.log(`   ⚠️  Found ${stuckCampaigns.length} campaigns stuck in processing for >30 minutes:`);
      stuckCampaigns.forEach(campaign => {
        console.log(`      📧 ${campaign.name} (${campaign.id}) - ${campaign.status} since ${campaign.updatedAt}`);
      });
    } else {
      console.log('   ✅ No campaigns stuck in processing');
    }

    // Step 6: Turtle send rate calculation verification
    console.log('\n6. Verifying turtle send rate calculations...');
    
    const testRates = [1, 10, 30, 60, 120, 600];
    testRates.forEach(rate => {
      const delayBetweenEmails = (60 * 1000) / rate; // milliseconds
      const emailsPerSecond = rate / 60;
      console.log(`   📊 ${rate} emails/min = ${delayBetweenEmails}ms delay = ${emailsPerSecond.toFixed(2)} emails/sec`);
    });

    console.log('\n🎯 SUMMARY');
    console.log('==========');
    console.log('✅ Worker connectivity: Working');
    console.log(`📊 Turtle campaigns found: ${turtleCampaigns.length}`);
    console.log(`⚠️  Stuck campaigns: ${stuckCampaigns.length}`);
    console.log('\n🔧 Next steps:');
    console.log('1. Check server endpoint routes for 405 errors');
    console.log('2. Verify worker-to-server communication authentication');
    console.log('3. Test turtle send with a small campaign');
    console.log('4. Monitor worker logs for processing bottlenecks');

  } catch (error) {
    console.error('❌ Debug script failed:', error);
    console.error('Stack:', error.stack);
  }
}

// Run the debug script
debugTurtleSendIssues();
