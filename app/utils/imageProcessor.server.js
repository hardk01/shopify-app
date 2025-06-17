import fetch from 'node-fetch';
import { createRequire } from 'module';

console.log('Initializing image processor...');

const require = createRequire(import.meta.url);
let sharp;
try {
  sharp = require('sharp');
  console.log('Sharp module loaded successfully');
} catch (error) {
  console.error('Failed to load sharp module:', error);
  throw error;
}

export async function downloadAndConvertToWebP(imageUrl) {
  console.log('Starting downloadAndConvertToWebP:', { imageUrl });
  
  try {
    // Download the image
    console.log('Fetching image...');
    const response = await fetch(imageUrl);
    
    if (!response.ok) {
      const error = `Failed to fetch image: ${response.statusText} (${response.status})`;
      console.error(error);
      throw new Error(error);
    }

    const contentType = response.headers.get('content-type');
    console.log('Response headers:', {
      contentType,
      contentLength: response.headers.get('content-length'),
      server: response.headers.get('server')
    });

    if (!contentType || !contentType.includes('image/')) {
      const error = `Invalid content type: ${contentType}`;
      console.error(error);
      throw new Error(error);
    }

    console.log('Downloading image buffer...');
    const imageBuffer = await response.arrayBuffer();
    
    if (!imageBuffer || imageBuffer.byteLength === 0) {
      const error = 'Downloaded image is empty';
      console.error(error);
      throw new Error(error);
    }
    
    console.log('Image downloaded successfully:', {
      size: imageBuffer.byteLength,
      contentType
    });

    // Create sharp instance
    console.log('Creating sharp instance...');
    const buffer = Buffer.from(imageBuffer);
    const image = sharp(buffer);

    // Get metadata
    console.log('Getting image metadata...');
    const originalMetadata = await image.metadata();
    
    if (!originalMetadata) {
      const error = 'Could not read image metadata';
      console.error(error);
      throw new Error(error);
    }
    
    console.log('Original image metadata:', originalMetadata);

    // Process image
    console.log('Converting image to WebP...');
    const processedImage = await image
      .rotate() // Auto-rotate based on EXIF data
      .webp({ 
        quality: 80,
        effort: 4,
        lossless: false,
        nearLossless: false,
      })
      .toBuffer({ resolveWithObject: true });

    if (!processedImage || !processedImage.data) {
      const error = 'Image processing failed - no output generated';
      console.error(error);
      throw new Error(error);
    }

    const result = {
      webpBuffer: processedImage.data,
      metadata: {
        width: processedImage.info.width,
        height: processedImage.info.height,
        format: processedImage.info.format,
        size: processedImage.data.length,
        originalFormat: originalMetadata.format,
        compressionRatio: (imageBuffer.byteLength / processedImage.data.length).toFixed(2)
      }
    };

    console.log('Image processing completed successfully:', {
      originalSize: imageBuffer.byteLength,
      processedSize: processedImage.data.length,
      width: processedImage.info.width,
      height: processedImage.info.height,
      format: processedImage.info.format
    });

    return result;
  } catch (error) {
    console.error('Error in downloadAndConvertToWebP:', {
      error: error.message,
      stack: error.stack,
      imageUrl
    });
    throw error;
  }
}

export function bufferToBase64(buffer) {
  try {
    console.log('Converting buffer to base64...');
    
    if (!buffer || !Buffer.isBuffer(buffer)) {
      const error = 'Invalid buffer provided to bufferToBase64';
      console.error(error);
      throw new Error(error);
    }
    
    const result = `data:image/webp;base64,${buffer.toString('base64')}`;
    console.log('Buffer converted to base64 successfully');
    
    return result;
  } catch (error) {
    console.error('Error in bufferToBase64:', error);
    throw error;
  }
} 