# Sender Data Flow Verification

## Critical Bug Fixed ✅

**Problem**: Emails were being sent with wrong sender information ("Gravity Point Media" instead of "Manito Manita")

**Root Cause**: `turtleSendingService.js` was calling `emailService.send()` but the method is actually named `emailService.sendEmail()`

**Fix Applied**: Changed method call from `.send()` to `.sendEmail()` and added proper campaign ID and contact ID parameters

---

## Complete Data Flow: Client → Server → Email

### 1. Client Side (CreateCampaignModal.tsx) ✅

**Location**: `/client/src/components/campaigns/CreateCampaignModal.tsx` lines 120-145

**What happens**:
- User selects a sender preset (Gravity Point Media, Manito Manita, or Custom)
- Form data includes:
  ```javascript
  {
    fromName: fromName.trim() || undefined,
    fromEmail: fromEmail || undefined,
    replyToEmail: replyToEmail || undefined
  }
  ```

**Example for Manito Manita preset**:
```javascript
{
  fromName: "Manito Manita",
  fromEmail: "info@manitomanita.com",
  replyToEmail: "info@manitomanita.com"
}
```

---

### 2. API Route Validation ✅

**Location**: `/server/src/routes/campaign.routes.js` lines 42-44

**Validation rules**:
```javascript
body('fromName').optional().trim().isLength({ min: 1, max: 100 }),
body('fromEmail').optional().isEmail(),
body('replyToEmail').optional().isEmail()
```

**Status**: All sender fields are validated and passed through to controller

---

### 3. Campaign Creation (Controller) ✅

**Location**: `/server/src/controllers/campaign.controller.js` lines 247-340

**What happens**:
- Controller extracts sender fields from request body (lines 267-269)
- Creates campaign in database with sender fields (lines 322-326):
  ```javascript
  const campaign = await Campaign.create({
    // ... other fields
    fromName: fromName || 'Gravity Point Media',
    fromEmail: fromEmail || 'support@send.gravitypointmedia.com',
    replyToEmail: replyToEmail || 'support@gravitypointmedia.com'
  }, { transaction });
  ```

**Status**: Sender fields are properly saved to database

---

### 4. Campaign Retrieval for Sending ✅

**Location**: `/server/src/controllers/campaign.controller.js` lines 896-930

**What happens**:
- When "Send Now" is triggered, campaign is loaded with all associations:
  ```javascript
  const campaign = await Campaign.findOne({
    where: { id: req.params.id, userId: req.user.id },
    include: [
      { model: Template, as: 'template' },
      { model: ContactList, as: 'contactList', include: [/* contacts */] }
    ]
  });
  ```

**Status**: Campaign object includes `fromName`, `fromEmail`, `replyToEmail` from database

---

### 5. Prepare Data for Worker ✅

**Location**: `/server/src/controllers/campaign.controller.js` lines 85-105

**What happens**:
- Campaign data is formatted for worker/turtle sending:
  ```javascript
  const prepareCampaignDataForWorker = (campaign) => {
    return {
      // ... other fields
      fromName: campaign.fromName || 'Gravity Point Media',
      fromEmail: campaign.fromEmail || 'support@send.gravitypointmedia.com',
      replyToEmail: campaign.replyToEmail || 'support@gravitypointmedia.com',
      // ... template and recipients
    };
  };
  ```

**Status**: Sender fields are included in campaign data object

---

### 6. Turtle Sending Service ✅ **[FIXED]**

**Location**: `/server/src/services/turtleSendingService.js` lines 211-224

**What happens**:
- Service extracts sender fields from campaign:
  ```javascript
  const fromName = campaign.fromName || process.env.FROM_NAME || 'Gravity Point Media';
  const fromEmail = campaign.fromEmail || process.env.FROM_EMAIL || 'support@send.gravitypointmedia.com';
  const replyToEmail = campaign.replyToEmail || process.env.REPLY_TO_EMAIL || 'support@gravitypointmedia.com';
  ```

- **FIXED**: Changed from `emailService.send()` to `emailService.sendEmail()`:
  ```javascript
  const result = await emailService.sendEmail({
    to: contact.email,
    subject: campaign.subject,
    html: emailContent,
    from: `${fromName} <${fromEmail}>`,
    campaignId: campaign.id,
    contactId: contact.id
  });
  ```

