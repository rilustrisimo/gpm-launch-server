# GPM Launch Email Campaign System - Production Deployment Guide

This guide provides step-by-step instructions to deploy the GPM Launch email marketing system to production using Cloudflare Workers and Pages.

## System Architecture Overview

The system consists of:

1. **Backend API** - Express.js application deployed on Cloudflare Workers
2. **Email Worker** - Specialized Cloudflare Worker for processing email campaigns
3. **Tracking Worker** - Worker for handling email open/click tracking
4. **Frontend Client** - React application deployed on Cloudflare Pages
5. **Database** - MySQL database for storing users, campaigns, contacts, templates
6. **Email Service** - AWS SES for sending transactional emails

## Prerequisites

- Cloudflare account with Workers and Pages access
- AWS account with SES enabled
- Production MySQL database
- Domain name configured in Cloudflare

## Step 1: Set Up AWS SES for Production

1. **Set up Domain Verification**:
   ```bash
   # Contact AWS Support to move out of SES sandbox if needed
   # This will allow sending to unverified email addresses
   ```

2. **Create Configuration Set for Tracking**:
   - Go to AWS SES console
   - Create configuration set "gpm-support-tracking"
   - Add event destinations for tracking opens and clicks

3. **Verify Sending Domain in SES**:
   - Add the required DNS records to your domain
   - Verify the domain in SES console

## Step 2: Prepare Production Database

1. **Create Production Database**:
   ```bash
   # Using your database administration tool (e.g., phpMyAdmin, MySQL Workbench)
   CREATE DATABASE gpm_launch_production;
   CREATE USER 'gpm_launch_prod'@'%' IDENTIFIED BY 'secure_db_password_here';
   GRANT ALL PRIVILEGES ON gpm_launch_production.* TO 'gpm_launch_prod'@'%';
   FLUSH PRIVILEGES;
   ```

## Step 3: Configure Backend for Production

1. **Update database configuration**:
   - Edit `/src/config/database.js` if needed
   - Make sure it reads environment variables correctly

2. **Configure production environment**:
   - Update `.env.production` with production values
   - Make sure AWS credentials are secure

3. **Deploy backend to Cloudflare Workers**:
   ```bash
   cd /Users/eyorsogood/Sites/launch.gravitypointmedia.com/server
   ./deploy.sh
   ```

## Step 4: Set Up Cloudflare DNS

1. **API Subdomain**:
   ```
   Type: CNAME
   Name: api
   Target: workers.dev (from Cloudflare Worker)
   Proxy status: Proxied
   ```

2. **Tracking Subdomain**:
   ```
   Type: CNAME
   Name: trk
   Target: workers.dev (from Tracking Worker)
   Proxy status: Proxied
   ```

3. **Main Application Subdomain**:
   ```
   Type: CNAME
   Name: launch
   Target: pages.dev (from Cloudflare Pages)
   Proxy status: Proxied
   ```

## Step 5: Deploy React Client to Cloudflare Pages

Follow the instructions in `client-deployment.md` to:

1. Configure client environment variables
2. Build the client
3. Deploy to Cloudflare Pages
4. Configure custom domain

## Step 6: Testing the Production Deployment

### Test Backend API

```bash
# Test authentication endpoint
curl -X POST https://api.gravitypointmedia.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@gravitypointmedia.com","password":"your_password"}'

# Store the returned JWT token
TOKEN="<paste_token_here>"

# Test campaign endpoint
curl -X GET https://api.gravitypointmedia.com/api/campaigns \
  -H "Authorization: Bearer $TOKEN"
```

### Test Email Sending

1. Create a test template in the UI
2. Send a test email to yourself
3. Check for proper tracking pixel and click tracking
4. Verify unsubscribe link works

### Test Tracking

1. Open a received test email
2. Click links in the email
3. Check tracking stats in the dashboard

## Step 7: Set Up Monitoring and Alerts

1. **Configure Worker Analytics**:
   - Enable Cloudflare Worker Analytics
   - Set up alerts for errors and high usage

2. **Set up SES Event Notifications**:
   - Configure bounce and complaint notifications
   - Set up CloudWatch metrics for SES

3. **Database Backup Schedule**:
   - Set up automated MySQL backups
   - Test restore procedures

## Step 8: Security Checklist

- [ ] JWT secrets are secure and unique in production
- [ ] Database credentials are strong and limited to necessary permissions
- [ ] AWS IAM roles follow least privilege principle
- [ ] API endpoints are properly protected with authentication
- [ ] CORS settings are configured correctly
- [ ] Rate limiting is enabled for API endpoints

## Troubleshooting

### Common Issues

1. **Worker Deployment Fails**:
   - Check Cloudflare Workers logs
   - Verify account limits and quotas

2. **Email Sending Issues**:
   - Check SES console for bounces or complaints
   - Verify sending quota and statistics
   - Test SES credentials

3. **Database Connection Problems**:
   - Verify MySQL connection settings
   - Check database server firewall rules
   - Test connection from Cloudflare Workers

### Support Resources

- Cloudflare Workers Documentation: https://developers.cloudflare.com/workers/
- AWS SES Documentation: https://docs.aws.amazon.com/ses/
- Sequelize ORM Documentation: https://sequelize.org/master/

## Maintenance

- Rotate database credentials every 90 days
- Rotate AWS access keys regularly
- Update npm dependencies quarterly
- Monitor SES reputation metrics
- Review and clean contact lists periodically
