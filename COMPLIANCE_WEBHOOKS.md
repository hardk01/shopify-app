# Sbit: Image SEO Booster - Compliance Webhooks

This document outlines the mandatory compliance webhooks that have been implemented for your Sbit: Image SEO Booster app to meet GDPR and privacy requirements for public apps.

## Required Webhooks

Shopify requires all public apps to implement three mandatory webhooks for privacy compliance:

### 1. Customer Data Request (`CUSTOMERS_DATA_REQUEST`)
**File:** `app/routes/webhooks.customers.data_request.jsx`
**Purpose:** Handles requests from customers who want to access their personal data stored by your app.

**What it does:**
- Receives customer data request notifications
- Logs the request for compliance tracking
- Should compile and send customer data (currently logs only)

**Production Implementation Notes:**
- Gather all customer data from your database
- Compile it into a readable format (JSON, CSV, etc.)
- Send it to the customer via email or make it available for download
- Log the action for audit purposes

### 2. Customer Data Erasure (`CUSTOMERS_REDACT`)
**File:** `app/routes/webhooks.customers.redact.jsx`
**Purpose:** Handles requests to delete or anonymize customer data.

**What it does:**
- Receives customer data erasure requests
- Removes or anonymizes customer-specific data
- Logs the erasure for compliance tracking

**Production Implementation Notes:**
- Remove any customer-specific preferences or settings
- Anonymize activity logs containing customer information
- Delete any cached customer data
- Update references to maintain data integrity

### 3. Shop Data Erasure (`SHOP_REDACT`)
**File:** `app/routes/webhooks.shop.redact.jsx`
**Purpose:** Handles complete shop data deletion when a shop is closed or requests data deletion.

**What it does:**
- Removes all shop-related data from SQLite database (sessions)
- Removes all shop-related data from MongoDB:
  - Shop records
  - Activity logs
  - Subscription data
- Logs the erasure for compliance tracking

## Webhook Registration

The webhooks have been registered in `app/utilty/registerWebhooks.js` with these topics:
- `CUSTOMERS_DATA_REQUEST`
- `CUSTOMERS_REDACT`
- `SHOP_REDACT`

## Webhook URLs

The webhooks will be accessible at:
- `https://your-app-url.com/webhooks/customers/data_request`
- `https://your-app-url.com/webhooks/customers/redact`
- `https://your-app-url.com/webhooks/shop/redact`

## Data Handled by Your App

Based on your current models, the following data is handled:

### SQLite Database (Prisma)
- **Sessions:** Shop access tokens and user session data

### MongoDB Database
- **Shop:** Shop details, access tokens, preferences
- **ActivityLog:** Image compression, WebP conversion, and alt text activity
- **Subscription:** Billing and plan information
- **Contact:** Contact form submissions (if any customer data)

## Compliance Considerations

1. **Data Minimization:** Only collect and store data that's necessary for your app's functionality
2. **Data Retention:** Implement automatic data cleanup policies
3. **Audit Logs:** Keep logs of all data processing activities
4. **Response Time:** Respond to data requests within 30 days
5. **Data Export Format:** Provide data in a commonly used, machine-readable format

## Testing

To test these webhooks:
1. Use Shopify's webhook testing tools in the Partner Dashboard
2. Test with sample payloads to ensure proper data handling
3. Verify that all shop data is properly removed during shop redaction
4. Ensure customer data requests compile the correct information

## Important Notes

- These webhooks must return a 200 status code even if there are errors
- Shopify expects a response within 5 seconds
- Failed webhook deliveries will be retried by Shopify
- These endpoints are automatically verified by Shopify using HMAC signatures

## Next Steps

1. **Review Implementation:** Ensure all relevant data is handled in each webhook
2. **Add Audit Logging:** Implement detailed logging for compliance tracking
3. **Test Thoroughly:** Test with real shop data to ensure complete data removal
4. **Document Procedures:** Create internal procedures for handling data requests
5. **Regular Reviews:** Periodically review and update data handling procedures
