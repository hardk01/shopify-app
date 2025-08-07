import { authenticate } from "../shopify.server";
import db from "../db.server";
import { ActivityLog } from "../models/ActivityLog.js";
import { Shop } from "../models/Shop.js";
import { Subscription } from "../models/subscription.js";
import { generateSecureExport, sendCustomerDataEmail } from "../utils/customerDataService.js";

export const action = async ({ request }) => {
  const { payload, session, topic, shop } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);
  
  try {
    // Extract customer information from the payload
    const customerId = payload.customer?.id;
    const customerEmail = payload.customer?.email;
    const ordersRequested = payload.orders_requested || [];
    
    console.log(`Customer data request for customer ID: ${customerId}, email: ${customerEmail}`);
    
    // Gather all customer data from databases
    const customerData = {
      request: {
        customerId,
        email: customerEmail,
        dataRequested: new Date().toISOString(),
        shop: shop,
        ordersRequested: ordersRequested.length
      },
      data: {
        // Customer-specific data (minimal in this image app)
        personalData: {
          id: customerId,
          email: customerEmail,
          requestDate: new Date().toISOString()
        },
        
        // App-specific data related to the customer
        appInteractions: [],
        imageProcessingHistory: [],
        preferences: {}
      }
    };

    // Get shop information for context
    try {
      const shopRecord = await Shop.findOne({ shop: shop });
      if (shopRecord) {
        customerData.data.shopInfo = {
          shopDomain: shop,
          appInstallDate: shopRecord.createdAt,
          lastInteraction: shopRecord.lastLogin
        };
      }
    } catch (mongoError) {
      console.log('MongoDB not available or shop not found:', mongoError.message);
    }

    // Create a comprehensive data export
    const dataExport = {
      exportInfo: {
        exportDate: new Date().toISOString(),
        shopDomain: shop,
        customerId: customerId,
        customerEmail: customerEmail,
        appName: "Sbit: Image SEO Booster",
        exportType: "GDPR Customer Data Request"
      },
      customerData: customerData.data,
      summary: {
        totalRecords: 0,
        dataTypes: ["Personal Information", "App Interactions"],
        note: "This app primarily handles shop-level image processing. Customer-specific data is minimal."
      }
    };

    // Generate secure export file and send email
    try {
      const exportInfo = await generateSecureExport(dataExport, customerId);
      
      // Send email with download link
      await sendCustomerDataEmail(customerEmail, exportInfo);
      
      console.log(`Customer data export sent to ${customerEmail}:`, {
        exportId: exportInfo.exportId,
        expiresAt: exportInfo.expiresAt
      });
      
    } catch (emailError) {
      // If email fails, still log the successful data processing
      console.error('Failed to send customer data email:', emailError);
      console.log('Customer data was processed but email delivery failed:', {
        customerId,
        email: customerEmail,
        shop: shop
      });
    }

    // Log the comprehensive data request for audit trail
    console.log('Customer data export generated:', {
      customerId,
      email: customerEmail,
      shop: shop,
      exportSize: JSON.stringify(dataExport).length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error processing customer data request:', error);
    // Don't throw - Shopify expects a 200 response even if there's an error
  }

  return new Response();
};
