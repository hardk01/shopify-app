import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { Subscription } from "../models/subscription.js";
import { Shop } from "../models/Shop.js";
import { connectDatabase } from "../utilty/database.js";

const plans = {
  'FREE': { name: 'Free', price: 0, trial_days: 0 },
  'SHOP PLAN': { name: 'Shop Plan', price: 9.99, trial_days: 7 },
  'WAREHOUSE PLAN': { name: 'Warehouse Plan', price: 14.99, trial_days: 7 },
  'FACTORY PLAN': { name: 'Factory Plan', price: 49.99, trial_days: 7 },
  'CITADEL PLAN': { name: 'Citadel Plan', price: 99, trial_days: 7 },
};

const APP_URL = "admin.shopify.com/store/tcxceststore12345"; // <-- Set your real app URL here

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  
  try {
    // Try to connect to database
    try {
      await connectDatabase();
    } catch (dbError) {
      console.warn('Database connection failed, using fallback data:', dbError.message);
      // Return fallback data if database is not available
      return json({
        subscription: {
          plan: "FREE",
          status: "active",
          imageCompressCount: 0,
          webPConvertCount: 0,
          altTextCount: 0,
          limits: {
            imageCompressLimit: 200,
            webPConvertLimit: 50,
            altTextLimit: 50
          }
        },
        plans: [
          { name: "FREE" },
          { name: "SHOP PLAN" },
          { name: "WAREHOUSE PLAN" },
          { name: "FACTORY PLAN" },
          { name: "CITADEL PLAN" }
        ]
      });
    }
    
    // Find or create shop record
    let shopRecord = await Shop.findOne({ shop: session.shop });
    if (!shopRecord) {
      shopRecord = await Shop.create({
        shop: session.shop,
        name: session.shop,
        myshopifyDomain: session.shop,
        plan: 'FREE',
        accessToken: session.accessToken
      });
    }

    // Find or create subscription record
    let subscription = await Subscription.findOne({ shopId: shopRecord._id });
    if (!subscription) {
      subscription = await Subscription.create({
        shopId: shopRecord._id,
        plan: 'FREE',
        status: 'active',
        accessToken: session.accessToken
      });
    }

    // Get plan limits
    const planLimits = subscription.getPlanLimits();

    return json({
      subscription: {
        plan: subscription.plan,
        status: subscription.status,
        imageCompressCount: subscription.imageCompressCount,
        webPConvertCount: subscription.webPConvertCount,
        altTextCount: subscription.altTextCount,
        limits: planLimits
      },
      plans: [
        { name: "FREE" },
        { name: "SHOP PLAN" },
        { name: "WAREHOUSE PLAN" },
        { name: "FACTORY PLAN" },
        { name: "CITADEL PLAN" }
      ]
    });
  } catch (error) {
    console.error('Error fetching subscription:', error);
    return json({
      subscription: {
        plan: "FREE",
        status: "active",
        imageCompressCount: 0,
        webPConvertCount: 0,
        altTextCount: 0,
        limits: {
          imageCompressLimit: 200,
          webPConvertLimit: 50,
          altTextLimit: 50
        }
      },
      plans: [
        { name: "FREE" },
        { name: "SHOP PLAN" },
        { name: "WAREHOUSE PLAN" },
        { name: "FACTORY PLAN" },
        { name: "CITADEL PLAN" }
      ]
    });
  }
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const plan = formData.get('plan');
  const shop = formData.get('shop');
  const selectedPlan = plans[plan];

  if (!plan || !shop || !selectedPlan) {
    return json({ error: 'Invalid plan or shop' }, { status: 400 });
  }

  if (selectedPlan.price === 0) {
    return json({ confirmationUrl: null });
  }

  // Build the embedded admin return URL
  const returnUrl = `https://${shop}/admin/apps/${process.env.SHOPIFY_API_KEY}/app/billing?shop=${shop}&plan=${plan}`;

  // Create a real recurring application charge for paid plans
  const response = await fetch(
    `https://${shop}/admin/api/2024-01/recurring_application_charges.json`,
    {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': session.accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recurring_application_charge: {
          name: selectedPlan.name,
          price: selectedPlan.price,
          return_url: returnUrl,
          test: process.env.NODE_ENV !== 'production',
        },
      }),
    }
  );
  const data = await response.json();
  if (!response.ok) {
    return json({ error: data.errors || 'Failed to create charge' }, { status: 400 });
  }
  return json({ confirmationUrl: data.recurring_application_charge.confirmation_url });
}; 