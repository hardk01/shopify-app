import { json } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import { useEffect, useState, useCallback } from "react";
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
  RangeSlider,
  LegacyStack,
  Toast,
  Frame
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

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
      return json({ images });
    } else {
      console.error("Unexpected response structure:", data);
      return json({ 
        images: [],
        error: "No images found" 
      });
    }
  } catch (error) {
    console.error("Error:", error);
    return json({ 
      images: [],
      error: error.message 
    });
  }
};

export default function ImagesPage() {
  const { images = [], error } = useLoaderData();
  const [localImages, setLocalImages] = useState(images);
  const navigate = useNavigate();
  const [compressModalActive, setCompressModalActive] = useState(false);
  const [compressionValue, setCompressionValue] = useState(80);
  const [isCompressing, setIsCompressing] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [compressionResults, setCompressionResults] = useState([]);
  const [compressionDone, setCompressionDone] = useState(false);

  // Transform images array for resource state
  const resources = (localImages || []).map(({ node }) => ({
    id: node.id,
    ...node,
    fileSize: node.compressedSize != null ? node.compressedSize : (node.originalSource?.fileSize || 0)
  }));

  const resourceName = {
    singular: 'file',
    plural: 'files',
  };

  const {
    selectedResources,
    allResourcesSelected,
    handleSelectionChange,
  } = useIndexResourceState(resources);

  const handleCompressClick = useCallback(() => {
    if (selectedResources.length > 0) {
      setCompressModalActive(true);
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
        const resource = resources.find(r => r.id === resourceId);
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
                altText: resource.image.altText || ""
              })
            });

            const result = await response.json();
            if (result.success && result.newFile) {
              const compressionInfo = {
                filename: result.newFile.url.split('/').pop(),
                originalSize: resource.fileSize,
                compressedSize: result.newFile.size,
                compressionRatio: ((resource.fileSize / result.newFile.size) * 100).toFixed(2),
                width: null,
                height: null
              };
              successfulCompressions.push(compressionInfo);
              setCompressionResults(prev => [...prev, compressionInfo]);

              // Update localImages with new compressed size
              updatedImages = updatedImages.map(img => {
                if (img.node.id === resource.id) {
                  return {
                    ...img,
                    node: {
                      ...img.node,
                      originalSource: {
                        ...img.node.originalSource,
                        fileSize: result.newFile.size
                      }
                    }
                  };
                }
                return img;
              });

              // Set compressed size metafield
              await admin.graphql(`
                mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
                  metafieldsSet(metafields: $metafields) {
                    metafields {
                      id
                      namespace
                      key
                      value
                      type
                    }
                    userErrors {
                      field
                      message
                    }
                  }
                }
              `, {
                variables: {
                  metafields: [
                    {
                      ownerId: resource.id,
                      namespace: "compression",
                      key: "compressed_size",
                      value: result.newFile.size.toString(),
                      type: "number_integer"
                    }
                  ]
                }
              });
            } else {
              failedCompressions.push({
                filename: resource.image.url.split('/').pop(),
                error: result.error || 'Unknown error'
              });
            }
          } catch (err) {
            console.error('Error compressing file:', err);
            failedCompressions.push({
              filename: resource.image.url.split('/').pop(),
              error: err.message
            });
          }
        }
      }

      setLocalImages(updatedImages);

      // Show appropriate message
      if (successfulCompressions.length > 0) {
        setToastMessage(`Successfully compressed ${successfulCompressions.length} ${
          successfulCompressions.length === 1 ? 'image' : 'images'
        }`);
        setIsError(false);
        setCompressionDone(true);
      } else if (failedCompressions.length > 0) {
        setToastMessage(`Failed to compress ${failedCompressions.length} ${
          failedCompressions.length === 1 ? 'image' : 'images'
        }. Please try again.`);
        setIsError(true);
        setCompressionDone(true);
      }
      setShowToast(true);

    } catch (error) {
      console.error('Error in compression process:', error);
      setToastMessage(error.message || 'Error compressing images');
      setIsError(true);
      setCompressionDone(true);
      setShowToast(true);
    } finally {
      setIsCompressing(false);
    }
  }, [selectedResources, resources, compressionValue, navigate, localImages]);

  const handleWebPConversion = useCallback(async () => {
    if (selectedResources.length === 0) return;

    setIsConverting(true);
    setShowToast(false);
    
    try {
      const successfulConversions = [];
      const failedConversions = [];

      for (const resourceId of selectedResources) {
        const resource = resources.find(r => r.id === resourceId);
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
              failedConversions.push({
                filename: resource.image.url.split('/').pop(),
                error: result.error || 'Unknown error'
              });
            }
          } catch (err) {
            console.error('Error converting file:', err);
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
        let message = `Successfully converted ${successfulConversions.length} ${
          successfulConversions.length === 1 ? 'image' : 'images'
        } to WebP`;
        
        if (skippedCount > 0) {
          message += `, skipped ${skippedCount} already in WebP format`;
        }
        
        if (failedConversions.length > 0) {
          message += `. Failed to convert ${failedConversions.length} images`;
        }
        
        setToastMessage(message);
        setIsError(false);

        // Wait a moment before refreshing
        setTimeout(() => {
          navigate(".", { replace: true });
        }, 500);

      } else if (failedConversions.length > 0) {
        setToastMessage(`Failed to convert ${failedConversions.length} ${
          failedConversions.length === 1 ? 'image' : 'images'
        }. Please try again.`);
        setIsError(true);
      } else {
        setToastMessage('All selected images are already in WebP format.');
        setIsError(false);
      }
      setShowToast(true);

    } catch (error) {
      console.error('Error in conversion process:', error);
      setToastMessage(error.message || 'Error converting images');
      setIsError(true);
      setShowToast(true);
    } finally {
      setIsConverting(false);
    }
  }, [selectedResources, resources, navigate]);

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

  const rowMarkup = resources.map(
    (resource, index) => {
      // Find compression result for this file (if any)
      const compressionResult = compressionResults.find(
        (result) => result.filename === resource.image.url.split('/').pop()
      );
      const displaySize = compressionResult
        ? compressionResult.compressedSize
        : resource.fileSize;
      return (
        <IndexTable.Row
          id={resource.id}
          key={resource.id}
          selected={selectedResources.includes(resource.id)}
          position={index}
        >
          <IndexTable.Cell>
            <Box padding="200" display="flex" gap="300">
              <Thumbnail
                source={resource.image.url}
                alt={resource.image.altText || "Image"}
                size="small"
              />
              <div>
                <Text variant="bodyMd" as="span" fontWeight="semibold">
                  {resource.image.url.split('/').pop()}
                </Text>
                <Text variant="bodySm" as="p" tone="subdued">
                  {getFileExtension(resource.image.url)}
                </Text>
              </div>
            </Box>
          </IndexTable.Cell>
          <IndexTable.Cell>
            <Text variant="bodyMd" as="span">
              {resource.image.altText || "—"}
            </Text>
          </IndexTable.Cell>
          <IndexTable.Cell>
            <Text variant="bodyMd" as="span">
              {formatDate(resource.createdAt)}
            </Text>
          </IndexTable.Cell>
          <IndexTable.Cell>
            <Text variant="bodyMd" as="span">
              {formatFileSize(displaySize)}
            </Text>
          </IndexTable.Cell>
          <IndexTable.Cell>
            <Text variant="bodyMd" as="span">
              —
            </Text>
          </IndexTable.Cell>
        </IndexTable.Row>
      );
    }
  );

  const bulkActions = selectedResources.length > 0
    ? [
        {
          content: 'Delete files',
          onAction: () => console.log('Delete', selectedResources),
        },
      ]
    : [];

  const handleCloseCompressModal = useCallback(() => {
    setCompressModalActive(false);
    setCompressionDone(false);
  }, []);

  const compressionModal = (
    <Modal
      open={compressModalActive}
      onClose={handleCloseCompressModal}
      title="Compress Images"
      primaryAction={
        compressionDone
          ? {
              content: "Done",
              onAction: handleCloseCompressModal,
              loading: false,
            }
          : {
              content: isCompressing ? "Compressing..." : "Compress",
              onAction: handleCompression,
              loading: isCompressing,
            }
      }
      secondaryActions={
        compressionDone
          ? []
          : [
              {
                content: "Cancel",
                onAction: handleCloseCompressModal,
              },
            ]
      }
    >
      <Modal.Section>
        <LegacyStack vertical>
          <Text as="p">
            Selected images: {selectedResources.length}
          </Text>
          <Box padding="400">
            <RangeSlider
              label="Compression Quality"
              value={compressionValue}
              onChange={handleCompressionChange}
              output
              min={0}
              max={100}
              step={1}
              suffix="%"
              disabled={compressionDone}
            />
          </Box>
          <Text as="p" variant="bodySm" tone="subdued">
            Higher quality means larger file size. Recommended: 70-85%
          </Text>
          {compressionResults.length > 0 && (
            <Box padding="400">
              <LegacyStack vertical spacing="tight">
                <Text variant="headingSm">Compression Results:</Text>
                {compressionResults.map((result, index) => (
                  <Box key={index} padding="300" background="bg-surface-secondary">
                    <LegacyStack vertical spacing="extraTight">
                      <Text variant="bodyMd" fontWeight="semibold">
                        {result.filename}
                      </Text>
                      <LegacyStack distribution="equalSpacing">
                        <Text variant="bodySm">Original: {formatFileSize(result.originalSize)}</Text>
                        <Text variant="bodySm">Compressed: {formatFileSize(result.compressedSize)}</Text>
                      </LegacyStack>
                      <Text variant="bodySm" tone={Number(result.compressionRatio) > 50 ? "critical" : "success"}>
                        Compression ratio: {result.compressionRatio}%
                      </Text>
                    </LegacyStack>
                  </Box>
                ))}
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

  return (
    <Frame>
      <Page
        title="Files"
        primaryAction={
          <ButtonGroup>
            <Button
              onClick={handleCompressClick}
              disabled={selectedResources.length === 0 || isCompressing}
              loading={isCompressing}
            >
              Compress
            </Button>
            <Button
              onClick={handleWebPConversion}
              disabled={selectedResources.length === 0 || isConverting}
              loading={isConverting}
              variant="primary"
            >
              Convert to WebP
            </Button>
          </ButtonGroup>
        }
      >
        {compressionModal}
        {toastMarkup}
        <TitleBar title="Files" />
        <Layout>
          <Layout.Section>
            {error && (
              <Banner status="critical" title="Error loading files">
                {error}
              </Banner>
            )}
            <div style={{ overflowX: 'hidden' }}>
              <LegacyCard>
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
                    { title: 'Date' }
                  ]}
                  selectable
                >
                  {resources.map(
                    ({ id, image, fileSize, createdAt }, index) => (
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
                          <Box padding="0" display="flex" gap="100" vertical>
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
                      </IndexTable.Row>
                    )
                  )}
                </IndexTable>
              </LegacyCard>
            </div>

            {selectedResources.length > 0 && (
              <div style={{ marginTop: '1rem' }}>
                <ButtonGroup>
                  <Button primary onClick={handleCompressClick}>
                    Compress Selected ({selectedResources.length})
                  </Button>
                </ButtonGroup>
              </div>
            )}
          </Layout.Section>
        </Layout>
      </Page>
    </Frame>
  );
} 