import {
  Page,
  Card,
  Text,
  Button,
  InlineStack,
  BlockStack,
  Box,
  InlineGrid,
  Icon,
  Toast,
  Spinner,
  Frame,
  SkeletonPage,
  SkeletonBodyText,
  SkeletonDisplayText,
  SkeletonThumbnail,
} from '@shopify/polaris';
import { CheckCircleIcon } from '@shopify/polaris-icons';
import { useState, useCallback, useEffect } from 'react';
import { useLoaderData, useNavigate, useSearchParams } from '@remix-run/react';
import { authenticate } from '../shopify.server';
import { json } from '@remix-run/node';
import { useAppBridge } from '@shopify/app-bridge-react';
import { Redirect } from '@shopify/app-bridge/actions';
import { Subscription } from '../models/subscription.js';
import { useTranslation } from 'react-i18next';
import { Shop } from '../models/Shop.js';
import '../i18n.js'; // Import i18n configuration
import { getSubscriptionData, getPlanLimits } from '../utils/subscriptionUtils.js';
import frame1 from '../assets/Frame (1).png';
import frame2 from '../assets/Frame (2).png';
import frame3 from '../assets/Frame (3).png';
import frame4 from '../assets/Frame (4).png';
import group4 from '../assets/Group (4).png';
import free from '../assets/Frame.png';
import tutorialIcon from '../assets/tutorialIcon.png';
import Footer from '../components/Footer';

// Helper: Ensure shop and FREE plan subscription exist
async function ensureShopAndFreePlan(session) {
  let shop = await Shop.findOne({ shop: session.shop });
  if (!shop) {
    shop = await Shop.create({
      shop: session.shop,
      name: session.shop,
      myshopifyDomain: session.shop,
      plan: 'FREE',
      accessToken: session.accessToken
    });
  }
  let subscription = await Subscription.findOne({ shopId: shop._id });
  if (!subscription) {
    subscription = await Subscription.create({
      shopId: shop._id,
      plan: 'FREE',
      status: 'active',
      accessToken: session.accessToken,
      startDate: new Date(),
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    });
  }
  return { shop, subscription };
}

// Helper: Handle plan upgrade after charge approval
async function handlePlanUpgrade({ shopDomain, accessToken, chargeId, planName }) {
  const response = await fetch(
    `https://${shopDomain}/admin/api/2024-01/recurring_application_charges/${chargeId}.json`,
    {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
    }
  );
  const data = await response.json();
  const charge = data.recurring_application_charge;
  if (charge && charge.status === 'active') {
    let shop = await Shop.findOne({ shop: shopDomain });
    if (!shop) throw new Error('Shop not found');
    await Subscription.findOneAndUpdate(
      { shopId: shop._id },
      { plan: planName, status: 'active', imageCompressCount: 0, webPConvertCount: 0, altTextCount: 0 }
    );
    return true;
  }
  return false;
}

export const loader = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);
  const shopDomain = session.shop;
  const accessToken = session.accessToken;
  
  if (!shopDomain) {
    return json({ error: "Missing shop parameter" }, { status: 400 });
  }
  
  const url = new URL(request.url);
  const chargeId = url.searchParams.get('charge_id');
  const planName = url.searchParams.get('plan');
  
  // 1. Always ensure shop and FREE plan on load
  await ensureShopAndFreePlan(session);
  
  // 2. If charge_id and plan, handle upgrade
  if (chargeId && planName) {
    await handlePlanUpgrade({ shopDomain, accessToken, chargeId, planName });
  }
  
  // 3. Get subscription data from Shopify GraphQL with database fallback
  const subscriptionData = await getSubscriptionData(admin, shopDomain, Shop, Subscription);
  
  // Get usage counts from database (these are still tracked locally)
  let usageCounts = { imageCompressCount: 0, webPConvertCount: 0, altTextCount: 0 };
  try {
    let shop = await Shop.findOne({ shop: shopDomain });
    if (shop) {
      let subscription = await Subscription.findOne({ shopId: shop._id });
      if (subscription) {
        usageCounts = {
          imageCompressCount: subscription.imageCompressCount || 0,
          webPConvertCount: subscription.webPConvertCount || 0,
          altTextCount: subscription.altTextCount || 0,
        };
      }
    }
  } catch (error) {
    console.error('Error fetching usage counts:', error);
  }
  
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
    ],
    session: {
      shop: shopDomain,
      accessToken: accessToken
    }
  });
};

