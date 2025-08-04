import { connectDatabase } from "./database";
import { encrypt, decrypt } from "./encryption";

// Import MongoDB models
import { CustomerData } from "../models/CustomerData";
import { DataRequest } from "../models/DataRequest";
import { DataRedaction } from "../models/DataRedaction";

/**
 * Handle customer data request (GDPR)
 */
export async function handleCustomersDataRequest(shop, request) {
  try {
    await connectDatabase();
    const payload = await request.json();
    const customerId = payload.customer?.id || payload.customer_id;
    
    if (!customerId) {
      throw new Error("No customer ID found in payload");
    }

    // Get all customer data from MongoDB
    const customerData = await CustomerData.find({
      shop,
      customerId: customerId.toString()
    });

    // Encrypt the data
    const encryptedData = await encrypt(JSON.stringify(customerData));

    // Store the encrypted data in MongoDB
    await DataRequest.create({
      shop,
      customerId: customerId.toString(),
      data: encryptedData,
      type: 'DATA_REQUEST',
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
    });

    console.log(`[GDPR] Data request processed for customer ${customerId} in shop ${shop}`);
    return true;
  } catch (error) {
    console.error(`[GDPR] Error processing data request:`, error);
    throw error;
  }
}

/**
 * Handle customer data redaction (GDPR)
 */
export async function handleCustomerRedaction(shop, request) {
  try {
    await connectDatabase();
    const payload = await request.json();
    const customerId = payload.customer?.id || payload.customer_id;
    
    if (!customerId) {
      throw new Error("No customer ID found in payload");
    }

    // Delete customer data from MongoDB
    const deletedCount = await CustomerData.deleteMany({
      shop,
      customerId: customerId.toString()
    });

    // Log the redaction in MongoDB
    await DataRedaction.create({
      shop,
      customerId: customerId.toString(),
      type: 'CUSTOMER_REDACT',
      timestamp: new Date()
    });

    console.log(`[GDPR] Redacted ${deletedCount.deletedCount} records for customer ${customerId} in shop ${shop}`);
    return true;
  } catch (error) {
    console.error(`[GDPR] Error processing customer redaction:`, error);
    throw error;
  }
}

/**
 * Handle shop data redaction (GDPR)
 */
export async function handleShopRedaction(shop, request) {
  try {
    await connectDatabase();
    
    // Delete all shop data from MongoDB
    const deletedData = await CustomerData.deleteMany({ shop });

    // Log the redaction in MongoDB
    await DataRedaction.create({
      shop,
      type: 'SHOP_REDACT',
      timestamp: new Date()
    });

    console.log(`[GDPR] Redacted shop data for ${shop}:`, {
      deletedDataRecords: deletedData.deletedCount
    });

    return true;
  } catch (error) {
    console.error(`[GDPR] Error processing shop redaction:`, error);
    throw error;
  }
}

/**
 * Clean up expired data requests
 */
export async function cleanupExpiredData() {
  try {
    await connectDatabase();
    const result = await DataRequest.deleteMany({
      expiresAt: {
        $lt: new Date()
      }
    });

    console.log(`[GDPR] Cleaned up ${result.deletedCount} expired data requests`);
    return result.deletedCount;
  } catch (error) {
    console.error(`[GDPR] Error cleaning up expired data:`, error);
    throw error;
  }
}

/**
 * Schedule regular cleanup of expired data
 */
export function scheduleCleanup() {
  // Run cleanup daily
  setInterval(async () => {
    try {
      await cleanupExpiredData();
    } catch (error) {
      console.error('[GDPR] Scheduled cleanup failed:', error);
    }
  }, 24 * 60 * 60 * 1000); // 24 hours

  // Run initial cleanup
  cleanupExpiredData().catch(error => {
    console.error('[GDPR] Initial cleanup failed:', error);
  });
} 