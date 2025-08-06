import React, { useState, useCallback, Suspense, useEffect } from 'react';
import '../styles/faq.css';
import {
  Page,
  Card,
  MediaCard,
  Text,
  Button,
  Badge,
  Link,
  ButtonGroup,
  InlineStack,
  BlockStack,
  Box,
  Popover,
  ActionList,
  InlineGrid,
  Pagination,
  Icon,
  SkeletonBodyText,
  SkeletonDisplayText,
  SkeletonThumbnail,
  SkeletonPage,
  Banner,
} from '@shopify/polaris';
import Footer from '../components/Footer';
import downloadIcon from '../assets/up-arrow.png';
import codeIcon from '../assets/wayfinder.png';
import uploadIcon from '../assets/down-arrow.png';
import { EmailIcon, ChatIcon, NoteIcon } from '@shopify/polaris-icons';
import userPng from '../assets/user.png';
import { CheckSmallIcon } from '@shopify/polaris-icons';
import { CalendarIcon } from '@shopify/polaris-icons';
import { json } from "@remix-run/node";
import { connectDatabase } from '../utilty/database';
import { authenticate } from "../shopify.server";
import { useLoaderData, useNavigate } from '@remix-run/react';
import CountryFlag from 'react-country-flag';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { BackgroundImport } from '../components/BackgroundImport';
import FaqSection from '../components/FaqSection';
import tutorialIcon from '../assets/tutorialIcon.png';
import { Shop } from '../models/Shop';
import { Subscription } from '../models/subscription';
import { getSubscriptionData, getPlanLimits } from '../utils/subscriptionUtils';

const LANGUAGE_OPTIONS = [
  { code: 'cs', label: 'Czech', country: 'CZ' },
  { code: 'da', label: 'Danish', country: 'DK' },
  { code: 'de', label: 'German', country: 'DE' },
  { code: 'en', label: 'English', country: 'US' },
  { code: 'es', label: 'Spanish', country: 'ES' },
  { code: 'fr', label: 'French', country: 'FR' },
  { code: 'it', label: 'Italian', country: 'IT' },
  { code: 'nl', label: 'Dutch', country: 'NL' },
  { code: 'no', label: 'Norwegian', country: 'NO' },
  { code: 'pl', label: 'Polish', country: 'PL' },
  { code: 'pt', label: 'Portuguese', country: 'PT' },
  { code: 'fi', label: 'Finnish', country: 'FI' },
  { code: 'sv', label: 'Swedish', country: 'SE' },
  { code: 'tr', label: 'Turkish', country: 'TR' },
  { code: 'th', label: 'Thai', country: 'TH' },
  { code: 'ja', label: 'Japanese', country: 'JP' },
  { code: 'zh', label: 'Chinese', country: 'CN' },
  // Add more as needed
];

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

