import { ActivityLog } from '../models/ActivityLog.js';

/**
 * Log an activity when user performs an action
 * @param {string} shopId - The shop ID
 * @param {string} shop - The shop domain
 * @param {string} type - Type of activity ('image_compression', 'webp_conversion', 'alt_text')
 * @param {number} count - Number of items processed in this action
 */
export async function logActivity(shopId, shop, type, count = 1) {
  try {
    const activityLog = new ActivityLog({
      shopId,
      shop,
      type,
      count
    });
    
    await activityLog.save();
    console.log(`Activity logged: ${type} - ${count} items for shop ${shop}`);
    return activityLog;
  } catch (error) {
    console.error('Error logging activity:', error);
    throw error;
  }
}

/**
 * Get activity statistics for a specific time period
 * @param {string} shopId - The shop ID
 * @param {number} days - Number of days to look back (7, 14, 30, etc.)
 * @returns {Object} Statistics object with totals by type
 */
export async function getActivityStats(shopId, days = 7) {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const activities = await ActivityLog.aggregate([
      {
        $match: {
          shopId: shopId,
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: '$type',
          totalCount: { $sum: '$count' },
          activityCount: { $sum: 1 }
        }
      }
    ]);
    
    // Format the results
    const stats = {
      imageCompression: 0,
      webpConversion: 0,
      altText: 0,
      period: `${days} days`,
      totalActivities: 0
    };
    
    activities.forEach(activity => {
      switch (activity._id) {
        case 'image_compression':
          stats.imageCompression = activity.totalCount;
          break;
        case 'webp_conversion':
          stats.webpConversion = activity.totalCount;
          break;
        case 'alt_text':
          stats.altText = activity.totalCount;
          break;
      }
      stats.totalActivities += activity.totalCount;
    });
    
    return stats;
  } catch (error) {
    console.error('Error getting activity stats:', error);
    throw error;
  }
}

/**
 * Get detailed activity logs with date breakdown
 * @param {string} shopId - The shop ID
 * @param {number} days - Number of days to look back
 * @returns {Array} Array of daily activity breakdowns
 */
export async function getDetailedActivityStats(shopId, days = 7) {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const activities = await ActivityLog.aggregate([
      {
        $match: {
          shopId: shopId,
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            date: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$createdAt"
              }
            },
            type: '$type'
          },
          totalCount: { $sum: '$count' }
        }
      },
      {
        $group: {
          _id: '$_id.date',
          activities: {
            $push: {
              type: '$_id.type',
              count: '$totalCount'
            }
          }
        }
      },
      {
        $sort: { '_id': -1 }
      }
    ]);
    
    return activities;
  } catch (error) {
    console.error('Error getting detailed activity stats:', error);
    throw error;
  }
}

/**
 * Get recent activity logs
 * @param {string} shopId - The shop ID
 * @param {number} limit - Number of recent activities to get
 * @returns {Array} Array of recent activity logs
 */
export async function getRecentActivities(shopId, limit = 10) {
  try {
    const activities = await ActivityLog.find({ shopId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    
    return activities;
  } catch (error) {
    console.error('Error getting recent activities:', error);
    throw error;
  }
}
