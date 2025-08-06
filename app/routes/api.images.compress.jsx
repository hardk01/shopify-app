import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { Subscription } from "../models/subscription.js";
import { Shop } from "../models/Shop.js";
import { connectDatabase } from "../utilty/database.js";
import { logActivity } from "../utils/activityLogger.js";

let sharp;
if (typeof process !== 'undefined' && process.versions && process.versions.node) {
  import('sharp').then(module => {
    sharp = module.default;
  }).catch(err => {
    console.error('Failed to load Sharp:', err);
  });
}

export async function action({ request }) {
  const { admin, session } = await authenticate.admin(request);
  
  try {
    if (!sharp) {
      throw new Error('Sharp module is not available');
    }

    const { imageUrl, imageId, quality, filename, originalFilename, altText } = await request.json();

    // Try to connect to database
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

      // Check if user has exceeded compression limits
      if (subscription.hasExceededImageLimits('compress', 1)) {
        const limits = subscription.getPlanLimits();
        const remaining = subscription.getRemainingQuota('compress');
        return json({
          success: false,
          error: `Plan limit exceeded. Your ${subscription.plan} plan allows ${limits.imageCompressLimit} image compressions. You have ${remaining} remaining. Please upgrade your plan to continue.`,
          limitExceeded: true,
          currentPlan: subscription.plan,
          limit: limits.imageCompressLimit,
          remaining: remaining
        }, { status: 403 });
      }
    } catch (dbError) {
      console.warn('Database connection failed, proceeding without plan limits:', dbError.message);
      // Continue without plan limits if database is not available
    }

    // Fetch the image from the URL
    const imageResponse = await fetch(imageUrl);
    const imageBuffer = await imageResponse.arrayBuffer();

    // Use the provided originalFilename or extract it from the URL
    const extractedFilename = decodeURIComponent(imageUrl.split('/').pop().split('?')[0]);
    const ext = extractedFilename.split('.').pop().toLowerCase();
    let mimeType = '';
    let compressFn = null;
    let sharpOptions = { quality: parseInt(quality, 10) };

    if (ext === 'jpg' || ext === 'jpeg') {
      mimeType = 'image/jpeg';
      compressFn = (input) => sharp(input).jpeg(sharpOptions);
    } else if (ext === 'png') {
      mimeType = 'image/png';
      compressFn = (input) => sharp(input).png(sharpOptions);
    } else if (ext === 'webp') {
      mimeType = 'image/webp';
      compressFn = (input) => sharp(input).webp(sharpOptions);
    } else {
      throw new Error('Unsupported image format');
    }

    // Process the image with Sharp in original format
    const compressedImage = await compressFn(Buffer.from(imageBuffer)).toBuffer();

    // Get the compressed image size
    const stats = await sharp(compressedImage).metadata();

    // Convert compressed image to base64 for preview
    const base64Image = `data:${mimeType};base64,${compressedImage.toString('base64')}`;

    // Calculate compression ratio
    const originalSize = Buffer.from(imageBuffer).length;
    const compressedSize = compressedImage.length;
    const compressionRatio = (originalSize / compressedSize).toFixed(2);

    // IMPORTANT: We need to preserve the exact URL structure to maintain product references
    
    // 1. Get the original file details including the exact URL
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
    
    // Store the original URL for reference
    const originalUrl = originalFile.image.url || originalFile.image.originalSrc;
    console.log("Original image URL:", originalUrl);
    
    // Extract the original filename from the URL
    const urlParts = originalUrl.split('/');
    const filenameWithQuery = urlParts[urlParts.length - 1];
    const filenameOnly = filenameWithQuery.split('?')[0];
    
    console.log("Original filename with path:", filenameOnly);
    
    // Instead of deleting and recreating, we'll use the fileUpdate mutation
    // which should preserve the URL structure
    
    // 1. First, stage the upload for the compressed image
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
              filename: filenameOnly, // Use the exact original filename with path
              mimeType: mimeType,
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

    // 2. Upload the compressed image to the staged URL
    const formData = new FormData();
    target.parameters.forEach(({ name, value }) => {
      formData.append(name, value);
    });
    formData.append('file', new Blob([compressedImage], { type: mimeType }), filenameOnly);

    const uploadResponse = await fetch(target.url, {
      method: 'POST',
      body: formData
    });
    if (!uploadResponse.ok) {
      throw new Error('Failed to upload compressed file to Shopify');
    }
    
    // 3. Use the fileUpdate mutation to update the existing file
    // This should preserve the URL structure
    const fileUpdateResponse = await admin.graphql(
      `mutation fileUpdate($files: [FileUpdateInput!]!) {
        fileUpdate(files: $files) {
          files {
            ... on MediaImage {
              id
              image { url }
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
              id: imageId,
              originalSource: target.resourceUrl,
              alt: altText || originalFile.alt || ""
            }
          ]
        }
      }
    );

    const fileData = await fileUpdateResponse.json();
    if (fileData.data?.fileUpdate?.userErrors?.length > 0) {
      throw new Error(fileData.data.fileUpdate.userErrors[0].message);
    }
    
    const updatedFile = fileData.data?.fileUpdate?.files?.[0];
    if (!updatedFile) {
      console.error("File update response:", JSON.stringify(fileData, null, 2));
      return json({
        success: false,
        error: "Failed to update file in Shopify. Response: " + JSON.stringify(fileData)
      }, { status: 500 });
    }

    // Poll for file to be ready
    let retries = 0;
    const maxRetries = 10;
    let readyFile = updatedFile;
    while ((!readyFile.image || !readyFile.image.url) && retries < maxRetries) {
      // Wait 2 seconds between polls
      await new Promise(resolve => setTimeout(resolve, 2000));
      // Query the file status
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
        { variables: { id: imageId } }
      );
      const checkData = await checkResponse.json();
      readyFile = checkData.data?.node;
      retries++;
    }

    if (!readyFile.image || !readyFile.image.url) {
      return json({
        success: false,
        error: "File processing timeout. Please try again later."
      }, { status: 500 });
    }
    
    // Log the URLs to verify they match
    console.log('Original URL:', originalUrl);
    console.log('Updated URL:', readyFile.image.url);

    // Increment the compression count
    if (subscription) {
      await subscription.incrementImageCount('compress', 1);
      
      // Log activity for statistics
      try {
        await logActivity(shopRecord._id, session.shop, 'image_compression', 1);
      } catch (logError) {
        console.error('Failed to log activity:', logError);
        // Don't fail the main operation if logging fails
      }
    }

    // 5. Return the new file info
    return json({
      success: true,
      originalFilename: filenameOnly.split('.')[0], // Return the filename without extension
      newFile: {
        id: readyFile.id,
        url: readyFile.image.url,
        size: compressedSize,
        originalUrl: originalUrl // Include the original URL for reference
      },
      usage: subscription ? {
        current: subscription.imageCompressCount + 1,
        limit: subscription.getPlanLimits().imageCompressLimit,
        remaining: subscription.getRemainingQuota('compress') - 1
      } : {
        current: 0,
        limit: 200,
        remaining: 200
      }
    });

  } catch (error) {
    console.error("Compression error:", error);
    return json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
} 