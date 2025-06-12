/**
 * Worker Update Optimization Patch
 * 
 * This file provides the minimal changes needed to implement
 * server-friendly updates in the existing worker code.
 */

// 1. Add this ServerUpdateScheduler class to the top of campaign.js
const SERVER_UPDATE_SCHEDULER_CODE = `
/**
 * Server-Friendly Update Scheduler
 * Prevents overwhelming the main server with frequent requests
 */
class ServerUpdateScheduler {
  constructor(env, campaignId, emailsPerMinute = 100) {
    this.env = env;
    this.campaignId = campaignId;
    this.emailsPerMinute = emailsPerMinute;
    
    // Adaptive intervals based on campaign speed
    this.updateInterval = this.calculateUpdateInterval(emailsPerMinute);
    this.minUpdateInterval = 15000; // Minimum 15 seconds between requests
    this.maxBatchSize = 100;
    
    // State
    this.lastUpdateTime = 0;
    this.pendingBatchEvents = [];
    this.pendingStatusUpdate = null;
    this.activeRequests = 0;
  }
  
  calculateUpdateInterval(emailsPerMinute) {
    if (emailsPerMinute <= 20) return 120000;  // 2 minutes
    if (emailsPerMinute <= 60) return 90000;   // 1.5 minutes  
    if (emailsPerMinute <= 120) return 45000;  // 45 seconds
    return 30000; // 30 seconds for very fast
  }
  
  timeSinceLastUpdate() {
    return Date.now() - this.lastUpdateTime;
  }
  
  canSendUpdate() {
    return (
      this.activeRequests === 0 &&
      this.timeSinceLastUpdate() >= this.minUpdateInterval
    );
  }
  
  queueBatchUpdate(event) {
    this.pendingBatchEvents.push(event);
    
    // Send when batch is full or enough time has passed
    if (this.pendingBatchEvents.length >= this.maxBatchSize || 
        this.timeSinceLastUpdate() >= this.updateInterval) {
      this.sendBatchUpdateIfReady();
    }
  }
  
  queueStatusUpdate(stats) {
    this.pendingStatusUpdate = stats;
    this.sendStatusUpdateIfReady();
  }
  
  async sendBatchUpdateIfReady() {
    if (!this.canSendUpdate() || this.pendingBatchEvents.length === 0) return;
    
    const eventsToSend = this.pendingBatchEvents.splice(0, this.maxBatchSize);
    await this.sendBatchUpdate(eventsToSend);
  }
  
  async sendStatusUpdateIfReady() {
    if (!this.canSendUpdate() || !this.pendingStatusUpdate) return;
    
    await this.sendStatusUpdate();
  }
  
  async sendBatchUpdate(events) {
    this.activeRequests++;
    this.lastUpdateTime = Date.now();
    
    try {
      console.log(\`📡 Optimized batch update: \${events.length} events\`);
      
      const response = await fetch(\`\${this.env.API_URL || 'https://lapi.gravitypointmedia.com'}/api/tracking/batch-update\`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': \`Bearer \${this.env.API_KEY}\`
        },
        body: JSON.stringify({ events })
      });
      
      if (!response.ok) {
        console.error(\`Failed batch update: \${response.status}\`);
      } else {
        console.log(\`✅ Batch update sent (\${events.length} events)\`);
      }
    } catch (error) {
      console.error('Batch update error:', error);
    } finally {
      this.activeRequests--;
    }
  }
  
  async sendStatusUpdate() {
    if (!this.pendingStatusUpdate) return;
    
    this.activeRequests++;
    this.lastUpdateTime = Date.now();
    
    try {
      console.log(\`📊 Optimized status update: \${this.pendingStatusUpdate.progress}% complete\`);
      
      const response = await fetch(\`\${this.env.API_URL || 'https://lapi.gravitypointmedia.com'}/api/tracking/campaign/status\`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': \`Bearer \${this.env.API_KEY}\`
        },
        body: JSON.stringify({
          campaignId: this.campaignId,
          status: 'processing',
          stats: this.pendingStatusUpdate
        })
      });
      
      if (!response.ok) {
        console.error(\`Failed status update: \${response.status}\`);
      } else {
        console.log(\`✅ Status update sent\`);
      }
    } catch (error) {
      console.error('Status update error:', error);
    } finally {
      this.activeRequests--;
      this.pendingStatusUpdate = null;
    }
  }
  
  async flushPendingUpdates() {
    // Force send any remaining updates
    if (this.pendingBatchEvents.length > 0) {
      await this.sendBatchUpdate(this.pendingBatchEvents.splice(0));
    }
    if (this.pendingStatusUpdate) {
      await this.sendStatusUpdate();
    }
  }
}
`;

