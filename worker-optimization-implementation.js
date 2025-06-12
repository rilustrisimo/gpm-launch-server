/**
 * Optimized Campaign Processor with Server-Friendly Updates
 * 
 * This file contains the improved version of the campaign processor
 * that implements intelligent server update throttling to prevent
 * overwhelming the main server with frequent requests.
 */

// Server-Friendly Update Scheduler Class
class ServerUpdateScheduler {
  constructor(env, campaignId) {
    this.env = env;
    this.campaignId = campaignId;
    
    // Server protection settings
    this.minUpdateInterval = 15000; // Minimum 15 seconds between requests
    this.maxConcurrentRequests = 2; // Maximum concurrent requests to server
    this.maxBatchSize = 100; // Maximum events per batch
    
    // Adaptive intervals based on campaign speed
    this.adaptiveIntervals = {
      slow: 120000,    // 2 minutes for ≤20 emails/min
      medium: 90000,   // 1.5 minutes for 21-60 emails/min
      fast: 45000,     // 45 seconds for 61-120 emails/min
      veryFast: 30000  // 30 seconds for >120 emails/min
    };
    
    // State tracking
    this.lastUpdateTime = 0;
    this.pendingBatchEvents = [];
    this.pendingStatusUpdate = null;
    this.activeRequests = 0;
    this.serverHealth = 'healthy'; // healthy, degraded, unhealthy
    this.consecutiveFailures = 0;
    
    // Update queue with priority
    this.updateQueue = [];
  }
  
  /**
   * Get adaptive update interval based on campaign speed
   */
  getUpdateInterval(emailsPerMinute) {
    if (emailsPerMinute <= 20) return this.adaptiveIntervals.slow;
    if (emailsPerMinute <= 60) return this.adaptiveIntervals.medium;
    if (emailsPerMinute <= 120) return this.adaptiveIntervals.fast;
    return this.adaptiveIntervals.veryFast;
  }
  
  /**
   * Queue a batch update with intelligent batching
   */
  queueBatchUpdate(events) {
    if (!Array.isArray(events)) events = [events];
    
    // Add to pending batch
    this.pendingBatchEvents.push(...events);
    
    // Check if we should send immediately or wait
    const shouldSendNow = 
      this.pendingBatchEvents.length >= this.maxBatchSize ||
      this.timeSinceLastUpdate() >= this.minUpdateInterval;
    
    if (shouldSendNow) {
      this.queueUpdate('batch', 'medium');
    }
  }
  
  /**
   * Queue a status update
   */
  queueStatusUpdate(stats) {
    this.pendingStatusUpdate = stats;
    this.queueUpdate('status', 'high');
  }
  
  /**
   * Add update to priority queue
   */
  queueUpdate(type, priority = 'medium') {
    const update = {
      type,
      priority,
      timestamp: Date.now(),
      retries: 0
    };
    
    // Insert based on priority
    if (priority === 'high') {
      this.updateQueue.unshift(update);
    } else {
      this.updateQueue.push(update);
    }
    
    // Process queue if conditions are met
    this.processQueue();
  }
  
  /**
   * Time since last server update
   */
  timeSinceLastUpdate() {
    return Date.now() - this.lastUpdateTime;
  }
  
  /**
   * Check if we can send an update now
   */
  canSendUpdate() {
    return (
      this.activeRequests < this.maxConcurrentRequests &&
      this.timeSinceLastUpdate() >= this.minUpdateInterval &&
      this.serverHealth !== 'unhealthy'
    );
  }
  
  /**
   * Process the update queue
   */
  async processQueue() {
    while (this.updateQueue.length > 0 && this.canSendUpdate()) {
      const update = this.updateQueue.shift();
      await this.executeUpdate(update);
    }
  }
  
  /**
   * Execute a specific update
   */
  async executeUpdate(update) {
    this.activeRequests++;
    this.lastUpdateTime = Date.now();
    
    try {
      if (update.type === 'batch' && this.pendingBatchEvents.length > 0) {
        await this.sendBatchUpdate();
      } else if (update.type === 'status' && this.pendingStatusUpdate) {
        await this.sendStatusUpdate();
      }
      
      // Reset failure counter on success
      this.consecutiveFailures = 0;
      this.updateServerHealth('healthy');
      
    } catch (error) {
      console.error(`Failed to send ${update.type} update:`, error);
      
      // Handle failure with exponential backoff
      this.consecutiveFailures++;
      update.retries++;
      
      if (update.retries < 3) {
        // Retry with exponential backoff
        const delay = Math.min(1000 * Math.pow(2, update.retries), 30000);
        setTimeout(() => {
          this.updateQueue.unshift(update);
          this.processQueue();
        }, delay);
      }
      
      // Update server health based on failures
      if (this.consecutiveFailures >= 3) {
        this.updateServerHealth('degraded');
      }
      if (this.consecutiveFailures >= 5) {
        this.updateServerHealth('unhealthy');
      }
    } finally {
      this.activeRequests--;
    }
  }
  
