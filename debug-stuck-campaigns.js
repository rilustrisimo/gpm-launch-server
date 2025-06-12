#!/usr/bin/env node

/**
 * Debug Stuck Turtle Campaigns
 * 
 * This script investigates why turtle send campaigns are getting stuck
 * at 2 deliveries with only 1 email per minute.
 */

const { Campaign, Template, ContactList, User, sequelize } = require('./src/models');

async function debugStuckCampaigns() {
  try {
    console.log('🔍 TURTLE SEND DEBUG - STUCK CAMPAIGNS');
    console.log('=====================================\n');

    // Test 1: Check database connection
    console.log('1. Testing database connection...');
    await sequelize.authenticate();
    console.log('   ✅ Database connection successful\n');

    // Test 2: Check for turtle campaigns
    console.log('2. Checking for turtle campaigns...');
    const turtleCampaigns = await Campaign.findAll({
      where: { sendingMode: 'turtle' },
      order: [['createdAt', 'DESC']],
      limit: 5,
      include: [
        { model: Template, as: 'template', attributes: ['name'] },
        { model: ContactList, as: 'contactList', attributes: ['name', 'count'] }
      ]
    });

    console.log(`   Found ${turtleCampaigns.length} turtle campaigns\n`);

    // Test 3: Analyze each turtle campaign
    if (turtleCampaigns.length > 0) {
      console.log('3. Analyzing turtle campaigns...');
      for (const campaign of turtleCampaigns) {
        console.log(`   📧 Campaign: ${campaign.name}`);
        console.log(`      ID: ${campaign.id}`);
        console.log(`      Status: ${campaign.status}`);
        console.log(`      Mode: ${campaign.sendingMode}`);
        console.log(`      Rate: ${campaign.emailsPerMinute} emails/min`);
        console.log(`      Progress: ${campaign.sent}/${campaign.totalRecipients} (${((campaign.sent / campaign.totalRecipients) * 100).toFixed(1)}%)`);
        console.log(`      Delivered: ${campaign.delivered}`);
        console.log(`      Created: ${campaign.createdAt}`);
        console.log(`      Started: ${campaign.sentAt || 'Not started'}`);
        
        // Calculate expected progress
        if (campaign.sentAt && campaign.emailsPerMinute) {
          const minutesElapsed = (new Date() - new Date(campaign.sentAt)) / (1000 * 60);
          const expectedSent = Math.floor(minutesElapsed * campaign.emailsPerMinute);
          console.log(`      Expected sent by now: ${Math.min(expectedSent, campaign.totalRecipients)} (${minutesElapsed.toFixed(1)} minutes elapsed)`);
          
          if (campaign.sent < expectedSent && campaign.status === 'sending') {
            console.log(`      ⚠️  POTENTIAL ISSUE: Campaign is behind expected progress!`);
          }
        }
        console.log('   ---');
      }
    }

    // Test 4: Check for sending campaigns specifically
    console.log('\n4. Checking for currently sending campaigns...');
    const sendingCampaigns = await Campaign.findAll({
      where: { 
        status: 'sending'
      },
      order: [['sentAt', 'DESC']]
    });

    console.log(`   Found ${sendingCampaigns.length} campaigns currently sending`);
    
    sendingCampaigns.forEach(campaign => {
      console.log(`   📤 ${campaign.name} (${campaign.sendingMode || 'normal'}) - ${campaign.sent}/${campaign.totalRecipients}`);
    });

    // Test 5: Check worker connectivity
    console.log('\n5. Testing worker connectivity...');
    try {
      const workerResponse = await fetch('https://worker.gravitypointmedia.com/test', {
        headers: {
          'Authorization': 'Bearer 14d18a0ab3ee46199da20077529788dd'
        }
      });
      
      if (workerResponse.ok) {
        const workerData = await workerResponse.json();
        console.log('   ✅ Worker is accessible');
        console.log(`   📊 Worker status: API Key Available: ${workerData.apiKeyAvailable}`);
      } else {
        console.log(`   ❌ Worker returned ${workerResponse.status}: ${workerResponse.statusText}`);
      }
    } catch (workerError) {
      console.log(`   ❌ Worker connectivity error: ${workerError.message}`);
    }

    // Test 6: Check for database schema issues
    console.log('\n6. Verifying database schema...');
    const [schemaResults] = await sequelize.query(`
      SELECT 
        sql 
      FROM sqlite_master 
      WHERE type='table' AND name='Campaigns'
    `);
    
    if (schemaResults.length > 0) {
      const tableSchema = schemaResults[0].sql;
      console.log('   Campaign table schema:');
      
      // Check for turtle send fields
      const hasSendingMode = tableSchema.includes('sendingMode');
      const hasEmailsPerMinute = tableSchema.includes('emailsPerMinute');
      const hasMaxConcurrentBatches = tableSchema.includes('maxConcurrentBatches');
      
      console.log(`   ✅ sendingMode field: ${hasSendingMode ? 'EXISTS' : 'MISSING'}`);
      console.log(`   ✅ emailsPerMinute field: ${hasEmailsPerMinute ? 'EXISTS' : 'MISSING'}`);
      console.log(`   ✅ maxConcurrentBatches field: ${hasMaxConcurrentBatches ? 'EXISTS' : 'MISSING'}`);
      
      if (!hasSendingMode || !hasEmailsPerMinute || !hasMaxConcurrentBatches) {
        console.log(`   ⚠️  Missing turtle send fields - migration may not have been applied!`);
      }
    }

    console.log('\n✅ Debug complete!');
    console.log('\nNEXT STEPS:');
    console.log('1. If campaigns are stuck, check worker logs');
    console.log('2. If no turtle campaigns exist, create a test campaign');
    console.log('3. If worker is inaccessible, check deployment status');

  } catch (error) {
    console.error('❌ Debug failed:', error.message);
    console.error('Stack trace:', error.stack);
    
    // Check if it's a SQL error with field name issue
    if (error.message.includes('sendMode')) {
      console.error('\n🚨 FOUND THE ISSUE: Code is using "sendMode" instead of "sendingMode"!');
      console.error('This error confirms the field name mismatch.');
    }
  } finally {
    await sequelize.close();
    process.exit(0);
  }
}

// Run the debug
debugStuckCampaigns();
