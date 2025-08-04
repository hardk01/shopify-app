import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
if (typeof window === "undefined" && React.useLayoutEffect) {
  React.useLayoutEffect = React.useEffect;
}
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import {
  Page,
  Layout,
  Text,
  Banner,
  Box,
  LegacyCard,
  IndexTable,
  useIndexResourceState,
  Thumbnail,
  ButtonGroup,
  Button,
  Modal,
  LegacyStack,
  Toast,
  Frame,
  Tag,
  TextField,
  Select,
  SkeletonPage,
  SkeletonBodyText,
  SkeletonDisplayText,
  SkeletonThumbnail,
  Icon,
  Pagination
} from "@shopify/polaris";
import { SearchIcon } from '@shopify/polaris-icons';
import { TitleBar } from "@shopify/app-bridge-react";
import Footer from '../components/Footer';

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);

  // Helper to check if a file URL or file name is referenced in theme settings, sections, templates, or layout files
  async function isFileReferencedInThemeSettingsOrSections(admin, themeId, fileUrl, fileName) {
    try {
      const assetsResp = await admin.rest.get({
        path: `/themes/${themeId}/assets`
      });
      const assets = assetsResp.body && assetsResp.body.assets;
      if (!assets) return { foundFiles: [], count: 0 };

      // Only check text-based files for references
      const relevantAssets = assets.filter(asset =>
        asset.key.match(/\.(liquid|json|css|js|txt|svg|html)$/)
      );

      let foundFiles = [];
      for (const asset of relevantAssets) {
        const assetDetailResp = await admin.rest.get({
          path: `/themes/${themeId}/assets`,
          query: { 'asset[key]': asset.key }
        });
        const assetDetail = assetDetailResp.body && assetDetailResp.body.asset;
        if (!assetDetail || !assetDetail.value) continue;

        const content = assetDetail.value.toLowerCase();
        let found = false;
        // 1. Check for literal file name or URL
        if (
          (fileName && content.includes(fileName.toLowerCase())) ||
          (fileUrl && content.includes(fileUrl.toLowerCase()))
        ) {
          foundFiles.push(asset.key);
          found = true;
        }
        // 2. If .liquid file, use regex to parse <img src="..."> tags
        if (asset.key.endsWith('.liquid')) {
          try {
            const imgSrcRegex = /<img[^>]+src=["']([^"']+)["']/gi;
            let match;
            while ((match = imgSrcRegex.exec(content)) !== null) {
              const src = match[1];
              if ((fileName && src.includes(fileName.toLowerCase())) || (fileUrl && src.includes(fileUrl.toLowerCase()))) {
                foundFiles.push(asset.key);
                found = true;
                break;
              }
            }
          } catch (e) {
            // Ignore regex errors
          }
        }
      }
      return { foundFiles, count: foundFiles.length };
    } catch (e) {
      return { foundFiles: [], count: 0 };
    }
  }

  try {
    const response = await admin.graphql(`
      query GetMediaImagesAndProducts {
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
        products(first: 250) {
          edges {
            node {
              id
              title
              images(first: 10) {
                edges {
                  node {
                    id
                    url
                  }
                }
              }
            }
          }
        }
        themes(first: 5) {
          edges {
            node {
              id
              name
            }
          }
        }
      }
    `);

    const data = await response.json();
    // Build a map of image URLs to product IDs
    const productImages = {};
    if (data.data && data.data.products && data.data.products.edges) {
      data.data.products.edges.forEach(productEdge => {
        if (!productEdge || !productEdge.node || !productEdge.node.images || !productEdge.node.images.edges) return;
        productEdge.node.images.edges.forEach(imgEdge => {
          if (!imgEdge || !imgEdge.node || !imgEdge.node.url) return;
          const url = imgEdge.node.url;
          if (!productImages[url]) productImages[url] = [];
          if (productEdge.node.id) {
            productImages[url].push(productEdge.node.id);
          }
        });
      });
    }

    // Only log product references for each image
    if (data.data && data.data.products && data.data.products.edges) {
      for (const edge of data.data.files.edges) {
        const node = edge.node;
        const fileName = node.image?.url?.split('/').pop()?.split('?')[0];
        let isProductReferenced = false;
        for (const productEdge of data.data.products.edges) {
          if (!productEdge || !productEdge.node || !productEdge.node.images || !productEdge.node.images.edges) continue;
          for (const imgEdge of productEdge.node.images.edges) {
            if (!imgEdge || !imgEdge.node || !imgEdge.node.url) continue;
            const prodFileName = imgEdge.node.url.split('/').pop()?.split('?')[0];
            if (fileName && prodFileName && fileName === prodFileName) {
              isProductReferenced = true;
              break;
            }
          }
          if (isProductReferenced) break;
        }
      }
    }

    if (data.data && data.data.files && data.data.files.edges) {
      // Build a map of file id/url to theme reference
      const themeReferenceMap = {};
      if (data.data.themes && data.data.themes.edges) {
        for (const edge of data.data.files.edges) {
          const node = edge.node;
          const fileUrl = node.image?.url;
          const fileName = fileUrl?.split('/').pop()?.split('?')[0];
          const themeReferences = { count: 0, names: [], foundFiles: [] };
          for (const themeEdge of data.data.themes.edges) {
            const theme = themeEdge.node;
            const themeId = theme.id.split('/').pop();
            const themeName = theme.name;
            const refResult = await isFileReferencedInThemeSettingsOrSections(admin, themeId, fileUrl, fileName);
            if (refResult.count > 0) {
              themeReferences.count++;
              themeReferences.names.push(themeName);
              themeReferences.foundFiles.push(...refResult.foundFiles);
            }
          }
          themeReferenceMap[fileUrl] = themeReferences;
        }
      }
      // Attach compressed size metafield to each image node and add references
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
        let references = [];
        const fileName = node.image?.url?.split('/').pop()?.split('?')[0];
        let productCount = 0;
        Object.keys(productImages).forEach(url => {
          const prodFileName = url.split('/').pop()?.split('?')[0];
          if (fileName && prodFileName && fileName === prodFileName) {
            productCount += productImages[url].length;
          }
        });
        if (productCount > 0) {
          references.push({ type: 'product', count: productCount });
        }

        const themeRef = themeReferenceMap[node.image?.url];
        if (themeRef && themeRef.count > 0) {
          references.push({ type: 'theme', count: themeRef.count, names: themeRef.names });
        }
        return {
          ...edge,
          node: {
            ...node,
            compressedSize,
            references,
            isThemeReferenced: themeRef ? themeRef.count > 0 : false
          }
        };
      });
      // Log all references for each image
      images.forEach(img => {
        const fileName = img.node.image?.url?.split('/').pop()?.split('?')[0];
        img.node.references.forEach(ref => {
          if (ref.type === 'product') {
          }
        });
      });
      return json({ images, shop: session.shop });
    } else {
      console.error("Unexpected response structure:", data);
      return json({
        images: [],
        error: "No images found",
        shop: session.shop
      });
    }
  } catch (error) {
    console.error("Error:", error);
    return json({
      images: [],
      error: error.message,
      shop: session.shop
    });
  }
};

