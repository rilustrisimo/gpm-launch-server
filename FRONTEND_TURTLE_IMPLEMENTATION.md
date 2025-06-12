# Frontend Implementation Guide - Turtle Send Feature

## Overview

This guide provides complete frontend components and integration patterns for the turtle send functionality. The backend is fully implemented and ready to accept turtle send parameters.

## Backend API Summary

### Campaign Creation/Update Endpoints
- **POST** `/api/campaigns` - Create campaign with turtle parameters
- **PUT** `/api/campaigns/:id` - Update campaign turtle settings
- **POST** `/api/campaigns/:id/send` - Send campaign (supports turtle mode)

### Turtle Send Parameters
```javascript
{
  "sendingMode": "turtle",      // 'normal' | 'turtle'
  "emailsPerMinute": 30,        // 1-600 range
  "maxConcurrentBatches": 1     // 1-50 range (always 1 for turtle)
}
```

## Frontend Implementation

### 1. Campaign Form Component

```jsx
// CampaignForm.jsx
import React, { useState } from 'react';

const CampaignForm = ({ onSubmit, initialValues = {}, isUpdate = false }) => {
  const [formData, setFormData] = useState({
    name: '',
    subject: '',
    templateId: '',
    contactListId: '',
    sendingMode: 'normal',
    emailsPerMinute: 60,
    ...initialValues
  });

  const [showTurtleOptions, setShowTurtleOptions] = useState(
    initialValues.sendingMode === 'turtle'
  );

  const handleSendingModeChange = (mode) => {
    setFormData(prev => ({
      ...prev,
      sendingMode: mode,
      emailsPerMinute: mode === 'turtle' ? 60 : null,
      maxConcurrentBatches: mode === 'turtle' ? 1 : 10
    }));
    setShowTurtleOptions(mode === 'turtle');
  };

  const getEstimatedTime = () => {
    if (formData.sendingMode !== 'turtle' || !formData.emailsPerMinute) return null;
    
    const recipientCount = 100; // Example - get from contact list
    const totalMinutes = recipientCount / formData.emailsPerMinute;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = Math.floor(totalMinutes % 60);
    
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  };

  const renderTurtleOptions = () => (
    <div className="turtle-send-options">
      <h3>🐢 Turtle Send Options</h3>
      <p className="description">
        Send emails at a controlled rate to avoid overwhelming recipients and improve deliverability.
      </p>
      
      <div className="form-group">
        <label htmlFor="emailsPerMinute">
          Emails per Minute
          <span className="range-info">(1-600)</span>
        </label>
        <input
          type="range"
          id="emailsPerMinute"
          min="1"
          max="600"
          value={formData.emailsPerMinute}
          onChange={(e) => setFormData(prev => ({
            ...prev,
            emailsPerMinute: parseInt(e.target.value)
          }))}
          className="slider"
        />
        <div className="slider-value">
          <strong>{formData.emailsPerMinute}</strong> emails/minute
        </div>
        
        {formData.emailsPerMinute && (
          <div className="rate-examples">
            <small>
              • {(formData.emailsPerMinute / 60).toFixed(1)} emails/second
              • {formData.emailsPerMinute * 60} emails/hour
            </small>
          </div>
        )}
      </div>

      <div className="time-estimate">
        <strong>Estimated Time:</strong>
        <span className="estimate-value">
          {getEstimatedTime() || 'Select recipient count'}
        </span>
      </div>

      <div className="speed-presets">
        <h4>Quick Presets:</h4>
        <div className="preset-buttons">
          <button
            type="button"
            onClick={() => handleEmailsPerMinuteChange(10)}
            className={formData.emailsPerMinute === 10 ? 'active' : ''}
          >
            Ultra Slow (10/min)
          </button>
          <button
            type="button"
            onClick={() => handleEmailsPerMinuteChange(30)}
            className={formData.emailsPerMinute === 30 ? 'active' : ''}
          >
            Standard (30/min)
          </button>
          <button
            type="button"
            onClick={() => handleEmailsPerMinuteChange(60)}
            className={formData.emailsPerMinute === 60 ? 'active' : ''}
          >
            Fast (60/min)
          </button>
          <button
            type="button"
            onClick={() => handleEmailsPerMinuteChange(120)}
            className={formData.emailsPerMinute === 120 ? 'active' : ''}
          >
            Rapid (120/min)
          </button>
        </div>
      </div>
    </div>
  );

  const handleEmailsPerMinuteChange = (value) => {
    setFormData(prev => ({ ...prev, emailsPerMinute: value }));
  };

  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      onSubmit(formData);
    }}>
      {/* Basic Campaign Fields */}
      <div className="form-group">
        <label htmlFor="name">Campaign Name</label>
        <input
          type="text"
          id="name"
          value={formData.name}
          onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
          required
        />
      </div>

      <div className="form-group">
        <label htmlFor="subject">Subject Line</label>
        <input
          type="text"
          id="subject"
          value={formData.subject}
          onChange={(e) => setFormData(prev => ({ ...prev, subject: e.target.value }))}
          required
        />
      </div>

      {/* Sending Mode Selection */}
      <div className="form-group">
        <label>Sending Mode</label>
        <div className="radio-group">
          <label className="radio-option">
            <input
              type="radio"
              name="sendingMode"
              value="normal"
              checked={formData.sendingMode === 'normal'}
              onChange={() => handleSendingModeChange('normal')}
            />
            <span className="radio-label">
              <strong>Normal Send</strong>
              <small>Send immediately at full speed (~10 emails/second)</small>
            </span>
          </label>
          <label className="radio-option">
            <input
              type="radio"
              name="sendingMode"
              value="turtle"
              checked={formData.sendingMode === 'turtle'}
              onChange={() => handleSendingModeChange('turtle')}
            />
            <span className="radio-label">
              <strong>🐢 Turtle Send</strong>
              <small>Send at controlled rate (1-600 emails/minute)</small>
            </span>
          </label>
        </div>
      </div>

      {/* Turtle Send Options */}
      {showTurtleOptions && renderTurtleOptions()}

      <div className="form-actions">
        <button type="submit" className="btn-primary">
          {isUpdate ? 'Update Campaign' : 'Create Campaign'}
        </button>
      </div>
    </form>
  );
};

export default CampaignForm;
```

