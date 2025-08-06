import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
if (typeof window === "undefined" && React.useLayoutEffect) {
  React.useLayoutEffect = React.useEffect;
}
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate, useRevalidator } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import {
  Page,
  Layout,
  Text,
  Banner,
  Box,
  Card,
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
  Pagination,
  BlockStack,
  InlineStack,
  Bleed,
  IndexFilters,
  useSetIndexFiltersMode,
  ChoiceList,
  Badge,
  RangeSlider
} from "@shopify/polaris";
import { SearchIcon } from '@shopify/polaris-icons';
import { TitleBar } from "@shopify/app-bridge-react";
import Footer from '../components/Footer';

export const loader = async ({ request }) => {
  try {
    const { admin, session } = await authenticate.admin(request);
  } catch (authError) {
    throw authError;
  }

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
    // Add timeout to prevent hanging
    const queryPromise = admin.graphql(`
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
      }
    `);
    
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('GraphQL query timeout')), 30000)
    );
    
    const response = await Promise.race([queryPromise, timeoutPromise]);

    const data = await response.json();
    
    // Build a map of image URLs to product information
    const productImages = {};
    const productTitles = {};
    if (data.data && data.data.products && data.data.products.edges) {
      data.data.products.edges.forEach(productEdge => {
        if (!productEdge || !productEdge.node || !productEdge.node.images || !productEdge.node.images.edges) return;
        productEdge.node.images.edges.forEach(imgEdge => {
          if (!imgEdge || !imgEdge.node || !imgEdge.node.url) return;
          const url = imgEdge.node.url;
          const fileName = url.split('/').pop()?.split('?')[0];
          
          // Map URL to product IDs
          if (!productImages[url]) productImages[url] = [];
          if (productEdge.node.id) {
            productImages[url].push(productEdge.node.id);
          }
          
          // Map image file name to product title for easier lookup
          if (fileName && productEdge.node.title) {
            if (!productTitles[fileName]) productTitles[fileName] = [];
            productTitles[fileName].push(productEdge.node.title);
          }
        });
      });
    }

    if (data.data && data.data.files && data.data.files.edges) {
      // Simplified approach - skip theme reference checking for now to speed up loading
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
        let productTitle = null;
        
        // Check product references and get product title
        Object.keys(productImages).forEach(url => {
          const prodFileName = url.split('/').pop()?.split('?')[0];
          if (fileName && prodFileName && fileName === prodFileName) {
            productCount += productImages[url].length;
          }
        });
        
        // Get product title for this image
        if (fileName && productTitles[fileName] && productTitles[fileName].length > 0) {
          // Use the first product title if multiple products use the same image
          productTitle = productTitles[fileName][0];
        }
        
        if (productCount > 0) {
          references.push({ type: 'product', count: productCount });
        }

        // Skip theme reference checking for faster loading
        // TODO: Add theme references back in future optimization
        
        return {
          ...edge,
          node: {
            ...node,
            compressedSize,
            references,
            productTitle, // Add product title to the node
            isThemeReferenced: false // Simplified for now
          }
        };
      });
      
      return json({ images, productTitles, shop: session.shop });
    } else {
      return json({
        images: [],
        error: "No images found",
        shop: session.shop
      });
    }
  } catch (error) {
    return json({
      images: [],
      error: error.message,
      shop: session?.shop || null
    });
  }
};