export async function loader({ request }) {
  try {
    if (!process.env.MONGODB_URI) {
      console.warn('MONGODB_URI not found, using fallback data');
      return json({
        shop: 'unknown',
        plan: 'FREE',
        language: 'en',
        error: 'Database not available, using fallback data.'
      });
    }
    try {
      await connectDatabase();
    } catch (dbError) {
      console.warn('Database connection failed, using fallback data:', dbError.message);
      return json({
        shop: 'unknown',
        plan: 'FREE',
        language: 'en',
        error: 'Database not available, using fallback data.'
      });
    }
    
    // Authenticate the user/session
    let session, admin;
    
    try {
      const authResult = await authenticate.admin(request);
      session = authResult.session;
      admin = authResult.admin;
    } catch (authError) {
      console.error('❌ Authentication failed:', authError.message);
      return json({ 
        error: "Authentication failed: " + authError.message,
        shop: 'unknown',
        plan: 'FREE',
        language: 'en'
      }, { status: 401 });
    }
    
    const shopDomain = session.shop;
    const accessToken = session.accessToken;
    
    if (!shopDomain) {
      return json({ error: "Missing shop parameter" }, { status: 400 });
    }
    
    if (!accessToken) {
      return json({ error: "Missing access token" }, { status: 401 });
    }
    
    // Always ensure shop and FREE plan on load
    await ensureShopAndFreePlan(session);
    
    // Get subscription data from Shopify GraphQL with database fallback
    let subscriptionData;
    
    try {
      subscriptionData = await getSubscriptionData(admin, shopDomain, Shop, Subscription);
    } catch (subError) {
      // Fallback to database-only mode
      subscriptionData = {
        plan: 'FREE',
        status: 'active',
        shopifySubscription: null
      };
    }
    
    // Get usage counts and shop data from database (these are still tracked locally)
    let shop = await Shop.findOne({ shop: shopDomain });
    let usageCounts = { imageCompressCount: 0, webPConvertCount: 0, altTextCount: 0 };
    let language = 'en';
    
    if (shop) {
      language = shop.language || 'en';
      let subscription = await Subscription.findOne({ shopId: shop._id });
      if (subscription) {
        usageCounts = {
          imageCompressCount: subscription.imageCompressCount || 0,
          webPConvertCount: subscription.webPConvertCount || 0,
          altTextCount: subscription.altTextCount || 0,
        };
      }
    }
    
    const planLimits = getPlanLimits(subscriptionData.plan);

    // Fetch product and image counts from Shopify with error handling
    let totalProduct = 0;
    let totalImages = 0;
    
    // Only fetch if we have a valid admin client and access token
    if (admin && admin.graphql && accessToken) {
      try {
        const productsResponse = await admin.graphql(`
          {
            products(first: 250) {
              edges {
                node {
                  id
                  images(first: 100) {
                    edges { node { id } }
                  }
                }
              }
            }
          }
        `);
        const productsData = await productsResponse.json();
        
        if (productsData?.data?.products?.edges) {
          const products = productsData.data.products.edges;
          totalProduct = products.length;
          totalImages = products.reduce((sum, p) => sum + (p.node.images.edges.length), 0);
        }
      } catch (productError) {
        // Continue with 0 values for totalProduct and totalImages
      }
    }

    const responseData = {
      shop: shopDomain,
      plan: subscriptionData.plan,
      language: language,
      shopifySubscription: subscriptionData.shopifySubscription,
      ...usageCounts,
      limits: planLimits,
      totalProduct,
      totalImages
    };
    
    return json(responseData);
  } catch (error) {
    console.error('Error in /app/_index loader:', error);
    return json({ error: error.message || 'Unknown error in dashboard loader' }, { status: 500 });
  }
}

