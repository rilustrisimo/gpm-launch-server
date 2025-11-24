/**
 * Script to verify email addresses in AWS SES
 * 
 * Usage: node verify-email.js <email-address>
 * Example: node verify-email.js info@manitomanita.com
 */

const AWS = require('aws-sdk');
require('dotenv').config();

// Configure AWS SES
const ses = new AWS.SES({
  region: process.env.AWS_REGION || 'us-east-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

/**
 * Verify an email address in AWS SES
 */
async function verifyEmail(emailAddress) {
  try {
    console.log(`\n🔍 Verifying email: ${emailAddress}`);
    console.log('📍 Region:', process.env.AWS_REGION || 'us-east-1');
    
    // Check if AWS credentials are configured
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
      throw new Error('AWS credentials not configured. Please set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in .env file');
    }
    
    // Request email verification
    const result = await ses.verifyEmailIdentity({ 
      EmailAddress: emailAddress 
    }).promise();
    
    console.log('\n✅ SUCCESS!');
    console.log('📧 Verification email has been sent to:', emailAddress);
    console.log('\n📝 Next Steps:');
    console.log('1. Check the inbox for', emailAddress);
    console.log('2. Open the verification email from AWS SES');
    console.log('3. Click the verification link in the email');
    console.log('4. Wait a few minutes for verification to complete');
    console.log('5. Run the check-verification.js script to confirm status');
    
    return result;
  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    
    if (error.code === 'InvalidParameterValue') {
      console.log('\n💡 The email address format is invalid');
    } else if (error.code === 'MessageRejected') {
      console.log('\n💡 AWS rejected the verification request');
    } else if (error.code === 'LimitExceeded') {
      console.log('\n💡 You have exceeded the limit for verification requests');
      console.log('   Try again later or contact AWS support');
    }
    
    throw error;
  }
}

/**
 * Check verification status of an email address
 */
async function checkVerificationStatus(emailAddress) {
  try {
    console.log(`\n🔍 Checking verification status for: ${emailAddress}`);
    
    const result = await ses.getIdentityVerificationAttributes({
      Identities: [emailAddress]
    }).promise();
    
    const status = result.VerificationAttributes[emailAddress];
    
    if (!status) {
      console.log('\n⚠️  Email not found in SES');
      console.log('This email has not been submitted for verification yet');
      return 'NotFound';
    }
    
    console.log('\n📊 Verification Status:', status.VerificationStatus);
    
    if (status.VerificationStatus === 'Success') {
      console.log('✅ Email is VERIFIED and ready to use!');
    } else if (status.VerificationStatus === 'Pending') {
      console.log('⏳ Verification is PENDING');
      console.log('📧 Please check the inbox and click the verification link');
    } else if (status.VerificationStatus === 'Failed') {
      console.log('❌ Verification FAILED');
      console.log('Please try requesting verification again');
    }
    
    return status.VerificationStatus;
  } catch (error) {
    console.error('\n❌ ERROR checking status:', error.message);
    throw error;
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('\n📧 AWS SES Email Verification Tool\n');
    console.log('Usage:');
    console.log('  Verify email:  node verify-email.js <email-address>');
    console.log('  Check status:  node verify-email.js --check <email-address>');
    console.log('\nExamples:');
    console.log('  node verify-email.js info@manitomanita.com');
    console.log('  node verify-email.js --check info@manitomanita.com');
    console.log('\nDefault emails to verify:');
    console.log('  - info@manitomanita.com');
    console.log('  - support@send.gravitypointmedia.com');
    process.exit(0);
  }
  
  try {
    if (args[0] === '--check') {
      const email = args[1] || 'info@manitomanita.com';
      await checkVerificationStatus(email);
    } else {
      const email = args[0];
      await verifyEmail(email);
    }
  } catch (error) {
    console.error('\n💥 Script failed:', error.message);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = { verifyEmail, checkVerificationStatus };
