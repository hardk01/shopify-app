import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export async function action({ request }) {
  const { admin } = await authenticate.admin(request);
  
  try {
    const { imageId, namespace, key, value, type } = await request.json();
    
    // Validate required fields
    if (!imageId || !namespace || !key || value === undefined) {
      return json({ success: false, error: "Missing required fields" }, { status: 400 });
    }
    
    // Set the metafield
    const response = await admin.graphql(`
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
            ownerId: imageId,
            namespace,
            key,
            value,
            type: type || "number_integer"
          }
        ]
      }
    });
    
    const responseJson = await response.json();
    
    // Check for errors
    if (responseJson.data?.metafieldsSet?.userErrors?.length > 0) {
      const errors = responseJson.data.metafieldsSet.userErrors;
      return json({ success: false, error: errors[0].message }, { status: 400 });
    }
    
    return json({ 
      success: true, 
      metafield: responseJson.data?.metafieldsSet?.metafields?.[0] || null 
    });
    
  } catch (error) {
    console.error("Error setting metafield:", error);
    return json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function loader() {
  return json({ message: "Method not allowed" }, { status: 405 });
}