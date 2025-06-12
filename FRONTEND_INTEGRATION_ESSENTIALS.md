# Frontend Integration Essentials - Turtle Send

## Critical API Integration Points

### 1. Campaign Creation/Update API
Your frontend needs to send these exact fields to work with the backend:

```javascript
// POST /api/campaigns or PUT /api/campaigns/:id
{
  "name": "Campaign Name",
  "subject": "Email Subject",
  "templateId": "uuid",
  "contactListId": "uuid",
  "sendingMode": "turtle",        // REQUIRED: 'normal' | 'turtle'
  "emailsPerMinute": 30,          // REQUIRED for turtle: 1-600
  "maxConcurrentBatches": 1       // Optional: defaults to 1 for turtle, 10 for normal
}
```

### 2. Campaign Status Monitoring
Poll this endpoint for real-time progress:

```javascript
// GET /api/campaigns/:id/stats
{
  "success": true,
  "campaign": {
    "id": "uuid",
    "name": "Campaign Name",
    "status": "sending",           // draft, scheduled, sending, completed, stopped
    "sendingMode": "turtle",
    "emailsPerMinute": 30
  },
  "stats": {
    "totalRecipients": 1000,
    "sent": 250,                   // Current progress
    "delivered": 240,
    "opens": 45,
    "clicks": 12
  },
  "progress": 25.0                 // Percentage complete
}
```

### 3. Campaign Sending
```javascript
// POST /api/campaigns/:id/send
// Body: empty
// Response: { "success": true, "message": "Campaign started" }
```

## Essential Frontend Components

### 1. Sending Mode Selection
- Radio buttons: "Normal Send" vs "🐢 Turtle Send"
- When turtle selected, show rate control

### 2. Rate Control (Turtle Mode Only)
- Slider or input: 1-600 emails/minute
- Live time estimation display
- Rate presets (10, 30, 60, 120/min)

### 3. Time Estimation Calculator
```javascript
const estimateTime = (recipients, emailsPerMinute) => {
  const totalMinutes = recipients / emailsPerMinute;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.floor(totalMinutes % 60);
  return `${hours}h ${minutes}m`;
};
```

### 4. Progress Tracking
- Poll `/api/campaigns/:id/stats` every 5-10 seconds during sending
- Show progress bar: `(sent / totalRecipients) * 100`
- Display current rate and estimated time remaining

### 5. Campaign List Indicators
- Show 🐢 icon for turtle campaigns
- Display rate (e.g., "🐢 30/min") 
- Show estimated time for turtle sends

## Validation Rules (Frontend)

```javascript
const validateTurtleParams = (data) => {
  if (data.sendingMode === 'turtle') {
    if (!data.emailsPerMinute) return "Rate required for turtle mode";
    if (data.emailsPerMinute < 1 || data.emailsPerMinute > 600) {
      return "Rate must be 1-600 emails/minute";
    }
  }
  return null;
};
```

## Polling Strategy

```javascript
// Different polling intervals based on sending mode
const getPollingInterval = (sendingMode, rate) => {
  if (sendingMode === 'turtle') {
    return rate <= 10 ? 10000 : 5000; // 10s for slow, 5s for faster
  }
  return 2000; // 2s for normal mode
};
```

## Key UI States

### Draft Campaign
- Show sending mode selection
- Allow rate configuration
- Validate before saving

### Sending Campaign  
- Show progress bar
- Display current rate
- Show time remaining
- Allow stopping

### Turtle Campaigns
- Highlight with 🐢 icon
- Show rate prominently  
- Longer polling interval
- Detailed progress info

## Critical Backend Response Fields

Your frontend should expect these fields from the backend:

```javascript
// Campaign object
{
  id: "uuid",
  name: "string",
  subject: "string", 
  status: "draft|scheduled|sending|completed|stopped",
  sendingMode: "normal|turtle",
  emailsPerMinute: number,        // Only present for turtle
  maxConcurrentBatches: number,
  totalRecipients: number,
  sent: number,
  delivered: number,
  opens: number,
  clicks: number
}
```

## Authentication
All API calls require Authorization header:
```javascript
headers: {
  'Authorization': `Bearer ${userToken}`,
  'Content-Type': 'application/json'
}
```

## Error Handling
Backend returns these error formats:
```javascript
// Validation errors
{
  "success": false,
  "errors": [
    { "field": "emailsPerMinute", "message": "Must be 1-600" }
  ]
}

// General errors  
{
  "success": false,
  "message": "Campaign not found"
}
```

## Essential User Experience

1. **Clear Mode Selection**: Make turtle vs normal choice obvious
2. **Rate Visualization**: Show time impact of rate selection
3. **Progress Feedback**: Real-time updates during turtle sends
4. **Visual Indicators**: 🐢 icons, rate displays, time estimates
5. **Presets**: Common rates (10, 30, 60/min) for easy selection

This covers everything your frontend needs to perfectly integrate with the turtle send backend! 🎯