function TableSkeleton() {
  return (
    <SkeletonPage primaryAction>
      <Box paddingBlockEnd="400">
        <LegacyCard>
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
                <div style={{ flex: 1 }}>
                  <SkeletonBodyText lines={1} />
                </div>
              </div>
            ))}
          </div>
        </LegacyCard>
      </Box>
    </SkeletonPage>
  );
}

export default function ImagesPage() {
  const { t } = useTranslation();
  const { images = [], error, shop } = useLoaderData();
  const [localImages, setLocalImages] = useState(images);
  const [altModalActive, setAltModalActive] = useState(false);
  const [altType, setAltType] = useState("product");
  const [altTarget, setAltTarget] = useState("product");
  const [customAlt, setCustomAlt] = useState("");
  const [isSavingAlt, setIsSavingAlt] = useState(false);
  const [altTags, setAltTags] = useState([]); // array of {type, value}
  const [customTag, setCustomTag] = useState("");
  const [altSeparator, setAltSeparator] = useState(' | ');
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradeMessage, setUpgradeMessage] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    if (images) {
      const timeout = setTimeout(() => setIsLoading(false), 400);
      return () => clearTimeout(timeout);
    }
  }, [images]);

  // Reset page when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  // Always use shop for storeName extraction
  const storeName = shop ? shop.split('.')[0] : '';

  // Transform images array for resource state
  const resources = (localImages || []).map(({ node }) => ({
    id: node.id,
    ...node,
    fileSize: node.compressedSize != null ? node.compressedSize : (node.originalSource?.fileSize || 0)
  })).filter(resource => {
    if (!searchQuery) return true;
    const fileName = decodeURIComponent(resource.image?.url?.split('/').pop().split('?')[0].split('.')[0] || '');
    const altText = resource.image?.altText || '';
    return fileName.toLowerCase().includes(searchQuery.toLowerCase()) || altText.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const totalItems = resources.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const currentPageItems = resources.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const resourceName = {
    singular: 'file',
    plural: 'files',
  };

  const {
    selectedResources,
    handleSelectionChange,
  } = useIndexResourceState(resources);

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

  const handleSaveAlt = async () => {
    setIsSavingAlt(true);
    try {
      // Build alt text from badges/tags if any are present
      let altText = altTags.length > 0 ? altTags.map(tag => tag.value).join(altSeparator) : '';
      // Fallback to old logic if no badges
      if (!altText) {
        if (altType === "product") {
          altText = "Product Image";
        } else if (altType === "store") {
          altText = storeName;
        } else {
          altText = customAlt;
        }
      }
      let filteredResources = resources;
      // If any images are selected, only use those (ignore altTarget filtering)
      if (selectedResources.length > 0) {
        filteredResources = resources.filter(img => selectedResources.includes(img.id));
      } else {
        // Only filter by altTarget if not using selectedResources
        if (altTarget === 'product') {
          filteredResources = resources.filter(img =>
            img.references && img.references.some(ref => ref.type === 'product')
          );
        } else if (altTarget === 'theme') {
          filteredResources = resources.filter(img => {
            const hasTheme = img.references && img.references.some(ref => ref.type === 'theme');
            const hasProduct = img.references && img.references.some(ref => ref.type === 'product');
            return hasTheme && !hasProduct;
          });
        }
      }
      // Show error if no images to update
      if (filteredResources.length === 0) {
        setToastMessage(t('images.no_images_selected_to_update_alt_tag', 'No images selected to update ALT tag.'));
        setIsError(true);
        setShowToast(true);
        setIsSavingAlt(false);
        return;
      }
      // Collect all image IDs to update
      const imageIds = filteredResources.map(img => img.id);
      // Only call the API once for all images
      const response = await fetch("/api/images/alt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageIds,
          altText,
          altType
        })
      });
      const result = await response.json();
      // Check for limit exceeded errors
      if (result && result.limitExceeded) {
        setUpgradeMessage(result.error);
        setShowUpgradeModal(true);
        setIsSavingAlt(false);
        return;
      }
      if (!result.success) {
        setToastMessage(t('images.failed_to_update_alt_text', { count: imageIds.length }, `Failed to update alt text for ${imageIds.length} images.`));
        setIsError(true);
      } else {
        // Instantly update local display
        setLocalImages(localImages.map(img => {
          // Only update alt text for filtered images
          if (!imageIds.includes(img.id)) return img;
          return {
            ...img,
            node: {
              ...img.node,
              image: {
                ...img.node.image,
                altText: altTags.length > 0
                  ? altTags.map(tag => {
                      if (tag.type === 'product') {
                        return img.node.image && img.node.image.url
                          ? decodeURIComponent(img.node.image.url.split('/').pop().split('?')[0].split('.')[0])
                          : t('images.product_title', 'Product Image');
                      }
                      if (tag.type === 'store') {
                        return storeName;
                      }
                      return tag.value;
                    }).join(altSeparator)
                  : (altType === "product"
                      ? (img.node.image && img.node.image.url
                          ? decodeURIComponent(img.node.image.url.split('/').pop().split('?')[0].split('.')[0])
                          : t('images.product_title', 'Product Image'))
                    : altType === "store"
                      ? storeName
                      : customAlt)
              }
            }
          };
        }));
        setAltModalActive(false);
        setAltTags([]);
        setCustomTag("");
        setAltSeparator(' | ');
        setToastMessage(t('images.alt_text_updated', `Alt text updated for ${imageIds.length} image${imageIds.length !== 1 ? 's' : ''}!`));
        setIsError(false);
      }
      setShowToast(true);
    } catch (e) {
      setToastMessage(t('images.failed_to_update_alt_text', 'Failed to update alt text'));
      setIsError(true);
      setShowToast(true);
    } finally {
      setIsSavingAlt(false);
    }
  };

  const toastMarkup = showToast ? (
    <Toast
      content={toastMessage}
      error={isError}
      onDismiss={() => setShowToast(false)}
    />
  ) : null;

  // if (isLoading) {
  //   return <TableSkeleton />;
  // }
  return (
    <Frame>
      <Page fullWidth
        primaryAction={
          <ButtonGroup>
            <Button
              onClick={() => {
                setAltModalActive(true);
                setAltType("product");
                setAltTarget("product");
                setCustomAlt("");
              }}
            >
              Export All Product

            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setAltModalActive(true);
                setAltType("product");
                setAltTarget("selected");
                setCustomAlt("");
              }}
              disabled={selectedResources.length === 0}
            >
              Add ALT Tag to Selected Products
            </Button>
          </ButtonGroup>
        }
      >
        {toastMarkup}
        <TitleBar title="Files" />
        <Layout>
          <Layout.Section>
            {error && (
              <Banner status="critical" title="Error loading files">
                {error}
              </Banner>
            )}
            <div  >
              <LegacyCard>
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
                      placeholder="Search by file name or alt text"
                      autoComplete="off"
                      clearButton
                      onClearButtonClick={() => setSearchQuery("")}
                      prefix={<Icon source={SearchIcon} color="subdued" />}
                      label="Search"
                      labelHidden
                      size="slim"
                      style={{ background: '#fff', borderRadius: 6 }}
                    />
                  </div>
                </div>
                <IndexTable
                  resourceName={resourceName}
                  itemCount={resources.length}
                  selectedItemsCount={selectedResources.length}
                  onSelectionChange={handleSelectionChange}
                  headings={[
                    { title: 'Preview' },
                    { title: 'File name' },
                    { title: 'Alt text' },
                    { title: 'Size' },
                    { title: 'Date' },
                    { title: 'References' },
                  ]}
                  selectable
                >
                  {currentPageItems.map(({ id, image, fileSize, createdAt, references }, index) => (
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
                            alt={image?.altText || ''}
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
                      <IndexTable.Cell>
                        <div style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {image?.altText || '—'}
                        </div>
                      </IndexTable.Cell>
                      <IndexTable.Cell>{formatFileSize(fileSize)}</IndexTable.Cell>
                      <IndexTable.Cell>{formatDate(createdAt)}</IndexTable.Cell>
                      <IndexTable.Cell>
                        {references && references.length > 0
                          ? (references.length > 1
                            ? `${references.length} references`
                            : references[0].type === 'product'
                              ? `${references[0].count} product${references[0].count > 1 ? 's' : ''}`
                              : references[0].label || '—')
                          : '—'}
                      </IndexTable.Cell>
                    </IndexTable.Row>
                  ))}
                </IndexTable>
                {/* Add pagination section */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'flex-end',
                    alignItems: 'center',
                    padding: '16px',
                    borderTop: '1px solid var(--p-border-subdued)',
                    background: 'var(--p-surface)',
                  }}
                >
                  <Pagination
                    hasPrevious={currentPage > 1}
                    onPrevious={() => setCurrentPage(currentPage - 1)}
                    hasNext={currentPage < totalPages}
                    onNext={() => setCurrentPage(currentPage + 1)}
                  />
                  <Text as="span" variant="bodySm" tone="subdued" style={{ marginLeft: '16px' }}>
                    Page {currentPage} of {totalPages}
                  </Text>
                </div>
              </LegacyCard>
            </div>
          </Layout.Section>
        </Layout>
        <Modal
          open={altModalActive}
          onClose={() => setAltModalActive(false)}
          title={`Set Alt Text for ${altTarget === 'selected' ? `${selectedResources.length} Selected Products` : altTarget === 'product' ? 'All Product Images' : 'Theme Images'}`}
          primaryAction={{
            content: isSavingAlt ? "Saving..." : "Save",
            onAction: handleSaveAlt,
            loading: isSavingAlt,
            disabled: altTags.length === 0 && altType === "custom" && !customAlt.trim()
          }}
          secondaryActions={[
            {
              content: "Cancel",
              onAction: () => setAltModalActive(false)
            }
          ]}
        >
          <Modal.Section>
            <LegacyStack vertical spacing="loose">
              <Text as="p">
                Build your alt text by adding tags below. You can add <b>Product Title</b>, <b>Store Name</b>, or custom text.
                The final alt text will be a combination of these, in order, separated by your chosen separator.
              </Text>
              <LegacyStack spacing="tight" alignment="center">
                <Button onClick={() => setAltTags(tags => [...tags, { type: 'product', value: 'Product Title' }])}>
                  + Product Title
                </Button>
                <Button onClick={() => setAltTags(tags => [...tags, { type: 'store', value: storeName }])}>
                  + Store Name
                </Button>
                <TextField
                  labelHidden
                  label="Custom tag"
                  value={customTag}
                  onChange={setCustomTag}
                  placeholder="Add custom tag"
                  onBlur={() => {
                    if (customTag.trim()) {
                      setAltTags(tags => [...tags, { type: 'custom', value: customTag.trim() }]);
                      setCustomTag('');
                    }
                  }}
                  onKeyUp={e => {
                    if (e.key === 'Enter' && customTag.trim()) {
                      setAltTags(tags => [...tags, { type: 'custom', value: customTag.trim() }]);
                      setCustomTag('');
                    }
                  }}
                />
                <Button
                  onClick={() => {
                    if (customTag.trim()) {
                      setAltTags(tags => [...tags, { type: 'custom', value: customTag.trim() }]);
                      setCustomTag('');
                    }
                  }}
                >
                  + Add
                </Button>
              </LegacyStack>
              {altTags.length > 0 && (
                <Box paddingBlockStart="200">
                  <LegacyStack spacing="tight">
                    {altTags.map((tag, idx) => (
                      <Tag
                        key={idx}
                        onRemove={() => setAltTags(tags => tags.filter((_, i) => i !== idx))}
                      >
                        {tag.value}
                      </Tag>
                    ))}
                  </LegacyStack>
                </Box>
              )}
              {altTags.length > 0 && (
                <Select
                  label="Separator"
                  labelInline
                  options={[
                    { label: '|', value: '|' },
                    { label: '/', value: '/' },
                    { label: '-', value: '-' },
                    { label: ',', value: ',' },
                    { label: 'Space', value: ' ' }
                  ]}
                  value={altSeparator}
                  onChange={setAltSeparator}
                />
              )}
              <Box background="bg-surface-secondary" padding="200" borderRadius="200">
                <Text variant="bodySm">
                  <b>Preview:</b> {altTags.length > 0 ? altTags.map(tag => tag.value).join(altSeparator) : <em>(none selected)</em>}
                </Text>
              </Box>
            </LegacyStack>
          </Modal.Section>
        </Modal>
        <Modal
          open={showUpgradeModal}
          onClose={() => setShowUpgradeModal(false)}
          title="Plan Limit Exceeded"
          primaryAction={{
            content: "Upgrade Plan",
            onAction: () => {
              setShowUpgradeModal(false);
              navigate('/app/billing');
            }
          }}
          secondaryActions={[
            {
              content: "Cancel",
              onAction: () => setShowUpgradeModal(false)
            }
          ]}
        >
          <Modal.Section>
            <Text as="p">
              {upgradeMessage}
            </Text>
            <Text as="p" variant="bodySm" tone="subdued">
              Upgrade your plan to continue using this feature.
            </Text>
          </Modal.Section>
        </Modal>
        <Footer />
      </Page>
    </Frame>
  );
}