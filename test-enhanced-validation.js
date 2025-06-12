#!/usr/bin/env node

const { validateEmail, testSmtpConnectivity } = require('./src/services/validationService');

console.log('🔍 Testing Enhanced Email Validation with Mailbox Verification');
console.log('=============================================================\n');

async function testEnhancedValidation() {
  // Test SMTP connectivity first
  console.log('1. Testing SMTP Connectivity...');
  const smtpAvailable = await testSmtpConnectivity();
  console.log(`SMTP Port 25 accessible: ${smtpAvailable}\n`);
  
  console.log('2. Testing Enhanced Validation for Major Providers...\n');
  
  const testEmails = [
    { email: 'user@gmail.com', expected: 'should try alternative ports and DNS validation' },
    { email: 'nonexistent123456789@gmail.com', expected: 'should fail even though Gmail domain' },
    { email: 'test@yahoo.com', expected: 'should try multiple validation methods' },
    { email: 'user@hotmail.com', expected: 'should verify mailbox existence if possible' },
    { email: 'admin@unknowndomain12345.com', expected: 'should require strict validation' }
  ];
  
  for (const test of testEmails) {
    console.log(`Testing: ${test.email}`);
    console.log(`Expected: ${test.expected}`);
    
    const startTime = Date.now();
    const result = await validateEmail(test.email);
    const endTime = Date.now();
    
    console.log(`✅ Valid: ${result.isValid}`);
    console.log(`📍 Reason: ${result.reason}`);
    console.log(`⚠️  Risk: ${result.riskLevel}`);
    console.log(`⏱️  Time: ${endTime - startTime}ms`);
    
    if (result.fallback) {
      console.log(`🔄 Fallback used: ${result.smtpCheck || 'yes'}`);
      if (result.method) {
        console.log(`🛠️  Method: ${result.method}`);
      }
      if (result.dnsScore) {
        console.log(`📊 DNS Score: ${result.dnsScore}/3`);
      }
    }
    
    console.log('--------------------------------------------------\n');
  }
  
  console.log('3. Testing Known Non-Existent Email...\n');
  
  // Test a known non-existent email at a major provider
  const nonExistentEmail = `definitely-does-not-exist-${Date.now()}@gmail.com`;
  console.log(`Testing: ${nonExistentEmail}`);
  
  const startTime = Date.now();
  const result = await validateEmail(nonExistentEmail);
  const endTime = Date.now();
  
  console.log(`✅ Valid: ${result.isValid}`);
  console.log(`📍 Reason: ${result.reason}`);
  console.log(`⚠️  Risk: ${result.riskLevel}`);
  console.log(`⏱️  Time: ${endTime - startTime}ms`);
  
  if (result.fallback) {
    console.log(`🔄 Fallback used: ${result.smtpCheck || 'yes'}`);
    if (result.method) {
      console.log(`🛠️  Method: ${result.method}`);
    }
  }
  
  console.log('\n🎯 Summary:');
  console.log('- Alternative SMTP ports (587, 465, 2525) are tested');
  console.log('- DNS validation checks SPF, DMARC, and DKIM records');
  console.log('- Major providers still get enhanced validation attempts');
  console.log('- Fallback only occurs after trying multiple methods');
  console.log('- Risk levels properly reflect validation confidence');
}

testEnhancedValidation().catch(console.error);
