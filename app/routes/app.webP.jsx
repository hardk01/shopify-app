import { json } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import { useEffect, useState, useCallback } from "react";
import {
  Page,
  Layout,
  Text,
  Banner,
  IndexTable,
  useIndexResourceState,
  Thumbnail,
  ButtonGroup,
  Button,
  Toast,
  Frame,
  Box,
  SkeletonPage,
  SkeletonBodyText,
  SkeletonDisplayText,
  SkeletonThumbnail,
  Modal,
  Pagination,
  LegacyCard
} from "@shopify/polaris";
import { Icon, TextField } from "@shopify/polaris";
import { SearchIcon } from '@shopify/polaris-icons';
import { authenticate } from '../shopify.server';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import Footer from "../components/Footer";
import { TitleBar } from "@shopify/app-bridge-react";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);

  try {
    // Get pagination parameters from URL
    const url = new URL(request.url);
    const cursor = url.searchParams.get('cursor');
    const direction = url.searchParams.get('direction') || 'next';
    const limit = 20; // Items per page

    // Build GraphQL query with pagination
    let paginationArgs = `first: ${limit}`;
    if (cursor && direction === 'next') {
      paginationArgs = `first: ${limit}, after: "${cursor}"`;
    } else if (cursor && direction === 'previous') {
      paginationArgs = `last: ${limit}, before: "${cursor}"`;
    }

    // Get total count with a separate query
    const totalResponse = await admin.graphql(
      `query GetTotalImageCount {
        files(first: 250, query: "mediaType:IMAGE") {
          edges {
            node {
              id
            }
          }
        }
      }`
    );

    const response = await admin.graphql(
      `query GetMediaImages {
        files(${paginationArgs}, query: "mediaType:IMAGE") {
          edges {
            cursor
            node {
              ... on MediaImage {
                id
                createdAt
                originalSource {
                  fileSize
                }
                image {
                  id
                  url
                  width
                  height
                  altText
                }
                metafields(namespace: "compression", first: 1) {
                  edges {
                    node {
                      key
                      value
                    }
                  }
                }
              }
            }
          }
          pageInfo {
            hasNextPage
            hasPreviousPage
            startCursor
            endCursor
          }
        }
      }`
    );

    const data = await response.json();
    const totalData = await totalResponse.json();
    
    if (data.data && data.data.files && data.data.files.edges) {
      // Calculate total pages
      const totalCount = totalData.data?.files?.edges?.length || 0;
      const totalPages = Math.ceil(totalCount / limit);
      
      // Attach compressed size metafield to each image node
      const images = data.data.files.edges.map(edge => {
        const node = edge.node;
        let compressedSize = null;
        if (node.metafields && node.metafields.edges.length > 0) {
          const metafield = node.metafields.edges.find(
            (e) => e.node.key === "compressed_size"
          );
          if (metafield) {
            compressedSize = Number(metafield.node.value);
          }
        }
        return {
          ...edge,
          node: {
            ...node,
            compressedSize
          }
        };
      });
      
      const pageInfo = data.data.files.pageInfo;
      return json({ 
        images, 
        pageInfo,
        totalPages,
        shop: session.shop 
      });
    } else {
      return json({ 
        images: [], 
        pageInfo: {
          hasNextPage: false,
          hasPreviousPage: false,
          startCursor: null,
          endCursor: null
        },
        totalPages: 0,
        error: "No images found", 
        shop: session.shop 
      });
    }
  } catch (error) {
    return json({ 
      images: [], 
      pageInfo: {
        hasNextPage: false,
        hasPreviousPage: false,
        startCursor: null,
        endCursor: null
      },
      totalPages: 0,
      error: error.message, 
      shop: session.shop 
    });
  }
};

function TableSkeleton() {
  return (
    <SkeletonPage primaryAction>
      <Box paddingBlockEnd="400">
        <div style={{ padding: '24px' }}>
          <SkeletonDisplayText size="small" />
          <Box paddingBlockStart="200" />
          {[...Array(6)].map((_, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
              <SkeletonThumbnail size="small" />
              <div style={{ flex: 2 }}>
                <SkeletonBodyText lines={1} />
              </div>
              <div style={{ flex: 2 }}>
                <SkeletonBodyText lines={1} />
              </div>
              <div style={{ flex: 1 }}>
                <SkeletonBodyText lines={1} />
              </div>
              <div style={{ flex: 1 }}>
                <SkeletonBodyText lines={1} />
              </div>
            </div>
          ))}
        </div>
      </Box>
    </SkeletonPage>
  );
}

