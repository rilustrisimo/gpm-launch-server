# Campaign Controller-Worker Communication

This document outlines how the server's campaign controller communicates with the Cloudflare Worker to handle email campaigns.

## Overview

The server communicates with the worker using a RESTful API with the following endpoints:

| Server Action | Worker API Endpoint | Description |
|--------------|---------------------|-------------|
| Initialize Campaign | POST `/api/campaign/:id/initialize` | Prepares a campaign for sending in the worker |
| Start Campaign | POST `/api/campaign/:id/start` | Begins the email sending process |
| Check Status | GET `/api/campaign/:id/status` | Gets current campaign status and stats |
| Stop Campaign | POST `/api/campaign/:id/stop` | Halts an in-progress campaign |
| Delete Campaign | DELETE `/api/campaign/:id` | Removes campaign data from worker storage |

## Communication Flow

1. **Campaign Creation**: 
   - Server creates campaign in database
   - Server automatically initializes campaign in worker with retry mechanism

2. **Campaign Update**:
   - Server updates campaign in database
   - Server re-initializes campaign in worker with retry mechanism

3. **Campaign Scheduling**:
   - Server schedules campaign in database
   - Server registers scheduled job with worker with retry mechanism

4. **Campaign Sending**:
   - Server initializes campaign in worker (if not already done)
   - Server instructs worker to start sending with retry mechanism
   - Worker processes emails in batches of 50
   - Server can monitor status via status endpoint
   - Worker sends status updates back to server via webhook

5. **Campaign Stopping**:
   - Server can stop in-progress campaign with retry mechanism
   - Worker halts sending remaining emails
   - Worker sends status update back to server

6. **Campaign Deletion**:
   - Server attempts to stop campaign if running with retry mechanism
   - Server deletes campaign data from worker with retry mechanism

7. **Status Synchronization**:
   - Worker sends status updates to server via webhook
   - Server periodically checks worker status via API
   - Server synchronizes campaign status when discrepancies are detected

## Campaign Status Values

Status values are synchronized between server and worker:

- `draft`: Initial campaign state, not yet sent
- `scheduled`: Campaign scheduled for future sending
- `sending`: Campaign actively sending emails
- `processing`: Campaign being processed by worker
- `completed`: Campaign finished sending all emails
- `stopped`: Campaign manually stopped before completion

## Worker API Key Authentication

All communication with the worker uses API key authentication:

```javascript
Authorization: Bearer ${WORKER_API_KEY}
```

The `WORKER_API_KEY` environment variable must be set in both server and worker environments.

## Webhook Communication

The worker communicates back to the server using webhooks:

| Worker Action | Server API Endpoint | Description |
|--------------|---------------------|-------------|
| Update Campaign Status | POST `/api/tracking/campaign/status` | Updates campaign status in the server |
| Update Tracking Data | POST `/api/tracking/update` | Records email open/click events |
| Batch Update Tracking | POST `/api/tracking/batch-update` | Records multiple tracking events |
| Process Unsubscribe | POST `/api/tracking/contacts/unsubscribe` | Updates contact with unsubscribe status |
| Process Bounce | POST `/api/tracking/contacts/bounce` | Records email bounce event |
| Process Complaint | POST `/api/tracking/contacts/complaint` | Records spam complaint |

All webhook endpoints validate the API key before processing data.

## Retry Mechanism

All communication with the worker implements a retry mechanism:

- Default of 3 retry attempts with 1-second delay between attempts
- Configurable via environment variables (`MAX_RETRIES`, `RETRY_DELAY`)
- Logs detailed error information for failure diagnosis
- Falls back to local operation for critical tasks when worker is unavailable

The retry logic is implemented in the `executeWithRetry` helper function:

```javascript
const executeWithRetry = async (apiCall, operation, maxRetries = MAX_RETRIES) => {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      console.log(`${operation}: Attempt ${attempt + 1}/${maxRetries + 1}`);
      const response = await apiCall();
      
      if (response.data && !response.data.success) {
        // Handle unsuccessful response
        if (attempt === maxRetries) {
          throw new Error(`Operation failed after ${maxRetries + 1} attempts`);
        }
      } else {
        return response;  // Success
      }
    } catch (error) {
      // Handle error and retry if attempts remaining
      if (attempt === maxRetries) {
        throw new Error(`Operation failed after ${maxRetries + 1} attempts`);
      }
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
    }
  }
};
```
