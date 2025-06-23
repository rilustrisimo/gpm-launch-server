console.log('🧪 Testing fresh contacts functionality...');

const campaignService = require('./src/services/campaignService');

async function testFreshContacts() {
  try {
    console.log('1️⃣ Getting campaign...');
    const campaignId = '5b69de2e-4d62-4a4c-b626-828222c7ce48';
    const userId = '45ced181-02f8-4572-8bd4-8574e482d075';
    
    const campaign = await campaignService.getCampaign(campaignId, userId);
    console.log(`✅ Campaign: ${campaign.name}`);
    console.log(`   Contact List ID: ${campaign.contactListId}`);
    
    console.log('\n2️⃣ Getting fresh contacts...');
    const freshContacts = await campaignService.getFreshContacts(campaign.contactListId);
    console.log(`✅ Fresh contacts found: ${freshContacts.length}`);
    
    console.log('\n3️⃣ Checking if biggysam@msn.com is excluded...');
    const problematicContact = freshContacts.find(c => c.email === 'biggysam@msn.com');
    if (problematicContact) {
      console.log('❌ biggysam@msn.com found in fresh contacts (should be excluded!)');
    } else {
      console.log('✅ biggysam@msn.com correctly excluded from fresh contacts');
    }
    
    console.log('\n4️⃣ Testing campaign restart...');
    const result = await campaignService.sendCampaign(campaignId, userId);
    console.log('✅ Campaign restart result:', {
      success: result.success,
      totalContacts: result.stats.totalContacts,
      activeContacts: result.stats.activeContacts
    });
    
    if (result.stats.activeContacts === 103) {
      console.log('🎉 PERFECT: Campaign is using 103 fresh contacts!');
    } else {
      console.log(`⚠️  Expected 103 contacts, got ${result.stats.activeContacts}`);
    }
    
    console.log('\n✅ All tests completed successfully!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.originalError) {
      console.error('   Original error:', error.originalError.message);
    }
  }
  
  process.exit(0);
}

testFreshContacts();
