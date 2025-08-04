// Helper to convert metafields object to Shopify array format
export function convertMetafieldsObjectToArray(metafieldsObj) {
  if (Array.isArray(metafieldsObj)) return metafieldsObj;
  const metafields = [];
  for (const [column, value] of Object.entries(metafieldsObj || {})) {
    if (value === undefined || value === null || String(value).trim() === '') continue;
    const match = column.match(/product\.metafields\.(\w+)\.(\w+)/);
    if (match) {
      metafields.push({
        namespace: match[1],
        key: match[2],
        value,
        type: 'single_line_text_field'
      });
    } else {
      metafields.push({
        namespace: 'custom',
        key: column.replace(/[^a-z0-9_]/gi, '_').toLowerCase(),
        value,
        type: 'single_line_text_field'
      });
    }
  }
  return metafields;
}

export function buildShopifyProductFromShopifyCSV(product) {
  console.log('[ShopifyBuilder] Building product from CSV:', product.handle);
  
  // Ensure variants are non-empty
  if (!product.variants || product.variants.length === 0) {
    console.log('[ShopifyBuilder] No variants found for product:', product.handle);
    return null;
  }

  // Convert metafields to the correct format
  const metafields = product.metafields.map(mf => ({
    namespace: mf.namespace,
    key: mf.key,
    value: mf.value,
    type: mf.type || 'single_line_text_field'
  }));

  console.log('[ShopifyBuilder] Processing variants:', product.variants.length);
  
  // Build the product object
  const shopifyProduct = {
    title: product.title,
    body_html: product.body_html,
    vendor: product.vendor,
    product_type: product.product_type,
    product_category: product.product_category || '',
    status: product.status,
    tags: Array.isArray(product.tags) ? product.tags : (product.tags ? product.tags.split(',').map(t => t.trim()) : []),
    variants: product.variants.map(variant => {
      console.log('[ShopifyBuilder] Processing variant:', variant);
      return {
        option1: variant.option1Value,
        option2: variant.option2Value,
        option3: variant.option3Value,
        price: variant.price,
        sku: variant.sku,
        compare_at_price: variant.compare_at_price,
        inventory_quantity: variant.inventory_quantity,
        inventory_policy: variant.inventory_policy,
        inventory_management: variant.inventory_management,
        barcode: variant.barcode,
        requires_shipping: variant.requires_shipping,
        taxable: variant.taxable
      };
    }),
    options: [
      { name: product.variants[0].option1Name },
      ...(product.variants[0].option2Name ? [{ name: product.variants[0].option2Name }] : []),
      ...(product.variants[0].option3Name ? [{ name: product.variants[0].option3Name }] : [])
    ],
    images: product.images.map(img => ({
      src: img.src,
      position: img.position,
      alt: img.alt
    })),
    metafields: metafields
  };

  console.log('[ShopifyBuilder] Built product:', JSON.stringify(shopifyProduct, null, 2));
  return shopifyProduct;
}

// NOTE: Metafields must have: namespace, key, value, type (e.g., 'single_line_text_field') 