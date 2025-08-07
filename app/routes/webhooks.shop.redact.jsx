import { authenticate } from "../shopify.server";
import db from "../db.server";
import { Shop } from "../models/Shop.js";
import { ActivityLog } from "../models/ActivityLog.js";
import { Subscription } from "../models/subscription.js";

export const action = async ({ request }) => {
  const { payload, session, topic, shop } = await authenticate.webhook(request);

  console.log(`[Sbit: Image SEO Booster] Received ${topic} webhook for ${shop}`);
  
  try {
    // Extract shop information from the payload
    const shopId = payload.shop_id;
    const shopDomain = payload.shop_domain;
    
    console.log(`[Sbit: Image SEO Booster] Shop data erasure request for shop: ${shopDomain} (ID: ${shopId})`);
    
    if (shopDomain || shop) {
      const targetShop = shopDomain || shop;
      
      console.log(`[Sbit: Image SEO Booster] Erasing all data for shop: ${targetShop}`);
      
      // Remove all sessions for this shop (SQLite/Prisma)
      await db.session.deleteMany({
        where: { shop: targetShop }
      });
      console.log(`[Sbit: Image SEO Booster] Deleted SQLite sessions for: ${targetShop}`);
      
      // Remove MongoDB data for this shop
      try {
        // Delete shop record
        await Shop.deleteMany({ shop: targetShop });
        console.log(`[Sbit: Image SEO Booster] Deleted shop record for: ${targetShop}`);
        
        // Delete all activity logs for this shop
        await ActivityLog.deleteMany({ shop: targetShop });
        console.log(`[Sbit: Image SEO Booster] Deleted activity logs for: ${targetShop}`);
        
        // Delete subscription data for this shop
        await Subscription.deleteMany({ shopId: targetShop });
        console.log(`[Sbit: Image SEO Booster] Deleted subscription data for: ${targetShop}`);
        
        // Additional cleanup for Sbit: Image SEO Booster data
        // If you have collections for:
        // - Image compression metadata
        // - WebP conversion records  
        // - Alt text optimization history
        // - SEO performance metrics
        // - Processing queues
        // Add their deletion here
        
      } catch (mongoError) {
        console.error(`[Sbit: Image SEO Booster] Error deleting MongoDB data for shop ${targetShop}:`, mongoError);
        // Continue processing even if MongoDB deletion fails
      }
      
      console.log(`[Sbit: Image SEO Booster] Shop data erasure completed for shop: ${targetShop}`);
    }
    
  } catch (error) {
    console.error('[Sbit: Image SEO Booster] Error processing shop data erasure:', error);
    // Don't throw - Shopify expects a 200 response even if there's an error
  }

  return new Response();
};
