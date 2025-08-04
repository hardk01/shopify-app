export function buildShopifyProductFromWixCSV(product) {
    let priceRaw = product['price'];
    let surchargeRaw = product['surcharge'];
    let priceNum = parseFloat(priceRaw);
    let surchargeNum = parseFloat(surchargeRaw);

    let price = '0.00';
    let compare_at_price = '';

    if (!isNaN(priceNum) && !isNaN(surchargeNum)) {
        if (priceNum < surchargeNum) {
            price = priceNum.toString();
            compare_at_price = surchargeNum.toString();
        } else if (surchargeNum < priceNum) {
            price = surchargeNum.toString();
            compare_at_price = priceNum.toString();
        } else {
            price = priceNum.toString();
            compare_at_price = '';
        }
    } else if (!isNaN(priceNum)) {
        price = priceNum.toString();
    } else if (!isNaN(surchargeNum)) {
        price = surchargeNum.toString();
    }

    // Parse Wix-style variant options using reference logic
    let variantAttributes = [];
    if (Array.isArray(product.options) && product.options.length > 0) {
        // Use options array from parser
        variantAttributes = product.options.map(opt => ({
            name: opt.name,
            options: opt.values
        }));
    } else {
        // Fallback to raw fields if options array is missing
        for (let i = 1; i <= 6; i++) {
            const name = product[`productOptionName${i}`];
            const type = product[`productOptionType${i}`];
            const description = product[`productOptionDescription${i}`];
            if (name && description) {
                const options = description.split(';').map(o => {
                    if (o.includes(':')) {
                        return o.split(':')[1].trim();
                    }
                    return o.trim();
                }).filter(Boolean);
                variantAttributes.push({ name, type, options });
            }
        }
    }
    console.log('[WixBuilder] Variant attributes:', JSON.stringify(variantAttributes, null, 2));

    // Build options array for Shopify
    let options = variantAttributes.map(attr => ({ name: attr.name, values: attr.options }));
    console.log('[WixBuilder] Shopify options:', JSON.stringify(options, null, 2));

    // Generate all combinations of variant options
    function cartesian(arr) {
        if (arr.length === 0) return [];
        if (arr.length === 1) return arr[0].map(v => [v]);
        return arr.reduce((a, b) => a.flatMap(d => b.map(e => [].concat(d, e))));
    }
    let variants = [];
    let inventory_quantity = parseInt(product.inventory || '0', 10);
    if (variantAttributes.length > 0) {
        const allOptions = variantAttributes.map(attr => attr.options);
        const combinations = cartesian(allOptions);
        combinations.forEach(comb => {
            let variantObj = {};
            comb.forEach((val, idx) => {
                variantObj[`option${idx + 1}`] = val;
            });
            console.log('[WixBuilder] Generated variant:', variantObj);
            variants.push({
                ...variantObj,
                price,
                compare_at_price,
                sku: product.sku || '',
                barcode: '',
                weight: parseFloat(product.weight || '0'),
                weight_unit: 'kg',
                inventory_quantity: inventory_quantity,
                inventory_management: 'shopify',
                inventory_policy: inventory_quantity > 0 ? 'continue' : 'deny',
                requires_shipping: true
            });
        });
    }
    // If no variants were processed, create a default variant and log an error
    if (variants.length === 0) {
        console.error('[WixBuilder][ERROR] No variants generated for product:', product.name || product.handleId, 'Variant attributes:', JSON.stringify(variantAttributes, null, 2));
        variants = [{
            price,
            compare_at_price,
            sku: product.sku || '',
            barcode: '',
            weight: parseFloat(product.weight || '0'),
            weight_unit: 'kg',
            inventory_quantity: inventory_quantity,
            inventory_management: 'shopify',
            inventory_policy: inventory_quantity > 0 ? 'continue' : 'deny',
            requires_shipping: true
        }];
    }

    // Process images
    const images = (product.productImageUrl || '').split(/[;,]/)
        .map(url => url.trim())
        .filter(Boolean)
        .map((url, index) => {
            // Handle Wix image URLs
            let imageUrl = url;
            if (!imageUrl.startsWith('http')) {
                // If it's a Wix image ID (e.g., "539049_10e38390e9a04328b4ea217a768ec236~mv2.jpg")
                if (imageUrl.includes('~mv2')) {
                    imageUrl = `https://static.wixstatic.com/media/${imageUrl}`;
                } else {
                    // If it's a relative path or other format
                    imageUrl = `https://static.wixstatic.com/media/${imageUrl}`;
                }
            }
            return {
                src: imageUrl,
                position: index + 1
            };
        });

    // Process additional info
    let additionalInfo = '';
    for (let i = 1; i <= 6; i++) {
        const title = product[`additionalInfoTitle${i}`];
        const description = product[`additionalInfoDescription${i}`];
        if (title && description) {
            additionalInfo += `<h3>${title}</h3><p>${description}</p>`;
        }
    }

    const description = product.description || '';
    const fullDescription = description + (additionalInfo ? `<div class="additional-info">${additionalInfo}</div>` : '');

    // Debug: Log status value
    const status = (product.visible && product.visible.toString().toLowerCase() === 'true') ? 'active' : 'draft';
    console.log('[WixBuilder] Status:', status, 'Visible field:', product.visible);

    return {
        title: product.name || 'Untitled',
        body_html: fullDescription,
        vendor: product.brand || '',
        product_type: product.fieldType || '',
        tags: [],
        options,
        images,
        collections: [],
        status,
        variants
    };
} 