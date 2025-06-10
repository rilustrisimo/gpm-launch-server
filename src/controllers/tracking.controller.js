/**
 * Tracking Controller
 * 
 * Handles tracking data updates from the Cloudflare Worker
 */

const { Campaign, Contact, ContactList, ContactListContacts } = require('../models');
const { createError } = require('../utils/error');

/**
 * Update email tracking data (opens, clicks, etc.)
 */
async function updateTracking(req, res, next) {
  try {
    console.log('📊 Received tracking update:');
    console.log(`- Body: ${JSON.stringify(req.body)}`);
    
    const { campaignId, contactId, trackingData } = req.body;
    
    if (!campaignId || !contactId || !trackingData) {
      console.log('❌ Missing required parameters');
      return next(createError('Missing required parameters', 400));
    }
    
    console.log(`- Campaign ID: ${campaignId}`);
    console.log(`- Contact ID: ${contactId}`);
    console.log(`- Event Type: ${trackingData.type}`);
    
    // Find the campaign
    const campaign = await Campaign.findByPk(campaignId);
    if (!campaign) {
      console.log('❌ Campaign not found');
      return next(createError('Campaign not found', 404));
    }
    
    // Find the contact
    const contact = await Contact.findByPk(contactId);
    if (!contact) {
      console.log('❌ Contact not found');
      return next(createError('Contact not found', 404));
    }
    
    console.log('✅ Found campaign and contact')
    
    // Update campaign statistics based on tracking event type
    switch (trackingData.type) {
      case 'click':
        // Update click stats
        try {
          await campaign.increment('clicks', { by: 1 });
        } catch (incrementError) {
          console.error(`Error incrementing campaign clicks: ${incrementError.message}`);
          const currentCount = campaign.clicks || 0;
          await campaign.update({ clicks: currentCount + 1 });
        }
        
        // Update contact's last click timestamp, clicked link, and last engagement
        await contact.update({
          lastClicked: trackingData.timestamp || new Date(),
          lastClickedLink: trackingData.link || null,
          lastEngagement: trackingData.timestamp || new Date()
        });
        break;
        
      case 'open':
        // Update open stats if available (though opens are typically disabled in SES)
        try {
          if (campaign.opens !== undefined) {
            await campaign.increment('opens', { by: 1 });
          }
        } catch (incrementError) {
          console.error(`Error incrementing campaign opens: ${incrementError.message}`);
          // Continue without failing
        }
        
        // Update contact's last open timestamp and last engagement
        await contact.update({
          lastOpened: trackingData.timestamp || new Date(),
          lastEngagement: trackingData.timestamp || new Date()
        });
        break;
        
      case 'delivery':
        // Update delivery stats
        try {
          await campaign.increment('delivered', { by: 1 });
        } catch (incrementError) {
          console.error(`Error incrementing campaign delivered: ${incrementError.message}`);
          const currentCount = campaign.delivered || 0;
          await campaign.update({ delivered: currentCount + 1 });
        }
        
        // Update contact's last delivered timestamp and last engagement
        await contact.update({
          lastDelivered: trackingData.timestamp || new Date(),
          lastEngagement: trackingData.timestamp || new Date()
        });
        break;
        
      case 'send':
        // Update send stats
        try {
          await campaign.increment('sent', { by: 1 });
        } catch (incrementError) {
          console.error(`Error incrementing campaign sent: ${incrementError.message}`);
          const currentCount = campaign.sent || 0;
          await campaign.update({ sent: currentCount + 1 });
        }
        
        // Update contact's last engagement for send events
        await contact.update({
          lastEngagement: trackingData.timestamp || new Date()
        });
        break;
    }
    
    // Return success
    res.status(200).json({ success: true });
  } catch (error) {
    next(createError('Failed to update tracking data', 500, error));
  }
}

/**
 * Update unsubscribe status for a contact
 */
