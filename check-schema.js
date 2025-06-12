// Check database schema for Campaigns table
const { sequelize } = require('./src/models');
require('dotenv').config();

async function checkSchema() {
  try {
    console.log('Checking Campaigns table schema...');
    
    // Get table description
    const [results] = await sequelize.query('DESCRIBE Campaigns');
    
    console.log('Campaigns table columns:');
    results.forEach(column => {
      console.log(`- ${column.Field}: ${column.Type} (${column.Null === 'YES' ? 'nullable' : 'not null'})`);
    });
    
    // Check if sendingMode column exists
    const sendingModeExists = results.some(col => col.Field === 'sendingMode');
    const sendModeExists = results.some(col => col.Field === 'sendMode');
    
    console.log(`\nsendingMode column exists: ${sendingModeExists}`);
    console.log(`sendMode column exists: ${sendModeExists}`);
    
    // Check for email count related columns
    const emailColumns = results.filter(col => col.Field.toLowerCase().includes('email'));
    console.log('\nEmail-related columns:');
    emailColumns.forEach(col => {
      console.log(`- ${col.Field}: ${col.Type}`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkSchema();
