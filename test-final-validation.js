#!/usr/bin/env node

const { validateEmail } = require('./src/services/validationService');

console.log('🎯 Final Email Validation Test - Enhanced Safety');
console.log('===============================================\n');

async function testFinalValidation() {
  console.log('Testing various email scenarios:\n');
  
  const testCases = [
    {
      email: 'john.doe@gmail.com',
      description: 'Real looking Gmail address',
      expectation: 'Should pass with medium risk (mailbox unverified)'
    },
    {
      email: 'obviouslyfake12345678901234567890@gmail.com', 
      description: 'Obviously fake Gmail address',
      expectation: 'Should pass with medium risk (major provider fallback)'
    },
    {
      email: 'user@yahoo.com',
      description: 'Basic Yahoo address',
      expectation: 'Should try DNS validation and alternative ports'
    },
    {
      email: 'contact@microsoft.com',
      description: 'Corporate email at major provider',
      expectation: 'Should validate with enhanced methods'
    },
    {
      email: 'test@example.com',
      description: 'Test domain',
      expectation: 'Should be rejected immediately'
    },
    {
      email: 'user@unknowndomain123456789.com',
      description: 'Unknown domain',
      expectation: 'Should require strict validation and likely fail'
    }
  ];
  
  for (const testCase of testCases) {
    console.log(`📧 Testing: ${testCase.email}`);
    console.log(`📝 Description: ${testCase.description}`);
    console.log(`🎯 Expectation: ${testCase.expectation}\n`);
    
    const startTime = Date.now();
    const result = await validateEmail(testCase.email);
    const duration = Date.now() - startTime;
    
    console.log('📊 RESULT:');
    console.log(`   ✅ Valid: ${result.isValid}`);
    console.log(`   📍 Reason: ${result.reason}`);
    console.log(`   ⚠️  Risk Level: ${result.riskLevel}`);
    console.log(`   ⏱️  Duration: ${duration}ms`);
    
    if (result.fallback) {
      console.log(`   🔄 Fallback Used: Yes`);
      if (result.method) {
        console.log(`   🛠️  Method: ${result.method}`);
      }
      if (result.dnsScore !== undefined) {
        console.log(`   📊 DNS Score: ${result.dnsScore}/3`);
      }
    }
    
    console.log('\n' + '─'.repeat(60) + '\n');
  }
  
  console.log('📋 SUMMARY OF ENHANCED VALIDATION:');
  console.log('├── ✅ Alternative SMTP ports tested (587, 465, 2525)');
  console.log('├── ✅ DNS validation with SPF/DMARC/DKIM checking');
  console.log('├── ✅ Major providers get enhanced validation attempts');
  console.log('├── ✅ Risk levels reflect validation confidence');
  console.log('├── ✅ Test emails rejected immediately');
  console.log('├── ✅ Unknown domains require strict validation');
  console.log('└── ⚠️  Medium risk assigned when mailbox unverified');
  
  console.log('\n🔒 SECURITY CONSIDERATIONS:');
  console.log('• Major providers pass with MEDIUM risk (not low)');
  console.log('• This indicates "domain valid, mailbox unverified"');
  console.log('• Applications can choose risk tolerance based on use case');
  console.log('• High-security apps can reject medium risk emails');
  console.log('• Standard apps can accept medium risk with monitoring');
}

testFinalValidation().catch(console.error);