async function updateUnsubscribe(req, res, next) {
  try {
    const { email, campaignId, timestamp } = req.body;
    
    if (!email) {
      return next(createError('Email is required', 400));
    }
    
    console.log(`Processing unsubscribe for email: ${email}, campaignId: ${campaignId}`);
    
    // Find the contact by email
    const contact = await Contact.findOne({ where: { email: email.toLowerCase() } });
    if (!contact) {
      console.log(`Contact not found for email: ${email}`);
      return next(createError('Contact not found', 404));
    }
    
    console.log(`Found contact: ${contact.id} (${contact.email})`);
    
    // Update the contact's unsubscribe status and overall status
    await contact.update({
      unsubscribed: true,
      unsubscribedAt: timestamp || new Date(),
      status: 'unsubscribed',
      lastEngagement: timestamp || new Date()
    });
    
    console.log(`Updated contact status to unsubscribed`);
    
    // Remove contact from all lists and update list counts
    const contactListAssociations = await ContactListContacts.findAll({
      where: { contactId: contact.id }
    });
    
    console.log(`Found ${contactListAssociations.length} list associations to remove`);
    
    // Remove from each list and update counts
    for (const association of contactListAssociations) {
      // Remove the association
      await ContactListContacts.destroy({
        where: {
          contactId: contact.id,
          contactListId: association.contactListId
        }
      });
      
      // Update the list count
      const contactList = await ContactList.findByPk(association.contactListId);
      if (contactList) {
        await contactList.decrement('count');
        console.log(`Decremented count for list: ${contactList.name} (${contactList.id})`);
      }
    }
    
    // If campaign ID is provided, record the unsubscribe source
    if (campaignId) {
      console.log(`Updating campaign unsubscribe count for campaign: ${campaignId}`);
      
      const campaign = await Campaign.findByPk(campaignId);
      if (campaign) {
        try {
          // Use increment with explicit field specification
          await campaign.increment('unsubscribes', { by: 1 });
          
          // Reload to get updated values
          await campaign.reload();
          console.log(`Successfully incremented unsubscribe count for campaign: ${campaignId}`);
          console.log(`New unsubscribe count: ${campaign.unsubscribes}`);
        } catch (incrementError) {
          console.error(`Error incrementing campaign unsubscribes: ${incrementError.message}`);
          // Try alternative approach
          const currentCount = campaign.unsubscribes || 0;
          await campaign.update({ unsubscribes: currentCount + 1 });
          console.log(`Fallback: Updated unsubscribe count manually to ${currentCount + 1}`);
        }
      } else {
        console.log(`Campaign not found: ${campaignId}`);
      }
    }
    
    console.log(`Successfully processed unsubscribe for contact: ${contact.id} (${email})`);
    
    // Return success
    res.status(200).json({ 
      success: true,
      message: 'Unsubscribe processed successfully',
      contactId: contact.id,
      listsRemoved: contactListAssociations.length
    });
  } catch (error) {
    console.error(`Error in updateUnsubscribe: ${error.message}`);
    console.error(error.stack);
    next(createError('Failed to update unsubscribe status', 500, error));
  }
}

/**
 * Record a bounce event
 */
