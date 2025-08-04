export function buildShopifyProductFromAmazonCSV(product) {
    // Images: use images array from parser if present
    let images = Array.isArray(product.images) ? product.images : [];

    // Categories: use first as product_type, all as tags/collections
    let categories = [];
    let productType = '';
    let tags = [];
    if (Array.isArray(product.categories)) {
        categories = product.categories;
        productType = categories[0] || '';
        tags = categories;
    } else if (typeof product.categories === 'string') {
        try {
            categories = JSON.parse(product.categories);
            productType = categories[0] || '';
            tags = categories;
        } catch {
            productType = product.categories;
            tags = [product.categories];
        }
    }

    // Price logic
    let price = product.final_price || product.price || '0.00';
    let compare_at_price = product.initial_price || product.compareAtPrice || '';
    if (compare_at_price && price && parseFloat(compare_at_price) <= parseFloat(price)) {
        compare_at_price = '';
    }

    // Status
    let status = (product.availability && product.availability.toLowerCase().includes('in stock')) ? 'active' : 'draft';

    // Weight (try to extract number and unit, convert to kg if needed)
    let weight = 0;
    if (product.item_weight) {
        let w = product.item_weight.toString().toLowerCase();
        if (w.includes('pound')) {
            weight = parseFloat(w) * 0.453592;
        } else if (w.includes('kg')) {
            weight = parseFloat(w);
        } else if (w.includes('ounce')) {
            weight = parseFloat(w) * 0.0283495;
        } else {
            weight = parseFloat(w);
        }
    }

    // Barcode
    let barcode = product.upc || product.asin || '';

    // SKU
    let sku = product.sku || product.model_number || product.asin || '';

    // Metafields (for extra info)
    let metafields = [];
    if (product.rating) metafields.push({ key: 'rating', value: product.rating });
    if (product.product_dimensions) metafields.push({ key: 'dimensions', value: product.product_dimensions });
    if (product.reviews_count) metafields.push({ key: 'reviews_count', value: product.reviews_count });
    if (product.discount) metafields.push({ key: 'discount', value: product.discount });
    if (product.url) metafields.push({ key: 'amazon_url', value: product.url });
    if (product.features) metafields.push({ key: 'features', value: Array.isArray(product.features) ? product.features.join('; ') : product.features });

    return {
        title: product.title || '',
        body_html: product.description || '',
        vendor: product.brand || product.manufacturer || '',
        product_type: productType,
        tags,
        images,
        collections: categories,
        status,
        variants: [
            {
                price: price.toString(),
                compare_at_price: compare_at_price ? compare_at_price.toString() : '',
                sku,
                barcode,
                weight,
                weight_unit: 'kg',
                inventory_quantity: 100, // Default, or parse if available
                inventory_management: 'shopify',
                inventory_policy: 'continue',
                requires_shipping: true
            }
        ],
        metafields
    };
} 