function BillingSkeleton() {
  return (
    <SkeletonPage>
      {/* Header Skeleton */}
      <Box paddingBlockEnd="400">
        <Card>
          <div style={{ padding: '20px' }}>
            <SkeletonDisplayText size="large" />
            <SkeletonBodyText lines={2} />
          </div>
        </Card>
      </Box>

      {/* Current Plan Skeleton */}
      <Box paddingBlockEnd="400">
        <Card>
          <div style={{ padding: '20px' }}>
            <SkeletonDisplayText size="medium" />
            <Box paddingBlockStart="400">
              <InlineStack gap="400" align="space-between">
                <div style={{ flex: 1 }}>
                  <SkeletonBodyText lines={2} />
                </div>
                <SkeletonThumbnail size="small" />
              </InlineStack>
            </Box>
          </div>
        </Card>
      </Box>

      {/* Plan Features Skeleton */}
      <Box paddingBlockEnd="400">
        <Card>
          <div style={{ padding: '20px' }}>
            <SkeletonDisplayText size="medium" />
            <Box paddingBlockStart="400">
              <BlockStack gap="200">
                {[1, 2, 3, 4, 5].map((i) => (
                  <InlineStack key={i} gap="200" align="start">
                    <SkeletonThumbnail size="small" />
                    <SkeletonBodyText lines={1} />
                  </InlineStack>
                ))}
              </BlockStack>
            </Box>
          </div>
        </Card>
      </Box>

      {/* Upgrade Options Skeleton */}
      <Box paddingBlockEnd="400">
        <Card>
          <div style={{ padding: '20px' }}>
            <SkeletonDisplayText size="medium" />
            <Box paddingBlockStart="400">
              <InlineGrid gap="400" columns={3}>
                {[1, 2, 3].map((i) => (
                  <Card key={i}>
                    <div style={{ padding: '20px' }}>
                      <SkeletonDisplayText size="small" />
                      <SkeletonBodyText lines={3} />
                      <Box paddingBlockStart="200">
                        <SkeletonThumbnail size="small" />
                      </Box>
                    </div>
                  </Card>
                ))}
              </InlineGrid>
            </Box>
          </div>
        </Card>
      </Box>
    </SkeletonPage>
  );
}

