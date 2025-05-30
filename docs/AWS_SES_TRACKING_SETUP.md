# AWS SES Email Tracking Setup Guide

This guide explains how to set up AWS SES for email tracking with CloudWatch Events and SNS notifications to capture and process email tracking events in the Gravity Point Media Email Campaign system.

## Overview of the Architecture

1. **AWS SES**: Sends emails with built-in open/click tracking capability
2. **AWS CloudWatch Events**: Captures SES tracking events
3. **AWS SNS**: Forwards events to our worker endpoint
4. **Cloudflare Worker**: Processes tracking events and updates both KV storage and main database
5. **Main Server API**: Receives tracking data updates from the worker

## Step 1: Configure AWS SES Configuration Set

1. Log in to the AWS Management Console
2. Navigate to Amazon SES
3. Go to Configuration Sets and create a new one called `gpm-tracking`
4. Enable open and click tracking under "Event destinations"

## Step 2: Create CloudWatch Event Rule and SNS Topic

1. Create a new SNS topic: `ses-tracking-notifications`
2. Add a subscription to this SNS topic with the following details:
   - Protocol: HTTPS
   - Endpoint: `https://worker.gravitypointmedia.com/webhook/ses`

3. In SES Configuration Set, add a new event destination:
   - Name: `tracking-events`
   - Event types: Send, Delivery, Open, Click, Bounce, Complaint
   - Destination: SNS Topic
   - Select the `ses-tracking-notifications` topic

## Step 3: Configure Worker for SNS Notifications

Our Cloudflare Worker is now set up to handle SNS notifications from AWS SES. The worker:

1. Verifies the signature of incoming SNS notifications
2. Processes different types of events:
   - Send events: Records successful sending
   - Delivery events: Updates delivery status
   - Open events: Records open actions
   - Click events: Records click actions and clicked links
   - Bounce events: Updates suppression list for hard bounces
   - Complaint events: Marks contacts as unsubscribed and suppressed

## Step 4: Set Up Custom Domains

1. In AWS SES, configure a custom domain for open and click tracking:
   - Domain: `trk.gravitypointmedia.com`
   - The domain is pointed to AWS SES tracking: `r.us-east-1.awstrack.me`

2. In Cloudflare, configure a custom domain for the worker:
   - Domain: `worker.gravitypointmedia.com`
   - This domain handles API requests and unsubscribe functionality

## Step 5: Update Required Environment Variables

### Server Environment Variables

```bash
# AWS SES Configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_SES_CONFIGURATION_SET=gpm-tracking

# Worker Integration
WORKER_URL=https://worker.gravitypointmedia.com
WORKER_API_KEY=your-worker-api-key
UNSUBSCRIBE_SECRET=your-unsubscribe-secret
```

### Worker Environment Variables

```bash
# Wrangler secrets
WORKER_API_KEY=your-worker-api-key
AWS_ACCESS_KEY_ID=your-aws-access-key
AWS_SECRET_ACCESS_KEY=your-aws-secret-key

# Wrangler vars
API_URL=https://lapi.gravitypointmedia.com
API_KEY=your-api-key-for-main-server
```

## Step 6: Testing

To ensure the tracking system is working correctly:

1. Send a test email using the SES configuration set
2. Confirm the worker receives tracking events (check worker logs)
3. Verify that tracking data is updated in the main database
4. Test unsubscribe functionality with a test email

## Tracking System Architecture

### Efficient Event Processing

The tracking system uses an efficient batch processing approach:

1. **Regular Events:** Opens and clicks are processed in batches to reduce API load
   - Events are collected until reaching 50 events or 15 seconds elapse
   - Batch updates are sent to the main database in a single request
   - This significantly reduces database load during high-volume campaigns

2. **Critical Events:** Bounces, complaints, and unsubscribes are processed immediately
   - These events affect deliverability and compliance
   - Immediate processing ensures timely updates to suppression lists

3. **Retry Mechanism:** Failed tracking updates are automatically retried
   - Failed events are stored in Cloudflare KV storage
   - Exponential backoff retries occur every minute
   - After 3 failed attempts, events are moved to a "dead letter" storage for manual review

### Storage Layers

- **Primary Storage:** Main MySQL database on the server
- **Fast Cache:** Cloudflare KV storage for immediate access to tracking data
- **Retry Queue:** Failed events are stored in KV with retry metadata

## Maintenance and Monitoring

- Monitor AWS SES sending quotas and reputation metrics
- Check Cloudflare Worker analytics for errors or performance issues
- Set up alerts for high bounce or complaint rates
- Review email tracking statistics regularly
- Monitor KV storage for accumulated failed events
- Check the dead letter storage periodically for events that couldn't be processed

## Useful AWS CLI Commands

```bash
# Check sending statistics
aws ses get-send-statistics

# Check configuration set
aws ses describe-configuration-set --configuration-set-name gpm-tracking

# Check event destinations
aws ses list-configuration-set-event-destinations --configuration-set-name gpm-tracking
```
