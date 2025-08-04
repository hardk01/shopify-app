import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { Subscription } from "../models/subscription.js";
import { Shop } from "../models/Shop.js";
import { connectDatabase } from "../utilty/database.js";
import { logActivity } from "../utils/activityLogger.js";

export async function action({ request }) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const { admin, session } = await authenticate.admin(request);
    const { imageIds, altText, altType, skipActivityLog } = await request.json();

    if (!Array.isArray(imageIds) || imageIds.length === 0 || !altText || !altType) {
      return json({ error: "Missing required fields" }, { status: 400 });
    }

    let subscription = null;
    let shopRecord = null;
    try {
      await connectDatabase();
      shopRecord = await Shop.findOne({ shop: session.shop });
      if (!shopRecord) {
        shopRecord = await Shop.create({
          shop: session.shop,
          name: session.shop,
          myshopifyDomain: session.shop,
          plan: 'FREE',
          accessToken: session.accessToken
        });
      }
      subscription = await Subscription.findOne({ shopId: shopRecord._id });
      if (!subscription) {
        subscription = await Subscription.create({
          shopId: shopRecord._id,
          plan: 'FREE',
          status: 'active',
          accessToken: session.accessToken
        });
      }
      // Check plan limits
      if (subscription.hasExceededImageLimits('alt', imageIds.length)) {
        const limits = subscription.getPlanLimits();
        const remaining = subscription.getRemainingQuota('alt');
        return json({
          success: false,
          error: `Plan limit exceeded. Your ${subscription.plan} plan allows ${limits.altTextLimit} alt text updates. You have ${remaining} remaining. Please upgrade your plan to continue.`,
          limitExceeded: true,
          currentPlan: subscription.plan,
          limit: limits.altTextLimit,
          remaining: remaining
        }, { status: 403 });
      }
    } catch (dbError) {
      console.warn('Database connection failed, proceeding without plan limits:', dbError.message);
    }

    // Update all images
    for (const imageId of imageIds) {
      await admin.graphql(`
        mutation fileUpdate($files: [FileUpdateInput!]!) {
          fileUpdate(files: $files) {
            files {
              ... on MediaImage {
                id
                alt
              }
            }
            userErrors {
              field
              message
            }
          }
        }
      `, {
        variables: {
          files: [
            {
              id: imageId,
              alt: altText
            }
          ]
        }
      });

      // Save the alt type to metafield
      await admin.graphql(`
        mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafields) {
            metafields {
              id
              namespace
              key
              value
            }
            userErrors {
              field
              message
            }
          }
        }
      `, {
        variables: {
          metafields: [
            {
              ownerId: imageId,
              namespace: "custom",
              key: "alt_type",
              value: altType,
              type: "single_line_text_field"
            }
          ]
        }
      });
    }

    // Increment the alt text count by the number of images updated
    if (subscription) {
      await subscription.incrementImageCount('alt', imageIds.length);
      
      // Log activity for statistics only if not part of a batch operation
      if (!skipActivityLog) {
        try {
          await logActivity(shopRecord._id, session.shop, 'alt_text', imageIds.length);
        } catch (logError) {
          console.error('Failed to log activity:', logError);
          // Don't fail the main operation if logging fails
        }
      }
    }

    return json({
      success: true,
      updated: imageIds.length,
      usage: subscription ? {
        current: subscription.altTextCount + imageIds.length,
        limit: subscription.getPlanLimits().altTextLimit,
        remaining: subscription.getRemainingQuota('alt') - imageIds.length
      } : {
        current: 0,
        limit: 50,
        remaining: 50
      }
    });

  } catch (error) {
    console.error("Error updating alt text:", error);
    return json({
      success: false,
      error: error.message || "Failed to update alt text"
    }, { status: 500 });
  }
} 