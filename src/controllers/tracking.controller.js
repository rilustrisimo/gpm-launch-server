/**
 * Tracking Controller
 * 
 * Handles tracking data updates from the Cloudflare Worker
 */

const { Campaign, Contact, ContactList, ContactListContacts } = require('../models');
const { createError } = require('../utils/error');

/**
 * Helper function to recalculate campaign stats from contacts
 * @param {Object} campaign - Campaign instance
 */
async function recalculateCampaignStatsFromContacts(campaign) {
  try {
    // Load campaign with contact list if not already loaded
    if (!campaign.contactList) {
      await campaign.reload({
        include: [{
          model: ContactList,
          as: 'contactList'
        }]
      });
    }
    
    if (!campaign.contactList) {
      console.warn(`Campaign ${campaign.id} has no contact list associated`);
      return;
    }
    
    // Get all contacts in the campaign's contact list
    const contacts = await Contact.findAll({
      include: [{
        model: ContactList,
        as: 'lists',
        where: { id: campaign.contactList.id },
        attributes: [],
        through: { attributes: [] }
      }],
      attributes: [
        'id', 
        'email', 
        'hasBounced', 
        'hasComplained', 
        'unsubscribed', 
        'lastOpened', 
        'lastClicked', 
        'lastDelivered'
      ]
    });

    // Calculate stats
    const stats = {
      bounces: contacts.filter(c => c.hasBounced).length,
      complaints: contacts.filter(c => c.hasComplained).length,
      unsubscribes: contacts.filter(c => c.unsubscribed).length,
      delivered: contacts.filter(c => c.lastDelivered).length,
      opens: contacts.filter(c => c.lastOpened).length,
      clicks: contacts.filter(c => c.lastClicked).length
    };

    // Calculate rates based on delivered emails
    const deliveredCount = stats.delivered;
    if (deliveredCount > 0) {
      // Open rate: percentage of delivered emails that were opened
      stats.openRate = parseFloat(((stats.opens / deliveredCount) * 100).toFixed(2));
      
      // Click rate: percentage of delivered emails that were clicked
      stats.clickRate = parseFloat(((stats.clicks / deliveredCount) * 100).toFixed(2));
    } else {
      // If no emails delivered, rates are 0
      stats.openRate = 0;
      stats.clickRate = 0;
    }

    // Update campaign with calculated stats
    await campaign.update(stats);
    console.log(`Recalculated stats for campaign ${campaign.id}:`, stats);
  } catch (error) {
    console.error(`Error recalculating campaign stats: ${error.message}`);
  }
}

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
        // Update contact's last click timestamp, clicked link, and last engagement
        await contact.update({
          lastClicked: trackingData.timestamp || new Date(),
          lastClickedLink: trackingData.link || null,
          lastEngagement: trackingData.timestamp || new Date()
        });
        
        // Recalculate and update campaign stats from contacts
        await recalculateCampaignStatsFromContacts(campaign);
        break;
        
      case 'open':
        // Update contact's last open timestamp and last engagement
        await contact.update({
          lastOpened: trackingData.timestamp || new Date(),
          lastEngagement: trackingData.timestamp || new Date()
        });
        
        // Recalculate and update campaign stats from contacts
        await recalculateCampaignStatsFromContacts(campaign);
        break;
        
      case 'delivery':
        // Update contact's last delivered timestamp and last engagement
        await contact.update({
          lastDelivered: trackingData.timestamp || new Date(),
          lastEngagement: trackingData.timestamp || new Date()
        });
        
        // Recalculate and update campaign stats from contacts
        await recalculateCampaignStatsFromContacts(campaign);
        break;
        
      case 'send':
        // Update contact's last engagement for send events
        await contact.update({
          lastEngagement: trackingData.timestamp || new Date()
        });
        
        // For send events, we might want to track this differently
        // since it's not necessarily stored as a contact field
        // but we can still recalculate other stats
        await recalculateCampaignStatsFromContacts(campaign);
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
      console.log(`Unsubscribe received for non-existent contact: ${email}`);
      return res.status(200).json({ 
        success: true, 
        warning: 'Contact not found in database, but unsubscribe recorded in logs',
        contactExists: false
      });
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
    
    // If campaign ID is provided, recalculate and update campaign stats from contacts
    if (campaignId) {
      console.log(`Updating campaign stats from contacts for campaign: ${campaignId}`);
      
      const campaign = await Campaign.findByPk(campaignId, {
        include: [{
          model: ContactList,
          as: 'contactList'
        }]
      });
      
      if (campaign && campaign.contactList) {
        try {
          // Use the centralized recalculation function
          await recalculateCampaignStatsFromContacts(campaign);
        } catch (statsError) {
          console.error(`Error calculating stats from contacts: ${statsError.message}`);
        }
      } else {
        console.log(`Campaign not found or missing contact list: ${campaignId}`);
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
    
    // If messageId contains campaignId, recalculate and update campaign stats from contacts
    if (messageId && messageId.includes('-campaign-')) {
      try {
        // Extract campaignId from messageId (format depends on how your system formats messageIds)
        const campaignIdMatch = messageId.match(/campaign-([a-f0-9\-]+)/i);
        if (campaignIdMatch && campaignIdMatch[1]) {
          const campaignId = campaignIdMatch[1];
          const campaign = await Campaign.findByPk(campaignId, {
            include: [{
              model: ContactList,
              as: 'contactList'
            }]
          });
          
          if (campaign && campaign.contactList) {
            // Use the centralized recalculation function
            await recalculateCampaignStatsFromContacts(campaign);
          }
        }
      } catch (err) {
        console.error(`Failed to update campaign stats from contacts: ${err.message}`);
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
    
    // If messageId contains campaignId, recalculate and update campaign stats from contacts
    if (messageId && messageId.includes('-campaign-')) {
      try {
        // Extract campaignId from messageId (format depends on how your system formats messageIds)
        const campaignIdMatch = messageId.match(/campaign-([a-f0-9\-]+)/i);
        if (campaignIdMatch && campaignIdMatch[1]) {
          const campaignId = campaignIdMatch[1];
          const campaign = await Campaign.findByPk(campaignId, {
            include: [{
              model: ContactList,
              as: 'contactList'
            }]
          });
          
          if (campaign && campaign.contactList) {
            // Calculate stats from contacts in the campaign's contact list
            const contacts = await Contact.findAll({
              include: [{
                model: ContactList,
                as: 'lists',
                where: { id: campaign.contactList.id },
                attributes: [],
                through: { attributes: [] }
              }],
              attributes: [
                'id', 
                'email', 
                'hasBounced', 
                'hasComplained', 
                'unsubscribed', 
                'lastOpened', 
                'lastClicked', 
                'lastDelivered'
              ]
            });

            // Use the centralized recalculation function
            await recalculateCampaignStatsFromContacts(campaign);
          }
        }
      } catch (err) {
        console.error(`Failed to update campaign stats from contacts: ${err.message}`);
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

/**
 * Track email open (triggered by tracking pixel)
 */
async function trackEmailOpen(req, res) {
  try {
    const { campaignId, contactId } = req.params;
    
    console.log(`📧 Email open tracked - Campaign: ${campaignId}, Contact: ${contactId}`);
    
    // Update contact tracking fields
    const contact = await Contact.findByPk(contactId);
    if (contact) {
      await contact.update({
        lastOpened: new Date(),
        lastEngagement: new Date()
      });
      console.log(`Updated contact ${contactId} open tracking`);
    }
    
    // Update CampaignStat record for backward compatibility
    const { CampaignStat } = require('../models');
    await CampaignStat.update(
      { 
        opened: true, 
        openedAt: new Date() 
      },
      { 
        where: { 
          campaignId, 
          contactId 
        } 
      }
    );
    
    // Recalculate campaign stats from contacts
    const campaign = await Campaign.findByPk(campaignId);
    if (campaign) {
      await recalculateCampaignStatsFromContacts(campaign);
    }
    
    // Return 1x1 transparent pixel
    const pixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
    res.set({
      'Content-Type': 'image/gif',
      'Content-Length': pixel.length,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    res.send(pixel);
  } catch (error) {
    console.error('Error tracking email open:', error);
    // Still return pixel even if tracking fails
    const pixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
    res.set('Content-Type', 'image/gif');
    res.send(pixel);
  }
}

/**
 * Track email click (redirect to original URL)
 */
async function trackEmailClick(req, res) {
  try {
    const { campaignId, contactId } = req.params;
    const { url } = req.query;
    
    console.log(`🔗 Email click tracked - Campaign: ${campaignId}, Contact: ${contactId}, URL: ${url}`);
    
    // Update contact tracking fields
    const contact = await Contact.findByPk(contactId);
    if (contact) {
      await contact.update({
        lastClicked: new Date(),
        lastClickedLink: url || null,
        lastEngagement: new Date()
      });
      console.log(`Updated contact ${contactId} click tracking`);
    }
    
    // Update CampaignStat record for backward compatibility
    const { CampaignStat } = require('../models');
    await CampaignStat.update(
      { 
        clicked: true, 
        clickedAt: new Date() 
      },
      { 
        where: { 
          campaignId, 
          contactId 
        } 
      }
    );
    
    // Recalculate campaign stats from contacts
    const campaign = await Campaign.findByPk(campaignId);
    if (campaign) {
      await recalculateCampaignStatsFromContacts(campaign);
    }
    
    // Redirect to original URL
    if (url) {
      res.redirect(url);
    } else {
      res.status(400).json({ 
        success: false, 
        message: 'No URL provided for redirect' 
      });
    }
  } catch (error) {
    console.error('Error tracking email click:', error);
    // Redirect to URL even if tracking fails
    if (req.query.url) {
      res.redirect(req.query.url);
    } else {
      res.status(500).json({ 
        success: false, 
        message: 'Error tracking click' 
      });
    }
  }
}

/**
 * Validate an unsubscribe token
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function validateUnsubscribeToken(req, res) {
  try {
    const { token, email } = req.body;
    
    if (!token || !email) {
      return res.status(400).json({
        success: false,
        message: 'Token and email are required'
      });
    }
    
    // The unsubscribe token is generated using:
    // crypto.createHash('sha256').update(`${email}:${campaignId}:${process.env.UNSUBSCRIBE_SECRET}`).digest('hex');
    // 
    // To validate, we need to find campaigns that this email was part of
    // and check if any of them would generate this token
    
    const crypto = require('crypto');
    const UNSUBSCRIBE_SECRET = process.env.UNSUBSCRIBE_SECRET || 'default-secret';
    
    // Find all campaigns this contact was part of
    const contact = await Contact.findOne({
      where: { email: email.toLowerCase() },
      include: [{
        model: ContactList,
        as: 'lists',
        include: [{
          model: Campaign,
          as: 'campaigns'
        }]
      }]
    });
    
    if (!contact) {
      return res.status(404).json({
        success: false,
        message: 'Contact not found'
      });
    }
    
    // Check each campaign this contact was part of
    for (const list of contact.lists) {
      for (const campaign of list.campaigns) {
        const expectedToken = crypto
          .createHash('sha256')
          .update(`${email}:${campaign.id}:${UNSUBSCRIBE_SECRET}`)
          .digest('hex');
        
        if (expectedToken === token) {
          return res.json({
            success: true,
            valid: true,
            campaignId: campaign.id
          });
        }
      }
    }
    
    // If no matching token found, it's invalid
    return res.json({
      success: true,
      valid: false
    });
    
  } catch (error) {
    console.error('Error validating unsubscribe token:', error);
    res.status(500).json({
      success: false,
      message: 'Error validating token'
    });
  }
}

module.exports = {
  updateTracking,
  updateBatchTracking,
  updateUnsubscribe,
  recordBounce,
  recordComplaint,
  updateCampaignStatus,
  updateContactForCampaignSend,
  trackEmailOpen,
  trackEmailClick,
  validateUnsubscribeToken
};
