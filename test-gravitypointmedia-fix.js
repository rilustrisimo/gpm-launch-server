#!/usr/bin/env node

/**
 * Test the fix for gravitypointmedia.com domain
 */

const { validateEmail } = require('./src/services/validationService');

async function testGravityPointMediaFix() {
  console.log('🧪 Testing GravityPointMedia.com Domain Fix');
  console.log('=' .repeat(60));
  
  const testEmail = 'rouie@gravitypointmedia.com';
  
  console.log(`\n🔍 Testing: ${testEmail}`);
  console.log(`Expected: Should now PASS with medium risk due to SPF record`);
  console.log('-'.repeat(60));
  
  try {
    const startTime = Date.now();
    const result = await validateEmail(testEmail);
    const endTime = Date.now();
    
    console.log('\n📋 VALIDATION RESULT:');
    console.log(`✅ Success: ${result.success}`);
    console.log(`✅ Valid: ${result.isValid}`);
    console.log(`📍 Reason: ${result.reason}`);
    console.log(`⚠️  Risk Level: ${result.riskLevel}`);
    console.log(`🏷️  Classification: ${result.classification}`);
    console.log(`🔧 SMTP Check: ${result.smtpCheck}`);
    console.log(`🌐 Domain Type: ${result.domainType}`);
    console.log(`⏱️  Time: ${endTime - startTime}ms`);
    
    if (result.warning) {
      console.log(`⚠️  Warning: ${result.warning}`);
    }
    
    if (result.dnsValidation) {
      console.log('\n📊 DNS VALIDATION DETAILS:');
      console.log(`   SPF: ${result.dnsValidation.hasSPF}`);
      console.log(`   DMARC: ${result.dnsValidation.hasDMARC}`);
      console.log(`   DKIM: ${result.dnsValidation.hasDKIM}`);
      console.log(`   Score: ${result.dnsValidation.score}/3`);
      console.log(`   Email Capable: ${result.dnsValidation.emailCapable}`);
    }
    
    console.log('\n' + '=' .repeat(60));
    
    if (result.isValid && result.riskLevel === 'medium') {
      console.log('🎉 SUCCESS! The fix works - email is now accepted with medium risk');
      console.log('✅ This proves the domain has valid email infrastructure (SPF record)');
      console.log('⚠️  Medium risk is appropriate since mailbox existence wasn\'t verified');
    } else if (result.isValid) {
      console.log('✅ Email accepted but with unexpected risk level');
    } else {
      console.log('❌ Email still rejected - investigating...');
      console.log('🔍 This suggests there might be another issue');
    }
    
  } catch (error) {
    console.error('❌ Test failed with error:', error);
  }
}

// Run the test
if (require.main === module) {
  testGravityPointMediaFix().catch(console.error);
}

module.exports = { testGravityPointMediaFix };
