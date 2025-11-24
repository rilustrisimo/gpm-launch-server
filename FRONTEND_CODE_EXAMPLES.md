# Frontend Implementation Code Examples

## 1. Fetch Verified Identities Function

```javascript
// Utility function to fetch verified identities
const fetchVerifiedIdentities = async () => {
  try {
    const response = await fetch('/api/campaigns/verified-identities', {
      headers: {
        'Authorization': `Bearer ${getAuthToken()}`
      }
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch verified identities');
    }
    
    const data = await response.json();
    return data.identities || ['support@send.gravitypointmedia.com'];
  } catch (error) {
    console.error('Error fetching verified identities:', error);
    return ['support@send.gravitypointmedia.com']; // Fallback
  }
};
```

## 2. React Form State Management

```javascript
// Add to campaign form state
const [campaignForm, setCampaignForm] = useState({
  name: '',
  subject: '',
  templateId: '',
  contactListId: '',
  // New sender fields
  fromName: 'Gravity Point Media',
  fromEmail: 'support@send.gravitypointmedia.com',
  replyToEmail: 'support@gravitypointmedia.com'
});

// Load verified identities on component mount
const [verifiedEmails, setVerifiedEmails] = useState([]);
const [loadingEmails, setLoadingEmails] = useState(true);

useEffect(() => {
  const loadIdentities = async () => {
    setLoadingEmails(true);
    const identities = await fetchVerifiedIdentities();
    setVerifiedEmails(identities);
    setLoadingEmails(false);
  };
  
  loadIdentities();
}, []);
```

## 3. React JSX Form Fields

```jsx
{/* Sender Settings Section */}
<div className="form-section">
  <h3>Sender Settings</h3>
  <p className="section-description">Configure who the email appears to be from</p>
  
  <div className="sender-fields-grid">
    {/* From Name Field */}
    <div className="form-field">
      <label htmlFor="fromName">From Name</label>
      <input
        type="text"
        id="fromName"
        name="fromName"
        value={campaignForm.fromName}
        onChange={handleFormChange}
        placeholder="e.g., John Doe, Support Team"
        maxLength={100}
        className="form-input"
        aria-describedby="fromName-help"
      />
      <small id="fromName-help" className="help-text">
        The display name recipients will see as the sender
      </small>
    </div>
    
    {/* From Email Field */}
    <div className="form-field">
      <label htmlFor="fromEmail">From Email Address</label>
      {loadingEmails ? (
        <div className="loading-dropdown" role="status" aria-live="polite">
          Loading verified emails...
        </div>
      ) : (
        <select
          id="fromEmail"
          name="fromEmail"
          value={campaignForm.fromEmail}
          onChange={handleFormChange}
          className="form-select"
          aria-describedby="fromEmail-help"
        >
          {verifiedEmails.map(email => (
            <option key={email} value={email}>{email}</option>
          ))}
        </select>
      )}
      <small id="fromEmail-help" className="help-text">
        Select a verified email address to send from
      </small>
    </div>
    
    {/* Reply-To Email Field */}
    <div className="form-field">
      <label htmlFor="replyToEmail">Reply-To Email</label>
      <input
        type="email"
        id="replyToEmail"
        name="replyToEmail"
        value={campaignForm.replyToEmail}
        onChange={handleFormChange}
        placeholder="e.g., support@company.com"
        className="form-input"
        aria-describedby="replyToEmail-help"
      />
      <small id="replyToEmail-help" className="help-text">
        Where recipients' replies will be sent
      </small>
    </div>
  </div>
</div>
```

## 4. Form Submission Handler

```javascript
const handleCampaignSubmit = async (formData) => {
  try {
    const response = await fetch('/api/campaigns', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`
      },
      body: JSON.stringify({
        name: formData.name,
        subject: formData.subject,
        templateId: formData.templateId,
        contactListId: formData.contactListId,
        // Include sender fields
        fromName: formData.fromName || 'Gravity Point Media',
        fromEmail: formData.fromEmail || 'support@send.gravitypointmedia.com',
        replyToEmail: formData.replyToEmail || 'support@gravitypointmedia.com',
        // ... other existing fields
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to create campaign');
    }
    
    const result = await response.json();
    console.log('Campaign created successfully:', result);
    
    // Handle success (redirect, show message, etc.)
    onSuccess?.(result);
    
  } catch (error) {
    console.error('Error creating campaign:', error);
    // Handle error - show validation errors to user
    setErrorMessage(error.message);
  }
};
```

## 5. CSS Styling

```css
/* Sender Settings Section */
.sender-settings-section {
  margin-bottom: 2rem;
  padding: 1.5rem;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  background-color: #fafafa;
}

.sender-fields-grid {
  display: grid;
  gap: 1rem;
}

/* Responsive grid layout */
@media (min-width: 768px) {
  .sender-fields-grid {
    grid-template-columns: 1fr 1fr;
    gap: 1.5rem;
  }
}

@media (min-width: 1024px) {
  .sender-fields-grid {
    grid-template-columns: 1fr 1fr 1fr;
    gap: 2rem;
  }
}

.form-field {
  display: flex;
  flex-direction: column;
}

.form-field label {
  font-weight: 600;
  margin-bottom: 0.5rem;
  color: #333;
}

.form-input,
.form-select {
  padding: 0.75rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 1rem;
  transition: border-color 0.2s ease;
}