async function recordBounce(req, res, next) {
  try {
    const { email, bounceType, messageId, timestamp } = req.body;
    
    if (!email) {
      return next(createError('Email is required', 400));
    }

    console.log(`Processing bounce for email: ${email}, type: ${bounceType || 'unknown'}, messageId: ${messageId}`);
    
    // Find the contact by email
    const contact = await Contact.findOne({ where: { email: email.toLowerCase() } });
    
    // If contact doesn't exist, log this but return a successful response
    // This prevents the worker from retrying and overwhelming the server
    if (!contact) {
      console.log(`Bounce received for non-existent contact: ${email}`);
      return res.status(200).json({ 
        success: true, 
        warning: 'Contact not found in database, but bounce recorded in logs',
        contactExists: false
      });
    }

    // Check if this specific bounce has already been processed for this contact
    // Use messageId and email combination for deduplication
    if (messageId && contact.lastBouncedAt) {
      // If the contact already has a bounce recorded and it's for the same message ID
      // we can check if this is a duplicate by comparing timestamps
      const existingBounceTime = new Date(contact.lastBouncedAt);
      const currentBounceTime = timestamp ? new Date(timestamp) : new Date();
      
      // If the bounce times are very close (within 1 minute) and the contact is already marked as bounced,
      // this is likely a duplicate event
      if (contact.hasBounced && Math.abs(currentBounceTime - existingBounceTime) < 60000) {
        console.log(`Duplicate bounce event detected for email: ${email}, messageId: ${messageId}`);
        return res.status(200).json({ 
          success: true,
          warning: 'Duplicate bounce event ignored',
          contactExists: true,
          contactId: contact.id
        });
      }
    }

    // Update the bounce status
    await contact.update({
      hasBounced: true,
      bounceType: bounceType || 'unknown',
      lastBouncedAt: timestamp || new Date(),
      status: bounceType && bounceType.toLowerCase() === 'permanent' ? 'bounced' : contact.status,
      lastEngagement: timestamp || new Date()
    });
    
    // If messageId contains campaignId, update the campaign bounce counter
    if (messageId && messageId.includes('-campaign-')) {
      try {
        // Extract campaignId from messageId (format depends on how your system formats messageIds)
        const campaignIdMatch = messageId.match(/campaign-([a-f0-9\-]+)/i);
        if (campaignIdMatch && campaignIdMatch[1]) {
          const campaignId = campaignIdMatch[1];
          const campaign = await Campaign.findByPk(campaignId);
          if (campaign) {
            try {
              await campaign.increment('bounces', { by: 1 });
              await campaign.reload();
              console.log(`Incremented bounce count for campaign: ${campaignId}`);
            } catch (incrementError) {
              console.error(`Error incrementing campaign bounces: ${incrementError.message}`);
              const currentCount = campaign.bounces || 0;
              await campaign.update({ bounces: currentCount + 1 });
              console.log(`Fallback: Updated bounce count manually to ${currentCount + 1}`);
            }
          }
        }
      } catch (err) {
        console.error(`Failed to update campaign bounce count: ${err.message}`);
        // Don't fail the whole request if this fails
      }
    }
    
    console.log(`Successfully recorded bounce for contact: ${contact.id} (${email})`);
    
    // Return success
    res.status(200).json({ 
      success: true,
      contactExists: true,
      contactId: contact.id
    });
  } catch (error) {
    console.error(`Error in recordBounce: ${error.message}`);
    next(createError('Failed to record bounce event', 500, error));
  }
}

/**
 * Record a complaint event
 */
async function recordComplaint(req, res, next) {
  try {
    const { email, complaintType, messageId, timestamp } = req.body;
    
    if (!email) {
      return next(createError('Email is required', 400));
    }
    
    console.log(`Processing complaint for email: ${email}, type: ${complaintType || 'unknown'}`);
    
    // Find the contact by email
    const contact = await Contact.findOne({ where: { email: email.toLowerCase() } });
    
    // If contact doesn't exist, log this but return a successful response
    // This prevents the worker from retrying and overwhelming the server
    if (!contact) {
      console.log(`Complaint received for non-existent contact: ${email}`);
      return res.status(200).json({ 
        success: true, 
        warning: 'Contact not found in database, but complaint recorded in logs',
        contactExists: false
      });
    }
    
    // Update the complaint status and also mark as unsubscribed
    await contact.update({
      hasComplained: true,
      complaintType: complaintType || 'unknown',
      lastComplainedAt: timestamp || new Date(),
      unsubscribed: true,
      unsubscribedAt: timestamp || new Date(),
      status: 'unsubscribed',
      lastEngagement: timestamp || new Date()
    });
    
    // If messageId contains campaignId, update the campaign complaints counter
    if (messageId && messageId.includes('-campaign-')) {
      try {
        // Extract campaignId from messageId (format depends on how your system formats messageIds)
        const campaignIdMatch = messageId.match(/campaign-([a-f0-9\-]+)/i);
        if (campaignIdMatch && campaignIdMatch[1]) {
          const campaignId = campaignIdMatch[1];
          const campaign = await Campaign.findByPk(campaignId);
          if (campaign) {
            try {
              await campaign.increment('complaints', { by: 1 });
              await campaign.reload();
              console.log(`Incremented complaint count for campaign: ${campaignId}`);
            } catch (incrementError) {
              console.error(`Error incrementing campaign complaints: ${incrementError.message}`);
              const currentCount = campaign.complaints || 0;
              await campaign.update({ complaints: currentCount + 1 });
              console.log(`Fallback: Updated complaint count manually to ${currentCount + 1}`);
            }
          }
        }
      } catch (err) {
        console.error(`Failed to update campaign complaint count: ${err.message}`);
        // Don't fail the whole request if this fails
      }
    }
    
    console.log(`Successfully recorded complaint for contact: ${contact.id} (${email})`);
    
    // Return success
    res.status(200).json({ 
      success: true,
      contactExists: true,
      contactId: contact.id
    });
  } catch (error) {
    console.error(`Error in recordComplaint: ${error.message}`);
    next(createError('Failed to record complaint event', 500, error));
  }
}

