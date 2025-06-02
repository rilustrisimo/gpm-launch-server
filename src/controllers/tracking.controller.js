/**
 * Tracking Controller
 * 
 * Handles tracking data updates from the Cloudflare Worker
 */

const { Campaign, Contact } = require('../models');
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
      case 'open':
        // Update open stats
        await campaign.increment('opens');
        
        // Update contact's last opened timestamp
        await contact.update({
          lastOpened: trackingData.timestamp || new Date()
        });
        break;
        
      case 'click':
        // Update click stats
        await campaign.increment('clicks');
        
        // Update contact's last click timestamp and clicked link
        await contact.update({
          lastClicked: trackingData.timestamp || new Date(),
          lastClickedLink: trackingData.link || null
        });
        break;
        
      case 'delivery':
        // Update delivery stats
        await campaign.increment('delivered');
        break;
        
      case 'send':
        // Update send stats
        await campaign.increment('sent');
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
    
    // Find the contact by email
    const contact = await Contact.findOne({ where: { email: email.toLowerCase() } });
    if (!contact) {
      return next(createError('Contact not found', 404));
    }
    
    // Update the unsubscribe status
    await contact.update({
      unsubscribed: true,
      unsubscribedAt: timestamp || new Date()
    });
    
    // If campaign ID is provided, record the unsubscribe source
    if (campaignId) {
      const campaign = await Campaign.findByPk(campaignId);
      if (campaign) {
        await campaign.increment('unsubscribes');
      }
    }
    
    // Return success
    res.status(200).json({ success: true });
  } catch (error) {
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
    
    console.log(`Processing bounce for email: ${email}, type: ${bounceType || 'unknown'}`);
    
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
    
    // Update the bounce status
    await contact.update({
      hasBounced: true,
      bounceType: bounceType || 'unknown',
      lastBouncedAt: timestamp || new Date()
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
            await campaign.increment('bounces');
            console.log(`Incremented bounce count for campaign: ${campaignId}`);
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
      unsubscribedAt: timestamp || new Date()
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
            await campaign.increment('complaints');
            console.log(`Incremented complaint count for campaign: ${campaignId}`);
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
            case 'open':
              await campaign.increment('opens');
              await contact.update({ lastOpened: trackingData.timestamp || new Date() });
              break;
              
            case 'click':
              await campaign.increment('clicks');
              await contact.update({
                lastClicked: trackingData.timestamp || new Date(),
                lastClickedLink: trackingData.link || null
              });
              break;
              
            case 'delivery':
              await campaign.increment('delivered');
              await contact.update({ lastDelivered: trackingData.timestamp || new Date() });
              break;
              
            case 'send':
              await campaign.increment('sent');
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
      
      if (stats.opens !== undefined) {
        updateData.opens = stats.opens;
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

module.exports = {
  updateTracking,
  updateBatchTracking,
  updateUnsubscribe,
  recordBounce,
  recordComplaint,
  updateCampaignStatus
};
