// Check Contact table schema
const { sequelize } = require('./src/models');
require('dotenv').config();

async function checkContactSchema() {
  try {
    console.log('Checking Contact table schema...');
    
    // Get table description
    const [results] = await sequelize.query('DESCRIBE Contacts');
    
    console.log('Contacts table columns:');
    results.forEach(column => {
      console.log(`- ${column.Field}: ${column.Type} (${column.Null === 'YES' ? 'nullable' : 'not null'})`);
    });
    
    // Check ContactListContacts junction table
    console.log('\nChecking ContactListContacts junction table...');
    const [junctionResults] = await sequelize.query('DESCRIBE ContactListContacts');
    
    console.log('ContactListContacts table columns:');
    junctionResults.forEach(column => {
      console.log(`- ${column.Field}: ${column.Type} (${column.Null === 'YES' ? 'nullable' : 'not null'})`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkContactSchema();