  /**
   * Send accumulated batch events
   */
  async sendBatchUpdate() {
    if (this.pendingBatchEvents.length === 0) return;
    
    const eventsToSend = this.pendingBatchEvents.splice(0, this.maxBatchSize);
    console.log(`📡 Sending optimized batch update: ${eventsToSend.length} events`);
    
    const response = await fetch(`${this.env.API_URL || 'https://lapi.gravitypointmedia.com'}/api/tracking/batch-update`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.env.API_KEY}`
      },
      body: JSON.stringify({ events: eventsToSend })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    console.log(`✅ Batch update sent successfully (${eventsToSend.length} events)`);
  }
  
  /**
   * Send pending status update
   */
  async sendStatusUpdate() {
    if (!this.pendingStatusUpdate) return;
    
    console.log(`📊 Sending optimized status update: ${this.pendingStatusUpdate.progress}% complete`);
    
    const response = await fetch(`${this.env.API_URL || 'https://lapi.gravitypointmedia.com'}/api/tracking/campaign/status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.env.API_KEY}`
      },
      body: JSON.stringify({
        campaignId: this.campaignId,
        status: 'processing',
        stats: this.pendingStatusUpdate
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    console.log(`✅ Status update sent successfully`);
    this.pendingStatusUpdate = null;
  }
  
  /**
   * Update server health status
   */
  updateServerHealth(status) {
    if (this.serverHealth !== status) {
      console.log(`🏥 Server health changed: ${this.serverHealth} → ${status}`);
      this.serverHealth = status;
      
      // Adjust behavior based on health
      if (status === 'degraded') {
        this.minUpdateInterval = Math.max(this.minUpdateInterval * 1.5, 30000);
      } else if (status === 'unhealthy') {
        this.minUpdateInterval = Math.max(this.minUpdateInterval * 2, 60000);
      } else if (status === 'healthy') {
        this.minUpdateInterval = 15000; // Reset to default
      }
    }
  }
  
  /**
   * Force send any pending updates (for campaign completion)
   */
  async flushPendingUpdates() {
    console.log('🔄 Flushing pending updates...');
    
    // Send any remaining batch events
    if (this.pendingBatchEvents.length > 0) {
      await this.sendBatchUpdate();
    }
    
    // Send final status update
    if (this.pendingStatusUpdate) {
      await this.sendStatusUpdate();
    }
    
    // Process any remaining queue items
    while (this.updateQueue.length > 0) {
      const update = this.updateQueue.shift();
      await this.executeUpdate(update);
    }
  }
  
  /**
   * Get scheduler statistics
   */
  getStats() {
    return {
      serverHealth: this.serverHealth,
      pendingBatchEvents: this.pendingBatchEvents.length,
      pendingStatusUpdate: !!this.pendingStatusUpdate,
      queueLength: this.updateQueue.length,
      activeRequests: this.activeRequests,
      timeSinceLastUpdate: this.timeSinceLastUpdate(),
      consecutiveFailures: this.consecutiveFailures
    };
  }
}

/**
 * Enhanced Campaign Processing Logic with Server-Friendly Updates
 * 
 * This function should replace the existing processCampaign method
 * in the CampaignProcessor Durable Object.
 */
async function processOptimizedCampaign() {
  try {
    if (!this.campaign || !this.campaign.recipients || this.campaign.recipients.length === 0) {
      throw new Error('Invalid campaign data');
    }
    
    const { id: campaignId, recipients, template } = this.campaign;
    const campaignSendingMode = this.campaign.sendingMode || 'normal';
    const emailsPerMinute = this.campaign.emailsPerMinute;
    
    console.log(`🚀 Starting optimized campaign processing: ${campaignId}`);
    console.log(`📊 Mode: ${campaignSendingMode}, Rate: ${emailsPerMinute || 'default'} emails/min`);
    
    // Initialize server-friendly update scheduler
    const updateScheduler = new ServerUpdateScheduler(this.env, campaignId);
    const updateInterval = updateScheduler.getUpdateInterval(emailsPerMinute || 100);
    
    console.log(`🛡️  Server protection active: ${updateInterval/1000}s update interval`);
    
    // Configure processing parameters
    let batchSize, delayBetweenBatches;
    
    if (campaignSendingMode === 'turtle' && emailsPerMinute) {
      batchSize = 1;
      delayBetweenBatches = (60 * 1000) / emailsPerMinute;
      console.log(`🐢 Turtle mode: ${emailsPerMinute} emails/minute, ${delayBetweenBatches}ms delay`);
    } else {
      batchSize = 10;
      delayBetweenBatches = 1000;
      console.log(`⚡ Normal mode: batch size ${batchSize}, ${delayBetweenBatches}ms delay`);
    }
    
    // Initialize campaign stats
    let statsData = {
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
    
    // Send initial status update
    updateScheduler.queueStatusUpdate({...statsData});
    
    // Process recipients
    for (let i = 0; i < recipients.length; i += batchSize) {
      if (!this.isProcessing) {
        console.log(`🛑 Campaign ${campaignId} stopped at index ${i}`);
        break;
      }
      
      const batch = recipients.slice(i, i + batchSize);
      
      if (campaignSendingMode === 'turtle') {
        // Turtle mode: sequential processing
        for (const recipient of batch) {
          if (!this.isProcessing) break;
          
          // Process single recipient
          await this.processSingleRecipient(recipient, campaignId, template, statsData, updateScheduler);
          
          // Update progress
          this.processedCount++;
          statsData.progress = Math.floor(this.processedCount / this.totalCount * 100);
          
          // Queue status update at appropriate intervals
          if (this.processedCount % Math.max(1, Math.floor(emailsPerMinute / 4)) === 0) {
            updateScheduler.queueStatusUpdate({...statsData});
          }
          
          // Wait before next email (turtle timing)
          if (this.processedCount < this.totalCount) {
            await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
          }
        }
      } else {
        // Normal mode: concurrent processing
        await Promise.all(batch.map(async (recipient) => {
          await this.processSingleRecipient(recipient, campaignId, template, statsData, updateScheduler);
        }));
        
        // Update progress for batch
        this.processedCount += batch.length;
        statsData.progress = Math.floor(this.processedCount / this.totalCount * 100);
        
        // Queue status update
        updateScheduler.queueStatusUpdate({...statsData});
        
        // Delay between batches
        if (i + batchSize < recipients.length) {
          await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
        }
      }
      
      // Periodic scheduler status logging
      if (i % 50 === 0) {
        const schedulerStats = updateScheduler.getStats();
        console.log(`📈 Scheduler: ${schedulerStats.queueLength} queued, ${schedulerStats.serverHealth} health`);
      }
    }
    
    // Campaign completed - flush all pending updates
    statsData.status = 'completed';
    statsData.progress = 100;
    statsData.completedAt = new Date().toISOString();
    
    updateScheduler.queueStatusUpdate({...statsData});
    await updateScheduler.flushPendingUpdates();
    
    console.log(`✅ Optimized campaign ${campaignId} completed successfully`);
    console.log(`📊 Final scheduler stats:`, updateScheduler.getStats());
    
  } catch (error) {
    console.error('❌ Optimized campaign processing error:', error);
    throw error;
  }
}

/**
 * Enhanced processSingleRecipient that works with the update scheduler
 */
async function processSingleRecipientOptimized(recipient, campaignId, template, statsData, updateScheduler) {
  try {
    // Send email (existing logic)
    const result = await this.sendEmail({
      to: recipient.email,
      subject: this.personalizeContent(template.subject, recipient),
      html: this.personalizeContent(template.content, recipient),
      from: 'Gravity Point Media <support@send.gravitypointmedia.com>',
      replyTo: 'support@gravitypointmedia.com'
    });
    
    // Update stats
    statsData.sent++;
    statsData.delivered++;
    
    if (statsData.contacts[recipient.id]) {
      statsData.contacts[recipient.id].sent = true;
      statsData.contacts[recipient.id].sentAt = new Date().toISOString();
    } else {
      statsData.contacts[recipient.id] = {
        sent: true,
        sentAt: new Date().toISOString()
      };
    }
    
    // Queue batch update with reduced frequency
    updateScheduler.queueBatchUpdate({
      campaignId,
      contactId: recipient.id,
      trackingData: {
        type: 'send',
        timestamp: new Date().toISOString(),
        messageId: result.messageId
      }
    });
    
    console.log(`📧 Email sent to ${recipient.email} (${statsData.sent}/${statsData.total})`);
    
  } catch (error) {
    console.error(`❌ Error sending to ${recipient.email}:`, error);
    
    // Track failure
    if (statsData.contacts[recipient.id]) {
      statsData.contacts[recipient.id].error = error.message;
    } else {
      statsData.contacts[recipient.id] = {
        error: error.message
      };
    }
  }
}

module.exports = {
  ServerUpdateScheduler,
  processOptimizedCampaign,
  processSingleRecipientOptimized
};
