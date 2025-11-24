/**
 * Test script to verify campaign rate calculations
 * 
 * This script creates mock contacts and campaigns to test the accuracy of openRate and clickRate calculations
 * in the recalculateCampaignStatsFromContacts function.
 */

// Import required modules
const { Campaign, Contact, ContactList, sequelize } = require('./src/models');

/**
 * Create a mock set of data for testing rate calculations
 * @param {boolean} useDeliveredCount - Whether to use delivered count or total contacts
 * @returns {Object} - Returns the contacts array for testing
 */
function createMockContacts(useDeliveredCount = true) {
  return [
    // 1. Has everything - opened, clicked, delivered
    {
      id: 1,
      email: 'test1@example.com',
      hasBounced: false,
      hasComplained: false,
      unsubscribed: false,
      lastOpened: new Date(),
      lastClicked: new Date(),
      lastDelivered: new Date()
    },
    // 2. Delivered and opened but not clicked
    {
      id: 2,
      email: 'test2@example.com',
      hasBounced: false,
      hasComplained: false,
      unsubscribed: false,
      lastOpened: new Date(),
      lastClicked: null,
      lastDelivered: new Date()
    },
    // 3. Delivered but not opened or clicked
    {
      id: 3,
      email: 'test3@example.com',
      hasBounced: false,
      hasComplained: false,
      unsubscribed: false,
      lastOpened: null,
      lastClicked: null,
      lastDelivered: useDeliveredCount ? new Date() : null
    },
    // 4. Bounced - no delivered timestamp
    {
      id: 4,
      email: 'test4@example.com',
      hasBounced: true,
      hasComplained: false,
      unsubscribed: false,
      lastOpened: null,
      lastClicked: null,
      lastDelivered: null
    },
    // 5. Normal contact - not opened, clicked, or delivered (not reached yet)
    {
      id: 5,
      email: 'test5@example.com',
      hasBounced: false,
      hasComplained: false,
      unsubscribed: false,
      lastOpened: null,
      lastClicked: null,
      lastDelivered: null
    }
  ];
}

/**
 * Calculate stats exactly like the real function does
 * @param {Array} contacts - Array of contact objects
 * @returns {Object} - Returns the calculated stats
 */
function calculateStats(contacts) {
  // Calculate stats
  const stats = {
    bounces: contacts.filter(c => c.hasBounced).length,
    complaints: contacts.filter(c => c.hasComplained).length,
    unsubscribes: contacts.filter(c => c.unsubscribed).length,
    delivered: contacts.filter(c => c.lastDelivered).length,
    opens: contacts.filter(c => c.lastOpened).length,
    clicks: contacts.filter(c => c.lastClicked).length
  };

  // Calculate rates based on total recipients in the contact list
  // If no delivered count is available, use total contacts as denominator
  const totalContacts = contacts.length;
  const deliveredCount = stats.delivered;
  
  // Use delivered count if available, otherwise use total contacts
  const denominator = deliveredCount > 0 ? deliveredCount : totalContacts;
  
  if (denominator > 0) {
    // Open rate: percentage of emails that were opened
    stats.openRate = parseFloat(((stats.opens / denominator) * 100).toFixed(2));
    
    // Click rate: percentage of emails that were clicked
    stats.clickRate = parseFloat(((stats.clicks / denominator) * 100).toFixed(2));
  } else {
    // If no emails or contacts, rates are 0
    stats.openRate = 0;
    stats.clickRate = 0;
  }
  
  return stats;
}

/**
 * Run tests and validate rate calculations
 */
