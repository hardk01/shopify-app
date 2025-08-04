export function buildShopifyProductFromWooCommerceCSV(product) {
    let priceRaw = product['price'];
    let compareAtPriceRaw = product['compareAtPrice'];
    let priceNum = parseFloat(priceRaw);
    let compareAtNum = parseFloat(compareAtPriceRaw);

    let price = '0.00';
    let compare_at_price = '';

    if (!isNaN(priceNum) && !isNaN(compareAtNum)) {
        if (priceNum < compareAtNum) {
            price = priceNum.toString();
            compare_at_price = compareAtNum.toString();
        } else if (compareAtNum < priceNum) {
            price = compareAtNum.toString();
            compare_at_price = priceNum.toString();
        } else {
            price = priceNum.toString();
            compare_at_price = '';
        }
    } else if (!isNaN(priceNum)) {
        price = priceNum.toString();
    } else if (!isNaN(compareAtNum)) {
        price = compareAtNum.toString();
    }

    // Process variants if they exist
    let variants = [];
    if (product.variants && Array.isArray(product.variants)) {
        variants = product.variants.map(variant => {
            let variantPrice = parseFloat(variant.price || '0');
            let variantComparePrice = parseFloat(variant.compareAtPrice || '0');
            let finalPrice = variantPrice.toString();
            let finalComparePrice = '';

            if (!isNaN(variantPrice) && !isNaN(variantComparePrice)) {
                if (variantPrice < variantComparePrice) {
                    finalPrice = variantPrice.toString();
                    finalComparePrice = variantComparePrice.toString();
                } else if (variantComparePrice < variantPrice) {
                    finalPrice = variantComparePrice.toString();
                    finalComparePrice = variantPrice.toString();
                }
            }

            return {
                price: finalPrice,
                compare_at_price: finalComparePrice,
                sku: variant.sku || '',
                barcode: variant.barcode || '',
                weight: variant.weight || 0,
                weight_unit: 'kg',
                inventory_quantity: variant.inventoryQuantity || 0,
                inventory_management: variant.inventoryManagement || 'shopify',
                inventory_policy: variant.inventoryPolicy || 'continue',
                requires_shipping: variant.requires_shipping !== false,
                option1: variant.option1 || '',
                option2: variant.option2 || '',
                option3: variant.option3 || ''
            };
        });
    }

    // If no variants were processed, create a default variant
    if (variants.length === 0) {
        variants = [{
            price,
            compare_at_price,
            sku: product.sku || product.SKU || '',
            barcode: product.barcode || '',
            weight: product.weight || 0,
            weight_unit: 'kg',
            inventory_quantity: parseInt(product.inventoryQuantity || product.Stock || product.Quantity || product.quantity || product['Inventory Quantity'] || '0', 10),
            inventory_management: 'shopify',
            inventory_policy: parseInt(product.Stock || product.Quantity || product.quantity || product['Inventory Quantity'] || '0', 10) > 0 ? 'continue' : 'deny',
            requires_shipping: true
        }];
    }

    return {
        title: product.title || product.Name || 'Untitled',
        body_html: product.description || product.Description || '',
        vendor: product.vendor || product.Vendor || '',
        product_type: product.productType || product.Type || '',
        tags: product.tags || [],
        options: product.options || [],
        images: product.images || [],
        collections: product.collections || [],
        status: product.status ? product.status.toLowerCase() : 'active',
        variants
    };
} 