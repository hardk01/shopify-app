import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

let sharp;
if (typeof process !== 'undefined' && process.versions && process.versions.node) {
  import('sharp').then(module => {
    sharp = module.default;
  }).catch(err => {
    console.error('Failed to load Sharp:', err);
  });
}

export async function action({ request }) {
  const { admin } = await authenticate.admin(request);
  
  try {
    if (!sharp) {
      throw new Error('Sharp module is not available');
    }

    const { imageUrl, imageId, quality, filename, altText } = await request.json();

    // Fetch the image from the URL
    const imageResponse = await fetch(imageUrl);
    const imageBuffer = await imageResponse.arrayBuffer();

    const originalFilename = decodeURIComponent(imageUrl.split('/').pop().split('?')[0]);
    const ext = originalFilename.split('.').pop().toLowerCase();
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

    // 1. Delete the original file first
    await admin.graphql(
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

    // Wait a moment for Shopify to process the deletion
    await new Promise(resolve => setTimeout(resolve, 1500));

    // 2. Get staged upload URL from Shopify
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
              filename: originalFilename,
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
    formData.append('file', new Blob([compressedImage], { type: mimeType }), originalFilename);

    const uploadResponse = await fetch(target.url, {
      method: 'POST',
      body: formData
    });
    if (!uploadResponse.ok) {
      throw new Error('Failed to upload compressed file to Shopify');
    }

    // 3. Create the new file in Shopify
    const fileCreateResponse = await admin.graphql(
      `mutation fileCreate($files: [FileCreateInput!]!) {
        fileCreate(files: $files) {
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
              contentType: "IMAGE",
              originalSource: target.resourceUrl,
              filename: originalFilename,
              alt: altText
            }
          ]
        }
      }
    );

    const fileData = await fileCreateResponse.json();
    if (fileData.data?.fileCreate?.userErrors?.length > 0) {
      throw new Error(fileData.data.fileCreate.userErrors[0].message);
    }
    const newFile = fileData.data?.fileCreate?.files?.[0];
    if (!newFile) {
      console.error("File create response:", JSON.stringify(fileData, null, 2));
      return json({
        success: false,
        error: "Failed to create new file in Shopify. Response: " + JSON.stringify(fileData)
      }, { status: 500 });
    }

    // Poll for file to be ready
    let retries = 0;
    const maxRetries = 10;
    let readyFile = newFile;
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
        { variables: { id: newFile.id } }
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

    // 5. Return the new file info
    return json({
      success: true,
      newFile: {
        id: readyFile.id,
        url: readyFile.image.url,
        size: compressedSize
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