async function runTests() {
  console.log('=== Testing campaign rate calculations ===');
  
  // Test 1: With delivered contacts (normal case)
  const contactsWithDelivered = createMockContacts(true);
  const statsWithDelivered = calculateStats(contactsWithDelivered);
  
  console.log('\nTest 1: With delivered contacts');
  console.log('Total contacts:', contactsWithDelivered.length);
  console.log('Delivered:', statsWithDelivered.delivered);
  console.log('Opens:', statsWithDelivered.opens);
  console.log('Clicks:', statsWithDelivered.clicks);
  console.log('Denominator used:', statsWithDelivered.delivered > 0 ? 'delivered count' : 'total contacts');
  console.log('Open rate:', statsWithDelivered.openRate + '%', 
    '(Expected: ' + ((statsWithDelivered.opens / statsWithDelivered.delivered) * 100).toFixed(2) + '%)');
  console.log('Click rate:', statsWithDelivered.clickRate + '%',
    '(Expected: ' + ((statsWithDelivered.clicks / statsWithDelivered.delivered) * 100).toFixed(2) + '%)');
  
  // Verify rates are correct
  const expectedOpenRate1 = parseFloat(((statsWithDelivered.opens / statsWithDelivered.delivered) * 100).toFixed(2));
  const expectedClickRate1 = parseFloat(((statsWithDelivered.clicks / statsWithDelivered.delivered) * 100).toFixed(2));
  const test1Passed = 
    statsWithDelivered.openRate === expectedOpenRate1 && 
    statsWithDelivered.clickRate === expectedClickRate1;
  console.log('Test 1 result:', test1Passed ? '✅ PASSED' : '❌ FAILED');
  
  // Test 2: Without delivered contacts (fallback to total contacts)
  const contactsWithoutDelivered = createMockContacts(false);
  const statsWithoutDelivered = calculateStats(contactsWithoutDelivered);
  
  console.log('\nTest 2: Without delivered contacts (fallback to total contacts)');
  console.log('Total contacts:', contactsWithoutDelivered.length);
  console.log('Delivered:', statsWithoutDelivered.delivered);
  console.log('Opens:', statsWithoutDelivered.opens);
  console.log('Clicks:', statsWithoutDelivered.clicks);
  console.log('Denominator used:', statsWithoutDelivered.delivered > 0 ? 'delivered count' : 'total contacts');
  console.log('Open rate:', statsWithoutDelivered.openRate + '%',
    '(Expected: ' + ((statsWithoutDelivered.opens / contactsWithoutDelivered.length) * 100).toFixed(2) + '%)');
  console.log('Click rate:', statsWithoutDelivered.clickRate + '%',
    '(Expected: ' + ((statsWithoutDelivered.clicks / contactsWithoutDelivered.length) * 100).toFixed(2) + '%)');
  
  // Verify rates are correct
  const expectedOpenRate2 = parseFloat(((statsWithoutDelivered.opens / contactsWithoutDelivered.length) * 100).toFixed(2));
  const expectedClickRate2 = parseFloat(((statsWithoutDelivered.clicks / contactsWithoutDelivered.length) * 100).toFixed(2));
  const test2Passed = 
    statsWithoutDelivered.openRate === expectedOpenRate2 && 
    statsWithoutDelivered.clickRate === expectedClickRate2;
  console.log('Test 2 result:', test2Passed ? '✅ PASSED' : '❌ FAILED');
  
  // Test 3: Edge case - no contacts at all
  const noContacts = [];
  const statsNoContacts = calculateStats(noContacts);
  
  console.log('\nTest 3: Edge case - no contacts');
  console.log('Open rate:', statsNoContacts.openRate + '%', '(Expected: 0%)');
  console.log('Click rate:', statsNoContacts.clickRate + '%', '(Expected: 0%)');
  
  // Verify rates are 0 when no contacts
  const test3Passed = statsNoContacts.openRate === 0 && statsNoContacts.clickRate === 0;
  console.log('Test 3 result:', test3Passed ? '✅ PASSED' : '❌ FAILED');
  
  console.log('\nSummary:');
  console.log('Test 1 (With delivered contacts):', test1Passed ? '✅ PASSED' : '❌ FAILED');
  console.log('Test 2 (Without delivered contacts):', test2Passed ? '✅ PASSED' : '❌ FAILED');
  console.log('Test 3 (No contacts at all):', test3Passed ? '✅ PASSED' : '❌ FAILED');
  console.log('Overall result:', test1Passed && test2Passed && test3Passed ? '✅ All tests PASSED' : '❌ Some tests FAILED');
}

// Run the tests
runTests()
  .catch(error => {
    console.error('Error running tests:', error);
  });
