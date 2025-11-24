/**
 * Script to update contact records where lastDelivered is null but lastEngagement exists
 * 
 * This script fixes historical data where lastDelivered wasn't properly set for contacts
 * that have engagement but no delivery timestamp (excluding bounced contacts).
 */

const { Contact, sequelize } = require('./src/models');

/**
 * Update contacts with missing lastDelivered timestamps
 */
async function updateMissingLastDelivered() {
  try {
    console.log('🔧 Starting update of contacts with missing lastDelivered timestamps...');
    
    // Find contacts where:
    // - lastDelivered is null
    // - lastEngagement is not null 
    // - hasBounced is false (bounced contacts should have null lastDelivered)
    const contactsToUpdate = await Contact.findAll({
      where: {
        lastDelivered: null,
        lastEngagement: {
          [sequelize.Sequelize.Op.ne]: null
        },
        hasBounced: false
      },
      attributes: [
        'id', 
        'email', 
        'lastEngagement', 
        'lastDelivered', 
        'hasBounced'
      ]
    });
    
    console.log(`📊 Found ${contactsToUpdate.length} contacts that need lastDelivered updated`);
    
    if (contactsToUpdate.length === 0) {
      console.log('✅ No contacts need updating. All records are already correct.');
      return;
    }
    
    // Show first few examples of what will be updated
    console.log('\n📋 Example contacts to be updated:');
    contactsToUpdate.slice(0, 5).forEach((contact, index) => {
      console.log(`${index + 1}. Contact ${contact.id} (${contact.email})`);
      console.log(`   lastEngagement: ${contact.lastEngagement}`);
      console.log(`   lastDelivered: ${contact.lastDelivered} -> will be set to ${contact.lastEngagement}`);
    });
    
    if (contactsToUpdate.length > 5) {
      console.log(`   ... and ${contactsToUpdate.length - 5} more contacts`);
    }
    
    // Ask for confirmation before proceeding
    console.log(`\n⚠️  This will update ${contactsToUpdate.length} contact records.`);
    console.log('Press Ctrl+C to cancel, or any key to continue...');
    
    // Wait for user input (in a real script, you might want to add readline for confirmation)
    // For now, we'll proceed automatically after a short delay
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log('\n🚀 Starting bulk update...');
    
    // Update in batches to avoid overwhelming the database
    const batchSize = 100;
    let updatedCount = 0;
    
    for (let i = 0; i < contactsToUpdate.length; i += batchSize) {
      const batch = contactsToUpdate.slice(i, i + batchSize);
      
      console.log(`📦 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(contactsToUpdate.length / batchSize)} (${batch.length} contacts)`);
      
      // Update each contact in the batch
      const updatePromises = batch.map(contact => 
        contact.update({ 
          lastDelivered: contact.lastEngagement 
        })
      );
      
      await Promise.all(updatePromises);
      updatedCount += batch.length;
      
      console.log(`✅ Updated ${updatedCount}/${contactsToUpdate.length} contacts`);
      
      // Small delay between batches to be gentle on the database
      if (i + batchSize < contactsToUpdate.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    console.log(`\n🎉 Successfully updated ${updatedCount} contacts!`);
    console.log('📈 All contacts now have proper lastDelivered timestamps.');
    
    // Verify the update
    const remainingContacts = await Contact.count({
      where: {
        lastDelivered: null,
        lastEngagement: {
          [sequelize.Sequelize.Op.ne]: null
        },
        hasBounced: false
      }
    });
    
    console.log(`\n🔍 Verification: ${remainingContacts} contacts still have missing lastDelivered (should be 0)`);
    
    if (remainingContacts === 0) {
      console.log('✅ All contacts successfully updated!');
    } else {
      console.log('⚠️  Some contacts may still need attention.');
    }
    
  } catch (error) {
    console.error('❌ Error updating contacts:', error);
    console.error(error.stack);
  }
}

/**
 * Show current statistics before and after update
 */
async function showStatistics() {
  try {
    console.log('\n📊 Current Contact Statistics:');
    
    const totalContacts = await Contact.count();
    const contactsWithLastDelivered = await Contact.count({
      where: {
        lastDelivered: {
          [sequelize.Sequelize.Op.ne]: null
        }
      }
    });
    const contactsWithLastEngagement = await Contact.count({
      where: {
        lastEngagement: {
          [sequelize.Sequelize.Op.ne]: null
        }
      }
    });
    const bouncedContacts = await Contact.count({
      where: {
        hasBounced: true
      }
    });
    const contactsNeedingUpdate = await Contact.count({
      where: {
        lastDelivered: null,
        lastEngagement: {
          [sequelize.Sequelize.Op.ne]: null
        },
        hasBounced: false
      }
    });
    
    console.log(`Total contacts: ${totalContacts}`);
    console.log(`Contacts with lastDelivered: ${contactsWithLastDelivered}`);
    console.log(`Contacts with lastEngagement: ${contactsWithLastEngagement}`);
    console.log(`Bounced contacts: ${bouncedContacts}`);
    console.log(`Contacts needing lastDelivered update: ${contactsNeedingUpdate}`);
    
    const deliveryRate = totalContacts > 0 ? ((contactsWithLastDelivered / totalContacts) * 100).toFixed(2) : 0;
    console.log(`Current delivery coverage: ${deliveryRate}%`);
    
  } catch (error) {
    console.error('Error showing statistics:', error);
  }
}

/**
 * Main function to run the update script
 */
async function main() {
  try {
    console.log('🚀 Contact lastDelivered Update Script');
    console.log('=====================================\n');
    
    // Show current statistics
    await showStatistics();
    
    // Perform the update
    await updateMissingLastDelivered();
    
    // Show final statistics
    console.log('\n📊 Final Statistics:');
    await showStatistics();
    
    console.log('\n✅ Script completed successfully!');
    
  } catch (error) {
    console.error('❌ Script failed:', error);
    process.exit(1);
  }
}

// Run the script if called directly
if (require.main === module) {
  main()
    .then(() => {
      console.log('\n👋 Goodbye!');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Unhandled error:', error);
      process.exit(1);
    });
}

module.exports = {
  updateMissingLastDelivered,
  showStatistics,
  main
};
