import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { connectDatabase } from "../utilty/database.js";
import { Shop } from "../models/Shop.js";
import { logActivity } from "../utils/activityLogger.js";

export async function action({ request }) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const { admin, session } = await authenticate.admin(request);
    const { type, count, batchId } = await request.json();

    if (!type || !count) {
      return json({ error: "Missing required fields: type and count" }, { status: 400 });
    }

    // Validate activity type
    const validTypes = ['image_compression', 'webp_conversion', 'alt_text'];
    if (!validTypes.includes(type)) {
      return json({ error: "Invalid activity type" }, { status: 400 });
    }

    // Connect to database and get shop record
    await connectDatabase();
    const shopRecord = await Shop.findOne({ shop: session.shop });
    
    if (!shopRecord) {
      return json({ error: "Shop not found" }, { status: 404 });
    }

    // Log the batch activity
    await logActivity(shopRecord._id, session.shop, type, count, batchId);

    return json({ 
      success: true,
      logged: {
        type,
        count,
        shop: session.shop,
        batchId
      }
    });

  } catch (error) {
    console.error("Error logging batch activity:", error);
    return json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
}