function TableSkeleton() {
  // Create skeleton data that matches the actual table structure
  const skeletonRows = Array.from({ length: 15 }, (_, index) => ({
    id: `skeleton-${index}`,
  }));

  return (
    <Frame>
      <Page 
        fullWidth
        primaryAction={
          <ButtonGroup>
            <Box width="160px">
              <SkeletonBodyText lines={1} />
            </Box>
          </ButtonGroup>
        }
      >
        <TitleBar title="Alt Text Manager" />
        <Layout>
          <Layout.Section>
            <Card padding="0">
              {/* Index Filters Skeleton */}
              <div style={{ padding: '16px', borderBottom: '1px solid var(--p-color-border)' }}>
                <InlineStack gap="400" align="space-between" blockAlign="center">
                  <Box width="280px">
                    <SkeletonBodyText lines={1} />
                  </Box>
                  <InlineStack gap="200" align="end">
                    <Box width="100px">
                      <SkeletonBodyText lines={1} />
                    </Box>
                    <Box width="80px">
                      <SkeletonBodyText lines={1} />
                    </Box>
                    <Box width="32px" minHeight="32px">
                      <SkeletonBodyText lines={1} />
                    </Box>
                  </InlineStack>
                </InlineStack>
              </div>
              
              {/* Use actual IndexTable with skeleton data for pixel-perfect matching */}
              <IndexTable
                resourceName={{ singular: 'file', plural: 'files' }}
                itemCount={skeletonRows.length}
                selectedItemsCount={0}
                onSelectionChange={() => {}}
                headings={[
                  { title: 'Preview' }, // Empty titles for skeleton
                  { title: 'File name' },
                  { title: 'Alt text' },
                  { title: 'Size' },
                  { title: 'Date' },
                  { title: 'References' },
                ]}
                selectable
                loading
              >
                {skeletonRows.map((row, index) => (
                  <IndexTable.Row
                    id={row.id}
                    key={row.id}
                    selected={false}
                    position={index}
                  >
                    <IndexTable.Cell>
                      <SkeletonThumbnail size="small" />
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <BlockStack gap="100">
                        <Box maxWidth="200px">
                          <SkeletonBodyText lines={1} />
                        </Box>
                        <Box maxWidth="60px">
                          <SkeletonBodyText lines={1} />
                        </Box>
                      </BlockStack>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Box maxWidth="180px">
                        <SkeletonBodyText lines={1} />
                      </Box>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Box maxWidth="80px">
                        <SkeletonBodyText lines={1} />
                      </Box>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Box maxWidth="70px">
                        <SkeletonBodyText lines={1} />
                      </Box>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Box maxWidth="100px">
                        <SkeletonBodyText lines={1} />
                      </Box>
                    </IndexTable.Cell>
                  </IndexTable.Row>
                ))}
              </IndexTable>
              
              {/* Pagination Skeleton */}
              <div style={{ padding: '16px', borderTop: '1px solid var(--p-color-border)' }}>
                <InlineStack align="start" blockAlign="center" gap="400">
                  <Box width="100px">
                    <SkeletonBodyText lines={1} />
                  </Box>
                  <Box width="150px">
                    <SkeletonBodyText lines={1} />
                  </Box>
                </InlineStack>
              </div>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    </Frame>
  );
}

