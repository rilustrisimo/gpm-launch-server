#!/usr/bin/env node

/**
 * Test Script for STRICT Email Validation Service
 * Tests that known domains with medium risk or connectivity issues are now rejected
 */

const { validateEmail } = require('./src/services/validationService');

async function testStrictValidation() {
  console.log('🧪 Testing STRICT Email Validation Service');
  console.log('=' .repeat(60));
  
  const testEmails = [
    // Known domains that should be rejected if they have medium risk or connectivity issues
    'itsmerouie@gmail.com',
    'test@gmail.com',
    'nonexistent@outlook.com', 
    'invalid@yahoo.com',
    'fake@hotmail.com',
    'test123@icloud.com',
    
    // Test emails that should be immediately rejected
    'testtest@example.com',
    'sample.email@test.com',
    
    // Valid-looking emails from known domains (may pass if SMTP succeeds with low risk)
    'info@gmail.com',
    'support@outlook.com'
  ];

  console.log('\n📋 Testing Email Validation Results:');
  console.log('-'.repeat(60));

  for (const email of testEmails) {
    try {
      console.log(`\n🔍 Testing: ${email}`);
      const result = await validateEmail(email);
      
      console.log(`   Result: ${result.isValid ? '✅ VALID' : '❌ INVALID'}`);
      console.log(`   Reason: ${result.reason}`);
      console.log(`   Risk Level: ${result.riskLevel || 'N/A'}`);
      console.log(`   Classification: ${result.classification || 'N/A'}`);
      console.log(`   SMTP Check: ${result.smtpCheck || 'N/A'}`);
      if (result.domainType) {
        console.log(`   Domain Type: ${result.domainType}`);
      }
      if (result.warning) {
        console.log(`   ⚠️  Warning: ${result.warning}`);
      }
      
    } catch (error) {
      console.log(`   ❌ ERROR: ${error.message}`);
    }
  }

  console.log('\n' + '=' .repeat(60));
  console.log('📊 STRICT VALIDATION SUMMARY:');
  console.log('• Known + Medium Risk SMTP → ❌ INVALID (STRICT)');
  console.log('• Known + Connectivity Issue → ❌ INVALID (STRICT)');  
  console.log('• Known + Low Risk SMTP → ✅ VALID');
  console.log('• Known + Mailbox Not Found → ❌ INVALID');
  console.log('• Unknown + Low Risk SMTP → ✅ VALID');
  console.log('• Unknown + Any Other Issue → ❌ INVALID');
  console.log('• Test/Fake Email Patterns → ❌ INVALID (immediate)');
  console.log('=' .repeat(60));
}

// Run the test
if (require.main === module) {
  testStrictValidation().catch(console.error);
}

module.exports = { testStrictValidation };
