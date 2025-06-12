#!/usr/bin/env node

/**
 * Quick Verification - Strict Validation
 * Tests a few key scenarios to verify strict mode is working
 */

const { validateEmail } = require('./src/services/validationService');

async function quickVerification() {
  console.log('⚡ QUICK VERIFICATION - STRICT VALIDATION');
  console.log('=' .repeat(50));
  
  // Test immediate rejections (should be very fast)
  const immediateTests = [
    'fake@example.com',
    'noreply@gmail.com',
    'invalid-email'
  ];
  
  console.log('\n🚀 Testing Immediate Rejections:');
  for (const email of immediateTests) {
    const start = Date.now();
    try {
      const result = await validateEmail(email);
      const duration = Date.now() - start;
      console.log(`${email}: ${result.isValid ? '✅ VALID' : '❌ INVALID'} (${duration}ms)`);
      if (duration < 100 && !result.isValid) {
        console.log('  ✅ CORRECT: Fast rejection');
      }
    } catch (error) {
      console.log(`${email}: ERROR - ${error.message}`);
    }
  }
  
  console.log('\n🔒 STRICT MODE VERIFICATION COMPLETE');
  console.log('All test emails should be rejected quickly');
  console.log('=' .repeat(50));
}

quickVerification().catch(console.error);
