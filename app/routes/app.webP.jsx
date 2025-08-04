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
  Modal
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
    const response = await admin.graphql(
      `query GetMediaImages {
        files(first: 50, query: "mediaType:IMAGE") {
          edges {
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
        }
      }`
    );

    const data = await response.json();
    if (data.data && data.data.files && data.data.files.edges) {
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
      return json({ images, shop: session.shop });
    } else {
      return json({ images: [], error: "No images found", shop: session.shop });
    }
  } catch (error) {
    return json({ images: [], error: error.message, shop: session.shop });
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
  const { images = [], error, shop } = useLoaderData();
  const [localImages, setLocalImages] = useState(images);
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradeMessage, setUpgradeMessage] = useState("");
  
  useEffect(() => {
    if (images) {
      const timeout = setTimeout(() => setIsLoading(false), 400);
      return () => clearTimeout(timeout);
    }
  }, [images]);

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
                imageId: resource.id
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
                errorMsg = `The image ${resource.image.url.split('/').pop()} no longer exists in Shopify and could not be converted.`;
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
    if (!bytes) return '0 KB';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
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
        <TitleBar title={t('images.title', 'Image Compress')} />
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
