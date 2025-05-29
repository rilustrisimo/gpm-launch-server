// Cloudflare Worker for handling email campaigns
// This worker interacts with Durable Objects to manage campaign state and uses KV for tracking

export class EmailCampaignDurableObject {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.storage = state.storage;
  }

  async initialize(campaignData) {
    await this.storage.put('campaign', campaignData);
    await this.storage.put('status', 'initialized');
    await this.storage.put('stats', {
      total: campaignData.recipients.length,
      sent: 0,
      delivered: 0,
      opened: 0,
      clicked: 0,
      bounced: 0,
      failed: 0,
      startedAt: new Date().toISOString(),
      completedAt: null
    });
  }

  async processCampaign() {
    const campaign = await this.storage.get('campaign');
    const stats = await this.storage.get('stats');
    
    await this.storage.put('status', 'processing');
    
    // Process in batches to avoid timeouts
    const batchSize = 50;
    const recipients = campaign.recipients;
    const template = campaign.template;
    
    for (let i = 0; i < recipients.length; i += batchSize) {
      const batch = recipients.slice(i, i + batchSize);
      
      // Track progress
      const progress = {
        processedCount: i,
        totalCount: recipients.length,
        percentComplete: Math.round((i / recipients.length) * 100)
      };
      await this.storage.put('progress', progress);
      
      // Process batch
      const results = await Promise.allSettled(
        batch.map(recipient => this.sendEmail(recipient, template, campaign))
      );
      
      // Update stats
      let sent = 0, failed = 0;
      results.forEach(result => {
        if (result.status === 'fulfilled') sent++;
        else failed++;
      });
      
      stats.sent += sent;
      stats.failed += failed;
      await this.storage.put('stats', stats);
      
      // Small delay to prevent rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    // Mark campaign as completed
    stats.completedAt = new Date().toISOString();
    await this.storage.put('stats', stats);
    await this.storage.put('status', 'completed');
    
    return stats;
  }
  
  async sendEmail(recipient, template, campaign) {
    // Integration with email service provider would go here
    // This is a placeholder for the actual email sending logic
    
    try {
      // Create personalized content by replacing template variables
      const personalizedContent = template.content.replace(
        /{{([^{}]+)}}/g, 
        (match, variable) => {
          return recipient[variable.trim()] || '';
        }
      );
      
      // Log the email send attempt to KV for tracking
      const trackingId = crypto.randomUUID();
      await this.env.EMAIL_TRACKING.put(
        `email:${trackingId}`,
        JSON.stringify({
          campaignId: campaign.id,
          recipientId: recipient.id,
          recipientEmail: recipient.email,
          sentAt: new Date().toISOString(),
          status: 'sent'
        }),
        { expirationTtl: 60 * 60 * 24 * 30 } // 30 days expiration
      );
      
      // Add tracking pixel and click tracking to content
      const trackingPixel = `<img src="${this.env.TRACKING_URL}/pixel/${trackingId}" width="1" height="1" />`;
      const enhancedContent = personalizedContent + trackingPixel;
      
      // Here you would connect to your actual email service provider
      // For example, SendGrid, Mailgun, etc.
      // const response = await fetch('https://api.sendgrid.com/v3/mail/send', {...})
      
      // For now, simulate a successful send
      return {
        success: true,
        trackingId,
        recipient: recipient.email
      };
    } catch (error) {
      console.error('Email send error:', error);
      return {
        success: false,
        error: error.message,
        recipient: recipient.email
      };
    }
  }
  
  // Handle requests to this Durable Object
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname.slice(1).split('/');
    
    if (request.method === 'POST' && path[0] === 'initialize') {
      const campaignData = await request.json();
      await this.initialize(campaignData);
      return new Response(JSON.stringify({ status: 'initialized' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    if (request.method === 'POST' && path[0] === 'start') {
      // Start processing the campaign asynchronously
      this.processCampaign().catch(err => console.error('Campaign processing error:', err));
      return new Response(JSON.stringify({ status: 'started' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    if (request.method === 'GET' && path[0] === 'status') {
      const status = await this.storage.get('status');
      const stats = await this.storage.get('stats');
      const progress = await this.storage.get('progress');
      
      return new Response(JSON.stringify({ status, stats, progress }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    return new Response('Not found', { status: 404 });
  }
}

// Main worker that dispatches requests to the appropriate Durable Object
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.slice(1).split('/');
    
    if (path[0] === 'campaign') {
      const campaignId = path[1];
      
      if (!campaignId) {
        return new Response('Campaign ID required', { status: 400 });
      }
      
      // Get a stub for the campaign Durable Object
      const id = env.EMAIL_CAMPAIGN.idFromString(campaignId);
      const stub = env.EMAIL_CAMPAIGN.get(id);
      
      // Forward the request to the Durable Object
      const subpath = path.slice(2).join('/');
      const newUrl = new URL(request.url);
      newUrl.pathname = '/' + subpath;
      
      const newRequest = new Request(newUrl, request);
      return stub.fetch(newRequest);
    }
    
    if (path[0] === 'pixel' && path[1]) {
      const trackingId = path[1];
      
      // Record the open event in KV
      const emailData = await env.EMAIL_TRACKING.get(`email:${trackingId}`, { type: 'json' });
      
      if (emailData) {
        emailData.openedAt = new Date().toISOString();
        emailData.status = 'opened';
        
        await env.EMAIL_TRACKING.put(
          `email:${trackingId}`,
          JSON.stringify(emailData),
          { expirationTtl: 60 * 60 * 24 * 30 } // 30 days expiration
        );
      }
      
      // Return a transparent 1x1 pixel
      return new Response(
        new Uint8Array([
          0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00,
          0x00, 0xFF, 0xFF, 0xFF, 0x00, 0x00, 0x00, 0x21, 0xF9, 0x04, 0x01, 0x00,
          0x00, 0x00, 0x00, 0x2C, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00,
          0x00, 0x02, 0x02, 0x44, 0x01, 0x00, 0x3B
        ]),
        { 
          headers: { 
            'Content-Type': 'image/gif',
            'Cache-Control': 'no-store' 
          } 
        }
      );
    }
    
    return new Response('Not found', { status: 404 });
  }
}; 