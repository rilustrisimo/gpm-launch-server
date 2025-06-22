#!/usr/bin/env node

const { Campaign, CampaignStat, sequelize } = require('./src/models');

async function testCalculateStats() {
  try {
    console.log('🔍 Testing campaign stats calculation...\n');
    
    const campaignId = '5b69de2e-4d62-4a4c-b626-828222c7ce48';
    
    // Test 1: Check if campaign exists
    console.log('1. Checking if campaign exists...');
    const campaign = await Campaign.findByPk(campaignId);
    if (!campaign) {
      console.log('❌ Campaign not found');
      return;
    }
    console.log(`✅ Campaign found: ${campaign.name} (${campaign.status})`);
    
    // Test 2: Check CampaignStat records
    console.log('\n2. Checking CampaignStat records...');
    const campaignStats = await CampaignStat.findAll({
      where: { campaignId },
      limit: 5 // Just get a few to test
    });
    console.log(`✅ Found ${campaignStats.length} CampaignStat records (showing first 5)`);
    
    // Test 3: Calculate stats manually
    console.log('\n3. Calculating stats manually...');
    const allStats = await CampaignStat.findAll({
      where: { campaignId },
      attributes: ['sent', 'delivered', 'opened', 'clicked', 'bounced']
    });
    
    const calculatedStats = {
      total: allStats.length,
      sent: allStats.filter(s => s.sent === true).length,
      delivered: allStats.filter(s => s.delivered === true).length,
      opened: allStats.filter(s => s.opened === true).length,
      clicked: allStats.filter(s => s.clicked === true).length,
      bounced: allStats.filter(s => s.bounced === true).length,
      unsubscribes: 0, // Not tracked in CampaignStats table
      complaints: 0   // Not tracked in CampaignStats table
    };
    
    console.log('✅ Calculated stats:', calculatedStats);
    
    console.log('\n🎉 All tests passed! The backend database connection and stats calculation should work.');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await sequelize.close();
  }
}

testCalculateStats();