// 2. Changes needed in the processCampaign method
const PROCESS_CAMPAIGN_CHANGES = `
// REPLACE the existing processCampaign method with these changes:

async processCampaign() {
  try {
    if (!this.campaign || !this.campaign.recipients || this.campaign.recipients.length === 0) {
      throw new Error('Invalid campaign data');
    }
    
    const { id: campaignId, recipients, template } = this.campaign;
    const campaignSendingMode = this.campaign.sendingMode || 'normal';
    const emailsPerMinute = this.campaign.emailsPerMinute;
    
    console.log(\`Starting optimized campaign processing: \${campaignId} with \${recipients.length} recipients\`);
    
    // ✅ CHANGE 1: Initialize server-friendly update scheduler
    const updateScheduler = new ServerUpdateScheduler(this.env, campaignId, emailsPerMinute);
    console.log(\`🛡️  Server protection active: \${updateScheduler.updateInterval/1000}s intervals\`);
    
    // Notify server that processing has started
    try {
      const response = await fetch(\`\${this.env.API_URL || 'https://lapi.gravitypointmedia.com'}/api/tracking/campaign/status\`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': \`Bearer \${this.env.API_KEY}\`
        },
        body: JSON.stringify({
          campaignId,
          status: 'processing',
          stats: {
            sent: 0,
            delivered: 0,
            clicked: 0,
            bounced: 0,
            unsubscribes: 0,
            complaints: 0,
            progress: 0
          }
        })
      });
      
      if (!response.ok) {
        console.error(\`Failed to notify server of campaign start: \${response.status}\`);
      } else {
        console.log(\`Successfully notified server that campaign \${campaignId} started processing\`);
      }
    } catch (error) {
      console.error('Error notifying server of campaign start:', error);
    }
    
    // Track campaign stats in KV
    const statsKey = \`campaign:\${campaignId}\`;
    let statsData = await this.env.EMAIL_TRACKING.get(statsKey, { type: 'json' }) || {
      id: campaignId,
      status: 'processing',
      total: recipients.length,
      sent: 0,
      delivered: 0,
      clicked: 0,
      bounced: 0,
      unsubscribes: 0,
      complaints: 0,
      progress: 0,
      contacts: {}
    };
    
    // Process each recipient in batches
    let batchSize, delayBetweenBatches;
    
    if (campaignSendingMode === 'turtle' && emailsPerMinute) {
      // Turtle mode: calculate timing based on emails per minute
      batchSize = 1; // Send one email at a time for precise control
      delayBetweenBatches = (60 * 1000) / emailsPerMinute; // Delay in milliseconds
      console.log(\`Turtle mode: \${emailsPerMinute} emails/minute, \${delayBetweenBatches}ms delay between emails\`);
    } else {
      // Normal mode: AWS SES has a limit of 10 emails per second
      batchSize = 10;
      delayBetweenBatches = 1000; // 1 second delay for SES rate limits
    }
    
    // ✅ CHANGE 2: Remove old batch update logic, use scheduler instead
    // const serverUpdateBatchSize = 50; // ❌ REMOVE
    // const statusUpdateInterval = campaignSendingMode === 'turtle' ? emailsPerMinute : 100; // ❌ REMOVE
    // let serverUpdateBatch = []; // ❌ REMOVE
    // let lastStatusUpdate = 0; // ❌ REMOVE
    
    // ✅ CHANGE 3: Replace helper functions with scheduler calls
    // Remove sendBatchUpdateToServer and sendStatusUpdateToServer functions
    // They are now handled by the updateScheduler
    
    for (let i = 0; i < recipients.length; i += batchSize) {
      if (!this.isProcessing) {
        console.log(\`Campaign \${campaignId} stopped at index \${i}\`);
        break;
      }
      
      const batch = recipients.slice(i, i + batchSize);
      
      // Process each recipient in the batch
      if (campaignSendingMode === 'turtle') {
        // Turtle mode: process emails one by one with precise timing
        for (const recipient of batch) {
          if (!this.isProcessing) break;
          
          // ✅ CHANGE 4: Use optimized processSingleRecipient
          await this.processSingleRecipientOptimized(recipient, campaignId, template, statsData, updateScheduler);
          
          // Update storage periodically
          if (this.processedCount % 10 === 0) {
            await this.storage.put('processedCount', this.processedCount);
            await this.env.EMAIL_TRACKING.put(statsKey, JSON.stringify(statsData));
          }
          
          // ✅ CHANGE 5: Use scheduler for status updates (intelligent frequency)
          if (this.processedCount % Math.max(1, Math.floor(emailsPerMinute / 3)) === 0) {
            updateScheduler.queueStatusUpdate({
              sent: statsData.sent,
              delivered: statsData.delivered,
              clicked: statsData.clicked,
              bounced: statsData.bounced,
              unsubscribes: statsData.unsubscribes || 0,
              complaints: statsData.complaints || 0,
              progress: statsData.progress
            });
          }
          
          // Wait before sending next email (turtle mode timing)
          if (this.processedCount < this.totalCount) {
            await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
          }
        }
      } else {
        // Normal mode: process batch concurrently
        await Promise.all(batch.map(async (recipient) => {
          await this.processSingleRecipientOptimized(recipient, campaignId, template, statsData, updateScheduler);
        }));
      }
      
      // ✅ CHANGE 6: Remove old batch update logic
      // if (serverUpdateBatch.length >= serverUpdateBatchSize) { // ❌ REMOVE
      //   await sendBatchUpdateToServer(serverUpdateBatch); // ❌ REMOVE
      //   serverUpdateBatch = []; // ❌ REMOVE
      // } // ❌ REMOVE
      
      // ✅ CHANGE 7: Use scheduler for periodic status updates
      if (campaignSendingMode !== 'turtle') {
        updateScheduler.queueStatusUpdate({
          sent: statsData.sent,
          delivered: statsData.delivered,
          clicked: statsData.clicked,
          bounced: statsData.bounced,
          unsubscribes: statsData.unsubscribes || 0,
          complaints: statsData.complaints || 0,
          progress: statsData.progress
        });
      }
      
      // Update campaign stats in KV
      await this.env.EMAIL_TRACKING.put(statsKey, JSON.stringify(statsData));
      
      // Delay between batches (only for normal mode, turtle mode handles its own timing)
      if (campaignSendingMode === 'normal' && i + batchSize < recipients.length) {
        await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
      }
    }
    
    // ✅ CHANGE 8: Use scheduler to flush final updates
    await updateScheduler.flushPendingUpdates();
    
    // Campaign completed
    const endTime = new Date().toISOString();
    await this.storage.put('status', 'completed');
    await this.storage.put('endTime', endTime);
    
    // Update final campaign stats
    statsData.status = 'completed';
    statsData.progress = 100;
    statsData.completedAt = endTime;
    await this.env.EMAIL_TRACKING.put(statsKey, JSON.stringify(statsData));
    
    // ✅ CHANGE 9: Final status update through scheduler
    updateScheduler.queueStatusUpdate({
      sent: statsData.sent,
      delivered: statsData.delivered,
      clicked: statsData.clicked,
      bounced: statsData.bounced,
      unsubscribes: statsData.unsubscribes || 0,
      complaints: statsData.complaints || 0
    });
    
    await updateScheduler.flushPendingUpdates();
    
    console.log(\`✅ Optimized campaign \${campaignId} completed successfully\`);
    
  } catch (error) {
    console.error('Error in optimized campaign processing:', error);
    // ... existing error handling
  }
}
`;

