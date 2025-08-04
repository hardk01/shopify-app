import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { connectDatabase } from "../utilty/database.js";
import { Shop } from "../models/Shop.js";
import { getActivityStats, getDetailedActivityStats, getRecentActivities } from "../utils/activityLogger.js";
import mongoose from 'mongoose';

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  
  try {
    await connectDatabase();
    
    const url = new URL(request.url);
    const days = parseInt(url.searchParams.get('days') || url.searchParams.get('range')) || 7;
    const detailed = url.searchParams.get('detailed') === 'true';
    const recent = url.searchParams.get('recent') === 'true';
    const shopParam = url.searchParams.get('shop');
    
    // Use shop from URL parameter if provided, otherwise use session shop
    const shopDomain = shopParam || session.shop;
    
    // Find shop record
    const shopRecord = await Shop.findOne({ shop: shopDomain });
    if (!shopRecord) {
      return json({ error: 'Shop not found' }, { status: 404 });
    }
    
    const shopId = new mongoose.Types.ObjectId(shopRecord._id);
    
    let result = {};
    
    if (recent) {
      const limit = parseInt(url.searchParams.get('limit')) || 10;
      result.recentActivities = await getRecentActivities(shopId, limit);
    }
    
    if (detailed) {
      result.detailedStats = await getDetailedActivityStats(shopId, days);
    }
    
    // Always include basic stats
    result.stats = await getActivityStats(shopId, days);
    
    return json({
      success: true,
      data: result,
      // Also provide flat structure for backward compatibility
      imageCompressCount: result.stats?.imageCompression || 0,
      webPConvertCount: result.stats?.webpConversion || 0,
      altTextCount: result.stats?.altText || 0,
      totalActivities: result.stats?.totalActivities || 0,
      period: result.stats?.period || `${days} days`
    });
    
  } catch (error) {
    console.error('Error fetching activity stats:', error);
    return json({
      success: false,
      error: 'Failed to fetch activity statistics',
      details: error.message
    }, { status: 500 });
  }
}