/**
 * Process a batch of tracking events
 * This enables more efficient updates for high-volume events like opens and clicks
 */
async function updateBatchTracking(req, res, next) {
  try {
    const { events } = req.body;
    
    if (!events || !Array.isArray(events) || events.length === 0) {
      return next(createError('Invalid or empty batch', 400));
    }
    
    console.log(`Processing batch of ${events.length} events`);
    
    // Process events in parallel with Promise.all
    const results = await Promise.all(
      events.map(async (event) => {
        try {
          const { campaignId, contactId, trackingData } = event;
          
          if (!campaignId || !contactId || !trackingData) {
            return { 
              success: false, 
              error: 'Missing required parameters',
              event
            };
          }
          
          // Find the campaign
          const campaign = await Campaign.findByPk(campaignId);
          if (!campaign) {
            return { 
              success: false, 
              error: 'Campaign not found',
              event
            };
          }
          
          // Find the contact
          const contact = await Contact.findByPk(contactId);
          if (!contact) {
            return { 
              success: false, 
              error: 'Contact not found',
              event
            };
          }
          
          // Update campaign statistics based on tracking event type
          switch (trackingData.type) {
            case 'click':
              // Update click stats with robust increment
              try {
                await campaign.increment('clicks', { by: 1 });
              } catch (incrementError) {
                console.error(`Error incrementing campaign clicks in batch: ${incrementError.message}`);
                const currentCount = campaign.clicks || 0;
                await campaign.update({ clicks: currentCount + 1 });
              }
              
              await contact.update({
                lastClicked: trackingData.timestamp || new Date(),
                lastClickedLink: trackingData.link || null,
                lastEngagement: trackingData.timestamp || new Date()
              });
              break;
              
            case 'open':
              // Update open stats if available
              try {
                if (campaign.opens !== undefined) {
                  await campaign.increment('opens', { by: 1 });
                }
              } catch (incrementError) {
                console.error(`Error incrementing campaign opens in batch: ${incrementError.message}`);
                // Continue without failing
              }
              
              await contact.update({
                lastOpened: trackingData.timestamp || new Date(),
                lastEngagement: trackingData.timestamp || new Date()
              });
              break;
              
            case 'delivery':
              // Update delivery stats with robust increment
              try {
                await campaign.increment('delivered', { by: 1 });
              } catch (incrementError) {
                console.error(`Error incrementing campaign delivered in batch: ${incrementError.message}`);
                const currentCount = campaign.delivered || 0;
                await campaign.update({ delivered: currentCount + 1 });
              }
              
              await contact.update({ 
                lastDelivered: trackingData.timestamp || new Date(),
                lastEngagement: trackingData.timestamp || new Date()
              });
              break;
              
            case 'send':
              // Update send stats with robust increment
              try {
                await campaign.increment('sent', { by: 1 });
              } catch (incrementError) {
                console.error(`Error incrementing campaign sent in batch: ${incrementError.message}`);
                const currentCount = campaign.sent || 0;
                await campaign.update({ sent: currentCount + 1 });
              }
              
              await contact.update({
                lastEngagement: trackingData.timestamp || new Date()
              });
              break;
              
            default:
              return {
                success: false,
                error: `Unknown tracking type: ${trackingData.type}`,
                event
              };
          }
          
          return { success: true, event };
        } catch (error) {
          console.error('Error processing batch event:', error);
          return {
            success: false,
            error: error.message,
            event
          };
        }
      })
    );
    
    // Count successes and failures
    const successes = results.filter(r => r.success).length;
    const failures = results.filter(r => !r.success);
    
    res.json({
      success: true,
      processed: events.length,
      successful: successes,
      failed: failures.length,
      failures: failures.length > 0 ? failures : undefined
    });
  } catch (error) {
    next(createError('Failed to process batch tracking update', 500, error));
  }
}

