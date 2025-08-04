export function buildShopifyProductFromSquarespaceCSV(product) {
  return {
    handle: product.handle || '',
    title: product.title || product.Name || 'Untitled',
    body_html: product.description || product.Description || '',
    vendor: product.vendor || product.Vendor || '',
    product_type: product.productType || product.Type || '',
    tags: product.tags || [],
    images: product.images || [],
    collections: product.collections || [],
    status: product.status || 'draft',
    variants: (product.variants || []).map(variant => ({
      title: variant.title,
      price: variant.price,
      compare_at_price: variant.compareAtPrice,
      sku: variant.sku,
      barcode: variant.barcode,
      weight: variant.weight,
      weight_unit: variant.weightUnit,
      inventory_quantity: variant.inventory_quantity || variant.inventoryQuantity || 0,
      inventory_policy: variant.inventoryPolicy,
      inventory_management: "shopify",
    })),
    options: product.options || [],
    metafields: product.metafields || [],
  };
} 