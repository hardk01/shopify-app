import { json } from "@remix-run/node";
import { useLoaderData, useNavigate, useRevalidator } from "@remix-run/react";
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
  Card,
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
  RangeSlider
} from "@shopify/polaris";
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
    const limit = 15; // Items per page

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
        <TitleBar title="Convert Images to WebP" />
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

export default function WebPPage() {
  const { t } = useTranslation();
  const { images = [], pageInfo, totalPages = 0, error, shop } = useLoaderData();
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const [isLoading, setIsLoading] = useState(true);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradeMessage, setUpgradeMessage] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  
  // IndexFilters state
  const [queryValue, setQueryValue] = useState("");
  const [sortSelected, setSortSelected] = useState(['date desc']);
  const [fileSizeFilter, setFileSizeFilter] = useState(undefined);
  const [fileTypeFilter, setFileTypeFilter] = useState(undefined);
  const {mode, setMode} = useSetIndexFiltersMode();
  
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

  // Reset page when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [queryValue, fileSizeFilter, fileTypeFilter, sortSelected]);

  // Transform and filter resources
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
      if (!matchesFileName && !matchesFileType) {
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
        
      default:
        return 0;
    }
  });

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

  const {
    selectedResources,
    handleSelectionChange,
    clearSelection,
  } = useIndexResourceState(sortedResources);

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
        const resource = sortedResources.find(r => r.id === resourceId);
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

            console.log('WebP conversion result for', resource.image.url, ':', result);

            if (result.success && result.file) {
              successfulConversions.push(result.file);
              console.log('Added to successful conversions:', result.file);
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

      console.log('Final conversion results:', {
        successful: successfulConversions.length,
        failed: failedConversions.length,
        successfulConversions,
        failedConversions
      });

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
        setShowToast(true);

        // Clear selection after successful conversion
        clearSelection();

        console.log('WebP conversion successful, refreshing table in 1 second...');
        // Wait a moment before refreshing the table
        setTimeout(() => {
          console.log('Executing navigation refresh...');
          // Use revalidator to refresh data without navigation
          revalidator.revalidate();
        }, 1000);

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
  }, [selectedResources, sortedResources, navigate, t]);

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
            {error && (
              <Banner status="critical" title={t('images.errorLoadingFiles', 'Error loading files')}>
                {error}
              </Banner>
            )}
            <Card padding="0">
              {/* Index Filters */}
              <IndexFilters
                sortOptions={sortOptions}
                sortSelected={sortSelected}
                queryValue={queryValue}
                queryPlaceholder="Search by file name or file type"
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
                resourceName={{ singular: t('images.file', 'file'), plural: t('images.files', 'files') }}
                itemCount={sortedResources.length}
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
                {sortedResources.map(({ id, image, fileSize, createdAt, fileName, fileExtension }, index) => (
                  <IndexTable.Row
                    id={id}
                    key={id}
                    selected={selectedResources.includes(id)}
                    position={index}
                  >
                    <IndexTable.Cell>
                      <Thumbnail
                        source={image?.url || ''}
                        alt=""
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
                    <IndexTable.Cell>{formatFileSize(fileSize)}</IndexTable.Cell>
                    <IndexTable.Cell>{formatDate(createdAt)}</IndexTable.Cell>
                  </IndexTable.Row>
                ))}
              </IndexTable>
            
              {/* Pagination */}
              {(pageInfo?.hasNextPage || pageInfo?.hasPreviousPage) && (
                <div style={{ padding: '16px', borderTop: '1px solid var(--p-color-border)' }}>
                  <InlineStack align="start" blockAlign="center" gap="400">
                    <Pagination
                      hasPrevious={pageInfo?.hasPreviousPage}
                      onPrevious={handlePreviousPage}
                      hasNext={pageInfo?.hasNextPage}
                      onNext={handleNextPage}
                    />
                    <Text variant="bodySm" tone="subdued">
                      {`${((currentPage - 1) * 15) + 1}-${Math.min(currentPage * 15, sortedResources.length)} of ${sortedResources.length}`}
                    </Text>
                  </InlineStack>
                </div>
              )}
            </Card>
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
