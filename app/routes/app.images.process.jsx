import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { downloadAndConvertToWebP, bufferToBase64 } from "../utils/imageProcessor.server";

export async function action({ request }) {
  console.log('Starting image processing request');
  
  try {
    const { admin } = await authenticate.admin(request);
    console.log('Authentication successful');

    // Get the raw body text
    const body = await request.text();
    console.log('Received raw body:', body);

    // Parse the JSON manually
    let formData;
    try {
      formData = JSON.parse(body);
    } catch (parseError) {
      console.error('Error parsing JSON:', parseError);
      return json({
        success: false,
        error: 'Invalid JSON data'
      }, { status: 400 });
    }

    console.log('Parsed form data:', formData);
    const { imageUrl, imageId } = formData;

    if (!imageUrl) {
      console.error('Image URL is missing from request');
      throw new Error('Image URL is required');
    }

    console.log('Processing image:', { imageUrl, imageId });
    
    try {
      const { webpBuffer, metadata } = await downloadAndConvertToWebP(imageUrl);
      console.log('Image processed successfully:', { metadata });
      
      const response = {
        success: true,
        id: imageId,
        webpImage: {
          dataUrl: bufferToBase64(webpBuffer),
          ...metadata
        }
      };
      
      console.log('Sending successful response');
      return json(response);
    } catch (processingError) {
      console.error('Error in image processing:', {
        error: processingError.message,
        stack: processingError.stack,
        imageUrl,
        imageId
      });
      
      return json({
        success: false,
        id: imageId,
        error: `Image processing failed: ${processingError.message}`
      }, { status: 500 });
    }
  } catch (error) {
    console.error('Error in action handler:', {
      error: error.message,
      stack: error.stack
    });
    
    return json({
      success: false,
      error: `Server error: ${error.message}`
    }, { status: 500 });
  }
} 