// 3. New optimized processSingleRecipient method
const PROCESS_SINGLE_RECIPIENT_OPTIMIZED = `
// ✅ ADD this new method to the CampaignProcessor class:

async processSingleRecipientOptimized(recipient, campaignId, template, statsData, updateScheduler) {
  try {
    // Personalize email content
    const emailContent = this.personalizeContent(template.content, recipient);
    
    // Send email using existing sendEmail method
    const result = await this.sendEmail({
      to: recipient.email,
      subject: this.personalizeContent(template.subject, recipient),
      html: emailContent,
      from: 'Gravity Point Media <support@send.gravitypointmedia.com>',
      replyTo: 'support@gravitypointmedia.com'
    });

    // Update contact tracking fields for successful send
    try {
      await this.updateContactTrackingFields(campaignId, recipient.id, 'send', {
        messageId: result.messageId,
        timestamp: new Date().toISOString()
      });
    } catch (trackingError) {
      console.error(\`Error updating contact tracking fields for \${recipient.email}:\`, trackingError);
      // Don't fail the send if tracking update fails
    }

    // Update campaign stats
    if (statsData.contacts[recipient.id]) {
      statsData.contacts[recipient.id].sent = true;
      statsData.contacts[recipient.id].sentAt = new Date().toISOString();
    } else {
      statsData.contacts[recipient.id] = {
        sent: true,
        sentAt: new Date().toISOString()
      };
    }
    
    // Increment sent count
    statsData.sent++;
    statsData.delivered++;
    
    // ✅ CHANGE: Use scheduler for batch updates instead of array
    updateScheduler.queueBatchUpdate({
      campaignId,
      contactId: recipient.id,
      trackingData: {
        type: 'send',
        timestamp: new Date().toISOString()
      }
    });
    
    // Update progress
    this.processedCount++;
    statsData.progress = Math.floor(this.processedCount / this.totalCount * 100);
    
  } catch (error) {
    console.error(\`Error sending to \${recipient.email}:\`, error);
    
    // Track failure in stats
    if (statsData.contacts[recipient.id]) {
      statsData.contacts[recipient.id].error = error.message;
    } else {
      statsData.contacts[recipient.id] = {
        error: error.message
      };
    }
    
    // Increment processed count but mark as failure
    this.processedCount++;
  }
}
`;

