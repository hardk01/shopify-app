// Plan limits configuration
export const PLAN_LIMITS = {
  'FREE': {
    importLimit: 20,
    exportLimit: 20,
    platforms: ['Shopify', 'WooCommerce']
  },
  'SHOP PLAN': {
    importLimit: 100,
    exportLimit: 100,
    platforms: ['Shopify', 'WooCommerce', 'Wix', 'BigCommerce', 'Squarespace']
  },
  'WAREHOUSE PLAN': {
    importLimit: 300,
    exportLimit: 300,
    platforms: ['Shopify', 'WooCommerce', 'Squarespace', 'Amazon', 'Alibaba', 'Custom Sheet']
  },
  'FACTORY PLAN': {
    importLimit: 1000,
    exportLimit: 1000,
    platforms: ['Shopify', 'WooCommerce', 'Wix', 'BigCommerce', 'Squarespace', 'Amazon', 'Alibaba', 'Custom Sheet', 'AliExpress', 'Etsy']
  },
  'FRANCHISE PLAN': {
    importLimit: 3000,
    exportLimit: 3000,
    platforms: ['Shopify', 'WooCommerce', 'Wix', 'BigCommerce', 'Squarespace', 'Amazon', 'Alibaba', 'Custom Sheet', 'AliExpress', 'Etsy', 'Ebay']
  },
  'CITADEL PLAN': {
    importLimit: 50000,
    exportLimit: 50000,
    platforms: ['Shopify', 'WooCommerce', 'Wix', 'BigCommerce', 'Squarespace', 'Amazon', 'Alibaba', 'Custom Sheet', 'AliExpress', 'Etsy', 'Ebay']
  }
};

import { Subscription } from '../models/subscription.js';
import StoreStats from '../models/StoreStats.js';
import ImportExportEvent from '../models/ImportExportEvent.js';

// Helper function to check if a shop has exceeded their import/export limits
export async function checkPlanLimits(shopId, type, count) {
  try {
    // Get subscription
    const subscription = await Subscription.findOne({ shopId });
    if (!subscription) {
      throw new Error('No subscription found');
    }

    // Get current stats from ImportExportEvent
    let currentCount = 0;
    if (type === 'import' || type === 'export') {
      const agg = await ImportExportEvent.aggregate([
        { $match: { shopId: typeof shopId === 'string' ? new (require('mongoose').Types.ObjectId)(shopId) : shopId, type } },
        { $group: { _id: null, total: { $sum: '$count' } } }
      ]);
      currentCount = agg[0]?.total || 0;
    }

    // Get plan limits
    const planLimits = PLAN_LIMITS[subscription.plan];
    if (!planLimits) {
      throw new Error('Invalid plan');
    }

    const limit = type === 'import' ? planLimits.importLimit : planLimits.exportLimit;
    const remaining = limit - currentCount;

    // Check if the operation would exceed the limit
    if (currentCount + count > limit) {
      return {
        allowed: false,
        current: currentCount,
        limit,
        remaining,
        plan: subscription.plan
      };
    }

    return {
      allowed: true,
      current: currentCount,
      limit,
      remaining: remaining - count,
      plan: subscription.plan
    };
  } catch (error) {
    console.error('[Plan Limits] Error checking limits:', error);
    throw error;
  }
}

// Helper function to check if a platform is allowed for the plan
export function isPlatformAllowed(plan, platform) {
  const planLimits = PLAN_LIMITS[plan];
  if (!planLimits) return false;
  return planLimits.platforms.includes(platform);
} 