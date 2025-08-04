import { Subscription } from '../models/subscription.js';
import mongoose from 'mongoose';
import { PLANS } from '../config/plans.js';
import { Shop } from '../models/Shop.js';

export async function checkSubscriptionQuota(shop) {
  if (!shop) {
    return { error: 'Shop parameter is required', status: 400 };
  }

  try {
    // First find the shop to get its ID
    const shopDoc = await Shop.findOne({ shop });
    if (!shopDoc) {
      return { error: 'Shop not found', status: 404 };
    }

    // Now find subscription using shop's ID
    const subscription = await Subscription.findOne({ shopId: shopDoc._id });
    
    // If no subscription exists, create a free one
    if (!subscription) {
      return {
        subscription: {
          plan: 'FREE',
          status: 'active',
          importCount: 0,
          exportCount: 0,
          nextBillingDate: null,
          limits: PLANS['FREE']
        }
      };
    }

    // Check if subscription is active
    if (subscription.status !== 'active') {
      return {
        error: 'Subscription is not active',
        status: 403,
        subscription: {
          plan: subscription.plan,
          status: subscription.status,
          nextBillingDate: subscription.nextBillingDate,
        },
        upgradeUrl: `/app/billing?shop=${shop}`
      };
    }

    // Check if quota is exceeded
    const limit = PLANS[subscription.plan].importLimit;

    return { 
      subscription: {
        plan: subscription.plan,
        status: subscription.status,
        importCount: subscription.importCount,
        limits: PLANS[subscription.plan]
      }
    };
  } catch (error) {
    return { error: 'Failed to check subscription quota', status: 500 };
  }
}

export async function requireActiveSubscription(shopId) {
  try {
    // Ensure shopId is an ObjectId
    const objectId = typeof shopId === 'string' ? mongoose.Types.ObjectId(shopId) : shopId;
    
    const subscription = await Subscription.findOne({
      shopId: objectId,
      status: 'active'
    });

    if (!subscription) {
      const error = new Error('Active subscription required');
      error.status = 402; // Payment Required
      throw error;
    }

    // Check if subscription is about to expire (within 7 days)
    if (subscription.nextBillingDate) {
      const daysUntilExpiry = Math.ceil((subscription.nextBillingDate - new Date()) / (1000 * 60 * 60 * 24));
      if (daysUntilExpiry <= 7) {
      }
    }

    return subscription;
  } catch (err) {
    throw err;
  }
}

export async function incrementUsage(shopId, type = 'import') {
  try {
    const updateField = type === 'import' ? 'importCount' : 'exportCount';
    
    // First check if subscription exists
    let subscription = await Subscription.findOne({ shopId });
    
    if (!subscription) {
      // Get shop to get access token
      const shop = await Shop.findOne({ _id: shopId });
      if (!shop) {
        throw new Error('Shop not found');
      }
      
      // Create new free subscription
      subscription = await Subscription.create({
        shopId,
        accessToken: shop.accessToken,
        plan: 'FREE',
        status: 'active',
        importCount: 0,
        exportCount: 0,
        nextBillingDate: null,
        limits: PLANS['FREE']
      });
    }

    // Now increment the count
    subscription = await Subscription.findOneAndUpdate(
      { shopId },
      { $inc: { [updateField]: 1 } },
      { new: true }
    );

    if (!subscription) {
      throw new Error('Failed to update subscription');
    }

    return subscription;
  } catch (error) {
    throw error;
  }
}

export async function checkPlatformAccess(shopId, platform) {
  try {
    const subscription = await Subscription.findOne({ shopId });
    
    if (!subscription) {
      return false;
    }

    const limits = PLANS[subscription.plan];
    return limits.platforms.includes(platform);
  } catch (error) {
    return false;
  }
} 