.form-input:focus,
.form-select:focus {
  outline: none;
  border-color: #007bff;
  box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.25);
}

.help-text {
  margin-top: 0.25rem;
  font-size: 0.875rem;
  color: #666;
}

.loading-dropdown {
  padding: 0.75rem;
  background-color: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 4px;
  color: #6c757d;
  font-style: italic;
}

/* Error states */
.form-field.error .form-input,
.form-field.error .form-select {
  border-color: #dc3545;
}

.error-message {
  margin-top: 0.25rem;
  font-size: 0.875rem;
  color: #dc3545;
}
```

## 6. Validation Function

```javascript
const validateSenderFields = (formData) => {
  const errors = {};
  
  // Validate fromName
  if (formData.fromName && formData.fromName.length > 100) {
    errors.fromName = 'From name must be 100 characters or less';
  }
  
  // Validate fromEmail
  if (formData.fromEmail && !isValidEmail(formData.fromEmail)) {
    errors.fromEmail = 'Please enter a valid email address';
  }
  
  // Validate replyToEmail
  if (formData.replyToEmail && !isValidEmail(formData.replyToEmail)) {
    errors.replyToEmail = 'Please enter a valid reply-to email address';
  }
  
  return errors;
};

const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};
```

## 7. Complete React Component Example

```jsx
import React, { useState, useEffect } from 'react';

const CampaignForm = ({ onSuccess, onError }) => {
  const [campaignForm, setCampaignForm] = useState({
    name: '',
    subject: '',
    templateId: '',
    contactListId: '',
    fromName: 'Gravity Point Media',
    fromEmail: 'support@send.gravitypointmedia.com',
    replyToEmail: 'support@gravitypointmedia.com'
  });

  const [verifiedEmails, setVerifiedEmails] = useState([]);
  const [loadingEmails, setLoadingEmails] = useState(true);
  const [validationErrors, setValidationErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const loadIdentities = async () => {
      setLoadingEmails(true);
      const identities = await fetchVerifiedIdentities();
      setVerifiedEmails(identities);
      setLoadingEmails(false);
    };
    
    loadIdentities();
  }, []);

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setCampaignForm(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Clear validation error for this field
    if (validationErrors[name]) {
      setValidationErrors(prev => ({
        ...prev,
        [name]: null
      }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate form
    const errors = validateSenderFields(campaignForm);
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }
    
    setSubmitting(true);
    try {
      await handleCampaignSubmit(campaignForm);
    } catch (error) {
      onError?.(error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="campaign-form">
      {/* Other form fields... */}
      
      {/* Sender Settings Section */}
      <div className="sender-settings-section">
        <h3>Sender Settings</h3>
        <p className="section-description">Configure who the email appears to be from</p>
        
        <div className="sender-fields-grid">
          {/* From Name Field */}
          <div className={`form-field ${validationErrors.fromName ? 'error' : ''}`}>
            <label htmlFor="fromName">From Name</label>
            <input
              type="text"
              id="fromName"
              name="fromName"
              value={campaignForm.fromName}
              onChange={handleFormChange}
              placeholder="e.g., John Doe, Support Team"
              maxLength={100}
              className="form-input"
              aria-describedby="fromName-help"
            />
            <small id="fromName-help" className="help-text">
              The display name recipients will see as the sender
            </small>
            {validationErrors.fromName && (
              <span className="error-message" role="alert">
                {validationErrors.fromName}
              </span>
            )}
          </div>
          
          {/* From Email Field */}
          <div className={`form-field ${validationErrors.fromEmail ? 'error' : ''}`}>
            <label htmlFor="fromEmail">From Email Address</label>
            {loadingEmails ? (
              <div className="loading-dropdown" role="status" aria-live="polite">
                Loading verified emails...
              </div>
            ) : (
              <select
                id="fromEmail"
                name="fromEmail"
                value={campaignForm.fromEmail}
                onChange={handleFormChange}
                className="form-select"
                aria-describedby="fromEmail-help"
              >
                {verifiedEmails.map(email => (
                  <option key={email} value={email}>{email}</option>
                ))}
              </select>
            )}
            <small id="fromEmail-help" className="help-text">
              Select a verified email address to send from
            </small>
            {validationErrors.fromEmail && (
              <span className="error-message" role="alert">
                {validationErrors.fromEmail}
              </span>
            )}
          </div>
          
          {/* Reply-To Email Field */}
          <div className={`form-field ${validationErrors.replyToEmail ? 'error' : ''}`}>
            <label htmlFor="replyToEmail">Reply-To Email</label>
            <input
              type="email"
              id="replyToEmail"
              name="replyToEmail"
              value={campaignForm.replyToEmail}
              onChange={handleFormChange}
              placeholder="e.g., support@company.com"
              className="form-input"
              aria-describedby="replyToEmail-help"
            />
            <small id="replyToEmail-help" className="help-text">
              Where recipients' replies will be sent
            </small>
            {validationErrors.replyToEmail && (
              <span className="error-message" role="alert">
                {validationErrors.replyToEmail}
              </span>
            )}
          </div>
        </div>
      </div>
      
      <button 
        type="submit" 
        className="submit-button"
        disabled={submitting || loadingEmails}
      >
        {submitting ? 'Creating Campaign...' : 'Create Campaign'}
      </button>
    </form>
  );
};

export default CampaignForm;
```
