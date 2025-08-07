// Email service for customer data requests
// This is a helper service for sending customer data exports

import nodemailer from 'nodemailer';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// Configure email transporter (update with your email service)
const createTransporter = () => {
  // Example using SMTP (update with your email service credentials)
  return nodemailer.createTransporter({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: process.env.SMTP_PORT || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
};

// Generate secure download link
export const generateSecureExport = async (customerData, customerId) => {
  const exportId = crypto.randomUUID();
  const filename = `customer-data-${customerId}-${exportId}.json`;
  
  // Create exports directory if it doesn't exist
  const exportsDir = path.join(process.cwd(), 'data-exports');
  if (!fs.existsSync(exportsDir)) {
    fs.mkdirSync(exportsDir, { recursive: true });
  }
  
  const filepath = path.join(exportsDir, filename);
  
  // Save export file
  fs.writeFileSync(filepath, JSON.stringify(customerData, null, 2));
  
  // Return export info
  return {
    exportId,
    filename,
    filepath,
    downloadUrl: `${process.env.SHOPIFY_APP_URL}/data-export/${exportId}`,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
  };
};

// Send customer data email
export const sendCustomerDataEmail = async (customerEmail, exportInfo) => {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log('Email credentials not configured, skipping email send');
    return;
  }

  const transporter = createTransporter();
  
  const emailTemplate = `
    <h2>Your Data Export Request</h2>
    <p>Dear Customer,</p>
    
    <p>We have processed your request for a copy of your personal data stored by our Sbit: Image SEO Booster app.</p>
    
    <p><strong>Download your data:</strong><br>
    <a href="${exportInfo.downloadUrl}" style="background-color: #0066cc; color: white; padding: 10px 15px; text-decoration: none; border-radius: 4px;">Download Data Export</a></p>
    
    <p><strong>Important Information:</strong></p>
    <ul>
      <li>This download link will expire on ${exportInfo.expiresAt.toLocaleDateString()}</li>
      <li>The file contains all personal data we have stored about you</li>
      <li>If you have any questions, please contact our support team</li>
    </ul>
    
    <p>Thank you for using our app.</p>
    
    <p>Best regards,<br>
    The Sbit: Image SEO Booster Team</p>
    
    <hr>
    <p style="font-size: 12px; color: #666;">
    This email was sent in response to your GDPR data request. 
    If you did not request this data export, please contact our support team immediately.
    </p>
  `;

  const mailOptions = {
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: customerEmail,
    subject: 'Your Data Export is Ready',
    html: emailTemplate
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Data export email sent to ${customerEmail}`);
  } catch (error) {
    console.error('Error sending data export email:', error);
    throw error;
  }
};

// Clean up expired exports (run this periodically)
export const cleanupExpiredExports = () => {
  const exportsDir = path.join(process.cwd(), 'data-exports');
  
  if (!fs.existsSync(exportsDir)) {
    return;
  }

  const files = fs.readdirSync(exportsDir);
  const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);

  files.forEach(file => {
    const filepath = path.join(exportsDir, file);
    const stats = fs.statSync(filepath);
    
    if (stats.mtime.getTime() < thirtyDaysAgo) {
      fs.unlinkSync(filepath);
      console.log(`Cleaned up expired export: ${file}`);
    }
  });
};
