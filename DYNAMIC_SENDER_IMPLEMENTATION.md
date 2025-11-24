# Dynamic Sender Fields Implementation - Complete

## Overview

This implementation adds dynamic selection of `from` and `replyTo` fields to the email campaign system, allowing users to:

1. **Select from verified AWS SES email addresses** from a dropdown
2. **Input custom from name** (e.g., "John Doe", "Support Team")
3. **Input custom reply-to email** address

## Database Changes

### Migration: `20250703000000-add-sender-fields-to-campaign.js`

Added three new fields to the `Campaigns` table:

```sql
ALTER TABLE Campaigns ADD COLUMN fromName VARCHAR(255) DEFAULT 'Gravity Point Media';
ALTER TABLE Campaigns ADD COLUMN fromEmail VARCHAR(255) DEFAULT 'support@send.gravitypointmedia.com';
ALTER TABLE Campaigns ADD COLUMN replyToEmail VARCHAR(255) DEFAULT 'support@gravitypointmedia.com';
```

### Model Updates: `src/models/campaign.js`

```javascript
fromName: {
  type: DataTypes.STRING,
  allowNull: true,
  defaultValue: 'Gravity Point Media'
},
fromEmail: {
  type: DataTypes.STRING,
  allowNull: true,
  defaultValue: 'support@send.gravitypointmedia.com'
},
replyToEmail: {
  type: DataTypes.STRING,
  allowNull: true,
  defaultValue: 'support@gravitypointmedia.com'
}
```

## Backend Implementation

### 1. AWS SES Service (`src/services/sesService.js`)

- **Purpose**: Fetches verified email identities from AWS SES
- **Fallback**: Returns default email if AWS credentials are missing or API fails
- **Features**:
  - Proper AWS v4 signature authentication
  - Node.js crypto compatibility
  - Error handling with graceful fallback

**Key Methods**:
- `getVerifiedIdentities()`: Returns array of verified email addresses

### 2. Campaign Controller Updates (`src/controllers/campaign.controller.js`)

#### New Endpoint:
```javascript
GET /api/campaigns/verified-identities
```
Returns list of verified email addresses from AWS SES.

#### Updated Methods:
- **`createCampaign`**: Now accepts `fromName`, `fromEmail`, `replyToEmail` fields
- **`updateCampaign`**: Now supports updating sender fields
- **`prepareCampaignDataForWorker`**: Passes sender fields to worker

#### Validation:
- `fromName`: 1-100 characters, optional
- `fromEmail`: Valid email format, optional
- `replyToEmail`: Valid email format, optional

### 3. Route Updates (`src/routes/campaign.routes.js`)

Added validation rules and new endpoint:

```javascript
// New endpoint for getting verified identities
router.get('/verified-identities', campaignController.getVerifiedIdentities);

// Updated validation for create/update
body('fromName').optional().trim().isLength({ min: 1, max: 100 }),
body('fromEmail').optional().isEmail(),
body('replyToEmail').optional().isEmail()
```

## Worker Implementation

### Updated Worker (`worker/src/durable/campaign.js`)

The worker now uses dynamic sender fields from the campaign data:

```javascript
// Before (hardcoded):
from: 'Gravity Point Media <support@send.gravitypointmedia.com>',
replyTo: 'support@gravitypointmedia.com'

// After (dynamic):
from: `${this.campaign.fromName || 'Gravity Point Media'} <${this.campaign.fromEmail || 'support@send.gravitypointmedia.com'}>`,
replyTo: this.campaign.replyToEmail || 'support@gravitypointmedia.com'
```

## API Usage Examples

### 1. Get Verified Email Identities

```bash
GET /api/campaigns/verified-identities
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "identities": [
    "support@send.gravitypointmedia.com",
    "noreply@example.com",
    "john@company.com"
  ]
}
```

### 2. Create Campaign with Custom Sender

```bash
POST /api/campaigns
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "My Campaign",
  "subject": "Hello World",
  "templateId": "uuid-here",
  "contactListId": "uuid-here",
  "fromName": "John Doe",
  "fromEmail": "john@company.com",
  "replyToEmail": "support@company.com"
}
```

### 3. Update Campaign Sender Fields

```bash
PUT /api/campaigns/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "fromName": "Jane Smith",
  "fromEmail": "jane@company.com",
  "replyToEmail": "help@company.com"
}
```

## Frontend Integration Guide

### 1. Fetch Verified Identities

```javascript
// Get verified email addresses for dropdown
const getVerifiedIdentities = async () => {
  const response = await fetch('/api/campaigns/verified-identities', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  const data = await response.json();
  return data.identities;
};
```

### 2. Campaign Form Fields

```html
<!-- From Name Input -->
<input 
  type="text" 
  name="fromName" 
  placeholder="e.g., John Doe, Support Team"
  maxlength="100"
/>

<!-- From Email Dropdown -->
<select name="fromEmail">
  <!-- Populated from getVerifiedIdentities() -->
  <option value="support@send.gravitypointmedia.com">support@send.gravitypointmedia.com</option>
  <option value="noreply@example.com">noreply@example.com</option>
</select>

<!-- Reply-To Email Input -->
<input 
  type="email" 
  name="replyToEmail" 
  placeholder="e.g., support@company.com"
/>
```

### 3. Form Submission

```javascript
const createCampaign = async (formData) => {
  const response = await fetch('/api/campaigns', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      name: formData.name,
      subject: formData.subject,
      templateId: formData.templateId,
      contactListId: formData.contactListId,
      fromName: formData.fromName || 'Gravity Point Media',
      fromEmail: formData.fromEmail || 'support@send.gravitypointmedia.com',
      replyToEmail: formData.replyToEmail || 'support@gravitypointmedia.com'
    })
  });
  
  return response.json();
};
```

## Environment Variables

Ensure these are set for AWS SES integration:

```env
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
```

## Testing

### Run Migration
```bash
cd server
npx sequelize-cli db:migrate
```

### Test Implementation
```bash
cd server
node test-dynamic-sender.js
node test-api-endpoint.js
```

## Benefits

1. **Brand Consistency**: Users can send from their own verified domains
2. **Better Deliverability**: Proper from/reply-to setup improves email reputation
3. **User Experience**: Replies go to appropriate addresses
4. **Flexibility**: Different campaigns can use different sender identities
5. **AWS SES Integration**: Automatically fetches verified identities

## Security Considerations

1. **Validation**: All email addresses are validated on the server
2. **AWS SES Only**: From emails must be verified in AWS SES
3. **Authentication**: All endpoints require proper authentication
4. **Graceful Fallback**: System works even if AWS SES is unavailable

## Migration Notes

- **Backward Compatibility**: Existing campaigns will use default values
- **No Downtime**: Migration adds fields with defaults
- **Worker Compatibility**: Worker handles both old and new campaign formats
