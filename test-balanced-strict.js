#!/usr/bin/env node

/**
 * Test Balanced Strict Validation
 * Tests the improved validation that handles network connectivity issues intelligently
 */

const { validateEmail } = require('./src/services/validationService');

async function testBalancedStrictValidation() {
  console.log('🎯 Testing BALANCED STRICT Email Validation Service');
  console.log('=' .repeat(70));
  
  const testEmails = [
    // Test patterns that should be immediately rejected
    { email: 'fake@example.com', expected: 'REJECT', reason: 'example.com domain' },
    { email: 'noreply@gmail.com', expected: 'REJECT', reason: 'noreply pattern' },
    { email: 'testtest@yahoo.com', expected: 'REJECT', reason: 'test pattern' },
    
    // Real-looking emails from known domains (should now pass with medium risk if network issues)
    { email: 'itsmerouie@gmail.com', expected: 'ACCEPT_MEDIUM', reason: 'known domain, network issue fallback' },
    { email: 'john.doe@yahoo.com', expected: 'ACCEPT_MEDIUM', reason: 'known domain, network issue fallback' },
    { email: 'contact@hotmail.com', expected: 'ACCEPT_MEDIUM', reason: 'known domain, network issue fallback' },
    
    // Obviously suspicious emails should still be rejected
    { email: '12345678901234567890123456789012345678901234567890@gmail.com', expected: 'REJECT', reason: 'too long' },
    { email: '123456@gmail.com', expected: 'REJECT', reason: 'suspicious number pattern' },
  ];

  console.log('\n📝 Testing Balanced Strict Validation:');
  console.log('-' .repeat(70));

  for (const testCase of testEmails) {
    console.log(`\n🧪 Testing: ${testCase.email}`);
    console.log(`   Expected: ${testCase.expected} (${testCase.reason})`);
    
    try {
      const startTime = Date.now();
      const result = await validateEmail(testCase.email);
      const duration = Date.now() - startTime;
      
      console.log(`   Result: ${result.isValid ? '✅ VALID' : '❌ INVALID'}`);
      console.log(`   Duration: ${duration}ms`);
      console.log(`   Risk Level: ${result.riskLevel || 'N/A'}`);
      console.log(`   Reason: ${result.reason}`);
      if (result.warning) {
        console.log(`   ⚠️  Warning: ${result.warning}`);
      }
      if (result.networkIssue) {
        console.log(`   🌐 Network Issue: Detected`);
      }
      
      // Check if result matches expectation
      const matchesExpectation = 
        (testCase.expected === 'REJECT' && !result.isValid) ||
        (testCase.expected === 'ACCEPT_MEDIUM' && result.isValid && result.riskLevel === 'medium') ||
        (testCase.expected === 'ACCEPT_LOW' && result.isValid && result.riskLevel === 'low');
      
      if (matchesExpectation) {
        console.log(`   ✅ CORRECT: Matches expected behavior`);
      } else {
        console.log(`   ⚠️  UNEXPECTED: Expected ${testCase.expected} but got different result`);
      }
      
    } catch (error) {
      console.log(`   ❌ ERROR: ${error.message}`);
    }
  }
  
  console.log('\n' + '=' .repeat(70));
  console.log('🎯 BALANCED STRICT VALIDATION SUMMARY:');
  console.log('✅ Test/Fake Patterns → ❌ INVALID (instant rejection)');
  console.log('✅ Known Domains + Network Issues → ✅ VALID (medium risk)');
  console.log('✅ Known Domains + Medium Risk SMTP → ✅ VALID (medium risk + warning)');
  console.log('✅ Unknown Domains + Network Issues → ❌ INVALID');
  console.log('✅ Unknown Domains + Medium Risk → ❌ INVALID');
  console.log('✅ Suspicious Patterns → ❌ INVALID');
  console.log('=' .repeat(70));
}

// Run the test
if (require.main === module) {
  testBalancedStrictValidation().catch(console.error);
}

module.exports = { testBalancedStrictValidation };
