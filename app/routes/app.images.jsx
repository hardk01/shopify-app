import { json } from "@remix-run/node";
import { useLoaderData, useNavigate, useRevalidator } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import { useEffect, useState, useCallback } from "react";
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
  RangeSlider,
  LegacyStack,
  Toast,
  Frame,
  SkeletonPage,
  SkeletonBodyText,
  SkeletonDisplayText,
  SkeletonThumbnail,
  Pagination,
  TextField,
  Icon,
  BlockStack,
  InlineStack,
  Bleed,
  Scrollable,
  IndexFilters,
  useSetIndexFiltersMode,
  ChoiceList,
  Badge,
  Divider
} from "@shopify/polaris";
import { SearchIcon } from '@shopify/polaris-icons';
import { TitleBar } from "@shopify/app-bridge-react";
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import Footer from "../components/Footer";

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
                metafields(namespace: "compression", first: 10) {
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
      // Attach metafields to each image node
      const images = data.data.files.edges.map(edge => {
        const node = edge.node;
        let compressedSize = null;
        let fileFormat = null;
        
        if (node.metafields && node.metafields.edges.length > 0) {
          // Find compressed size metafield
          const sizeMetafield = node.metafields.edges.find(
            (e) => e.node.key === "compressed_size"
          );
          if (sizeMetafield) {
            compressedSize = Number(sizeMetafield.node.value);
          }
          
          // Find file format metafield
          const formatMetafield = node.metafields.edges.find(
            (e) => e.node.key === "file_format"
          );
          if (formatMetafield) {
            fileFormat = formatMetafield.node.value;
          }
        }
        
        return {
          ...edge,
          node: {
            ...node,
            compressedSize,
            fileFormat
          }
        };
      });
      return json({ images, shop: session.shop });
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
      shop: session.shop
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
            <Box width="140px">
              <SkeletonBodyText lines={1} />
            </Box>
          </ButtonGroup>
        }
      >
        <TitleBar title="Image Compression" />
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
                  { title: 'Preview' },
                  { title: 'File name' },
                  { title: 'Alt text' },
                  { title: 'Size' },
                  { title: 'Date' },
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
  const { images = [], error, shop } = useLoaderData();
  const [localImages, setLocalImages] = useState(images);
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  
  // IndexFilters state
  const [queryValue, setQueryValue] = useState("");
  const [sortSelected, setSortSelected] = useState(['date desc']);
  const [fileSizeFilter, setFileSizeFilter] = useState(undefined);
  const [fileTypeFilter, setFileTypeFilter] = useState(undefined);
  const {mode, setMode} = useSetIndexFiltersMode();
  
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  const [compressModalActive, setCompressModalActive] = useState(false);
  const [compressionValue, setCompressionValue] = useState(80);
  const [isCompressing, setIsCompressing] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [compressionResults, setCompressionResults] = useState([]);
  const [compressionDone, setCompressionDone] = useState(false);
  const [altModalActive, setAltModalActive] = useState(false);
  const [altImage, setAltImage] = useState(null);
  const [altType, setAltType] = useState("product");
  const [customAlt, setCustomAlt] = useState("");
  const [isSavingAlt, setIsSavingAlt] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  // Badge/tag state for new alt text UI
  const [altTags, setAltTags] = useState([]); // array of {type, value}
  const [customTag, setCustomTag] = useState("");
  const [altSeparator, setAltSeparator] = useState(' | ');
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradeMessage, setUpgradeMessage] = useState("");
  const [previewImageUrl, setPreviewImageUrl] = useState(null);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  
  // Always use shop for storeName extraction
  const storeName = shop ? shop.split('.')[0] : '';

  // Transform images array for resource state
  const allResources = (localImages || []).map(({ node }) => {
    // Prioritize compressedSize from metafield over originalSource.fileSize
    const fileSize = node.compressedSize != null
      ? node.compressedSize
      : (node.originalSource?.fileSize || 0);
    
    // Explicitly include fileFormat property
    return {
      id: node.id,
      ...node,
      fileSize,
      fileFormat: node.fileFormat,
      fileName: decodeURIComponent(node.image?.url?.split('/').pop().split('?')[0].split('.')[0] || ''),
      fileExtension: (node.image?.url?.split('.').pop().split('?')[0] || '').toUpperCase()
    };
  });

  // Apply filters and search
  const resources = allResources.filter(resource => {
    // Search filter
    if (queryValue) {
      const searchLower = queryValue.toLowerCase();
      const matchesFileName = resource.fileName.toLowerCase().includes(searchLower);
      const matchesFileType = resource.fileExtension.toLowerCase().includes(searchLower);
      const matchesAltText = resource.image?.altText?.toLowerCase().includes(searchLower);
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
    
    return true;
  });

  // Apply sorting
  const sortedResources = [...resources].sort((a, b) => {
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
        
      default:
        return 0;
    }
  });

  const resourceName = {
    singular: t('images.file', 'file'),
    plural: t('images.files', 'files'),
  };

  const {
    selectedResources,
    allResourcesSelected,
    handleSelectionChange,
    clearSelection,
  } = useIndexResourceState(sortedResources);

  const handleCompressClick = useCallback(() => {
    if (selectedResources.length > 0) {
      setCompressModalActive(true);
      setCompressionResults([]); // Clear previous results when opening modal
      setCompressionDone(false); // Reset completion state
      setCompressionValue(80); // Reset compression quality to default (80%)
    }
  }, [selectedResources]);

  const handleCompressionChange = useCallback(
    (value) => setCompressionValue(value),
    [],
  );

  const handleCompression = useCallback(async () => {
    setIsCompressing(true);
    setCompressionResults([]);
    setCompressionDone(false);
    try {
      const successfulCompressions = [];
      const failedCompressions = [];
      let updatedImages = [...localImages];

      for (const resourceId of selectedResources) {
        const resource = sortedResources.find(r => r.id === resourceId);
        if (resource) {
          try {
            const response = await fetch('/api/images/compress', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                imageUrl: resource.image.url,
                imageId: resource.id,
                quality: compressionValue,
                filename: resource.image.url.split('/').pop().split('?')[0],
                originalFilename: decodeURIComponent(resource.image.url.split('/').pop().split('?')[0].split('.')[0]),
                altText: resource.image.altText || "",
                skipActivityLog: true  // Skip individual logging for batch operation
              })
            });

            const result = await response.json();
            if (result.success && result.newFile) {
              const compressionInfo = {
                // Use the original filename instead of the one from the URL
                filename: result.originalFilename || decodeURIComponent(resource.image.url.split('/').pop().split('?')[0].split('.')[0]),
                displayFilename: result.newFile.url.split('/').pop(),
                originalSize: resource.fileSize,
                compressedSize: result.newFile.size,
                compressionRatio: ((resource.fileSize / result.newFile.size) * 100).toFixed(2),
                width: null,
                height: null
              };
              successfulCompressions.push(compressionInfo);
              setCompressionResults(prev => [...prev, compressionInfo]);

              // Update localImages with new compressed size and file format
              updatedImages = updatedImages.map(img => {
                if (img.node.id === resource.id) {
                  const fileFormat = result.newFile.url.split('.').pop().split('?')[0];
                  return {
                    ...img,
                    node: {
                      ...img.node,
                      compressedSize: result.newFile.size,
                      fileFormat: fileFormat,
                      originalSource: {
                        ...img.node.originalSource,
                        fileSize: result.newFile.size
                      }
                    }
                  };
                }
                return img;
              });

              // Set compressed size metafield using API endpoint
              const metafieldResponse = await fetch('/api/images/metafield', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  imageId: resource.id,
                  namespace: "compression",
                  key: "compressed_size",
                  value: result.newFile.size.toString(),
                  type: "number_integer"
                })
              });
              
              const sizeMetafieldResult = await metafieldResponse.json();
              if (!sizeMetafieldResult.success) {
                // Silent error - don't log metafield errors
              }
              
              // Also set the file format metafield
              const formatResponse = await fetch('/api/images/metafield', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  imageId: resource.id,
                  namespace: "compression",
                  key: "file_format",
                  value: result.newFile.url.split('.').pop().split('?')[0],
                  type: "single_line_text_field"
                })
              });
              
              const formatMetafieldResult = await formatResponse.json();
              if (!formatMetafieldResult.success) {
                // Silent error - don't log metafield errors
              }
            } else {
              // Check if it's a limit exceeded error
              if (result.limitExceeded) {
                setUpgradeMessage(result.error);
                setShowUpgradeModal(true);
                setIsCompressing(false);
                return;
              }
              failedCompressions.push({
                filename: resource.image.url.split('/').pop(),
                error: result.error || 'Unknown error'
              });
            }
          } catch (err) {
            failedCompressions.push({
              filename: resource.image.url.split('/').pop(),
              error: err.message
            });
          }
        }
      }

      setLocalImages(updatedImages);

      // Log batch activity if any compressions were successful
      if (successfulCompressions.length > 0) {
        try {
          console.log('Logging batch activity for compression:', successfulCompressions.length);
          const batchResponse = await fetch('/api/batch-activity', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              type: 'image_compression',
              count: successfulCompressions.length
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

      // Show appropriate message
      if (successfulCompressions.length > 0) {
        setToastMessage(t('images.compressSuccess', { 
          count: successfulCompressions.length, 
          type: successfulCompressions.length === 1 ? t('images.image') : t('images.images')
        }));
        setIsError(false);
        setCompressionDone(true);
        
        // Clear selection after successful compression
        clearSelection();
        
        // Refresh the table after successful compression
        setTimeout(() => {
          revalidator.revalidate();
        }, 1000);
      } else if (failedCompressions.length > 0) {
        setToastMessage(t('images.failedToConvert', `Failed to compress ${failedCompressions.length} ${
          failedCompressions.length === 1 ? 'image' : 'images'
        }.`) + ' ' + t('images.pleaseTryAgain'));
        setIsError(true);
        setCompressionDone(true);
      }
      setShowToast(true);

    } catch (error) {
      setToastMessage(error.message || t('images.errorConvertingImages'));
      setIsError(true);
      setCompressionDone(true);
      setShowToast(true);
    } finally {
      setIsCompressing(false);
    }
  }, [selectedResources, resources, compressionValue, navigate, localImages]);

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

  // Get file extension from URL
  const getFileExtension = (url) => {
    const extension = url.split('.').pop().toUpperCase();
    return extension.length <= 4 ? extension : '';
  };

  // Add these state variables at the top of your ImagesPage component
  // const [currentPage, setCurrentPage] = useState(1);

  // Add pagination calculations after your resources filter
  const totalItems = sortedResources.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const currentPageItems = sortedResources.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Add useEffect to reset page when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [queryValue, fileSizeFilter, fileTypeFilter, sortSelected]);

  useEffect(() => {
    if (images) {
      const timeout = setTimeout(() => setIsLoading(false), 400);
      return () => clearTimeout(timeout);
    }
  }, [images]);

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
  ];

  // Filter handlers
  const handleFiltersQueryChange = useCallback((value) => setQueryValue(value), []);
  const handleQueryValueRemove = useCallback(() => setQueryValue(''), []);
  const handleFileSizeChange = useCallback((value) => setFileSizeFilter(value), []);
  const handleFileSizeRemove = useCallback(() => setFileSizeFilter(undefined), []);
  const handleFileTypeChange = useCallback((value) => setFileTypeFilter(value), []);
  const handleFileTypeRemove = useCallback(() => setFileTypeFilter(undefined), []);
  
  const handleFiltersClearAll = useCallback(() => {
    handleQueryValueRemove();
    handleFileSizeRemove();
    handleFileTypeRemove();
  }, [handleQueryValueRemove, handleFileSizeRemove, handleFileTypeRemove]);

  // Save and cancel handlers for IndexFilters
  const onHandleSave = async () => {
    await new Promise(resolve => setTimeout(resolve, 1));
    return true;
  };
  
  const onHandleCancel = () => {
    // Clear all filters when cancel is clicked
    handleFiltersClearAll();
  };

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

  const handleCloseCompressModal = useCallback(() => {
    setCompressModalActive(false);
    setCompressionDone(false);
    setCompressionResults([]); // Clear previous compression results
    setCompressionValue(80); // Reset compression quality to default
  }, []);

  const compressionModal = (
    <Modal
      open={compressModalActive}
      onClose={handleCloseCompressModal}
      title={t('images.compress_images', 'Compress Images')}
      primaryAction={
        compressionDone
          ? {
              content: t('images.done', 'Done'),
              onAction: handleCloseCompressModal,
              loading: false,
            }
          : {
              content: isCompressing ? t('images.compressing', 'Compressing') : t('images.compress', 'Compress'),
              onAction: handleCompression,
              loading: isCompressing,
            }
      }
      secondaryActions={
        compressionDone
          ? []
          : [
              {
                content: t('images.cancel', 'Cancel'),
                onAction: handleCloseCompressModal,
              },
            ]
      }
    >
      <Modal.Section>
        <LegacyStack vertical>
          <Text as="p">
            {t('images.selected_images', { count: selectedResources.length })}
          </Text>
          <Box padding="400">
            <RangeSlider
              label={t('images.compression_quality', 'Compression Quality')}
              value={compressionValue}
              onChange={handleCompressionChange}
              output
              min={0}
              max={100}
              step={1}
              suffix={`${compressionValue}%`}
              disabled={compressionDone}
            />
          </Box>
          <Text as="p" variant="bodySm" tone="subdued">
            {t('images.compressionQualityHint', 'Higher quality means larger file size. Recommended: 70-85%')}
          </Text>
          
          {/* Demo Compression Preview */}
          {!compressionDone && selectedResources.length > 0 && (() => {
            // Get a random selected image as demo
            const demoResource = sortedResources.find(r => selectedResources.includes(r.id));
            const demoOriginalSizeKB = Math.round(demoResource?.fileSize / 1024) || 245;
            
            // Calculate realistic compression based on actual file size
            const baseCompression = 0.35; // 35% base compression
            const qualityFactor = compressionValue / 100;
            const compressionFactor = baseCompression + (1 - baseCompression) * qualityFactor;
            const demoPredictedSize = Math.round(demoOriginalSizeKB * compressionFactor);
            const demoPredictedRatio = Math.round(((demoOriginalSizeKB - demoPredictedSize) / demoOriginalSizeKB) * 100);
            
            return (
              <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                <BlockStack gap="300">
                  <Text variant="headingSm" fontWeight="bold">
                    💡 Live Preview - Your Selected Image
                  </Text>
                  <Text variant="bodySm" tone="subdued">
                    Showing preview with "{demoResource?.fileName || 'your image'}" - {selectedResources.length} image{selectedResources.length > 1 ? 's' : ''} selected
                  </Text>
                  
                  {/* Side-by-side image comparison */}
                  <InlineStack gap="400" align="center">
                    {/* Original Image */}
                    <BlockStack gap="200" align="center">
                      <Text variant="bodyMd" fontWeight="medium" tone="subdued">
                        Original Image
                      </Text>
                      <Box 
                        padding="200" 
                        background="bg-surface" 
                        borderRadius="200"
                        borderWidth="025"
                        borderColor="border"
                        style={{ minHeight: '140px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Thumbnail
                          source={demoResource?.image?.url || "https://via.placeholder.com/120x120/E5E5E5/999999?text=No+Image"}
                          alt={demoResource?.image?.altText || "Original image"}
                          size="large"
                        />
                      </Box>
                      <Text variant="bodySm" fontWeight="bold" tone="base">
                        {demoOriginalSizeKB} KB - 100% Quality
                      </Text>
                    </BlockStack>
                    
                    {/* Arrow indicator */}
                    <Box padding="200">
                      <Text variant="headingMd" tone="subdued" style={{ fontSize: '24px' }}>
                        →
                      </Text>
                    </Box>
                    
                    {/* Compressed Image Preview */}
                    <BlockStack gap="200" align="center">
                      <Text variant="bodyMd" fontWeight="medium" tone="subdued">
                        Compressed Preview
                      </Text>
                      <Box 
                        padding="200" 
                        background="bg-surface-success-subdued" 
                        borderRadius="200"
                        borderWidth="025"
                        borderColor="border-success"
                        style={{ minHeight: '140px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >
                        {/* Simulate compression effect with CSS filter */}
                        <div style={{ 
                          filter: `contrast(${0.85 + (compressionValue / 100) * 0.15}) brightness(${0.92 + (compressionValue / 100) * 0.08}) saturate(${0.9 + (compressionValue / 100) * 0.1})`,
                          transition: 'filter 0.3s ease',
                          opacity: compressionValue < 30 ? 0.8 : compressionValue < 60 ? 0.92 : 1
                        }}>
                          <Thumbnail
                            source={demoResource?.image?.url || "https://via.placeholder.com/120x120/E5E5E5/999999?text=No+Image"}
                            alt={demoResource?.image?.altText || "Compressed preview"}
                            size="large"
                          />
                        </div>
                      </Box>
                      <Text variant="bodySm" fontWeight="bold" tone="success">
                        {demoPredictedSize} KB - {compressionValue}% Quality
                      </Text>
                    </BlockStack>
                  </InlineStack>
                  
                  {/* Quality indicator */}
                  <InlineStack align="space-between" blockAlign="center">
                    <Text variant="bodyMd" fontWeight="medium">
                      Quality: {compressionValue}%
                    </Text>
                    <Badge 
                      status={
                        compressionValue >= 90 ? 'success' : 
                        compressionValue >= 70 ? 'attention' : 
                        compressionValue >= 50 ? 'warning' : 'critical'
                      }
                    >
                      {compressionValue >= 90 ? 'Excellent' : 
                       compressionValue >= 70 ? 'Good' : 
                       compressionValue >= 50 ? 'Fair' : 'Low'}
                    </Badge>
                  </InlineStack>
                  
                  <Divider />
                  
                  {/* Size comparison */}
                  <InlineStack gap="400" align="space-between">
                    <BlockStack gap="100">
                      <Text variant="bodySm" tone="subdued">Original Size</Text>
                      <Text variant="bodyMd" fontWeight="bold">
                        {demoOriginalSizeKB} KB
                      </Text>
                    </BlockStack>
                    
                    <BlockStack gap="100">
                      <Text variant="bodySm" tone="subdued">Predicted Size</Text>
                      <Text 
                        variant="bodyMd" 
                        fontWeight="bold" 
                        tone={demoPredictedSize < demoOriginalSizeKB ? 'success' : 'base'}
                      >
                        {demoPredictedSize} KB
                      </Text>
                    </BlockStack>
                    
                    <BlockStack gap="100">
                      <Text variant="bodySm" tone="subdued">Space Saved</Text>
                      <Text 
                        variant="bodyMd" 
                        fontWeight="bold" 
                        tone={demoPredictedRatio > 0 ? 'success' : 'base'}
                      >
                        {demoPredictedRatio}%
                      </Text>
                    </BlockStack>
                  </InlineStack>
                  
                  {/* Total savings for all selected images */}
                  {selectedResources.length > 1 && (
                    <Box padding="200" background="bg-surface-info-subdued" borderRadius="150">
                      <Text variant="bodySm" alignment="center" tone="info">
                        💾 Estimated total savings for all {selectedResources.length} selected images: 
                        <Text as="span" fontWeight="bold"> ~{Math.round((demoOriginalSizeKB - demoPredictedSize) * selectedResources.length)} KB</Text>
                      </Text>
                    </Box>
                  )}
                  
                  {/* Savings highlight for single image */}
                  {selectedResources.length === 1 && (
                    <Box padding="200" background="bg-surface-success-subdued" borderRadius="150">
                      <Text variant="bodySm" alignment="center" tone="success">
                        ✅ You'll save {demoOriginalSizeKB - demoPredictedSize} KB ({demoPredictedRatio}%) from this image
                      </Text>
                    </Box>
                  )}
                </BlockStack>
              </Box>
            );
          })()}
          
          {compressionResults.length > 0 && (
            <Box padding="400">
              <LegacyStack vertical spacing="tight">
                <Text variant="headingSm">{t('images.compression_results', 'Compression Results')}</Text>
                {compressionResults.map((result, index) => {
                  // Find the resource for this result
                  const resource = sortedResources.find(r =>
                    r.image.url.includes(result.filename.split('?')[0])
                  );
                  return (
                    <Box key={index} padding="300" background="bg-surface-secondary">
                      <LegacyStack vertical spacing="extraTight">
                        <LegacyStack alignment="center">
                          {resource && (
                            <span
                              style={{ cursor: 'pointer' }}
                              onClick={() => {
                                setPreviewImageUrl(resource.image.url);
                                setPreviewModalOpen(true);
                              }}
                            >
                              <Thumbnail
                                source={resource.image.url}
                                alt={resource.image.altText || result.filename}
                                size="small"
                              />
                            </span>
                          )}
                          <Text variant="bodyMd" fontWeight="semibold">
                            {result.filename}{result.displayFilename ? '.' + result.displayFilename.split('.').pop().split('?')[0] : ''}
                          </Text>
                        </LegacyStack>
                        <LegacyStack distribution="equalSpacing">
                          <Text variant="bodySm">{t('images.original_size', 'Original Size')}: {formatFileSize(result.originalSize)}</Text>
                          <Text variant="bodySm">{t('images.compressed_size', 'Compressed Size')}: {formatFileSize(result.compressedSize)}</Text>
                        </LegacyStack>
                        <Text variant="bodySm" tone={Number(result.compressionRatio) > 50 ? "critical" : "success"}>
                          {t('images.compression_ratio', 'Compression Ratio')}: {result.compressionRatio}%
                        </Text>
                      </LegacyStack>
                    </Box>
                  );
                })}
              </LegacyStack>
            </Box>
          )}
        </LegacyStack>
      </Modal.Section>
    </Modal>
  );

  const toastMarkup = showToast ? (
    <Toast
      content={toastMessage}
      error={isError}
      onDismiss={() => setShowToast(false)}
    />
  ) : null;

  const handleSaveAlt = async () => {
    setIsSavingAlt(true);
    try {
      // Build alt text from badges/tags if any are present
      let altText = altTags.length > 0 ? altTags.map(tag => tag.value).join(altSeparator) : '';
      // Fallback to old logic if no badges
      if (!altText) {
        if (altType === "product") {
          altText = t('images.product_image');
        } else if (altType === "store") {
          altText = storeName;
        } else {
          altText = customAlt;
        }
      }
      const results = await Promise.all(
        sortedResources.map(img => {
          // If using badges, replace 'Product Title' with actual product title for each image
          let finalAltText = altText;
          if (altTags.length > 0) {
            finalAltText = altTags.map(tag => {
              if (tag.type === 'product') {
                return img.image && img.image.url
                  ? decodeURIComponent(img.image.url.split('/').pop().split('?')[0].split('.')[0])
                  : t('images.product_image');
              }
              if (tag.type === 'store') {
                return storeName;
              }
              return tag.value;
            }).join(altSeparator);
          }
          return fetch("/api/images/alt", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              imageId: img.id,
              altText: finalAltText,
              altType
            })
          })
          .then(res => res.json())
          .catch(e => ({ success: false, error: e.message }));
        })
      );
      const failed = results.filter(r => !r || !r.success);
      if (failed.length === 0) {
        // Log batch activity
        try {
          console.log('Logging batch activity for alt text:', sortedResources.length);
          const batchResponse = await fetch('/api/batch-activity', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              type: 'alt_text',
              count: sortedResources.length
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

        // Instantly update local display
        setLocalImages(localImages.map(img => ({
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
                        : t('images.product_image');
                    }
                    if (tag.type === 'store') {
                      return storeName;
                    }
                    return tag.value;
                  }).join(altSeparator)
                : (altType === "product"
                    ? (img.node.image && img.node.image.url
                        ? decodeURIComponent(img.node.image.url.split('/').pop().split('?')[0].split('.')[0])
                        : t('images.product_image'))
                  : altType === "store"
                    ? storeName
                    : customAlt)
            }
          }
        })));
        setAltModalActive(false); // Close the modal instantly
        setAltImage(null);
        setCustomAlt("");
        setAltTags([]);
        setCustomTag("");
        setAltSeparator(' | ');
        setToastMessage(t('images.alt_text_updated', 'Alt text updated'));
        setIsError(false);
      } else {
        setToastMessage(t('images.failed_to_update_alt_text', { count: failed.length }, 'Failed to update alt text for {count} images'));
        setIsError(true);
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

  if (isLoading) {
    return <TableSkeleton />;
  }

  return (
    <Frame>
      
      <Page fullWidth
        // title={t('images.title', 'Files')}
        primaryAction={
          <ButtonGroup>
            <Button
              onClick={handleCompressClick}
              disabled={selectedResources.length === 0 || isCompressing}
              loading={isCompressing}
            >
              {t('images.compress', 'Compress')}
            </Button>
            {/* Remove WebP conversion button and related comments */}
            {/* <Button
              onClick={handleWebPConversion}
              disabled={selectedResources.length === 0 || isConverting}
              loading={isConverting}
              variant="primary"
            >
              Convert to WebP
            </Button> */}
            {/* <Button
              onClick={() => {
                setAltImage({ all: true });
                setAltType("product");
                setCustomAlt("");
                setAltModalActive(true);
              }}
            >
              Add Alt
            </Button> */}
          </ButtonGroup>}>
          
        {compressionModal}
        {toastMarkup}
        <TitleBar title={t('images.title', 'Image Compress')} />
        <Layout>
          <Layout.Section>
            {error && (
              <Banner status="critical" title={t('images.error_loading_files', 'Error loading files')}>
                {error}
              </Banner>
            )}
            <Card padding="0">
              <IndexFilters
                sortOptions={sortOptions}
                sortSelected={sortSelected}
                queryValue={queryValue}
                queryPlaceholder="Search images..."
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
                ]}
                selectable
              >
                {currentPageItems.map((resource, index) => {
                const { id, image, fileSize, createdAt, fileName, fileExtension } = resource;
                return (
                  <IndexTable.Row
                    id={id}
                    key={id}
                    selected={selectedResources.includes(id)}
                    position={index}
                  >
                    <IndexTable.Cell>
                      <Thumbnail
                        source={image?.url}
                        alt={image?.altText || "Image"}
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
                  </IndexTable.Row>
                );
              })}
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

            {selectedResources.length > 0 && (
              <Box paddingBlockStart="400">
                <ButtonGroup>
                  <Button primary onClick={handleCompressClick}>
                    {t('images.compressSelected', 'Compress Selected')} ({selectedResources.length})
                  </Button>
                </ButtonGroup>
              </Box>
            )}
          </Layout.Section>
        </Layout>
        <Modal
          open={showUpgradeModal}
          onClose={() => setShowUpgradeModal(false)}
          title={t('images.plan_limit_exceeded', 'Plan Limit Exceeded')}
          primaryAction={{
            content: t('images.upgrade_plan', 'Upgrade Plan'),
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
              {t('images.upgrade_your_plan', 'Upgrade your plan to continue compressing images.')}
            </Text>
          </Modal.Section>
        </Modal>
        <Modal
          open={altModalActive}
          onClose={() => setAltModalActive(false)}
          title={t('images.set_alt_text_for_all_images', 'Set Alt Text for All Images')}
          primaryAction={{
            content: isSavingAlt ? t('images.saving', 'Saving') : t('images.save', 'Save'),
            onAction: handleSaveAlt,
            loading: isSavingAlt,
            disabled: altTags.length === 0 && altType === "custom" && !customAlt.trim()
          }}
          secondaryActions={[
            {
              content: t('images.cancel', 'Cancel'),
              onAction: () => setAltModalActive(false)
            }
          ]}>
          <Modal.Section>
            <LegacyStack vertical>
              <Text as="p">{t('images.build_your_alt_text_by_adding_tags', 'Build your alt text by adding tags')}</Text>
              {altTags.length > 0 && (
                <Box padding="200">
                  <label>
                    {t('images.separator', 'Separator')}:
                    <select value={altSeparator} onChange={e => setAltSeparator(e.target.value)} style={{ marginLeft: 8 }}>
                      <option value="|">{t('images.separator_pipe', 'Pipe')}</option>
                      <option value="-">{t('images.separator_dash', 'Dash')}</option>
                      <option value=",">{t('images.separator_comma', 'Comma')}</option>
                      <option value="/">{t('images.separator_slash', 'Slash')}</option>
                      <option value=" ">{t('images.separator_space', 'Space')}</option>
                    </select>
                  </label>
                </Box>
              )}
              <Box padding="200" display="flex" gap="200">
                <Button onClick={() => setAltTags(tags => [...tags, {type: 'product', value: t('images.product_title', 'Product Title')}])}>
                  + {t('images.product_title', 'Product Title')}
                </Button>
                <Button onClick={() => setAltTags(tags => [...tags, {type: 'store', value: storeName}])}>
                  + {t('images.store_name', 'Store Name')}
                </Button>
                <input
                  type="text"
                  value={customTag}
                  onChange={e => setCustomTag(e.target.value)}
                  placeholder={t('images.add_custom_tag', 'Add custom tag')}
                  style={{ marginRight: 8 }}
                />
                <Button
                  onClick={() => {
                    if (customTag.trim()) {
                      setAltTags(tags => [...tags, {type: 'custom', value: customTag.trim()}]);
                      setCustomTag('');
                    }
                  }}
                >
                  + {t('images.add', 'Add')}
                </Button>
              </Box>
              <Box padding="200" display="flex" gap="100">
                {altTags.map((tag, idx) => (
                  <span key={idx} style={{
                    display: 'inline-block',
                    background: tag.type === 'product' ? '#d1e7dd' : tag.type === 'store' ? '#cfe2ff' : '#f8d7da',
                    borderRadius: '12px',
                    padding: '4px 10px',
                    marginRight: '8px',
                    fontWeight: 500
                  }}>
                    {tag.value}
                    <span
                      style={{ marginLeft: 6, cursor: 'pointer', color: 'red' }}
                      onClick={() => setAltTags(tags => tags.filter((_, i) => i !== idx))}
                    >×</span>
                  </span>
                ))}
              </Box>
              <Box padding="200">
                <Text variant="bodySm">{t('images.preview', 'Preview')}: <b>{altTags.length > 0 ? altTags.map(tag => tag.value).join(altSeparator) : t('images.none_selected', 'None selected')}</b></Text>
              </Box>
            </LegacyStack>
          </Modal.Section>
        </Modal>
        {/* Add modal for preview image */}
        <Modal
          open={previewModalOpen}
          onClose={() => setPreviewModalOpen(false)}
          title={t('images.image_preview', 'Image Preview')}
          large
          primaryAction={{
            content: t('images.close', 'Close'),
            onAction: () => setPreviewModalOpen(false)
          }}
        >
          <Modal.Section>
            {previewImageUrl && (
              <img
                src={previewImageUrl}
                alt={t('images.preview', 'Preview')}
                style={{ width: '100%', maxHeight: '70vh', objectFit: 'contain' }}
              />
            )}
          </Modal.Section>
        </Modal>
        <Footer />
      </Page>
    </Frame>
  );
}