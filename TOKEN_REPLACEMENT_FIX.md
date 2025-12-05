# Token Replacement Fix - First Name & Other Personalization Tokens

## Issue Found
The UI was instructing users to use `{{first_name}}` format (with underscores), but the worker code was only replacing `{{firstName}}` format (camelCase). This caused personalization tokens to not work.

## Token Format Mismatch
- **UI Documentation**: `{{first_name}}`, `{{last_name}}`, `{{company}}`, `{{current_date}}`
- **Worker Code** (before fix): Only supported `{{firstName}}`, `{{lastName}}`
- **Template Middleware**: Correctly supported `{{first_name}}` format

## Files Updated

### 1. `/server/worker/src/durable/campaign.js`
**Function**: `personalizeContent(content, recipient)`

**Changes**:
- Added support for `{{first_name}}` (primary format shown in UI)
- Kept backward compatibility with `{{firstName}}` (camelCase)
- Added support for `{{last_name}}`, `{{company}}`, `{{current_date}}`
- Now replaces both underscore and camelCase formats

**Supported Tokens** (both formats work):
- `{{first_name}}` or `{{firstName}}` → Contact's first name
- `{{last_name}}` or `{{lastName}}` → Contact's last name
- `{{email}}` → Contact's email
- `{{company}}` → Contact's company
- `{{current_date}}` → Current date
- Any custom fields: `{{custom_field_name}}`

### 2. `/server/src/services/turtleSendingService.js`
**Function**: Token replacement in email content

**Changes**:
- Updated to support both `{{first_name}}` and `{{firstName}}`
- Added `{{company}}` and `{{current_date}}` tokens
- Now consistent with worker implementation

## Deployment Status
✅ **Worker Deployed**: Version `703712ae-f533-4fd3-963c-e95cc703f20c`
- Deployed at: https://gpm-email-tracking-worker.ilustrisimo-rouie.workers.dev
- Upload: 127.17 KiB / gzip: 21.99 KiB
- All bindings configured correctly

## Testing
To verify the fix works:

1. **Create a test template** with tokens:
   ```
   Subject: Hello {{first_name}}!
   
   Content:
   Hi {{first_name}} {{last_name}},
   
   Your email is {{email}}.
   Company: {{company}}
   Date: {{current_date}}
   ```

2. **Create a test campaign** using this template

3. **Send to a contact** with:
   - firstName: "John"
   - lastName: "Doe"
   - email: "john@example.com"
   - company: "Test Inc"

4. **Expected Result**:
   ```
   Subject: Hello John!
   
   Content:
   Hi John Doe,
   
   Your email is john@example.com.
   Company: Test Inc
   Date: 12/5/2025
   ```

## Backward Compatibility
Both token formats are now supported:
- `{{first_name}}` ✅ (recommended - shown in UI)
- `{{firstName}}` ✅ (legacy - still works)

Existing templates using either format will continue to work.

## Summary
✅ Fixed token replacement to match UI documentation
✅ Added missing tokens (company, current_date)
✅ Maintained backward compatibility
✅ Updated both worker and server code
✅ Deployed to production
