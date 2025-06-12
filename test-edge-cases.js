#!/usr/bin/env node

/**
 * Final Verification Test for Strict Validation
 * Tests edge cases to ensure strict validation works correctly
 */

const { validateEmail } = require('./src/services/validationService');

async function testEdgeCases() {
  console.log('🔬 EDGE CASE TESTING - STRICT VALIDATION');
  console.log('=' .repeat(60));
  
  const edgeCaseEmails = [
    // Test patterns that should be immediately rejected
    { email: 'fake@example.com', expectation: 'IMMEDIATE_REJECT', reason: 'example.com domain' },
    { email: 'noreply@gmail.com', expectation: 'IMMEDIATE_REJECT', reason: 'noreply pattern' },
    { email: 'testtest@yahoo.com', expectation: 'IMMEDIATE_REJECT', reason: 'test pattern' },
    
    // Known domains that would previously pass with warnings but should now fail
    { email: 'user123@gmail.com', expectation: 'STRICT_REJECT', reason: 'known domain but unverifiable mailbox' },
    { email: 'contact@hotmail.com', expectation: 'STRICT_REJECT', reason: 'known domain but SMTP issues' },
    
    // Invalid format should still be rejected immediately
    { email: 'invalid-email', expectation: 'FORMAT_REJECT', reason: 'invalid format' },
    { email: '@gmail.com', expectation: 'FORMAT_REJECT', reason: 'missing local part' },
    { email: 'user@', expectation: 'FORMAT_REJECT', reason: 'missing domain' }
  ];

  console.log('\n📝 Testing Edge Cases:');
  console.log('-' .repeat(60));

  for (const testCase of edgeCaseEmails) {
    console.log(`\n🧪 Testing: ${testCase.email}`);
    console.log(`   Expected: ${testCase.expectation} (${testCase.reason})`);
    
    try {
      const startTime = Date.now();
      const result = await validateEmail(testCase.email);
      const duration = Date.now() - startTime;
      
      console.log(`   Result: ${result.isValid ? '✅ VALID' : '❌ INVALID'}`);
      console.log(`   Duration: ${duration}ms`);
      console.log(`   Reason: ${result.reason}`);
      
      // Verify expectations
      if (testCase.expectation === 'IMMEDIATE_REJECT' && duration < 100) {
        console.log(`   ✅ CORRECT: Immediate rejection as expected`);
      } else if (testCase.expectation === 'STRICT_REJECT' && !result.isValid && result.domainType === 'known') {
        console.log(`   ✅ CORRECT: Known domain strictly rejected as expected`);
      } else if (testCase.expectation === 'FORMAT_REJECT' && !result.isValid && duration < 50) {
        console.log(`   ✅ CORRECT: Format rejection as expected`);
      } else if (!result.isValid) {
        console.log(`   ✅ CORRECT: Rejected as expected`);
      } else {
        console.log(`   ⚠️  UNEXPECTED: Expected rejection but got acceptance`);
      }
      
    } catch (error) {
      console.log(`   ❌ ERROR: ${error.message}`);
    }
  }
  
  console.log('\n' + '=' .repeat(60));
  console.log('🎯 EDGE CASE VERIFICATION COMPLETE');
  console.log('📊 All tests should show appropriate rejection behavior');
  console.log('⚡ Immediate rejections should be <100ms');
  console.log('🔒 Known domains should be strictly validated (no fallbacks)');
  console.log('=' .repeat(60));
}

// Run the edge case tests
if (require.main === module) {
  testEdgeCases().catch(console.error);
}

module.exports = { testEdgeCases };
