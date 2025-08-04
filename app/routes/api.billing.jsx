import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { Subscription } from "../models/subscription.js";
import { Shop } from "../models/Shop.js";
import { connectDatabase } from "../utilty/database.js";
import { getSubscriptionData, getPlanLimits } from '../utils/subscriptionUtils.js';

const plans = {
  'FREE': { name: 'Free', price: 0, trial_days: 0 },
  'SHOP PLAN': { name: 'Shop Plan', price: 9.99, trial_days: 7 },
  'WAREHOUSE PLAN': { name: 'Warehouse Plan', price: 14.99, trial_days: 7 },
  'FACTORY PLAN': { name: 'Factory Plan', price: 49.99, trial_days: 7 },
  'CITADEL PLAN': { name: 'Citadel Plan', price: 99, trial_days: 7 },
};

const APP_URL = "admin.shopify.com/store/tcxceststore12345"; // <-- Set your real app URL here

export const loader = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);
  
  try {
    // Try to connect to database
    try {
      await connectDatabase();
    } catch (dbError) {
      // Database connection failed, using fallback data
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

    // Get subscription data from Shopify GraphQL with database fallback and FREE plan enforcement
    const subscriptionData = await getSubscriptionData(admin, session.shop, Shop, Subscription);
    
    // Get usage counts from database (these are still tracked locally)
    let usageCounts = { imageCompressCount: 0, webPConvertCount: 0, altTextCount: 0 };
    try {
      // Refresh subscription data after potential updates
      subscription = await Subscription.findOne({ shopId: shopRecord._id });
      if (subscription) {
        usageCounts = {
          imageCompressCount: subscription.imageCompressCount || 0,
          webPConvertCount: subscription.webPConvertCount || 0,
          altTextCount: subscription.altTextCount || 0,
        };
      }
    } catch (error) {
      // Error fetching usage counts - use defaults
    }

    // Get plan limits
    const planLimits = getPlanLimits(subscriptionData.plan);

    return json({
      subscription: {
        plan: subscriptionData.plan,
        status: subscriptionData.status,
        shopifySubscription: subscriptionData.shopifySubscription,
        ...usageCounts,
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
    // Error fetching subscription - return fallback
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