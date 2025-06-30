#!/usr/bin/env node

/**
 * Recalculate Campaign Stats Script
 * 
 * This script recalculates all campaign statistics from contact data
 * to ensure data consistency and accurate reporting.
 * 
 * Usage:
 *   node recalculate-campaign-stats.js
 *   # or
 *   ./recalculate-campaign-stats.js
 * 
 * What it does:
 * - Fetches all campaigns from the database
 * - For each campaign, recalculates stats based on actual contact data:
 *   - delivered: Count of contacts with lastDelivered timestamp
 *   - opens: Count of contacts with lastOpened timestamp
 *   - clicks: Count of contacts with lastClicked timestamp
 *   - bounces: Count of contacts with hasBounced = true
 *   - complaints: Count of contacts with hasComplained = true
 *   - unsubscribes: Count of contacts with unsubscribed = true
 *   - openRate: (opens / delivered) * 100
 *   - clickRate: (clicks / delivered) * 100
 * - Shows before/after comparison for each campaign
 * - Provides a summary of processed campaigns
 */

const path = require('path');
const { Campaign, ContactList } = require('./src/models');

// Import the recalculation function from the tracking controller
const { recalculateCampaignStatsFromContacts } = require('./src/controllers/tracking.controller');

/**
 * Main function to recalculate stats for all campaigns
 */
async function recalculateAllCampaignStats() {
  console.log('🔄 Starting campaign stats recalculation...\n');
  
  try {
    // Get all campaigns with their contact lists
    const campaigns = await Campaign.findAll({
      include: [{
        model: ContactList,
        as: 'contactList'
      }],
      order: [['createdAt', 'DESC']]
    });
    
    if (campaigns.length === 0) {
      console.log('⚠️ No campaigns found in the database.');
      return;
    }
    
    console.log(`📊 Found ${campaigns.length} campaigns to recalculate.\n`);
    
    let processed = 0;
    let succeeded = 0;
    let failed = 0;
    const failedCampaigns = [];
    
    // Process campaigns one by one to avoid overwhelming the database
    for (const campaign of campaigns) {
      processed++;
      
      try {
        console.log(`[${processed}/${campaigns.length}] Processing campaign: ${campaign.name} (${campaign.id})`);
        
        if (!campaign.contactList) {
          console.log(`   ⚠️ Skipping - no contact list associated`);
          continue;
        }
        
        // Get current stats before recalculation
        const beforeStats = {
          delivered: campaign.delivered || 0,
          opens: campaign.opens || 0,
          clicks: campaign.clicks || 0,
          bounces: campaign.bounces || 0,
          complaints: campaign.complaints || 0,
          unsubscribes: campaign.unsubscribes || 0,
          openRate: campaign.openRate || 0,
          clickRate: campaign.clickRate || 0
        };
        
        // Recalculate stats from contacts
        await recalculateCampaignStatsFromContacts(campaign);
        
        // Reload campaign to get updated stats
        await campaign.reload();
        
        const afterStats = {
          delivered: campaign.delivered || 0,
          opens: campaign.opens || 0,
          clicks: campaign.clicks || 0,
          bounces: campaign.bounces || 0,
          complaints: campaign.complaints || 0,
          unsubscribes: campaign.unsubscribes || 0,
          openRate: campaign.openRate || 0,
          clickRate: campaign.clickRate || 0
        };
        
        // Check if stats changed
        const hasChanges = JSON.stringify(beforeStats) !== JSON.stringify(afterStats);
        
        if (hasChanges) {
          console.log(`   ✅ Updated - Changes detected:`);
          console.log(`      Delivered: ${beforeStats.delivered} → ${afterStats.delivered}`);
          console.log(`      Opens: ${beforeStats.opens} → ${afterStats.opens}`);
          console.log(`      Clicks: ${beforeStats.clicks} → ${afterStats.clicks}`);
          console.log(`      Bounces: ${beforeStats.bounces} → ${afterStats.bounces}`);
          console.log(`      Complaints: ${beforeStats.complaints} → ${afterStats.complaints}`);
          console.log(`      Unsubscribes: ${beforeStats.unsubscribes} → ${afterStats.unsubscribes}`);
          console.log(`      Open Rate: ${beforeStats.openRate}% → ${afterStats.openRate}%`);
          console.log(`      Click Rate: ${beforeStats.clickRate}% → ${afterStats.clickRate}%`);
        } else {
          console.log(`   ✅ No changes - stats already accurate`);
        }
        
        succeeded++;
        
      } catch (error) {
        failed++;
        failedCampaigns.push({
          id: campaign.id,
          name: campaign.name,
          error: error.message
        });
        console.log(`   ❌ Failed: ${error.message}`);
      }
      
      console.log(''); // Empty line for readability
    }
    
    // Summary
    console.log('📋 SUMMARY:');
    console.log(`   Total campaigns: ${campaigns.length}`);
    console.log(`   Successfully processed: ${succeeded}`);
    console.log(`   Failed: ${failed}`);
    
    if (failedCampaigns.length > 0) {
      console.log('\n❌ Failed campaigns:');
      failedCampaigns.forEach(campaign => {
        console.log(`   - ${campaign.name} (${campaign.id}): ${campaign.error}`);
      });
    }
    
    console.log('\n✅ Campaign stats recalculation completed!');
    
  } catch (error) {
    console.error('❌ Fatal error during recalculation:', error);
    process.exit(1);
  }
}

/**
 * Run the script with proper error handling
 */
async function main() {
  try {
    await recalculateAllCampaignStats();
    process.exit(0);
  } catch (error) {
    console.error('❌ Script failed:', error);
    process.exit(1);
  }
}

// Only run if this file is executed directly
if (require.main === module) {
  main();
}

module.exports = {
  recalculateAllCampaignStats
};