function DashboardSkeleton() {
  return (
    <SkeletonPage>
      {/* MediaCard Banner Skeleton */}
      <Box paddingBlockEnd="400">
        <Card>
          <div style={{ display: 'flex', gap: '20px', padding: '20px' }}>
            <SkeletonThumbnail size="large" />
            <div style={{ flex: 1 }}>
              <SkeletonDisplayText size="medium" />
              <SkeletonBodyText lines={3} />
            </div>
          </div>
        </Card>
      </Box>

      {/* Welcome Bar Skeleton */}
      <Box paddingBlockEnd="400">
        <InlineStack gap="400" align="space-between">
          <InlineStack gap="200">
            <SkeletonThumbnail size="small" />
            <SkeletonBodyText lines={1} />
          </InlineStack>
          <SkeletonThumbnail size="small" />
        </InlineStack>
      </Box>

      {/* Steps Section Skeleton */}
      <Box paddingBlockEnd="400">
        <InlineGrid gap="400" columns={3}>
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <div style={{ padding: '20px' }}>
                <SkeletonThumbnail size="large" />
                <SkeletonDisplayText size="small" />
                <SkeletonBodyText lines={2} />
                <Box paddingBlockStart="200">
                  <SkeletonThumbnail size="small" />
                </Box>
              </div>
            </Card>
          ))}
        </InlineGrid>
      </Box>

      {/* Stats Section Skeleton */}
      <Box paddingBlockEnd="400">
        <Card>
          <div style={{ padding: '20px' }}>
            <InlineGrid gap="400" columns={4}>
              {[1, 2, 3, 4].map((i) => (
                <div key={i}>
                  <SkeletonDisplayText size="small" />
                  <SkeletonBodyText lines={1} />
                </div>
              ))}
            </InlineGrid>
          </div>
        </Card>
      </Box>

      {/* Tutorials Section Skeleton */}
      <Box paddingBlockEnd="400">
        <Card>
          <div style={{ padding: '20px' }}>
            <SkeletonDisplayText size="medium" />
            <SkeletonBodyText lines={1} />
            <Box paddingBlockStart="400">
              <InlineGrid gap="400" columns={2}>
                {[1, 2].map((i) => (
                  <Card key={i}>
                    <div style={{ padding: '20px' }}>
                      <InlineStack gap="200">
                        <SkeletonThumbnail size="medium" />
                        <div style={{ flex: 1 }}>
                          <SkeletonDisplayText size="small" />
                          <SkeletonBodyText lines={2} />
                        </div>
                      </InlineStack>
                    </div>
                  </Card>
                ))}
              </InlineGrid>
            </Box>
          </div>
        </Card>
      </Box>

      {/* Help Section Skeleton */}
      <Box paddingBlockEnd="400">
        <Card>
          <div style={{ padding: '20px' }}>
            <SkeletonDisplayText size="medium" />
            <Box paddingBlockStart="400">
              <InlineGrid gap="400" columns={3}>
                {[1, 2, 3].map((i) => (
                  <Card key={i}>
                    <div style={{ padding: '20px' }}>
                      <InlineStack gap="200">
                        <SkeletonThumbnail size="small" />
                        <div style={{ flex: 1 }}>
                          <SkeletonBodyText lines={2} />
                        </div>
                      </InlineStack>
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

export default function Dashboard() {
  const { t } = useTranslation();
  const loaderData = typeof useLoaderData === 'function' ? useLoaderData() : {};
  
  // Check if we have essential data loaded
  const hasEssentialData = loaderData.shop && loaderData.plan && loaderData.hasOwnProperty('totalProduct');
  
  const [selectedFaq, setSelectedFaq] = useState(null);
  const [selectedLanguage, setSelectedLanguage] = useState(i18n.language || 'en');
  const [tutorialPage, setTutorialPage] = useState(1);
  const [selectedRange, setSelectedRange] = useState('7');
  const [isLoading, setIsLoading] = useState(true);
  const [i18nReady, setI18nReady] = useState(false);
  const tutorialsRaw = t('quick_tutorials.tutorials', { returnObjects: true });
  const tutorials = Array.isArray(tutorialsRaw) ? tutorialsRaw : [];
  const TUTORIALS_PER_PAGE = 2;
  const totalPages = Math.ceil(tutorials.length / TUTORIALS_PER_PAGE);
  const pagedTutorials = Array.isArray(tutorials)
    ? tutorials.slice((tutorialPage - 1) * TUTORIALS_PER_PAGE, tutorialPage * TUTORIALS_PER_PAGE)
    : [];
  const [stats, setStats] = useState({ 
    totalProduct: 0, 
    import: 0, 
    export: 0,
    imageCompressCount: 0,
    webPConvertCount: 0,
    altTextCount: 0
  });
  const [statsLoading, setStatsLoading] = useState(false);
  const [activeImports, setActiveImports] = useState([]);
  const [showBanner, setShowBanner] = useState(true);
  const navigate = useNavigate();
  const [showReviewBanner, setShowReviewBanner] = useState(true);

  // Get steps array from translations
  const steps = t('steps', { returnObjects: true });
  const stepsArray = Array.isArray(steps) ? steps : [];

  // Sync i18n language with loaderData.language on mount and set i18nReady
  useEffect(() => {
    if (loaderData.language && i18n.language !== loaderData.language) {
      i18n.changeLanguage(loaderData.language).then(() => setI18nReady(true));
    } else {
      setI18nReady(true);
    }
  }, [loaderData.language]);

  // Sync selectedLanguage with loaderData.language
  useEffect(() => {
    if (loaderData.language && selectedLanguage !== loaderData.language) {
      setSelectedLanguage(loaderData.language);
    }
  }, [loaderData.language]);

  // Add a timeout fallback in case data loading gets stuck
  useEffect(() => {
    let timeoutId;
    
    if (!hasEssentialData && !loaderData.error) {
      timeoutId = setTimeout(() => {
        if (loaderData.shop || loaderData.plan) {
          setI18nReady(true); // Force show even if not complete
        } else {
          // Attempt to refresh the page to retry loading
          window.location.reload();
        }
      }, 8000); // 8 second timeout
    }
    
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [hasEssentialData, loaderData.shop, loaderData.plan, loaderData.error]);

  // useEffect(() => {
  //   let shop = new URLSearchParams(window.location.search).get('shop');
  //   if (!shop && loaderData.shop) {
  //     shop = loaderData.shop;
  //   }
  //   if (shop) {
  //     setIsLoading(true);
  //     fetch(`/api/stats?shop=${encodeURIComponent(shop)}&range=${selectedRange}`)
  //       .then(res => res.json())
  //       .then(data => {
  //         setStats(data);
  //         setIsLoading(false);
  //       });
  //   }
  // }, [loaderData.shop, selectedRange]);

  // Fetch activity stats when range changes
  useEffect(() => {
    const fetchStats = async () => {
      if (!loaderData.shop) return;
      
      setStatsLoading(true);
      try {
        const response = await fetch(`/api/stats?shop=${encodeURIComponent(loaderData.shop)}&range=${selectedRange}`, {
          credentials: 'include',
          headers: {
            'Accept': 'application/json',
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.success) {
            setStats({
              totalProduct: loaderData.totalProduct || 0,
              totalImages: loaderData.totalImages || 0,
              imageCompressCount: data.imageCompressCount || 0,
              webPConvertCount: data.webPConvertCount || 0,
              altTextCount: data.altTextCount || 0,
              period: data.period || `${selectedRange} days`
            });
          } else {
            console.error('Failed to fetch stats:', data.error);
            // Fallback to loader data
            setStats({
              totalProduct: loaderData.totalProduct || 0,
              totalImages: loaderData.totalImages || 0,
              imageCompressCount: loaderData.imageCompressCount || 0,
              webPConvertCount: loaderData.webPConvertCount || 0,
              altTextCount: loaderData.altTextCount || 0,
              period: `${selectedRange} days`
            });
          }
        } else {
          throw new Error(`HTTP ${response.status}`);
        }
      } catch (error) {
        console.error('Error fetching activity stats:', error);
        // Fallback to loader data
        setStats({
          totalProduct: loaderData.totalProduct || 0,
          totalImages: loaderData.totalImages || 0,
          imageCompressCount: loaderData.imageCompressCount || 0,
          webPConvertCount: loaderData.webPConvertCount || 0,
          altTextCount: loaderData.altTextCount || 0,
          period: `${selectedRange} days`
        });
      } finally {
        setStatsLoading(false);
      }
    };

    fetchStats();
  }, [selectedRange, loaderData.shop, loaderData.totalProduct, loaderData.totalImages, loaderData.imageCompressCount, loaderData.webPConvertCount, loaderData.altTextCount]);

  // Function to refresh stats
  const refreshStats = async () => {
    if (!loaderData.shop) return;
    
    setStatsLoading(true);
    try {
      const response = await fetch(`/api/stats?shop=${encodeURIComponent(loaderData.shop)}&range=${selectedRange}`, {
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setStats({
            totalProduct: loaderData.totalProduct || 0,
            totalImages: loaderData.totalImages || 0,
            imageCompressCount: data.imageCompressCount || 0,
            webPConvertCount: data.webPConvertCount || 0,
            altTextCount: data.altTextCount || 0,
            period: data.period || `${selectedRange} days`
          });
        }
      }
    } catch (error) {
      console.error('Error refreshing stats:', error);
    } finally {
      setStatsLoading(false);
    }
  };

  useEffect(() => {
    const loadActiveImports = async () => {
      try {
        const response = await fetch('/api/imports/active', {
          credentials: 'include',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          }
        });
        const data = await response.json();

        if (data.success) {
          setActiveImports(data.imports);
          // Only continue polling if there are active imports
          if (data.imports.length === 0) {
            return false; // Stop polling
          }
          return true; // Continue polling
        } else {
          return false; // Stop polling on error
        }
      } catch (error) {
        return false; // Stop polling on error
      }
    };

    let shouldContinuePolling = true;
    const pollInterval = 5000; // 5 seconds

    const startPolling = async () => {
      shouldContinuePolling = await loadActiveImports();
      if (shouldContinuePolling) {
        setTimeout(startPolling, pollInterval);
      }
    };

    // Initial load
    startPolling();

    // Cleanup function
    return () => {
      shouldContinuePolling = false;
    };
  }, []);

  const handleImportComplete = (importId, progress) => {
    setActiveImports(prev => prev.filter(imp => imp._id !== importId));
    // Refresh stats after import completes
    refreshStats();
  };

  if (!i18nReady || !hasEssentialData) {
    // If there's an error, show it instead of loading forever
    if (loaderData.error) {
      return (
        <Page title={t('dashboard.title')}>
          <Banner status="critical">
            <Text variant="bodyMd">
              {t('dashboard.error_loading')}: {loaderData.error}. {t('dashboard.refresh_message')}
            </Text>
          </Banner>
        </Page>
      );
    }
    
    return <DashboardSkeleton />;
  }

  // Utility function to format plan names
  function formatPlanName(plan) {
    if (!plan) return '';
    return plan
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  const getPlanDisplayName = (plan) => {
    return t(`plans.${plan}`) || plan || 'FREE';
  };

  return (

      <Page>
        {/* MediaCard Banner with image filling the left side */}
        {showBanner && (
          <MediaCard
            title={t('welcome')}
            primaryAction={{
              content: t('banner.primary_action'),
              onAction: () => { },
            }}
            secondaryAction={{
              content: t('banner.secondary_action'),
              onAction: () => { },
            }}
            description={t('banner.description')}
            popoverActions={[{ content: t('banner.dismiss'), onAction: () => setShowBanner(false) }]}
            size="small"
          >
            <img
              alt="Profile"
              width="100%"
              height="100%"
              style={{ objectFit: 'cover', objectPosition: 'center' }}
              src={userPng}
            />
          </MediaCard>
        )}

        {/* Welcome Bar */}
        <Box paddingBlockEnd="200" paddingBlockStart="200">
          <InlineStack align="space-between" blockAlign="center" width="100%">
            <InlineStack gap="200" blockAlign="center">
              <span style={{ fontSize: 20 }}>👋</span>
              <Text as="span" fontWeight="bold" variant="bodyMd" color="default">
                {t('intro.welcome_message')}
              </Text>
              <Link url="#" monochrome={false} removeUnderline={false}>
                <Text as="span" fontWeight="semibold" variant="bodyMd" color="textHighlight">
                  {t('intro.app_name')}
                </Text>
              </Link>
              <Badge status={(loaderData.plan || 'FREE') === 'FREE' ? 'info' : 'success'} tone={(loaderData.plan || 'FREE') === 'FREE' ? 'info' : 'success'}>
                {getPlanDisplayName(loaderData.plan || 'FREE')}
              </Badge>
            </InlineStack>
            <InlineStack gap="200" blockAlign="center">
              <LanguageDropdown selectedLanguage={selectedLanguage} setSelectedLanguage={setSelectedLanguage} />
            </InlineStack>
          </InlineStack>
        </Box>

        {/* Usage Summary */}
        {/* <Box paddingBlockEnd="400">
          <Card padding="400">
            <BlockStack gap="300">
              <Text variant="headingMd" fontWeight="bold">
                Current Usage - {loaderData.plan}
              </Text>
              <InlineGrid columns={4} gap="400">
                <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                  <Text variant="headingSm" fontWeight="semibold">
                    Image Compression
                  </Text>
                  <Text variant="bodyMd">
                    {loaderData.imageCompressCount || 0} / {loaderData.limits?.imageCompressLimit || 0}
                  </Text>
                  <Text variant="bodySm" tone="subdued">
                    {Math.round(((loaderData.imageCompressCount || 0) / (loaderData.limits?.imageCompressLimit || 1)) * 100)}% used
                  </Text>
                </Box>
                <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                  <Text variant="headingSm" fontWeight="semibold">
                    WebP Conversion
                  </Text>
                  <Text variant="bodyMd">
                    {loaderData.webPConvertCount || 0} / {loaderData.limits?.webPConvertLimit || 0}
                  </Text>
                  <Text variant="bodySm" tone="subdued">
                    {Math.round(((loaderData.webPConvertCount || 0) / (loaderData.limits?.webPConvertLimit || 1)) * 100)}% used
                  </Text>
                </Box>
                <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                  <Text variant="headingSm" fontWeight="semibold">
                    Alt Text Updates
                  </Text>
                  <Text variant="bodyMd">
                    {loaderData.altTextCount || 0} / {loaderData.limits?.altTextLimit || 0}
                  </Text>
                  <Text variant="bodySm" tone="subdued">
                    {Math.round(((loaderData.altTextCount || 0) / (loaderData.limits?.altTextLimit || 1)) * 100)}% used
                  </Text>
                </Box>
                <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                  <Text variant="headingSm" fontWeight="semibold">
                    Total Product
                  </Text>
                  <Text variant="bodyLg">{loaderData.totalProduct || 0}</Text>
                </Box>
                <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                  <Text variant="headingSm" fontWeight="semibold">
                    Total Image in your product
                  </Text>
                  <Text variant="bodyLg">{loaderData.totalImages || 0}</Text>
                </Box>
                <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                  <Text variant="headingSm" fontWeight="semibold">
                    Compress
                  </Text>
                  <Text variant="bodyLg">{loaderData.imageCompressCount || 0}</Text>
                </Box>
                <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                  <Text variant="headingSm" fontWeight="semibold">
                    Alt tag Done in image
                  </Text>
                  <Text variant="bodyLg">{loaderData.altTextCount || 0}</Text>
                </Box>
              </InlineGrid>
            </BlockStack>
          </Card>
        </Box> */}


        {/* Steps Section */}
        {/* <Box display="flex" justifyContent="flex-start" paddingBlockEnd="400">
          <SpacingBackground>
            <InlineGrid gap="400" columns={3}>
              {stepsArray.map((step, idx) => (
                <Placeholder key={idx} height="320px" width="307px">
                  <div style={{ textAlign: 'center', marginBottom: 8 }}>
                    <span style={{ color: '#202223', fontWeight: 450, fontSize: 12 }}>{`Step ${step.step_number}:`}</span>
                    <div style={{ fontWeight: 700, fontSize: 14, marginTop: 4 }}>
                      {`${step.emoji} ${step.title}`}
                    </div>
                  </div>
                  <div style={{ width: '100%', textAlign: 'center' }}>
                    <Text color="subdued" style={{ fontSize: 12, marginBottom: 16, display: 'inline-block' }}>
                      {step.description}
                    </Text>
                  </div>
                  <Button variant="primary" fullWidth style={{ width: 288, height: 32 }}>{step.button}</Button>
                </Placeholder>
              ))}
            </InlineGrid>
          </SpacingBackground>
        </Box> */}


        {/* Date Range Dropdown */}
        <Box paddingBlockEnd="400">
          <InlineStack align="space-between" blockAlign="center">
            <DateRangeDropdown selectedRange={selectedRange} setSelectedRange={setSelectedRange} />
          </InlineStack>
        </Box>

        {/* Stats */}
        <Box paddingBlockEnd="400">
          <Card padding="500" background="bg-surface" borderRadius="2xl" paddingBlockStart="600" paddingBlockEnd="600">
            <div style={{ width: '100%' }}>
              {/* Labels Row */}
              <div style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                gap: 48,
                marginBottom: 8,
              }}>
                <div style={{ flex: 1, textAlign: 'left', fontWeight: 600, color: '#202223' }}>
                  <span style={{ display: 'inline-block', borderBottom: '1px dotted #ccc', paddingBottom: 4 }}>{t('stats.total_products')}</span>
                </div>
                <div style={{ flex: 1, textAlign: 'left', fontWeight: 600, color: '#202223' }}>
                  <span style={{ display: 'inline-block', borderBottom: '1px dotted #ccc', paddingBottom: 4 }}>{t('stats.total_images')}</span>
                </div>
                <div style={{ flex: 1, textAlign: 'left', fontWeight: 600, color: '#202223' }}>
                  <span style={{ display: 'inline-block', borderBottom: '1px dotted #ccc', paddingBottom: 4 }}>{t('stats.images_compressed')}</span>
                </div>
                <div style={{ flex: 1, textAlign: 'left', fontWeight: 600, color: '#202223' }}>
                  <span style={{ display: 'inline-block', borderBottom: '1px dotted #ccc', paddingBottom: 4 }}>{t('stats.webp_converted')}</span>
                </div>
                <div style={{ flex: 1, textAlign: 'left', fontWeight: 600, color: '#202223' }}>
                  <span style={{ display: 'inline-block', borderBottom: '1px dotted #ccc', paddingBottom: 4 }}>{t('stats.alt_tags_added')}</span>
                </div>
              </div>
              {/* Numbers Row */}
              <div style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                gap: 48,
              }}>
                <div style={{ flex: 1, textAlign: 'left', fontWeight: 700, fontSize: 20, color: '#202223' }}>
                  {statsLoading ? '...' : (stats.totalProduct || 0)}
                </div>
                <div style={{ flex: 1, textAlign: 'left', fontWeight: 700, fontSize: 20, color: '#202223' }}>
                  {statsLoading ? '...' : (stats.totalImages || 0)}
                </div>
                <div style={{ flex: 1, textAlign: 'left', fontWeight: 700, fontSize: 20, color: '#202223' }}>
                  {statsLoading ? '...' : (stats.imageCompressCount || 0)}
                </div>
                <div style={{ flex: 1, textAlign: 'left', fontWeight: 700, fontSize: 20, color: '#202223' }}>
                  {statsLoading ? '...' : (stats.webPConvertCount || 0)}
                </div>
                <div style={{ flex: 1, textAlign: 'left', fontWeight: 700, fontSize: 20, color: '#202223' }}>
                  {statsLoading ? '...' : (stats.altTextCount || 0)}
                </div>
              </div>
            </div>
          </Card>
        </Box>

        {/* Active Imports Section */}
        {activeImports.length > 0 && (
          <Box marginTop="400">
            <Text variant="headingMd" marginBottom="200">{t('active_imports.title')}</Text>
            {activeImports.map(importData => (
              <Box key={importData._id} marginBottom="200">
                <BackgroundImport
                  importId={importData._id}
                  onComplete={(progress) => handleImportComplete(importData._id, progress)}
                />
                <Text variant="bodyMd">
                  {t('active_imports.progress', { processedProducts: importData.processedProducts, totalProducts: importData.totalProducts })}
                </Text>
              </Box>
            ))}
          </Box>
        )}

        {/* Help Section */ /* FAQ Section */}
        <Box paddingBlockEnd="400">
          <Card paddingBlockStart="600" paddingBlockEnd="600" background="bg-surface" borderRadius="2xl">
            <div style={{ padding: '5px 0px 11px 2px' }}>
              <Text variant="headingMd" as="h2" fontWeight="bold">
                {t('import.need_help_or_import')}
              </Text>
            </div>
            <InlineGrid columns={3} gap="400" style={{ width: '100%' }}>
              <Card padding="400" border="base" background="bg-surface" borderRadius="lg" style={{ width: '100%', margin: 0 }}>
                <Box paddingInlineStart="200">
                  <Link url="#" monochrome={false} style={{ color: '#3574F2', fontWeight: 500 }} onClick={e => { e.preventDefault(); navigate('/app/contact#help-section'); }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <Icon source={EmailIcon} color="interactive" />
                      {t('import.get_email_support')}
                    </span>
                  </Link>
                  <Text color="subdued" fontSize="bodySm">
                    {t('import.email_support_description')}
                  </Text>
                </Box>
              </Card>
              <Card padding="400" border="base" background="bg-surface" borderRadius="lg" style={{ width: '100%', margin: 0 }}>
                <Box paddingInlineStart="200">
                  <Link url="#" monochrome={false} style={{ color: '#3574F2', fontWeight: 500 }} onClick={e => { e.preventDefault(); if (window.$crisp) window.$crisp.push(["do", "chat:open"]); }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <Icon source={ChatIcon} color="interactive" />
                      {t('import.start_live_chat')}
                    </span>
                  </Link>
                  <Text color="subdued" fontSize="bodySm">
                    {t('import.live_chat_description')}
                  </Text>
                </Box>
              </Card>
              <Card padding="400" border="base" background="bg-surface" borderRadius="lg" style={{ width: '100%', margin: 0 }}>
                <Box paddingInlineStart="200">
                  <Link url="#" monochrome={false} style={{ color: '#3574F2', fontWeight: 500 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <Icon source={NoteIcon} color="interactive" />
                      {t('import.help_docs')}
                    </span>
                  </Link>
                  <Text color="subdued" fontSize="bodySm">
                    {t('import.help_docs_description')}
                  </Text>
                </Box>
              </Card>
            </InlineGrid>
            <Box paddingBlockEnd="400" paddingBlockStart="400">
              <FaqSection />
            </Box>
          </Card>
        </Box>
        
        {/* Review Request Banner */}
        {showReviewBanner && (
          <Box>
            <Banner
              title={t('review_banner.title')}
              status="info"
              onDismiss={() => setShowReviewBanner(false)}
            >
              <p>{t('review_banner.message')}</p>
              <Box paddingBlockStart="200">
                <Button onClick={() => window.open('https://your-review-link.com', '_blank')}>{t('review_banner.leave_review')}</Button>
              </Box>
            </Banner>
          </Box>
        )}

        {/* my apps */}
        {/* <Box display="flex" justifyContent="flex-start" paddingBlockEnd="400" marginBlockStart="400">
          <Card padding="500" background="bg-surface" borderRadius="2xl" paddingBlockStart="600" paddingBlockEnd="600">
            <BlockStack gap="200">
              <Text variant="headingMd">My Apps</Text>
              <Text color="subdued">Apps you have installed or created</Text>
              <Box paddingBlockStart="400" />
              {/* Placeholder for user's apps */}
              {/* <InlineGrid columns={{ xs: 1, sm: 2 }} gap="400">
                <Card padding="400" background="bg-surface" borderRadius="lg">
                  <Box paddingInline="200" paddingBlock="400" style={{ textAlign: 'center', minHeight: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Text color="subdued">You have not installed or created any apps yet.</Text>
                  </Box>
                </Card>
              </InlineGrid>
              <Box paddingBlockStart="400">
                <InlineStack align="space-between" blockAlign="center">
                  <Pagination
                    hasPrevious={tutorialPage > 1}
                    onPrevious={() => setTutorialPage(tutorialPage - 1)}
                    hasNext={tutorialPage < totalPages}
                    onNext={() => setTutorialPage(tutorialPage + 1)}
                    label={`${tutorialPage}/${totalPages}`}
                  />
                </InlineStack>
              </Box> */} 
              {/* In the future, map over user's apps here */}
            {/* </BlockStack>
          </Card>
        </Box> */}
        <Footer />
      </Page>
    
  );
}


function LanguageDropdown({ selectedLanguage, setSelectedLanguage }) {
  const [active, setActive] = useState(false);
  const toggleActive = useCallback(() => setActive((active) => !active), []);
  const selected = LANGUAGE_OPTIONS.find(l => l.code === selectedLanguage) || LANGUAGE_OPTIONS[0];

  const handleSelect = async (lang) => {
    setSelectedLanguage(lang.code);
    i18n.changeLanguage(lang.code);
    setActive(false);
    // Update language in backend
    try {
      await fetch('/api/shop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: lang.code })
      });
    } catch (err) {
      console.error('LanguageDropdown: Error updating language in backend', err);
    }
  };

  const activator = (
    <Button onClick={toggleActive} disclosure>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontWeight: 700 }}>
        <CountryFlag
          countryCode={selected.country}
          svg
          style={{ width: 22, height: 16, borderRadius: 3, marginRight: 10, boxShadow: '0 0 1px #ccc' }}
          aria-label={selected.label}
        />
        {selected.label}
      </span>
    </Button>
  );

  return (
    <Popover
      active={active}
      activator={activator}
      autofocusTarget="first-node"
      onClose={toggleActive}
    >
      <div style={{ maxHeight: 320, overflowY: 'auto', minWidth: 200 }}>
        <ActionList
          actionRole="menuitem"
          items={LANGUAGE_OPTIONS.map(lang => ({
            active: selectedLanguage === lang.code,
            content: (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontWeight: selectedLanguage === lang.code ? 700 : 400 }}>
                <CountryFlag
                  countryCode={lang.country}
                  svg
                  style={{ width: 22, height: 16, borderRadius: 3, marginRight: 10, boxShadow: '0 0 1px #ccc' }}
                  aria-label={lang.label}
                />
                {lang.label}
              </span>
            ),
            suffix: selectedLanguage === lang.code ? <Icon source={CheckSmallIcon} /> : undefined,
            onAction: () => handleSelect(lang)
          }))}
        />
      </div>
    </Popover>
  );
}

function DateRangeDropdown({ selectedRange, setSelectedRange }) {
  const { t } = useTranslation();
  const [active, setActive] = useState(false);
  const toggleActive = useCallback(() => setActive((active) => !active), []);
  const ranges = [
    { value: '7', label: t('dashboard.date_range.last_7_days') },
    { value: '30', label: t('dashboard.date_range.last_30_days') },
  ];
  const activator = (
    <Button onClick={toggleActive} disclosure icon={CalendarIcon}>
      {ranges.find(r => r.value === selectedRange)?.label || t('dashboard.date_range.select_range')}
    </Button>
  );
  return (
    <Popover
      active={active}
      activator={activator}
      autofocusTarget="first-node"
      onClose={toggleActive}
    >
      <ActionList
        actionRole="menuitem"
        items={ranges.map(range => ({
          content: range.label,
          active: selectedRange === range.value,
          suffix: selectedRange === range.value ? <Icon source={CheckSmallIcon} /> : undefined,
          onAction: () => {
            setSelectedRange(range.value);
            setActive(false);
          },
        }))}
      />
    </Popover>
  );
}
