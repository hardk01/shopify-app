import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { Subscription } from "../models/subscription.js";
import { Shop } from "../models/Shop.js";
import { connectDatabase } from "../utilty/database.js";
import fs from 'fs';
import path from 'path';
import { saveCompressedImage } from "../utils/compressedImages";
import { logActivity } from "../utils/activityLogger.js";

let sharp;
if (typeof process !== 'undefined' && process.versions && process.versions.node) {
  import('sharp').then(module => {
    sharp = module.default;
  }).catch(err => {
    // Sharp module fallback handling
  });
}

export async function action({ request }) {
  try {
    const { admin, session } = await authenticate.admin(request);
    
    if (!sharp) {
      throw new Error('Sharp module is not available');
    }

    const { imageUrl, imageId, skipActivityLog } = await request.json();
    
    if (!imageUrl || !imageId) {
      throw new Error('Image URL and ID are required');
    }

    // Ensure database connection
    let subscription = null;
    let shopRecord = null;
    
    try {
      await connectDatabase();
      
      // Check plan limits before processing
      shopRecord = await Shop.findOne({ shop: session.shop });
      if (!shopRecord) {
        shopRecord = await Shop.create({
          shop: session.shop,
          name: session.shop,
          myshopifyDomain: session.shop,
          plan: 'FREE',
          accessToken: session.accessToken
        });
      }

      subscription = await Subscription.findOne({ shopId: shopRecord._id });
      if (!subscription) {
        subscription = await Subscription.create({
          shopId: shopRecord._id,
          plan: 'FREE',
          status: 'active',
          accessToken: session.accessToken
        });
      }

      // Check if user has exceeded WebP conversion limits
      if (subscription.hasExceededImageLimits('webp', 1)) {
        const limits = subscription.getPlanLimits();
        const remaining = subscription.getRemainingQuota('webp');
        return json({
          success: false,
          error: `Plan limit exceeded. Your ${subscription.plan} plan allows ${limits.webPConvertLimit} WebP conversions. You have ${remaining} remaining. Please upgrade your plan to continue.`,
          limitExceeded: true,
          currentPlan: subscription.plan,
          limit: limits.webPConvertLimit,
          remaining: remaining
        }, { status: 403 });
      }
    } catch (dbError) {
      // Database connection failed, proceeding without plan limits
      // Continue without plan limits if database is not available
    }

    // Get original file details to preserve all associations
    const fileDetailsResponse = await admin.graphql(
      `query GetFile($id: ID!) {
        node(id: $id) {
          ... on MediaImage {
            id
            image {
              url
              originalSrc
            }
            alt
            originalSource {
              fileSize
            }
            status
          }
        }
      }`,
      { variables: { id: imageId } }
    );
    
    const fileDetails = await fileDetailsResponse.json();
    const originalFile = fileDetails.data?.node;
    
    if (!originalFile) {
      throw new Error('Could not retrieve original file details');
    }
    
    // Store the original URL and alt text for reference
    const originalUrl = originalFile.image.url || originalFile.image.originalSrc;
    const originalAltText = originalFile.alt || "";
    // Process image conversion
    
    // Extract the original filename from the URL and preserve the base name
    const urlParts = originalUrl.split('/');
    const filenameWithQuery = urlParts[urlParts.length - 1];
    const originalFilename = filenameWithQuery.split('?')[0];
    const baseFilename = originalFilename.split('.')[0];
    // Keep the original filename but change extension to .webp
    const webpFilename = `${baseFilename}.webp`;
    
    // Convert to WebP format

    // Fetch original image
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error(`Failed to fetch image: ${imageResponse.statusText}`);
    }
    
    const imageBuffer = await imageResponse.arrayBuffer();

    // Convert to WebP with error handling
    let webpBuffer;
    try {
      webpBuffer = await sharp(Buffer.from(imageBuffer))
        .webp({
          quality: 80,
          lossless: false,
        })
        .toBuffer();
    } catch (error) {
      console.error('Sharp conversion error:', error);
      throw new Error('Failed to convert image to WebP');
    }

    // Get staged upload URL
    const stagedResponse = await admin.graphql(
      `mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
        stagedUploadsCreate(input: $input) {
          stagedTargets {
            resourceUrl
            url
            parameters {
              name
              value
            }
          }
          userErrors {
            field
            message
          }
        }
      }`,
      {
        variables: {
          input: [
            {
              filename: webpFilename,
              mimeType: "image/webp",
              httpMethod: "POST",
              resource: "FILE"
            }
          ]
        }
      }
    );

    const stagedData = await stagedResponse.json();
    
    if (stagedData.data?.stagedUploadsCreate?.userErrors?.length > 0) {
      throw new Error(stagedData.data.stagedUploadsCreate.userErrors[0].message);
    }

    const target = stagedData.data?.stagedUploadsCreate?.stagedTargets?.[0];
    if (!target) {
      throw new Error('Failed to get upload URL');
    }

    // Create form data for upload
    const formData = new FormData();
    target.parameters.forEach(({ name, value }) => {
      formData.append(name, value);
    });
    formData.append('file', new Blob([webpBuffer], { type: 'image/webp' }), webpFilename);

    // Upload to staged URL
    const uploadResponse = await fetch(target.url, {
      method: 'POST',
      body: formData
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error('Upload failed:', {
        status: uploadResponse.status,
        statusText: uploadResponse.statusText,
        error: errorText
      });
      throw new Error(`Failed to upload file to staging: ${uploadResponse.status} ${uploadResponse.statusText}`);
    }

    // Check if we're converting to a different format (WebP conversion always needs new file)
    const originalExtension = originalFilename.split('.').pop().toLowerCase();
    const needsFormatChange = originalExtension !== 'webp';
    
    // For WebP conversion, we always need to delete and recreate (no fileUpdate approach)
    // First, get all product references before deleting
    let productReferences = [];
    try {
      // Search through all products to find references by URL and ID
      const referencesResponse = await admin.graphql(
        `query GetProductImages {
          products(first: 250) {
            nodes {
              id
              title
              images(first: 250) {
                nodes {
                  id
                  url
                  altText
                }
              }
              media(first: 250) {
                nodes {
                  ... on MediaImage {
                    id
                    image { url }
                    alt
                  }
                }
              }
            }
          }
        }`
      );
      
      const referencesData = await referencesResponse.json();
      const products = referencesData.data?.products?.nodes || [];
      
      // Find products that reference this image URL or ID
      for (const product of products) {
        // Check both images and media arrays but avoid duplicates
        const foundReferences = new Set();
        
        // Check product images first
        for (const image of product.images.nodes) {
          const imageUrl = image.url;
          if (imageUrl) {
            // Check if this image URL matches the original URL (ignore query params for comparison)
            const imageUrlBase = imageUrl.split('?')[0];
            const originalUrlBase = originalUrl.split('?')[0];
            
            // Also check the direct file ID match
            if (imageUrlBase === originalUrlBase || image.id === imageId) {
              const refKey = `${product.id}-${image.id}`;
              if (!foundReferences.has(refKey)) {
                foundReferences.add(refKey);
                productReferences.push({
                  productId: product.id,
                  imageId: image.id,
                  altText: image.altText || "",
                  position: product.images.nodes.indexOf(image) // Store position for proper ordering
                });
              }
            }
          }
        }
        
        // Check product media only if not already found in images
        for (const media of product.media.nodes.filter(media => media.image)) {
          const imageUrl = media.image.url;
          if (imageUrl) {
            // Check if this image URL matches the original URL (ignore query params for comparison)
            const imageUrlBase = imageUrl.split('?')[0];
            const originalUrlBase = originalUrl.split('?')[0];
            
            // Also check the direct file ID match
            if (imageUrlBase === originalUrlBase || media.id === imageId) {
              const refKey = `${product.id}-${media.id}`;
              if (!foundReferences.has(refKey)) {
                foundReferences.add(refKey);
                productReferences.push({
                  productId: product.id,
                  imageId: media.id,
                  altText: media.alt || "",
                  position: product.media.nodes.indexOf(media) // Store position for proper ordering
                });
              }
            }
          }
        }
      }
      
    } catch (error) {
      // Continue without product references if search fails
    }
    
    // Remove duplicate references (same product, regardless of image ID - group by product only)
    const uniqueReferences = [];
    const seenProducts = new Set();
    for (const ref of productReferences) {
      if (!seenProducts.has(ref.productId)) {
        seenProducts.add(ref.productId);
        uniqueReferences.push(ref);
      }
    }
    productReferences = uniqueReferences;
    
    // Delete the original file first and wait for confirmation
    let fileDeleted = false;
    try {
      const deleteResponse = await admin.graphql(
        `mutation fileDelete($fileIds: [ID!]!) {
          fileDelete(fileIds: $fileIds) {
            deletedFileIds
            userErrors {
              field
              message
            }
          }
        }`,
        {
          variables: {
            fileIds: [imageId]
          }
        }
      );
      
      const deleteData = await deleteResponse.json();
      if (deleteData.data?.fileDelete?.deletedFileIds?.includes(imageId)) {
        fileDeleted = true;
      }
    } catch (error) {
      // Continue if deletion fails
    }
    
    // Wait a moment for the deletion to propagate
    if (fileDeleted) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // For WebP conversion with product references, skip standalone file creation
    // and only create the file when adding to products to avoid duplicates
    let finalFile = null;
    let newFileReady = false;
    let updateSuccessful = false;
    
    if (productReferences.length > 0) {
      // Group references by product to avoid duplicate additions
      const productGroups = {};
      for (const ref of productReferences) {
        if (!productGroups[ref.productId]) {
          productGroups[ref.productId] = [];
        }
        productGroups[ref.productId].push(ref);
      }
      
      // Process each product only once
      for (const [productId, refs] of Object.entries(productGroups)) {
        try {
          // Use the first reference for alt text and position
          const primaryRef = refs[0];
          
          // Add the WebP file to the product (this creates the file)
          const createMediaResponse = await admin.graphql(
            `mutation productCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
              productCreateMedia(productId: $productId, media: $media) {
                media {
                  ... on MediaImage {
                    id
                    image {
                      url
                    }
                    alt
                  }
                }
                mediaUserErrors {
                  field
                  message
                }
              }
            }`,
            {
              variables: {
                productId: productId,
                media: [
                  {
                    originalSource: target.resourceUrl,
                    alt: primaryRef.altText || "",
                    mediaContentType: "IMAGE"
                  }
                ]
              }
            }
          );
          
          const createResult = await createMediaResponse.json();
          
          if (createResult.data?.productCreateMedia?.media?.length > 0) {
            updateSuccessful = true;
            
            // Store the file info from the first successful creation
            if (!finalFile) {
              finalFile = createResult.data.productCreateMedia.media[0];
              newFileReady = true;
            }
            
            // Successfully created new media reference
            const newMedia = createResult.data.productCreateMedia.media[0];
            
            // Reorder the images to maintain the original position if needed
            if (primaryRef.position !== undefined && primaryRef.position > 0) {
              await admin.graphql(
                `mutation productReorderMedia($id: ID!, $moves: [MoveInput!]!) {
                  productReorderMedia(id: $id, moves: $moves) {
                    mediaUserErrors {
                      field
                      message
                    }
                  }
                }`,
                {
                  variables: {
                    id: productId,
                    moves: [
                      {
                        id: newMedia.id,
                        newPosition: primaryRef.position.toString()
                      }
                    ]
                  }
                }
              );
            }
          }
        } catch (error) {
          // Continue with other products if one fails
        }
      }
      
    } else {
      // No product references, create standalone file
      updateSuccessful = true; // Mark as successful since conversion worked
      const fileCreateResponse = await admin.graphql(
        `mutation fileCreate($files: [FileCreateInput!]!) {
          fileCreate(files: $files) {
            files {
              ... on MediaImage {
                id
                image {
                  url
                }
                status
              }
            }
            userErrors {
              field
              message
            }
          }
        }`,
        {
          variables: {
            files: [
              {
                contentType: "IMAGE",
                originalSource: target.resourceUrl,
                filename: webpFilename,
                alt: originalAltText
              }
            ]
          }
        }
      );

      const fileData = await fileCreateResponse.json();

      if (!fileData.data) {
        throw new Error('Invalid response from Shopify API');
      }

      if (fileData.data?.fileCreate?.userErrors?.length > 0) {
        const errors = fileData.data.fileCreate.userErrors;
        throw new Error(`Failed to create file: ${errors.map(e => e.message).join(', ')}`);
      }

      finalFile = fileData.data?.fileCreate?.files?.[0];
      if (!finalFile) {
        throw new Error('No file returned from Shopify');
      }
      
      // Wait for the new file to be processed
      let fileCheckRetries = 0;
      const maxFileCheckRetries = 10;
      
      while (!newFileReady && fileCheckRetries < maxFileCheckRetries) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const checkResponse = await admin.graphql(
          `query GetFile($id: ID!) {
            node(id: $id) {
              ... on MediaImage {
                id
                image { url }
                status
              }
            }
          }`,
          { variables: { id: finalFile.id } }
        );
        
        const checkData = await checkResponse.json();
        const checkedFile = checkData.data?.node;
        
        if (checkedFile?.image?.url) {
          newFileReady = true;
          finalFile = checkedFile;
        }
        
        fileCheckRetries++;
      }
      
      if (!newFileReady) {
        throw new Error('File processing timeout');
      }
    }    // Final processing check
    let processedFile = finalFile;

    // Ensure the file has a valid URL before proceeding
    if (!processedFile?.image?.url) {
      // Add retry mechanism for waiting for image processing
      let retries = 0;
      const maxRetries = 10;

      while ((!processedFile?.image?.url) && retries < maxRetries) {
        // Wait for image processing
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds between retries

        // Query the file status
        const checkResponse = await admin.graphql(
          `query GetFile($id: ID!) {
            node(id: $id) {
              ... on MediaImage {
                id
                image {
                  url
                }
                status
              }
            }
          }`,
          {
            variables: {
              id: processedFile.id
            }
          }
        );

        const checkData = await checkResponse.json();
        processedFile = checkData.data?.node;
        
        if (!processedFile) {
          throw new Error('Failed to check file status');
        }
        
        retries++;
      }

      if (!processedFile?.image?.url) {
        throw new Error('Image processing timeout - please try again');
      }
    }

    // Log the URLs to verify the conversion
    
    let compressedSizes = {};
    try {
      compressedSizes = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), 'compressedImages.json'), 'utf8')
      );
    } catch (e) {}

    compressedSizes[imageId] = webpBuffer.length;
    fs.writeFileSync(path.join(process.cwd(), 'compressedImages.json'), JSON.stringify(compressedSizes, null, 2));

    // After you have the new file ID and compressed size:
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
            ownerId: processedFile.id, // The Shopify file ID (for the new or updated file)
            namespace: "compression",
            key: "compressed_size",
            value: webpBuffer.length.toString(),
            type: "number_integer"
          }
        ]
      }
    });

    // Persist the compressed size
    await saveCompressedImage(imageId, webpBuffer.length);

    // Increment the WebP conversion count
    if (subscription) {
      await subscription.incrementImageCount('webp', 1);
      
      // Log activity for statistics only if not part of a batch operation
      if (!skipActivityLog) {
        try {
          await logActivity(shopRecord._id, session.shop, 'webp_conversion', 1);
        } catch (logError) {
          console.error('Failed to log activity:', logError);
          // Don't fail the main operation if logging fails
        }
      }
    }

    return json({
      success: true,
      file: {
        id: processedFile.id,
        url: processedFile.image.url,
        filename: webpFilename,
        originalUrl: originalUrl,
        referencesPreserved: updateSuccessful,
        compressedSize: webpBuffer.length
      },
      usage: subscription ? {
        current: subscription.webPConvertCount + 1,
        limit: subscription.getPlanLimits().webPConvertLimit,
        remaining: subscription.getRemainingQuota('webp') - 1
      } : {
        current: 0,
        limit: 50,
        remaining: 50
      }
    });

  } catch (error) {
    console.error("WebP conversion error:", error);
    return json({
      success: false,
      error: error.message || 'Failed to convert image'
    }, { status: 500 });
  }
}

export async function loader({ request }) {
  const { admin } = await authenticate.admin(request);

  // Fetch images with metafields
  const response = await admin.graphql(`
    {
      files(first: 50) {
        nodes {
          ... on MediaImage {
            id
            image { url }
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
  `);

  const images = response.data.files.nodes.map(img => {
    const compressedSizeField = img.metafields?.edges?.find(
      edge => edge.node.key === "compressed_size"
    );
    return {
      id: img.id,
      url: img.image?.url,
      compressedSize: compressedSizeField ? Number(compressedSizeField.node.value) : null,
      // ...other fields
    };
  });
  return json({ images });
} 