/**
 * Update campaign status based on worker reports
 * This endpoint allows the worker to report status changes directly to the server
 */
async function updateCampaignStatus(req, res, next) {
  try {
    console.log('📊 Received campaign status update:');
    console.log(`- Body: ${JSON.stringify(req.body)}`);
    
    const { campaignId, status, stats } = req.body;
    
    if (!campaignId || !status) {
      console.log('❌ Missing required parameters');
      return next(createError('Missing required parameters', 400));
    }
    
    console.log(`- Campaign ID: ${campaignId}`);
    console.log(`- Status: ${status}`);
    
    // Find the campaign
    const campaign = await Campaign.findByPk(campaignId);
    if (!campaign) {
      console.log('❌ Campaign not found');
      return next(createError('Campaign not found', 404));
    }
    
    // Validate status value
    const validStatuses = ['draft', 'scheduled', 'sending', 'processing', 'completed', 'stopped'];
    if (!validStatuses.includes(status)) {
      console.log(`❌ Invalid status value: ${status}`);
      return next(createError(`Invalid status value: ${status}`, 400));
    }
    
    // Update the campaign status
    await campaign.update({ status });
    
    // If stats are provided, update them too
    if (stats) {
      const updateData = {};
      
      // Process provided stats
      if (stats.sent !== undefined) {
        updateData.sent = stats.sent;
      }
      
      if (stats.delivered !== undefined) {
        updateData.delivered = stats.delivered;
      }
      
      if (stats.clicks !== undefined) {
        updateData.clicks = stats.clicks;
      }
      
      if (stats.bounces !== undefined) {
        updateData.bounces = stats.bounces;
      }
      
      if (stats.complaints !== undefined) {
        updateData.complaints = stats.complaints;
      }
      
      if (stats.unsubscribes !== undefined) {
        updateData.unsubscribes = stats.unsubscribes;
      }
      
      if (Object.keys(updateData).length > 0) {
        await campaign.update(updateData);
      }
    }
    
    // If status is completed, update completedAt timestamp
    if (status === 'completed') {
      await campaign.update({ completedAt: new Date() });
    }
    
    console.log('✅ Campaign status updated successfully');
    
    return res.status(200).json({
      success: true,
      message: 'Campaign status updated successfully'
    });
  } catch (error) {
    console.error('❌ Error updating campaign status:', error);
    return next(createError('Internal server error', 500, error));
  }
}

/**
 * Update contact tracking fields for campaign send events
 * This ensures all tracking fields are properly maintained during campaign execution
 */