export default function WebPPage() {
  const { t } = useTranslation();
  const { images = [], pageInfo, totalPages = 0, error, shop } = useLoaderData();
  const [localImages, setLocalImages] = useState(images);
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradeMessage, setUpgradeMessage] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  
  useEffect(() => {
    if (images) {
      const timeout = setTimeout(() => setIsLoading(false), 400);
      return () => clearTimeout(timeout);
    }
  }, [images]);

  // Get current page from URL or default to 1
  useEffect(() => {
    const url = new URL(window.location);
    const cursor = url.searchParams.get('cursor');
    const direction = url.searchParams.get('direction');
    
    if (!cursor) {
      setCurrentPage(1);
    } else {
      // Estimate page number based on cursor presence
      // This is an approximation since we don't have total count
      const storedPage = sessionStorage.getItem('webp-current-page');
      if (storedPage && direction) {
        const page = parseInt(storedPage);
        if (direction === 'next') {
          setCurrentPage(page + 1);
        } else if (direction === 'previous' && page > 1) {
          setCurrentPage(page - 1);
        }
      }
    }
  }, []);

  const filteredResources = (localImages || [])
    .map(({ node }) => ({
      id: node.id,
      ...node,
      fileSize: node.compressedSize != null ? node.compressedSize : (node.originalSource?.fileSize || 0)
    }))
    .filter(resource => {
      if (!searchQuery) return true;
      const fileName = decodeURIComponent(resource.image?.url?.split('/').pop().split('?')[0].split('.')[0] || '');
      return fileName.toLowerCase().includes(searchQuery.toLowerCase());
    });

  const {
    selectedResources,
    handleSelectionChange,
  } = useIndexResourceState(filteredResources);

  const [isConverting, setIsConverting] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [isError, setIsError] = useState(false);

  // Pagination navigation functions
  const handleNextPage = useCallback(() => {
    if (pageInfo?.hasNextPage && pageInfo?.endCursor) {
      const nextPage = currentPage + 1;
      sessionStorage.setItem('webp-current-page', nextPage.toString());
      setCurrentPage(nextPage);
      
      const url = new URL(window.location);
      url.searchParams.set('cursor', pageInfo.endCursor);
      url.searchParams.set('direction', 'next');
      navigate(`${url.pathname}${url.search}`);
    }
  }, [pageInfo, navigate, currentPage]);

  const handlePreviousPage = useCallback(() => {
    if (pageInfo?.hasPreviousPage && pageInfo?.startCursor) {
      const prevPage = Math.max(1, currentPage - 1);
      sessionStorage.setItem('webp-current-page', prevPage.toString());
      setCurrentPage(prevPage);
      
      const url = new URL(window.location);
      url.searchParams.set('cursor', pageInfo.startCursor);
      url.searchParams.set('direction', 'previous');
      navigate(`${url.pathname}${url.search}`);
    }
  }, [pageInfo, navigate, currentPage]);

  // --- WebP Conversion Logic ---
  const handleWebPConversion = useCallback(async () => {
    if (selectedResources.length === 0) return;

    setIsConverting(true);
    setShowToast(false);

    try {
      const successfulConversions = [];
      const failedConversions = [];

      for (const resourceId of selectedResources) {
        const resource = filteredResources.find(r => r.id === resourceId);
        if (resource) {
          const fileExtension = resource.image.url.split('.').pop().toLowerCase();
          // Skip if already WebP
          if (fileExtension === 'webp') {
            continue;
          }

          try {
            const response = await fetch('/api/images/webp', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                imageUrl: resource.image.url,
                imageId: resource.id,
                skipActivityLog: true  // Skip individual logging for batch operation
              })
            });

            const result = await response.json();

            if (result.success && result.file) {
              successfulConversions.push(result.file);
            } else {
              // Check if it's a limit exceeded error
              if (result.limitExceeded) {
                setUpgradeMessage(result.error);
                setShowUpgradeModal(true);
                setIsConverting(false);
                return;
              }
              let errorMsg = result.error || 'Unknown error';
              if (errorMsg.includes('no longer exists in Shopify')) {
                errorMsg = t('images.imageNoLongerExists', { fileName: resource.image.url.split('/').pop() });
              }
              failedConversions.push({
                filename: resource.image.url.split('/').pop(),
                error: errorMsg
              });
            }
          } catch (err) {
            failedConversions.push({
              filename: resource.image.url.split('/').pop(),
              error: err.message
            });
          }
        }
      }

      // Log batch activity if any conversions were successful
      if (successfulConversions.length > 0) {
        try {
          console.log('Logging batch activity for WebP conversion:', successfulConversions.length);
          const batchResponse = await fetch('/api/batch-activity', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              type: 'webp_conversion',
              count: successfulConversions.length
            })
          });
          
          const batchResult = await batchResponse.json();
          console.log('Batch activity result:', batchResult);
          
          if (!batchResult.success) {
            console.error('Failed to log batch activity:', batchResult.error);
          }
        } catch (logError) {
          console.error('Failed to log batch activity:', logError);
          // Don't fail the main operation if logging fails
        }
      }

      // Show appropriate message based on results
      if (successfulConversions.length > 0) {
        const skippedCount = selectedResources.length - (successfulConversions.length + failedConversions.length);
        let message = `${t('images.conversionSuccess', 'Successfully converted')} ${successfulConversions.length} ${
          successfulConversions.length === 1 ? t('images.image', 'image') : t('images.images', 'images')
        } ${t('images.toWebP', 'to WebP')}`;

        if (skippedCount > 0) {
          message += `, ${t('images.skippedAlreadyWebP', 'skipped')} ${skippedCount} ${t('images.alreadyInWebP', 'already in WebP format')}`;
        }

        if (failedConversions.length > 0) {
          message += `. ${t('images.failedToConvert', 'Failed to convert')} ${failedConversions.length} ${t('images.images', 'images')}`;
          // Add details for missing images
          const missingImages = failedConversions.filter(f => f.error.includes('no longer exists in Shopify'));
          if (missingImages.length > 0) {
            message += `\n${missingImages.map(f => f.error).join('\n')}`;
          }
        }

        setToastMessage(message);
        setIsError(false);

        // Wait a moment before refreshing
        setTimeout(() => {
          navigate('.', { replace: true });
        }, 500);

      } else if (failedConversions.length > 0) {
        // Add details for missing images
        const missingImages = failedConversions.filter(f => f.error.includes('no longer exists in Shopify'));
        let message = `${t('images.failedToConvert', 'Failed to convert')} ${failedConversions.length} ${
          failedConversions.length === 1 ? t('images.image', 'image') : t('images.images', 'images')
        }. ${t('images.pleaseTryAgain', 'Please try again.')}`;
        if (missingImages.length > 0) {
          message += `\n${missingImages.map(f => f.error).join('\n')}`;
        }
        setToastMessage(message);
        setIsError(true);
      } else {
        setToastMessage(`${t('images.allSelectedImagesAlreadyWebP', 'All selected images are already in WebP format.')}`);
        setIsError(false);
      }
      setShowToast(true);

    } catch (error) {
      setToastMessage(error.message || t('images.errorConvertingImages', 'Error converting images'));
      setIsError(true);
      setShowToast(true);
    } finally {
      setIsConverting(false);
    }
  }, [selectedResources, filteredResources, navigate, t]);

  // --- UI ---
  const toastMarkup = showToast ? (
    <Toast
      content={toastMessage}
      error={isError}
      onDismiss={() => setShowToast(false)}
    />
  ) : null;

  // Format file size to human readable format
  const formatFileSize = (bytes) => {
    if (!bytes) return `0 ${t('images.fileSizes.kb')}`;
    const sizes = [
      t('images.fileSizes.bytes'),
      t('images.fileSizes.kb'), 
      t('images.fileSizes.mb'),
      t('images.fileSizes.gb')
    ];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
  };

  // Format date to readable format
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  if (isLoading) {
    return <TableSkeleton />;
  }
  return (
    <Frame>
      <Page fullWidth
        // title={t('images.convertImagesToWebP', 'Convert Images to WebP')}
        primaryAction={
          <ButtonGroup>
            <Button
              onClick={handleWebPConversion}
              disabled={selectedResources.length === 0 || isConverting}
              loading={isConverting}
              variant="primary"
            >
              {t('images.convertToWebP', 'Convert to WebP')}
            </Button>
          </ButtonGroup>
        }
      >
        {toastMarkup}
        <TitleBar title={t('images.webpConversionTitle', 'Convert Images to WebP')} />
        <Layout>
          <Layout.Section>
            {/* Table/Card header with search bar styled like Shopify admin */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 1rem',
              borderBottom: '1px solid #E1E3E5',
              background: '#F6F6F7',
              minHeight: 48
            }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: '#202223' }}>
                {/* Optionally, put a title here or leave blank for clean look */}
              </div>
              <div style={{ maxWidth: 320, width: '100%' }}>
                <TextField
                  value={searchQuery}
                  onChange={setSearchQuery}
                  placeholder={t('images.searchByFileName', 'Search by file name')}
                  autoComplete="off"
                  clearButton
                  onClearButtonClick={() => setSearchQuery("")}
                  prefix={<Icon source={SearchIcon} color="subdued" />}
                  label={t('images.search', 'Search')}
                  labelHidden
                  size="slim"
                  style={{ background: '#fff', borderRadius: 6 }}
                />
              </div>
            </div>
            {error && (
              <Banner status="critical" title={t('images.errorLoadingFiles', 'Error loading files')}>
                {error}
              </Banner>
            )}
            <div style={{ overflowX: 'hidden' }}>
              <LegacyCard>
                <IndexTable
                  resourceName={{ singular: t('images.file', 'file'), plural: t('images.files', 'files') }}
                  itemCount={filteredResources.length}
                  selectedItemsCount={selectedResources.length}
                  onSelectionChange={handleSelectionChange}
                  headings={[
                    { title: t('images.preview', 'Preview') },
                    { title: t('images.fileName', 'File name') },
                    { title: t('images.size', 'Size') },
                    { title: t('images.date', 'Date') },
                  ]}
                  selectable
                >
              {filteredResources.map(({ id, image, fileSize, createdAt }, index) => (
                <IndexTable.Row
                  id={id}
                  key={id}
                  selected={selectedResources.includes(id)}
                  position={index}
                >
                  <IndexTable.Cell>
                    <div style={{ width: '50px', height: '50px' }}>
                      <Thumbnail
                        source={image?.url || ''}
                        alt=""
                        size="small"
                      />
                    </div>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Box padding="0" display="flex" gap="100" vertical="true">
                      <Text variant="bodyMd" as="span" fontWeight="semibold">
                        {decodeURIComponent(image?.url?.split('/').pop().split('?')[0].split('.')[0] || '')}
                      </Text>
                      <Text variant="bodySm" as="p" tone="subdued">
                        {(image?.url?.split('.').pop().split('?')[0] || '').toUpperCase()}
                      </Text>
                    </Box>
                  </IndexTable.Cell>
                  <IndexTable.Cell>{formatFileSize(fileSize)}</IndexTable.Cell>
                  <IndexTable.Cell>{formatDate(createdAt)}</IndexTable.Cell>
                </IndexTable.Row>
              ))}
            </IndexTable>
            
            {/* Pagination */}
            {(pageInfo?.hasNextPage || pageInfo?.hasPreviousPage) && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-start',
                  alignItems: 'center',
                  padding: '16px',
                  borderTop: '1px solid #E1E3E5',
                  background: '#FAFBFB',
                  gap: '12px',
                }}
              >
                <Pagination
                  hasPrevious={pageInfo?.hasPreviousPage}
                  onPrevious={handlePreviousPage}
                  hasNext={pageInfo?.hasNextPage}
                  onNext={handleNextPage}
                  label={t('pagination.page_of', { current: currentPage, total: totalPages }, `Page ${currentPage} of ${totalPages}`)}
                />
              </div>
            )}
              </LegacyCard>
            </div>
          </Layout.Section>
        </Layout>
        <Modal
          open={showUpgradeModal}
          onClose={() => setShowUpgradeModal(false)}
          title={t('images.planLimitExceeded', 'Plan Limit Exceeded')}
          primaryAction={{
            content: t('images.upgradePlan', 'Upgrade Plan'),
            onAction: () => {
              setShowUpgradeModal(false);
              navigate('/app/billing');
            }
          }}
          secondaryActions={[
            {
              content: t('images.cancel', 'Cancel'),
              onAction: () => setShowUpgradeModal(false)
            }
          ]}
        >
          <Modal.Section>
            <Text as="p">
              {upgradeMessage}
            </Text>
            <Text as="p" variant="bodySm" tone="subdued">
              {t('images.upgradeYourPlanToContinue', 'Upgrade your plan to continue using this feature.')}
            </Text>
          </Modal.Section>
        </Modal>
        <Footer />
      </Page>
    </Frame>
  );
}
