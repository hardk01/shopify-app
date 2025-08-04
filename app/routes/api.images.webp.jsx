import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { Subscription } from "../models/subscription.js";
import { Shop } from "../models/Shop.js";
import { connectDatabase } from "../utilty/database.js";
import fs from 'fs';
import path from 'path';
import { saveCompressedImage } from "../utils/compressedImages";

let sharp;
if (typeof process !== 'undefined' && process.versions && process.versions.node) {
  import('sharp').then(module => {
    sharp = module.default;
  }).catch(err => {
    console.error('Failed to load Sharp:', err);
  });
}

export async function action({ request }) {
  try {
    const { admin, session } = await authenticate.admin(request);
    
    if (!sharp) {
      throw new Error('Sharp module is not available');
    }

    const { imageUrl, imageId } = await request.json();
    
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
      console.warn('Database connection failed, proceeding without plan limits:', dbError.message);
      // Continue without plan limits if database is not available
    }

    // Get original filename and create WebP filename
    const originalFilename = decodeURIComponent(imageUrl.split('/').pop().split('?')[0]);
    const webpFilename = `${originalFilename.split('.')[0]}.webp`;

    // First delete the original file
    let originalDeleted = false;
    let deleteError = null;
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
      if (deleteData.data?.fileDelete?.userErrors?.length > 0) {
        const msg = deleteData.data.fileDelete.userErrors[0].message;
        // If access denied, log and continue
        if (msg.includes('Access denied') || msg.includes('delete files permissions')) {
          console.warn('Could not delete original file due to permissions:', msg);
          deleteError = msg;
        } else if (msg.includes('does not exist')) {
          return json({
            success: false,
            error: 'The image no longer exists in Shopify and could not be converted.'
          }, { status: 404 });
        } else {
          throw new Error(`Failed to delete original file: ${msg}`);
        }
      } else {
        originalDeleted = true;
      }
    } catch (err) {
      // If access denied, log and continue
      if (err.message && (err.message.includes('Access denied') || err.message.includes('delete files permissions'))) {
        console.warn('Could not delete original file due to permissions:', err.message);
        deleteError = err.message;
      } else {
        throw err;
      }
    }

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

    // Validate the upload was successful
    try {
      const uploadResult = await uploadResponse.text();
      console.log('Upload success:', uploadResult);
    } catch (error) {
      console.error('Error reading upload response:', error);
    }

    // Add a small delay to ensure file is processed
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Create file in Shopify
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
              alt: ""
            }
          ]
        }
      }
    );

    const fileData = await fileCreateResponse.json();

    // Enhanced error handling and logging
    if (!fileData.data) {
      console.error('Invalid response from Shopify:', fileData);
      throw new Error('Invalid response from Shopify API');
    }

    if (fileData.data?.fileCreate?.userErrors?.length > 0) {
      const errors = fileData.data.fileCreate.userErrors;
      console.error('File creation errors:', errors);
      throw new Error(`Failed to create file: ${errors.map(e => e.message).join(', ')}`);
    }

    const uploadedFile = fileData.data?.fileCreate?.files?.[0];
    if (!uploadedFile) {
      console.error('No file in response:', fileData);
      throw new Error('No file returned from Shopify');
    }

    // Add retry mechanism for waiting for image processing
    let retries = 0;
    const maxRetries = 5;
    let processedFile = uploadedFile;

    while (!processedFile.image?.url && retries < maxRetries) {
      console.log(`Waiting for image processing... Attempt ${retries + 1}/${maxRetries}`);
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

    if (!processedFile.image?.url) {
      console.error('File processing timeout:', processedFile);
      throw new Error('Image processing timeout - please try again');
    }

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
    }

    return json({
      success: true,
      file: {
        id: processedFile.id,
        url: processedFile.image.url,
        filename: webpFilename,
        originalDeleted,
        deleteError,
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