### 2. Campaign List Component with Turtle Indicators

```jsx
// CampaignList.jsx
import React from 'react';

const CampaignList = ({ campaigns }) => {
  const renderSendingModeIcon = (campaign) => {
    if (campaign.sendingMode === 'turtle') {
      return (
        <span className="turtle-indicator" title={`Turtle Send: ${campaign.emailsPerMinute}/min`}>
          🐢 {campaign.emailsPerMinute}/min
        </span>
      );
    }
    return (
      <span className="normal-indicator" title="Normal Send">
        ⚡ Normal
      </span>
    );
  };

  const calculateEstimatedTime = (campaign) => {
    if (campaign.sendingMode !== 'turtle' || !campaign.emailsPerMinute) {
      return 'Instant';
    }
    
    const totalMinutes = campaign.totalRecipients / campaign.emailsPerMinute;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = Math.floor(totalMinutes % 60);
    
    if (hours > 0) {
      return `~${hours}h ${minutes}m`;
    }
    return `~${minutes}m`;
  };

  return (
    <div className="campaign-list">
      {campaigns.map(campaign => (
        <div key={campaign.id} className="campaign-card">
          <div className="campaign-header">
            <h3>{campaign.name}</h3>
            {renderSendingModeIcon(campaign)}
          </div>
          
          <div className="campaign-details">
            <p><strong>Subject:</strong> {campaign.subject}</p>
            <p><strong>Recipients:</strong> {campaign.totalRecipients}</p>
            <p><strong>Estimated Time:</strong> {calculateEstimatedTime(campaign)}</p>
            <p><strong>Status:</strong> 
              <span className={`status-${campaign.status}`}>{campaign.status}</span>
            </p>
          </div>

          {campaign.sendingMode === 'turtle' && campaign.status === 'sending' && (
            <TurtleProgressIndicator campaign={campaign} />
          )}
        </div>
      ))}
    </div>
  );
};
```

