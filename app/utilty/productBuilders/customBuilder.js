export function buildShopifyProductFromCustomCSV(product, fieldMapping) {
  // Use fieldMapping if provided, otherwise use default mapping
  if (fieldMapping) {
    const mapped = {};
    for (const [shopifyField, csvField] of Object.entries(fieldMapping)) {
      mapped[shopifyField] = product[csvField] || '';
    }
    return mapped;
  }
  return {
    title: product.title || product.Name || 'Untitled',
    body_html: product.description || product.Description || '',
    vendor: product.brand || product.Manufacturer || product.vendor || '',
    product_type: product.productType || product.Type || '',
    tags: product.tags || [],
    images: product.images || [],
    collections: product.collections || [],
    status: product.status || 'draft',
    variants: product.variants || [],
    options: product.options || [],
    // Add other fields as needed
  };
} 