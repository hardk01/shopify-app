# Environment Variables for Sbit: Image SEO Booster Customer Data Webhooks

Add these environment variables to your `.env` file to enable email functionality for customer data requests in Sbit: Image SEO Booster:

## Email Configuration (Required for Production)

```env
# SMTP Email Settings
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-app-email@gmail.com
SMTP_PASS=your-app-password-or-app-specific-password
SMTP_FROM=your-app-email@gmail.com

# Your app URL (already should exist)
SHOPIFY_APP_URL=https://your-app-domain.com
```

## Email Service Options

### Option 1: Gmail
- Use Gmail SMTP with an App Password
- Enable 2FA and create an App Password
- Host: smtp.gmail.com, Port: 587

### Option 2: SendGrid
```env
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=your-sendgrid-api-key
```

### Option 3: Mailgun
```env
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_USER=your-mailgun-username
SMTP_PASS=your-mailgun-password
```

### Option 4: AWS SES
```env
SMTP_HOST=email-smtp.us-east-1.amazonaws.com
SMTP_PORT=587
SMTP_USER=your-aws-access-key
SMTP_PASS=your-aws-secret-key
```

## Development Mode
If email credentials are not provided, the webhook will:
- Still process the data request
- Log all data to console
- Skip email sending (with warning logs)
- Return successful response to Shopify

## Security Notes
- Never commit email credentials to version control
- Use environment-specific credentials
- Consider using email service API keys instead of passwords
- Set up proper SPF/DKIM records for your domain