async function updateContactForCampaignSend(req, res, next) {
  try {
    const { contactId, campaignId, eventType, timestamp, data } = req.body;
    
    if (!contactId || !campaignId || !eventType) {
      return next(createError('Missing required parameters', 400));
    }
    
    console.log(`Updating contact ${contactId} for campaign ${campaignId} event: ${eventType}`);
    
    // Find the contact
    const contact = await Contact.findByPk(contactId);
    if (!contact) {
      console.log(`Contact not found: ${contactId}`);
      return next(createError('Contact not found', 404));
    }
    
    // Find the campaign
    const campaign = await Campaign.findByPk(campaignId);
    if (!campaign) {
      console.log(`Campaign not found: ${campaignId}`);
      return next(createError('Campaign not found', 404));
    }
    
    const updateTimestamp = timestamp || new Date();
    let contactUpdates = {
      lastEngagement: updateTimestamp
    };
    
    // Handle different event types and update appropriate fields
    switch (eventType.toLowerCase()) {
      case 'send':
        // For send events, just update last engagement
        break;
        
      case 'delivery':
        contactUpdates.lastDelivered = updateTimestamp;
        try {
          await campaign.increment('delivered', { by: 1 });
        } catch (incrementError) {
          console.error(`Error incrementing campaign delivered: ${incrementError.message}`);
          const currentCount = campaign.delivered || 0;
          await campaign.update({ delivered: currentCount + 1 });
        }
        break;
        
      case 'open':
        contactUpdates.lastOpened = updateTimestamp;
        try {
          if (campaign.opens !== undefined) {
            await campaign.increment('opens', { by: 1 });
          }
        } catch (incrementError) {
          console.error(`Error incrementing campaign opens: ${incrementError.message}`);
        }
        break;
        
      case 'click':
        contactUpdates.lastClicked = updateTimestamp;
        if (data && data.link) {
          contactUpdates.lastClickedLink = data.link;
        }
        try {
          await campaign.increment('clicks', { by: 1 });
        } catch (incrementError) {
          console.error(`Error incrementing campaign clicks: ${incrementError.message}`);
          const currentCount = campaign.clicks || 0;
          await campaign.update({ clicks: currentCount + 1 });
        }
        break;
        
      case 'bounce':
        contactUpdates.hasBounced = true;
        contactUpdates.lastBouncedAt = updateTimestamp;
        if (data && data.bounceType) {
          contactUpdates.bounceType = data.bounceType;
          // Update status to 'bounced' for permanent bounces
          if (data.bounceType.toLowerCase() === 'permanent') {
            contactUpdates.status = 'bounced';
          }
        }
        try {
          await campaign.increment('bounces', { by: 1 });
        } catch (incrementError) {
          console.error(`Error incrementing campaign bounces: ${incrementError.message}`);
          const currentCount = campaign.bounces || 0;
          await campaign.update({ bounces: currentCount + 1 });
        }
        break;
        
      case 'complaint':
        contactUpdates.hasComplained = true;
        contactUpdates.lastComplainedAt = updateTimestamp;
        contactUpdates.unsubscribed = true;
        contactUpdates.unsubscribedAt = updateTimestamp;
        contactUpdates.status = 'unsubscribed';
        if (data && data.complaintType) {
          contactUpdates.complaintType = data.complaintType;
        }
        try {
          await campaign.increment('complaints', { by: 1 });
        } catch (incrementError) {
          console.error(`Error incrementing campaign complaints: ${incrementError.message}`);
          const currentCount = campaign.complaints || 0;
          await campaign.update({ complaints: currentCount + 1 });
        }
        break;
        
      case 'unsubscribe':
        contactUpdates.unsubscribed = true;
        contactUpdates.unsubscribedAt = updateTimestamp;
        contactUpdates.status = 'unsubscribed';
        try {
          await campaign.increment('unsubscribes', { by: 1 });
        } catch (incrementError) {
          console.error(`Error incrementing campaign unsubscribes: ${incrementError.message}`);
          const currentCount = campaign.unsubscribes || 0;
          await campaign.update({ unsubscribes: currentCount + 1 });
        }
        break;
        
      default:
        return next(createError(`Unknown event type: ${eventType}`, 400));
    }
    
    // Update the contact with all changes
    await contact.update(contactUpdates);
    
    console.log(`Successfully updated contact ${contactId} for ${eventType} event`);
    
    res.status(200).json({
      success: true,
      message: 'Contact tracking fields updated successfully',
      contactId,
      campaignId,
      eventType,
      updatedFields: Object.keys(contactUpdates)
    });
    
  } catch (error) {
    console.error(`Error updating contact for campaign send: ${error.message}`);
    next(createError('Failed to update contact tracking fields', 500, error));
  }
}

module.exports = {
  updateTracking,
  updateBatchTracking,
  updateUnsubscribe,
  recordBounce,
  recordComplaint,
  updateCampaignStatus,
  updateContactForCampaignSend
};