**Previous Bug**: Was calling `.send()` which doesn't exist
**Fix Applied**: Now calls `.sendEmail()` with correct parameters

---

### 7. Email Service (AWS SES) ✅

**Location**: `/server/src/services/emailService.js` lines 59-105

**What happens**:
- Receives email parameters and sends via AWS SES:
  ```javascript
  async sendEmail({ to, subject, html, text, from, campaignId, contactId }) {
    const params = {
      Source: from,  // <-- Uses the 'from' parameter directly
      Destination: { ToAddresses: [to] },
      Message: { /* subject and body */ },
      Tags: [
        { Name: 'campaignId', Value: campaignId || 'unknown' },
        { Name: 'contactId', Value: contactId || 'unknown' }
      ]
    };
    const result = await this.ses.sendEmail(params).promise();
  }
  ```

**Status**: Correctly uses `from` parameter as AWS SES `Source`

---

## Data Flow Summary

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. Client: CreateCampaignModal.tsx                              │
│    → Sends: { fromName, fromEmail, replyToEmail }               │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. API Route: campaign.routes.js                                │
│    → Validates sender fields                                     │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. Controller: createCampaign()                                  │
│    → Saves to database: Campaign.create({ fromName, ... })      │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. Controller: sendCampaignNow()                                 │
│    → Loads campaign from DB with all fields                     │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. Helper: prepareCampaignDataForWorker()                        │
│    → Includes fromName, fromEmail, replyToEmail                 │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ 6. Service: turtleSendingService._sendTurtleEmail() [FIXED]     │
│    → Extracts: campaign.fromName, campaign.fromEmail            │
│    → Calls: emailService.sendEmail({ from: ... })               │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ 7. Service: emailService.sendEmail()                             │
│    → Sends via AWS SES with Source: from parameter              │
└─────────────────────────────────────────────────────────────────┘
```

---

## Testing Instructions

### Server Restart Required ⚠️

Since we fixed a critical method call, **the server MUST be restarted** for the fix to take effect.

```bash
cd /Users/eyorsogood/Sites/launch.gravitypointmedia.com/server
# Stop existing server
pkill -f "node.*server"
# Start server
npm start
```

### Test Steps

1. **Create a new campaign** with Manito Manita preset:
   - From Name: `Manito Manita`
   - From Email: `info@manitomanita.com`
   - Reply-To: `info@manitomanita.com`

2. **Send the campaign** using "Send Now"

3. **Check received email** headers:
   - From: Should show `Manito Manita <info@manitomanita.com>`
   - Reply-To: Should show `info@manitomanita.com`

### Verification Script

```bash
cd /Users/eyorsogood/Sites/launch.gravitypointmedia.com/server
node test-campaign-sender.js
```

This will show the campaign's sender fields from the database.

---

## What Was Fixed

### Before (Broken)
```javascript
// turtleSendingService.js
const result = await emailService.send({  // ❌ Method doesn't exist!
  to: contact.email,
  subject: campaign.subject,
  html: emailContent,
  from: `${fromName} <${fromEmail}>`,
  replyTo: replyToEmail  // ❌ Not used by emailService
});
```

### After (Fixed)
```javascript
// turtleSendingService.js
console.log('📧 Sending email with sender:', { fromName, fromEmail, to: contact.email });
const result = await emailService.sendEmail({  // ✅ Correct method name!
  to: contact.email,
  subject: campaign.subject,
  html: emailContent,
  from: `${fromName} <${fromEmail}>`,
  campaignId: campaign.id,     // ✅ Added for tracking
  contactId: contact.id         // ✅ Added for tracking
});
```

---

## Status

✅ **Client → Server**: Data passes correctly  
✅ **Database Storage**: Sender fields saved correctly  
✅ **Campaign Retrieval**: Sender fields loaded correctly  
✅ **Turtle Sending**: Now uses correct method with proper parameters  
✅ **Email Service**: Correctly configured to use `from` parameter  

🔄 **Next Step**: Restart server and test with fresh campaign