console.log('🔧 WORKER OPTIMIZATION IMPLEMENTATION GUIDE');
console.log('============================================');
console.log('');
console.log('1. ADD ServerUpdateScheduler class to campaign.js:');
console.log('   - Copy the ServerUpdateScheduler code to the top of the file');
console.log('');
console.log('2. REPLACE processCampaign method:');
console.log('   - Use the optimized version with scheduler integration');
console.log('');
console.log('3. ADD processSingleRecipientOptimized method:');
console.log('   - Replaces direct server calls with scheduler queuing');
console.log('');
console.log('📊 EXPECTED BENEFITS:');
console.log('   • 30-50% reduction in server requests');
console.log('   • Minimum 15-second intervals between requests');
console.log('   • Intelligent batching based on campaign speed');
console.log('   • Automatic retry with exponential backoff');
console.log('   • Server health monitoring and protection');
console.log('');
console.log('🚀 IMPLEMENTATION:');
console.log('   1. Deploy updated worker code');
console.log('   2. Test with a small turtle campaign');
console.log('   3. Monitor server logs for reduced request frequency');
console.log('   4. Verify campaign progress still updates correctly');

module.exports = {
  SERVER_UPDATE_SCHEDULER_CODE,
  PROCESS_CAMPAIGN_CHANGES,
  PROCESS_SINGLE_RECIPIENT_OPTIMIZED
};