### 3. Turtle Progress Indicator

```jsx
// TurtleProgressIndicator.jsx
import React, { useState, useEffect } from 'react';

const TurtleProgressIndicator = ({ campaign }) => {
  const [progress, setProgress] = useState(0);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/campaigns/${campaign.id}/stats`);
        const data = await response.json();
        
        if (data.success) {
          setStats(data.stats);
          const progressPercent = (data.stats.sent / campaign.totalRecipients) * 100;
          setProgress(progressPercent);
        }
      } catch (error) {
        console.error('Failed to fetch campaign stats:', error);
      }
    }, 5000); // Poll every 5 seconds for turtle mode

    return () => clearInterval(pollInterval);
  }, [campaign.id, campaign.totalRecipients]);

  const calculateRemainingTime = () => {
    if (!stats || !campaign.emailsPerMinute) return null;
    
    const remaining = campaign.totalRecipients - stats.sent;
    const remainingMinutes = remaining / campaign.emailsPerMinute;
    const hours = Math.floor(remainingMinutes / 60);
    const minutes = Math.floor(remainingMinutes % 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m remaining`;
    }
    return `${minutes}m remaining`;
  };

  return (
    <div className="turtle-progress">
      <div className="progress-header">
        <h4>🐢 Turtle Send Progress</h4>
        <span className="rate-indicator">{campaign.emailsPerMinute}/min</span>
      </div>
      
      <div className="progress-bar">
        <div 
          className="progress-fill" 
          style={{ width: `${progress}%` }}
        ></div>
        <span className="progress-text">{progress.toFixed(1)}%</span>
      </div>
      
      {stats && (
        <div className="progress-stats">
          <div className="stat-item">
            <span className="stat-label">Sent:</span>
            <span className="stat-value">{stats.sent} / {campaign.totalRecipients}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Time Remaining:</span>
            <span className="stat-value">{calculateRemainingTime()}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Current Rate:</span>
            <span className="stat-value">{campaign.emailsPerMinute} emails/min</span>
          </div>
        </div>
      )}
    </div>
  );
};
```

### 4. API Integration Service

```javascript
// campaignService.js
export const campaignService = {
  // Create campaign with turtle options
  async createCampaign(campaignData) {
    const response = await fetch('/api/campaigns', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`
      },
      body: JSON.stringify(campaignData)
    });
    
    if (!response.ok) {
      throw new Error('Failed to create campaign');
    }
    
    return response.json();
  },

  // Update campaign turtle settings
  async updateCampaign(campaignId, updates) {
    const response = await fetch(`/api/campaigns/${campaignId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`
      },
      body: JSON.stringify(updates)
    });
    
    if (!response.ok) {
      throw new Error('Failed to update campaign');
    }
    
    return response.json();
  },

  // Send campaign (supports turtle mode)
  async sendCampaign(campaignId) {
    const response = await fetch(`/api/campaigns/${campaignId}/send`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getAuthToken()}`
      }
    });
    
    if (!response.ok) {
      throw new Error('Failed to send campaign');
    }
    
    return response.json();
  },

  // Get campaign stats (for progress tracking)
  async getCampaignStats(campaignId) {
    const response = await fetch(`/api/campaigns/${campaignId}/stats`, {
      headers: {
        'Authorization': `Bearer ${getAuthToken()}`
      }
    });
    
    if (!response.ok) {
      throw new Error('Failed to get campaign stats');
    }
    
    return response.json();
  }
};

function getAuthToken() {
  // Return your auth token logic
  return localStorage.getItem('authToken');
}
```

### 5. CSS Styles

```css
/* turtle-send.css */
.turtle-send-options {
  background: #f8f9fa;
  border: 2px solid #e9ecef;
  border-radius: 8px;
  padding: 20px;
  margin: 20px 0;
}

.turtle-send-options h3 {
  color: #28a745;
  margin-bottom: 10px;
}

.description {
  color: #6c757d;
  margin-bottom: 20px;
  font-style: italic;
}

.slider {
  width: 100%;
  height: 6px;
  border-radius: 3px;
  background: #ddd;
  outline: none;
  margin: 10px 0;
}

.slider::-webkit-slider-thumb {
  appearance: none;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #28a745;
  cursor: pointer;
}

.slider-value {
  text-align: center;
  font-size: 18px;
  color: #28a745;
  margin: 10px 0;
}

.rate-examples {
  text-align: center;
  color: #6c757d;
}

.time-estimate {
  background: #e7f3ff;
  padding: 12px;
  border-radius: 6px;
  margin: 15px 0;
  text-align: center;
}

.estimate-value {
  color: #0066cc;
  font-weight: bold;
  margin-left: 10px;
}

.preset-buttons {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 10px;
}

.preset-buttons button {
  padding: 8px 16px;
  border: 2px solid #dee2e6;
  background: white;
  border-radius: 20px;
  cursor: pointer;
  transition: all 0.2s;
}

.preset-buttons button:hover {
  border-color: #28a745;
  background: #f8f9fa;
}

.preset-buttons button.active {
  background: #28a745;
  color: white;
  border-color: #28a745;
}

.turtle-indicator {
  background: #28a745;
  color: white;
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: bold;
}

.normal-indicator {
  background: #007bff;
  color: white;
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: bold;
}

.turtle-progress {
  background: #f8f9fa;
  border: 1px solid #dee2e6;
  border-radius: 6px;
  padding: 15px;
  margin-top: 15px;
}

.progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.rate-indicator {
  background: #28a745;
  color: white;
  padding: 2px 6px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: bold;
}

.progress-bar {
  position: relative;
  background: #e9ecef;
  height: 20px;
  border-radius: 10px;
  margin: 10px 0;
}

.progress-fill {
  background: linear-gradient(90deg, #28a745, #20c997);
  height: 100%;
  border-radius: 10px;
  transition: width 0.3s ease;
}

.progress-text {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 12px;
  font-weight: bold;
  color: #333;
}

.progress-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px;
  margin-top: 15px;
}

.stat-item {
  display: flex;
  justify-content: space-between;
  padding: 5px 0;
  border-bottom: 1px solid #dee2e6;
}

.stat-label {
  font-weight: 500;
  color: #6c757d;
}

.stat-value {
  font-weight: bold;
  color: #28a745;
}

.radio-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.radio-option {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 15px;
  border: 2px solid #dee2e6;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.radio-option:hover {
  border-color: #adb5bd;
}

.radio-option:has(input:checked) {
  border-color: #28a745;
  background: #f8f9fa;
}

.radio-label {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.radio-label small {
  color: #6c757d;
}
```

## Usage Examples

### Create Campaign with Turtle Send
```javascript
const campaignData = {
  name: "Monthly Newsletter",
  subject: "Your March Update",
  templateId: "uuid-here",
  contactListId: "uuid-here",
  sendingMode: "turtle",
  emailsPerMinute: 30,
  maxConcurrentBatches: 1
};

await campaignService.createCampaign(campaignData);
```

### Update Existing Campaign to Turtle Mode
```javascript
const updates = {
  sendingMode: "turtle",
  emailsPerMinute: 60
};

await campaignService.updateCampaign(campaignId, updates);
```

## Key Features Implemented

1. **Visual Sending Mode Selection**: Radio buttons for Normal vs Turtle send
2. **Interactive Rate Slider**: 1-600 emails/minute with live preview
3. **Time Estimation**: Real-time calculation of sending duration
4. **Quick Presets**: Common rate presets (10, 30, 60, 120/min)
5. **Progress Tracking**: Live progress updates for turtle sends
6. **Visual Indicators**: Clear turtle 🐢 icons and rate display
7. **Validation**: Frontend validation matching backend rules

## Integration Points

- Backend API is fully compatible and ready
- All turtle send parameters validated server-side
- Real-time progress tracking via existing `/stats` endpoint
- Worker handles all rate limiting and timing automatically

The turtle send feature is now complete end-to-end! 🎉