export default function BillingPage() {
  const { t, ready } = useTranslation();
  const { subscription, session, redirectToDashboard } = useLoaderData();
  
  // Fallback function for translations
  const safeT = (key, fallback) => {
    if (!ready) return fallback || key;
    try {
      const translation = t(key);
      return translation !== key ? translation : fallback || key;
    } catch (error) {
      console.warn(`Translation error for key: ${key}`, error);
      return fallback || key;
    }
  };
  const [toastActive, setToastActive] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [loadingPlan, setLoadingPlan] = useState(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const shop = searchParams.get('shop');
  const plan = searchParams.get('plan');
  const chargeId = searchParams.get('charge_id');
  const [isLoading, setIsLoading] = useState(true);
  const app = useAppBridge();
  const [cookieWarning, setCookieWarning] = useState(false);
  const [showReopenButton, setShowReopenButton] = useState(false);

  useEffect(() => {
    function isEmbedded() {
      try {
        return window.top !== window.self;
      } catch (e) {
        return true;
      }
    }
    if (!isEmbedded() && shop) {
      window.top.location.href = `https://admin.shopify.com/store/${shop.replace('.myshopify.com', '')}/apps/diversified-enterprise-app-13`;
    }
  }, [shop]);

  const handleUpgrade = async (planName) => {
    try {
      setLoadingPlan(planName);
      const formData = new FormData();
      formData.append('plan', planName);
      formData.append('shop', session.shop);

      const response = await fetch('/api/billing', {
        method: 'POST',
        body: formData,
        headers: {
          'Accept': 'application/json',
        },
      });

      const data = await response.json();

      if (!response.ok) {
        let errorMsg = data.error;
        if (typeof errorMsg === 'object') {
          errorMsg = JSON.stringify(errorMsg);
        }
        throw new Error(errorMsg || data.message || 'Failed to process upgrade');
      }

      if (!data.confirmationUrl) {
        throw new Error('No confirmation URL received from server');
      }

      // Redirect user to Shopify's confirmationUrl for approval
      window.top.location.href = data.confirmationUrl;
    } catch (error) {
      setToastMessage('Failed to process upgrade. ' + (error.message || 'Please try again.'));
      setToastActive(true);
      setLoadingPlan(null);
    }
  };

  const toggleToast = useCallback(() => setToastActive((active) => !active), []);

  const showSuccessToast = (message) => {
    setToastMessage(message);
    setToastActive(true);
  };

  // Helper to compare plan names case-insensitively
  const isCurrentPlan = (planName) => {
    if (!subscription?.plan || !planName) return false;
    return subscription.plan.toLowerCase() === planName.toLowerCase();
  };

  const plansList = [
    {
      name: safeT('billing.free', 'Free'),
      price: '$0',
      period: '/mo',
      features: [
        safeT('billing.import_export_20', '200 Image Compress'),
        safeT('billing.platforms_shop', '50 webP Convert'),
        safeT('billing.does_not_renew', '50 alt Content'),
      ],
      button: subscription?.plan === 'FREE' ? (
        <Button fullWidth disabled>
          {safeT('billing.current_plan', 'Current Plan')}
        </Button>
      ) : null, // Hide button if user has any other plan
    },
    {
      name: safeT('billing.shop_plan', 'Shop Plan'),
      price: '$9.99',
      period: '/mo',
      features: [
        safeT('billing.import_export_100', '500 Image Compress'),
        safeT('billing.platforms_shop_plus', '200 webP Convert'),
        safeT('billing.renews_monthly', '500 alt Content'),
      ],
      button: (
        <Button
        fullWidth
        variant='primary'
        onClick={() => handleUpgrade('SHOP PLAN')}
          disabled={isCurrentPlan('Shop Plan') || loadingPlan === 'SHOP PLAN'}
      >
          {isCurrentPlan('Shop Plan')
            ? safeT('billing.current_plan', 'Current Plan')
            : loadingPlan === 'SHOP PLAN'
              ? (
          <InlineStack gap="200" align="center">
            <Spinner size="small" />
            <span>{safeT('billing.upgrading', 'Upgrading...')}</span>
          </InlineStack>
              )
              : safeT('billing.upgrade', 'Upgrade')}
        </Button>
      ),
    },
    {
      name: safeT('billing.warehouse_plan', 'Warehouse Plan'),
      price: '$14.99',
      period: '/mo',
      features: [
        safeT('billing.import_export_300', '1000 Image Compress'),
        safeT('billing.platforms_warehouse', '500 webP Convert'),
        safeT('billing.renews_monthly', '500 alt Content'),
      ],
      button: (
        <Button
        fullWidth
        variant='primary'
        onClick={() => handleUpgrade('WAREHOUSE PLAN')}
          disabled={isCurrentPlan('Warehouse Plan') || loadingPlan === 'WAREHOUSE PLAN'}
      >
          {isCurrentPlan('Warehouse Plan')
            ? safeT('billing.current_plan', 'Current Plan')
            : loadingPlan === 'WAREHOUSE PLAN'
              ? (
          <InlineStack gap="200" align="center">
            <Spinner size="small" />
            <span>{safeT('billing.upgrading', 'Upgrading...')}</span>
          </InlineStack>
              )
              : safeT('billing.upgrade', 'Upgrade')}
        </Button>
      ),
    },
    {
      name: safeT('billing.factory_plan', 'Factory Plan'),
      price: '$49.99',
      period: '/mo',
      features: [
        safeT('billing.import_export_1000', '2000 Image Compress'),
        safeT('billing.platforms_factory', '500 webP Convert'),
        safeT('billing.renews_monthly', '500 alt Content'),
        safeT('billing.priority_support', 'Priority support'),
      ],
      button: (
        <Button
        fullWidth
        variant='primary'
        onClick={() => handleUpgrade('FACTORY PLAN')}
          disabled={isCurrentPlan('Factory Plan') || loadingPlan === 'FACTORY PLAN'}
      >
          {isCurrentPlan('Factory Plan')
            ? safeT('billing.current_plan', 'Current Plan')
            : loadingPlan === 'FACTORY PLAN'
              ? (
          <InlineStack gap="200" align="center">
            <Spinner size="small" />
            <span>{safeT('billing.upgrading', 'Upgrading...')}</span>
          </InlineStack>
              )
              : safeT('billing.upgrade', 'Upgrade')}
        </Button>
      ),
    },
    // {
    //   name: t('billing.franchise_plan'),
    //   price: '$129.99',
    //   period: '/mo',
    //   features: [
    //     t('billing.import_export_3000'),
    //     t('billing.platforms_franchise'),
    //     t('billing.renews_monthly'),
    //     t('billing.priority_support'),
    //   ],
    //   button: <Button
    //     fullWidth
    //     variant='primary'
    //     onClick={() => handleUpgrade('FRANCHISE PLAN')}
    //     disabled={subscription?.plan === 'FRANCHISE PLAN' || loadingPlan === 'FRANCHISE PLAN'}
    //   >
    //     {loadingPlan === 'FRANCHISE PLAN' ? (
    //       <InlineStack gap="200" align="center">
    //         <Spinner size="small" />
    //         <span>{t('billing.upgrading')}</span>
    //       </InlineStack>
    //     ) : subscription?.plan === 'FRANCHISE PLAN' ? t('billing.current_plan') : t('billing.upgrade')}
    //   </Button>,
    // },
    {
      name: safeT('billing.citadel_plan', 'Citadel Plan'),
      price: '$99',
      period: '/mo',
      features: [
        safeT('billing.import_export_50000', '5000 Image Compress'),
        safeT('billing.webP_50000', '5000 webP Content'),
        safeT('billing.alt_export_50000', '5000 alt Content'),
        safeT('billing.priority_support', 'Priority support'),
      ],
      button: (
        <Button
          fullWidth
          variant='primary'
          onClick={() => handleUpgrade('CITADEL PLAN')}
          disabled={isCurrentPlan('Citadel Plan') || loadingPlan === 'CITADEL PLAN'}
        >
          {isCurrentPlan('Citadel Plan')
            ? safeT('billing.current_plan', 'Current Plan')
            : loadingPlan === 'CITADEL PLAN'
              ? (
                <InlineStack gap="200" align="center">
                  <Spinner size="small" />
                  <span>{safeT('billing.upgrading', 'Upgrading...')}</span>
                </InlineStack>
              )
              : safeT('billing.upgrade', 'Upgrade')}
        </Button>
      ),
    },
  ];

  useEffect(() => {
    // Simulate loading
    setIsLoading(true);
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (chargeId && plan && shop) {
      navigate('/app/billing', { replace: true });
    }
  }, [chargeId, plan, shop, navigate]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const returnTo = params.get('returnTo');
    if (returnTo && subscription?.status === 'active') {
      navigate(returnTo, { replace: true });
    }
  }, [subscription, navigate]);

  useEffect(() => {
    if (redirectToDashboard && shop && app) {
      try {
        const appHandle = session.shop;
        const redirect = Redirect.create(app);
        if (redirect && typeof redirect.dispatch === 'function') {
          redirect.dispatch(
            Redirect.Action.REMOTE,
            `https://${shop}/admin/apps/${appHandle}`
          );
        } else {
          console.error('Redirect object or dispatch function is not valid:', redirect);
        }
      } catch (err) {
        console.error('App Bridge redirect error:', err);
      }
    }
  }, [redirectToDashboard, app, shop]);

  useEffect(() => {
    // Check if cookies are enabled and session cookie is present
    if (!document.cookie || document.cookie === '') {
      setCookieWarning(true);
    }
  }, []);



  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Polaris:wght@400;500;600;700&display=swap');
        .billing-features, .billing-card, .billing-features *, .billing-card * {
          font-family: 'Polaris', 'Inter', -apple-system, BlinkMacSystemFont, 'San Francisco', 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif !important;
          font-size: 14px !important;
        }
      `}</style>
      {showReopenButton ? (
        <div style={{ textAlign: 'center', marginTop: 80 }}>
          <Text color="critical" variant="headingMd">
            {safeT('billing.reopen_app_message', 'Please reopen this app from your Shopify admin.')}
          </Text>
          <Button
            onClick={() => window.location.href = '/auth/login'}
            variant="primary"
            style={{ marginTop: 24 }}
          >
            {safeT('billing.reopen_button', 'Reopen in Shopify Admin')}
          </Button>
        </div>
      ) : (
        <Frame>
          <Page>
            <Box paddingBlockStart="400">
              <Box paddingBlockEnd="400">
                <Text variant="headingLg" as="h2" fontWeight="bold" alignment="left" marginBlockEnd="400">
                  {safeT('billing.title', 'Pricing Plans')}
                </Text>
              </Box>
              
              {/* Current Usage Summary */}
              {subscription && (
                <Box paddingBlockEnd="400">
                  <Card padding="400">
                    <BlockStack gap="300">
                      <Text variant="headingMd" fontWeight="bold">
                        {safeT('billing.current_usage', 'Current Usage')} - {subscription.plan}
                      </Text>
                      <InlineGrid columns={3} gap="400">
                        <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                          <Text variant="headingSm" fontWeight="semibold">
                            {safeT('billing.image_compression', 'Image Compression')}
                          </Text>
                          <Text variant="bodyMd">
                            {subscription.imageCompressCount || 0} / {subscription.limits?.imageCompressLimit || 200}
                          </Text>
                          <Text variant="bodySm" tone="subdued">
                            {Math.round(((subscription.imageCompressCount || 0) / (subscription.limits?.imageCompressLimit || 200)) * 100)}% {safeT('billing.used', 'used')}
                          </Text>
                        </Box>
                        <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                          <Text variant="headingSm" fontWeight="semibold">
                            {safeT('billing.webp_conversion', 'WebP Conversion')}
                          </Text>
                          <Text variant="bodyMd">
                            {subscription.webPConvertCount || 0} / {subscription.limits?.webPConvertLimit || 50}
                          </Text>
                          <Text variant="bodySm" tone="subdued">
                            {Math.round(((subscription.webPConvertCount || 0) / (subscription.limits?.webPConvertLimit || 50)) * 100)}% {safeT('billing.used', 'used')}
                          </Text>
                        </Box>
                        <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                          <Text variant="headingSm" fontWeight="semibold">
                            {safeT('billing.alt_text_updates', 'Alt Text Updates')}
                          </Text>
                          <Text variant="bodyMd">
                            {subscription.altTextCount || 0} / {subscription.limits?.altTextLimit || 50}
                          </Text>
                          <Text variant="bodySm" tone="subdued">
                            {Math.round(((subscription.altTextCount || 0) / (subscription.limits?.altTextLimit || 50)) * 100)}% {safeT('billing.used', 'used')}
                          </Text>
                        </Box>
                      </InlineGrid>
                    </BlockStack>
                  </Card>
                </Box>
              )}
              
              <InlineGrid columns={3} rows={2} gap="400">
                {plansList.map((plan, idx) => (
                  <Card key={idx} padding="400" background="bg-surface" borderRadius="2xl" style={{ minWidth: 300, maxWidth: 340, flex: 1 }}>
                    <BlockStack gap="200" align="center">
                      <img
                        src={
                          idx === 0 ? free :
                            idx === 1 ? frame1 :
                              idx === 2 ? group4 :
                                idx === 3 ? frame2 :
                                  idx === 4 ? frame3 :
                                    idx === 5 ? frame4 :
                                      tutorialIcon
                        }
                        alt={plan.name}
                        style={{ display: 'block', width: 48, height: 48, margin: '0 auto', marginBottom: 12 }}
                      />
                      {plan.badge && <Box marginBlockEnd="200">{plan.badge}</Box>}
                      <Box>
                        <Text variant="headingMd" fontWeight="bold" alignment="center">{plan.name}</Text>
                        <Text variant="headingLg" fontWeight="bold" alignment="center">{plan.price}<span style={{ fontWeight: 400, fontSize: 18 }}>{plan.period}</span></Text>
                      </Box>
                      {plan.button}
                      <ul style={{ marginTop: 16, textAlign: 'left', paddingLeft: 0, listStyle: 'none' }}>
                        {plan.features.map((feature, i) => (
                          <li
                            key={i}
                            style={{
                              display: 'flex',
                              alignItems: 'flex-start',
                              marginBottom: 8,
                            }}
                          >
                            <span style={{ width: 24, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
                              <Icon source={CheckCircleIcon} tone="success" />
                            </span>
                            <Text
                              as="span"
                              variant="bodyMd"
                              style={{
                                fontSize: 14,
                                wordBreak: 'break-word',
                                marginLeft: 8,
                              }}
                            >
                              {feature}
                            </Text>
                          </li>
                        ))}
                      </ul>
                    </BlockStack>
                  </Card>
                ))}
              </InlineGrid>
            </Box>
            <Footer />
          </Page>
          {toastActive && (
            <Toast content={toastMessage} onDismiss={toggleToast} />
          )}
        </Frame>
      )}
    </>
  );
}