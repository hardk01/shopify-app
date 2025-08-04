// Utility functions for subscription management

// Helper function to ensure database subscription exists and is properly set
export const ensureDatabaseSubscription = async (shopDomain, plan, Shop, Subscription) => {
  try {
    let shop = await Shop.findOne({ shop: shopDomain });
    if (!shop) {
      shop = await Shop.create({
        shop: shopDomain,
        name: shopDomain,
        myshopifyDomain: shopDomain,
        plan: plan,
      });
    }

    let subscription = await Subscription.findOne({ shopId: shop._id });
    if (!subscription) {
      subscription = await Subscription.create({
        shopId: shop._id,
        plan: plan,
        status: 'active',
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      });
    } else if (subscription.plan !== plan) {
      subscription.plan = plan;
      subscription.status = 'active';
      await subscription.save();
    }

    return { shop, subscription };
  } catch (error) {
    console.error('❌ Error ensuring database subscription:', error);
    throw error;
  }
};

export const mapShopifySubscriptionToPlan = (shopifySubscription) => {
  if (!shopifySubscription || !shopifySubscription.name) {
    return 'FREE';
  }
  
  const subscriptionName = shopifySubscription.name.toLowerCase();
  
  if (subscriptionName.includes('shop')) {
    return 'SHOP PLAN';
  } else if (subscriptionName.includes('warehouse')) {
    return 'WAREHOUSE PLAN';
  } else if (subscriptionName.includes('factory')) {
    return 'FACTORY PLAN';
  } else if (subscriptionName.includes('citadel')) {
    return 'CITADEL PLAN';
  }
  
  return 'FREE';
};

export const getPlanLimits = (plan) => {
  switch (plan) {
    case 'SHOP PLAN':
      return { imageCompressLimit: 500, webPConvertLimit: 200, altTextLimit: 500 };
    case 'WAREHOUSE PLAN':
      return { imageCompressLimit: 1000, webPConvertLimit: 500, altTextLimit: 500 };
    case 'FACTORY PLAN':
      return { imageCompressLimit: 2000, webPConvertLimit: 500, altTextLimit: 500 };
    case 'CITADEL PLAN':
      return { imageCompressLimit: 5000, webPConvertLimit: 5000, altTextLimit: 5000 };
    default: // FREE
      return { imageCompressLimit: 200, webPConvertLimit: 50, altTextLimit: 50 };
  }
};

export const fetchShopifySubscription = async (admin) => {
  try {
    // Check if admin object has the necessary properties
    if (!admin || !admin.graphql) {
      return null;
    }

    // Additional check to ensure the admin client is properly initialized
    try {
      // Try a simple test query first to validate the session
      const testResponse = await admin.graphql(`
        query {
          shop {
            id
            name
          }
        }
      `);
      const testData = await testResponse.json();
      
      if (testData.errors) {
        console.log('⚠️ GraphQL client authentication issue:', testData.errors);
        return null;
      }
      
    } catch (testError) {
      return null;
    }
    
    // First try to get active subscriptions
    const response = await admin.graphql(`
      query GetAppSubscription {
        app {
          installation {
            activeSubscriptions {
              id
              name
              status
              currentPeriodEnd
              trialDays
              returnUrl
              test
              lineItems {
                id
                plan {
                  pricingDetails {
                    ... on AppRecurringPricing {
                      price {
                        amount
                        currencyCode
                      }
                      interval
                    }
                  }
                }
              }
            }
          }
        }
      }
    `);
    
    const subscriptionData = await response.json();
    
    if (subscriptionData?.data?.app?.installation?.activeSubscriptions?.length > 0) {
      const subscription = subscriptionData.data.app.installation.activeSubscriptions[0];
      return subscription;
    }
    
    // If no active subscriptions, try to check for app purchases via REST API
    try {
      if (admin.rest && admin.rest.session?.shop) {
        const chargesResponse = await admin.rest.get({
          path: 'recurring_application_charges',
        });
        
        if (chargesResponse.data?.recurring_application_charges?.length > 0) {
          const activeCharges = chargesResponse.data.recurring_application_charges.filter(
            charge => charge.status === 'active'
          );
          
          if (activeCharges.length > 0) {
            const charge = activeCharges[0];
            
            // Convert REST API charge to subscription format
            return {
              id: charge.id,
              name: charge.name,
              status: charge.status,
              test: charge.test,
              currentPeriodEnd: charge.updated_at,
              // Add other fields as needed
            };
          }
        }
      }
    } catch (restError) {
      console.error('❌ Error fetching charges via REST API:', restError);
    }
    
    return null;
  } catch (error) {
    console.error('❌ Error fetching subscription from Shopify:', error);
    console.error('❌ Error details:', error.message);
    return null;
  }
};

export const getSubscriptionData = async (admin, shopDomain, Shop, Subscription) => {
  let currentPlan = 'FREE';
  let subscriptionStatus = 'active';
  let shopifySubscription = null;
  
  // Try to fetch from Shopify GraphQL first, but only if admin object is properly configured
  if (admin && admin.graphql) {
    try {
      shopifySubscription = await fetchShopifySubscription(admin);
    } catch (error) {
      // Continuing with database-only mode...
    }
  }
  
  if (shopifySubscription) {
    currentPlan = mapShopifySubscriptionToPlan(shopifySubscription);
    subscriptionStatus = shopifySubscription.status?.toLowerCase() || 'active';
    
    // Ensure database subscription matches Shopify subscription
    try {
      await ensureDatabaseSubscription(shopDomain, currentPlan, Shop, Subscription);
    } catch (error) {
      console.error('❌ Failed to sync database subscription with Shopify:', error);
    }
  } else {
    // No Shopify subscription found, ensure database has FREE plan
    try {
      await ensureDatabaseSubscription(shopDomain, 'FREE', Shop, Subscription);
      currentPlan = 'FREE';
      subscriptionStatus = 'active';
    } catch (dbError) {
      console.error('❌ Database update failed:', dbError);
    }
  }
  
  return {
    plan: currentPlan,
    status: subscriptionStatus,
    shopifySubscription
  };
};