export default function ImagesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  
  const { images = [], productTitles = {}, error, shop } = useLoaderData();
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
  const [isLoading, setIsLoading] = useState(true);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradeMessage, setUpgradeMessage] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  // IndexFilters state
  const [queryValue, setQueryValue] = useState("");
  const [sortSelected, setSortSelected] = useState(['date desc']);
  const [fileSizeFilter, setFileSizeFilter] = useState(undefined);
  const [fileTypeFilter, setFileTypeFilter] = useState(undefined);
  const [altTextFilter, setAltTextFilter] = useState(undefined);
  const {mode, setMode} = useSetIndexFiltersMode();

  // Save and cancel handlers for IndexFilters
  const onHandleSave = async () => {
    await new Promise(resolve => setTimeout(resolve, 1));
    return true;
  };
  
  const onHandleCancel = () => {
    // Clear all filters when cancel is clicked
    handleFiltersClearAll();
    // Exit filtering mode
    setMode('DEFAULT');
  };

  // Check if any filters are active and set mode accordingly
  useEffect(() => {
    const hasActiveFilters = queryValue || 
                            (fileSizeFilter && fileSizeFilter.length === 2) || 
                            (fileTypeFilter && fileTypeFilter.length > 0) || 
                            (altTextFilter && altTextFilter.length > 0);
    
    if (hasActiveFilters) {
      setMode('filtering');
    } else {
      setMode('DEFAULT');
    }
  }, [queryValue, fileSizeFilter, fileTypeFilter, altTextFilter, setMode]);

  useEffect(() => {
    if (images) {
      const timeout = setTimeout(() => setIsLoading(false), 400);
      return () => clearTimeout(timeout);
    }
  }, [images]);

  // Reset page when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [queryValue, fileSizeFilter, fileTypeFilter, altTextFilter, sortSelected]);

  // Always use shop for storeName extraction
  const storeName = shop ? shop.split('.')[0] : '';

  // Transform images array for resource state
  const allResources = (images || []).map(({ node }) => ({
    id: node.id,
    ...node,
    fileSize: node.compressedSize != null ? node.compressedSize : (node.originalSource?.fileSize || 0),
    fileName: decodeURIComponent(node.image?.url?.split('/').pop().split('?')[0].split('.')[0] || ''),
    fileExtension: (node.image?.url?.split('.').pop().split('?')[0] || '').toUpperCase()
  }));

  // Apply filters and search
  const filteredResources = allResources.filter(resource => {
    // Search filter
    if (queryValue) {
      const searchLower = queryValue.toLowerCase();
      const matchesFileName = resource.fileName.toLowerCase().includes(searchLower);
      const matchesFileType = resource.fileExtension.toLowerCase().includes(searchLower);
      const matchesAltText = (resource.image?.altText || '').toLowerCase().includes(searchLower);
      if (!matchesFileName && !matchesFileType && !matchesAltText) {
        return false;
      }
    }
    
    // File size filter
    if (fileSizeFilter && fileSizeFilter.length === 2) {
      const fileSizeKB = resource.fileSize / 1024;
      if (fileSizeKB < fileSizeFilter[0] || fileSizeKB > fileSizeFilter[1]) {
        return false;
      }
    }
    
    // File type filter
    if (fileTypeFilter && fileTypeFilter.length > 0) {
      if (!fileTypeFilter.includes(resource.fileExtension.toLowerCase())) {
        return false;
      }
    }

    // Alt text filter
    if (altTextFilter && altTextFilter.length > 0) {
      const hasAltText = resource.image?.altText && resource.image.altText.trim() !== '';
      if (altTextFilter.includes('with_alt') && !hasAltText) {
        return false;
      }
      if (altTextFilter.includes('without_alt') && hasAltText) {
        return false;
      }
    }
    
    return true;
  });

  // Apply sorting
  const sortedResources = [...filteredResources].sort((a, b) => {
    const [sortKey, sortDirection] = sortSelected[0].split(' ');
    
    switch (sortKey) {
      case 'name':
        const nameA = a.fileName.toLowerCase();
        const nameB = b.fileName.toLowerCase();
        return sortDirection === 'asc' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
      
      case 'size':
        return sortDirection === 'asc' ? a.fileSize - b.fileSize : b.fileSize - a.fileSize;
      
      case 'date':
        const dateA = new Date(a.createdAt).getTime();
        const dateB = new Date(b.createdAt).getTime();
        return sortDirection === 'asc' ? dateA - dateB : dateB - dateA;
      
      case 'type':
        const typeA = a.fileExtension.toLowerCase();
        const typeB = b.fileExtension.toLowerCase();
        return sortDirection === 'asc' ? typeA.localeCompare(typeB) : typeB.localeCompare(typeA);

      case 'alt':
        const altA = (a.image?.altText || '').toLowerCase();
        const altB = (b.image?.altText || '').toLowerCase();
        return sortDirection === 'asc' ? altA.localeCompare(altB) : altB.localeCompare(altA);
        
      default:
        return 0;
    }
  });

  const totalItems = sortedResources.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const currentPageItems = sortedResources.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // IndexFilters configuration
  const sortOptions = [
    {label: 'File Name', value: 'name asc', directionLabel: 'A-Z'},
    {label: 'File Name', value: 'name desc', directionLabel: 'Z-A'},
    {label: 'Date', value: 'date asc', directionLabel: 'Oldest first'},
    {label: 'Date', value: 'date desc', directionLabel: 'Newest first'},
    {label: 'File Size', value: 'size asc', directionLabel: 'Smallest first'},
    {label: 'File Size', value: 'size desc', directionLabel: 'Largest first'},
    {label: 'File Type', value: 'type asc', directionLabel: 'A-Z'},
    {label: 'File Type', value: 'type desc', directionLabel: 'Z-A'},
    {label: 'Alt Text', value: 'alt asc', directionLabel: 'A-Z'},
    {label: 'Alt Text', value: 'alt desc', directionLabel: 'Z-A'},
  ];

  // Filter handlers
  const handleFiltersQueryChange = useCallback((value) => {
    setQueryValue(value);
    // Enter filtering mode when search is used
    if (value && value.length > 0) {
      setMode('filtering');
    }
  }, [setMode]);
  const handleQueryValueRemove = useCallback(() => {
    setQueryValue('');
    // Exit filtering mode when search is cleared
    setMode('DEFAULT');
  }, [setMode]);
  const handleFileSizeChange = useCallback((value) => {
    setFileSizeFilter(value);
    setMode('filtering');
  }, [setMode]);
  const handleFileSizeRemove = useCallback(() => {
    setFileSizeFilter(undefined);
    setMode('DEFAULT');
  }, [setMode]);
  const handleFileTypeChange = useCallback((value) => {
    setFileTypeFilter(value);
    if (value && value.length > 0) {
      setMode('filtering');
    }
  }, [setMode]);
  const handleFileTypeRemove = useCallback(() => {
    setFileTypeFilter(undefined);
    setMode('DEFAULT');
  }, [setMode]);
  const handleAltTextChange = useCallback((value) => {
    setAltTextFilter(value);
    if (value && value.length > 0) {
      setMode('filtering');
    }
  }, [setMode]);
  const handleAltTextRemove = useCallback(() => {
    setAltTextFilter(undefined);
    setMode('DEFAULT');
  }, [setMode]);
  
  const handleFiltersClearAll = useCallback(() => {
    handleQueryValueRemove();
    handleFileSizeRemove();
    handleFileTypeRemove();
    handleAltTextRemove();
    // Exit filtering mode when all filters are cleared
    setMode('DEFAULT');
  }, [handleQueryValueRemove, handleFileSizeRemove, handleFileTypeRemove, handleAltTextRemove, setMode]);

  // Get unique file types for filter
  const availableFileTypes = [...new Set(allResources.map(r => r.fileExtension.toLowerCase()))]
    .sort()
    .map(type => ({label: type.toUpperCase(), value: type}));

  const filters = [
    {
      key: 'fileSize',
      label: 'File Size (KB)',
      filter: (
        <RangeSlider
          label="File size is between"
          labelHidden
          value={fileSizeFilter || [0, 10000]}
          prefix=""
          suffix=" KB"
          output
          min={0}
          max={10000}
          step={100}
          onChange={handleFileSizeChange}
        />
      ),
    },
    {
      key: 'fileType',
      label: 'File Type',
      filter: (
        <ChoiceList
          title="File Type"
          titleHidden
          choices={availableFileTypes}
          selected={fileTypeFilter || []}
          onChange={handleFileTypeChange}
          allowMultiple
        />
      ),
      shortcut: true,
    },
    {
      key: 'altText',
      label: 'Alt Text',
      filter: (
        <ChoiceList
          title="Alt Text"
          titleHidden
          choices={[
            {label: 'With Alt Text', value: 'with_alt'},
            {label: 'Without Alt Text', value: 'without_alt'}
          ]}
          selected={altTextFilter || []}
          onChange={handleAltTextChange}
          allowMultiple
        />
      ),
      shortcut: true,
    },
  ];

  const appliedFilters = [];
  if (fileSizeFilter) {
    appliedFilters.push({
      key: 'fileSize',
      label: `File size: ${fileSizeFilter[0]}-${fileSizeFilter[1]} KB`,
      onRemove: handleFileSizeRemove,
    });
  }
  if (fileTypeFilter && fileTypeFilter.length > 0) {
    appliedFilters.push({
      key: 'fileType',
      label: `File type: ${fileTypeFilter.map(t => t.toUpperCase()).join(', ')}`,
      onRemove: handleFileTypeRemove,
    });
  }
  if (altTextFilter && altTextFilter.length > 0) {
    const altLabels = altTextFilter.map(filter => 
      filter === 'with_alt' ? 'With Alt Text' : 'Without Alt Text'
    );
    appliedFilters.push({
      key: 'altText',
      label: `Alt text: ${altLabels.join(', ')}`,
      onRemove: handleAltTextRemove,
    });
  }

  const resourceName = {
    singular: t('images.file', 'file'),
    plural: t('images.files', 'files'),
  };

  const {
    selectedResources,
    handleSelectionChange,
    clearSelection,
  } = useIndexResourceState(sortedResources);

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
      let filteredResources = sortedResources;
      // If any images are selected, only use those (ignore altTarget filtering)
      if (selectedResources.length > 0) {
        filteredResources = sortedResources.filter(img => selectedResources.includes(img.id));
      } else {
        // Only filter by altTarget if not using selectedResources
        if (altTarget === 'product') {
          filteredResources = sortedResources.filter(img =>
            img.references && img.references.some(ref => ref.type === 'product')
          );
        } else if (altTarget === 'theme') {
          filteredResources = sortedResources.filter(img => {
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
        // Success - no need to update local state, revalidator will handle refresh
        setAltModalActive(false);
        setAltTags([]);
        setCustomTag("");
        setAltSeparator(' | ');
        setToastMessage(t('images.alt_text_updated', `Alt text updated for ${imageIds.length} image${imageIds.length !== 1 ? 's' : ''}!`));
        setIsError(false);
        
        // Clear selection after successful alt text update
        clearSelection();
        
        // Refresh the table after successful alt text update
        setTimeout(() => {
          revalidator.revalidate();
        }, 1000);
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

  // Helper function to get product title for selected images
  const getProductTitleForSelectedImages = () => {
    if (selectedResources.length === 0) return 'Product Title';
    
    // Get all selected resources with product titles
    const selectedWithTitles = sortedResources.filter(resource => 
      selectedResources.includes(resource.id) && resource.productTitle
    );
    
    if (selectedWithTitles.length === 0) {
      return 'Product Title'; // Fallback if no product titles found
    }
    
    if (selectedWithTitles.length === 1) {
      return selectedWithTitles[0].productTitle;
    }
    
    // If multiple images with different product titles, use the first one
    // but could be enhanced to show a selection or use a generic title
    return selectedWithTitles[0].productTitle;
  };

  if (isLoading) {
    return <TableSkeleton />;
  }
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
              {t('alt.export_all_product')}
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
              {t('alt.add_alt_tag_to_selected')}
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
            <Card padding="0">
              {/* Index Filters */}
              <IndexFilters
                sortOptions={sortOptions}
                sortSelected={sortSelected}
                queryValue={queryValue}
                queryPlaceholder="Search by file name, alt text or file type"
                onQueryChange={handleFiltersQueryChange}
                onQueryClear={handleQueryValueRemove}
                onSort={setSortSelected}
                filters={filters}
                appliedFilters={appliedFilters}
                onClearAll={handleFiltersClearAll}
                mode={mode}
                setMode={setMode}
                tabs={[]}
                views={[]}
                onHandleSave={onHandleSave}
                onHandleCancel={onHandleCancel}
                hideFilters={false}
                disabled={false}
                canCreateNewView={true}
                loading={false}
                primaryAction={
                  mode === 'filtering' ? {
                    type: 'save-as',
                    onAction: async (value) => {
                      await new Promise(resolve => setTimeout(resolve, 1));
                      return true;
                    },
                    disabled: false,
                    loading: false,
                  } : undefined
                }
                cancelAction={
                  mode === 'filtering' ? {
                    onAction: onHandleCancel,
                    disabled: false,
                    loading: false,
                  } : undefined
                }
              />
              
              {/* Table without sticky header */}
              <IndexTable
                resourceName={resourceName}
                itemCount={sortedResources.length}
                selectedItemsCount={selectedResources.length}
                onSelectionChange={handleSelectionChange}
                headings={[
                  { title: t('images.preview', 'Preview') },
                  { title: t('images.fileName', 'File name') },
                  { title: t('images.altText', 'Alt text') },
                  { title: t('images.size', 'Size') },
                  { title: t('images.date', 'Date') },
                  { title: t('images.references', 'References') },
                ]}
                selectable
              >
                {currentPageItems.map(({ id, image, fileSize, createdAt, references, fileName, fileExtension }, index) => (
                  <IndexTable.Row
                    id={id}
                    key={id}
                    selected={selectedResources.includes(id)}
                    position={index}
                  >
                    <IndexTable.Cell>
                      <Thumbnail
                        source={image?.url || ''}
                        alt={image?.altText || ''}
                        size="small"
                      />
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <BlockStack gap="100">
                        <Text variant="bodyMd" as="span" fontWeight="semibold">
                          {fileName}
                        </Text>
                        <Text variant="bodySm" as="p" tone="subdued">
                          {fileExtension}
                        </Text>
                      </BlockStack>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Text variant="bodyMd" truncate>
                        {image?.altText || '—'}
                      </Text>
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
                
              {/* Pagination */}
              {totalPages > 1 && (
                <div style={{ padding: '16px', borderTop: '1px solid var(--p-color-border)' }}>
                  <InlineStack align="start" blockAlign="center" gap="400">
                    <Pagination
                      hasPrevious={currentPage > 1}
                      onPrevious={() => setCurrentPage(currentPage - 1)}
                      hasNext={currentPage < totalPages}
                      onNext={() => setCurrentPage(currentPage + 1)}
                    />
                    <Text variant="bodySm" tone="subdued">
                      {`${((currentPage - 1) * itemsPerPage) + 1}-${Math.min(currentPage * itemsPerPage, totalItems)} of ${totalItems}`}
                    </Text>
                  </InlineStack>
                </div>
              )}
            </Card>
          </Layout.Section>
        </Layout>
        <Modal
          open={altModalActive}
          onClose={() => setAltModalActive(false)}
          title={
            altTarget === 'selected' 
              ? t('alt.set_alt_text_for_selected', { count: selectedResources.length })
              : altTarget === 'product' 
                ? t('alt.set_alt_text_for_all_products')
                : t('alt.set_alt_text_for_theme')
          }
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
                Build your alt text by adding tags below. You can add the actual <b>Product Title</b> from your selected products, <b>Store Name</b>, or custom text.
                The final alt text will be a combination of these, in order, separated by your chosen separator.
              </Text>
              <LegacyStack spacing="tight" alignment="center">
                <Button onClick={() => {
                  const productTitle = getProductTitleForSelectedImages();
                  setAltTags(tags => [...tags, { type: 'product', value: productTitle }]);
                }}>
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

export function ErrorBoundary() {
  return (
    <Frame>
      <Page>
        <Banner status="critical" title="Something went wrong">
          <p>There was an error loading the alt tag page. Please refresh and try again.</p>
        </Banner>
      </Page>
    </Frame>
  );
}