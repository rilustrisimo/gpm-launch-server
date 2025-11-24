/**
 * Script to check which emails are verified in AWS SES
 * and ensure info@manitomanita.com is included
 */

const sesService = require('./src/services/sesService');
require('dotenv').config();

async function checkVerifiedEmails() {
  try {
    console.log('\n🔍 Checking verified email identities...\n');
    console.log('📍 AWS Region:', process.env.AWS_REGION || 'us-east-1');
    console.log('🔑 AWS Credentials:', process.env.AWS_ACCESS_KEY_ID ? 'Configured ✅' : 'Not configured ❌');
    console.log('');
    
    const identities = await sesService.getVerifiedIdentities();
    
    console.log('📧 Verified Email Identities:\n');
    identities.forEach((email, index) => {
      console.log(`   ${index + 1}. ${email}`);
    });
    
    console.log('\n✅ Total:', identities.length, 'verified emails');
    
    // Check if Manito Manita email is included
    if (identities.includes('info@manitomanita.com')) {
      console.log('\n✅ SUCCESS: info@manitomanita.com is in the list!');
    } else {
      console.log('\n⚠️  WARNING: info@manitomanita.com is NOT in the list');
      console.log('   This email will be added to the default list as a fallback');
    }
    
    // Check if Gravity Point email is included
    if (identities.includes('support@send.gravitypointmedia.com')) {
      console.log('✅ SUCCESS: support@send.gravitypointmedia.com is in the list!');
    } else {
      console.log('⚠️  WARNING: support@send.gravitypointmedia.com is NOT in the list');
    }
    
    console.log('\n📝 Note: These emails are available in the campaign creation dropdown\n');
    
  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error('Stack:', error.stack);
  }
}

// Run the check
checkVerifiedEmails();
