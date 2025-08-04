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
  const { session } = await authenticate.admin(request);
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
  // 3. Fetch latest subscription and plans
  let shop = await Shop.findOne({ shop: shopDomain });
  let subscription = await Subscription.findOne({ shopId: shop._id });
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
  const { t } = useTranslation();
  const { subscription, session, redirectToDashboard } = useLoaderData();
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
      name: t('billing.free'),
      price: '$0',
      period: '/mo',
      features: [
        t('billing.import_export_20'),
        t('billing.platforms_shop'),
        t('billing.does_not_renew'),
        // `${subscription?.limits?.imageCompressLimit || 200}${t('billing.import_export_20')}` ,
        // `${subscription?.limits?.webPConvertLimit || 50} ${t('billing.platforms_shop')}`,
        // `${subscription?.limits?.altTextLimit || 50} ${t('billing.does_not_renew')}`,
      ],
      button: (
        <Button fullWidth disabled>
          {isCurrentPlan('Free') ? t('billing.current_plan') : t('billing.current_plan')}
        </Button>
      ),
    },
    {
      name: t('billing.shop_plan'),
      price: '$9.99',
      period: '/mo',
      features: [
        t('billing.import_export_100'),
        t('billing.platforms_shop_plus'),
        t('billing.renews_monthly'),
      ],
      button: (
        <Button
        fullWidth
        variant='primary'
        onClick={() => handleUpgrade('SHOP PLAN')}
          disabled={isCurrentPlan('Shop Plan') || loadingPlan === 'SHOP PLAN'}
      >
          {isCurrentPlan('Shop Plan')
            ? t('billing.current_plan')
            : loadingPlan === 'SHOP PLAN'
              ? (
          <InlineStack gap="200" align="center">
            <Spinner size="small" />
            <span>{t('billing.upgrading')}</span>
          </InlineStack>
              )
              : t('billing.upgrade')}
        </Button>
      ),
    },
    {
      name: t('billing.warehouse_plan'),
      price: '$14.99',
      period: '/mo',
      features: [
        t('billing.import_export_300'),
        t('billing.platforms_warehouse'),
        t('billing.renews_monthly'),
      ],
      button: (
        <Button
        fullWidth
        variant='primary'
        onClick={() => handleUpgrade('WAREHOUSE PLAN')}
          disabled={isCurrentPlan('Warehouse Plan') || loadingPlan === 'WAREHOUSE PLAN'}
      >
          {isCurrentPlan('Warehouse Plan')
            ? t('billing.current_plan')
            : loadingPlan === 'WAREHOUSE PLAN'
              ? (
          <InlineStack gap="200" align="center">
            <Spinner size="small" />
            <span>{t('billing.upgrading')}</span>
          </InlineStack>
              )
              : t('billing.upgrade')}
        </Button>
      ),
    },
    {
      name: t('billing.factory_plan'),
      price: '$49.99',
      period: '/mo',
      features: [
        t('billing.import_export_1000'),
        t('billing.platforms_factory'),
        t('billing.renews_monthly'),
        t('billing.priority_support'),
      ],
      button: (
        <Button
        fullWidth
        variant='primary'
        onClick={() => handleUpgrade('FACTORY PLAN')}
          disabled={isCurrentPlan('Factory Plan') || loadingPlan === 'FACTORY PLAN'}
      >
          {isCurrentPlan('Factory Plan')
            ? t('billing.current_plan')
            : loadingPlan === 'FACTORY PLAN'
              ? (
          <InlineStack gap="200" align="center">
            <Spinner size="small" />
            <span>{t('billing.upgrading')}</span>
          </InlineStack>
              )
              : t('billing.upgrade')}
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
      name: t('billing.citadel_plan'),
      price: '$99',
      period: '/mo',
      features: [
        t('billing.import_export_50000'),
        t('billing.webP_50000'),
        t('billing.alt_export_50000'),
        t('billing.priority_support'),
      ],
      button: <Button fullWidth disabled>{t('billing.contact_us_to_upgrade')}</Button>,
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
            Please reopen this app from your Shopify admin.
          </Text>
          <Button
            onClick={() => window.location.href = '/auth/login'}
            variant="primary"
            style={{ marginTop: 24 }}
          >
            Reopen in Shopify Admin
          </Button>
        </div>
      ) : (
        <Frame>
          <Page>
            <Box paddingBlockStart="400">
              <Box paddingBlockEnd="400">
                <Text variant="headingLg" as="h2" fontWeight="bold" alignment="left" marginBlockEnd="400">
                  {t('billing.title')}
                </Text>
              </Box>
              
              {/* Current Usage Summary */}
              {subscription && (
                <Box paddingBlockEnd="400">
                  <Card padding="400">
                    <BlockStack gap="300">
                      <Text variant="headingMd" fontWeight="bold">
                        Current Usage - {subscription.plan}
                      </Text>
                      <InlineGrid columns={3} gap="400">
                        <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                          <Text variant="headingSm" fontWeight="semibold">
                            Image Compression
                          </Text>
                          <Text variant="bodyMd">
                            {subscription.imageCompressCount || 0} / {subscription.limits?.imageCompressLimit || 200}
                          </Text>
                          <Text variant="bodySm" tone="subdued">
                            {Math.round(((subscription.imageCompressCount || 0) / (subscription.limits?.imageCompressLimit || 200)) * 100)}% used
                          </Text>
                        </Box>
                        <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                          <Text variant="headingSm" fontWeight="semibold">
                            WebP Conversion
                          </Text>
                          <Text variant="bodyMd">
                            {subscription.webPConvertCount || 0} / {subscription.limits?.webPConvertLimit || 50}
                          </Text>
                          <Text variant="bodySm" tone="subdued">
                            {Math.round(((subscription.webPConvertCount || 0) / (subscription.limits?.webPConvertLimit || 50)) * 100)}% used
                          </Text>
                        </Box>
                        <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                          <Text variant="headingSm" fontWeight="semibold">
                            Alt Text Updates
                          </Text>
                          <Text variant="bodyMd">
                            {subscription.altTextCount || 0} / {subscription.limits?.altTextLimit || 50}
                          </Text>
                          <Text variant="bodySm" tone="subdued">
                            {Math.round(((subscription.altTextCount || 0) / (subscription.limits?.altTextLimit || 50)) * 100)}% used
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