export function buildShopifyProductFromWalmartCSV(product) {
  // Always include a default variant and options for simple products
  const variant = {
    option1: 'Default',
    price: product.price || 0,
    sku: product.sku || '',
    inventory_quantity: product.inventoryQuantity || 0,
    inventory_policy: product.inventoryPolicy || 'deny',
    inventory_management: 'shopify',
  };
  return {
    title: product.title || 'Untitled',
    body_html: product.description || '',
    product_type: product.productType || '',
    vendor: product.vendor || '',
    tags: product.tags || [],
    images: product.images || [],
    collections: product.collections || [],
    status: product.status || 'draft',
    variants: [variant],
    options: [{ name: 'Title', values: ['Default'] }],
    metafields: product.metafields || [],
  };
} 