import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify';

export const amazonParser = {
    async parseCSV(csvText) {
        try {
            const records = parse(csvText, {
                columns: true,
                skip_empty_lines: true,
                trim: true
            });

            return records.map(record => {
                // Parse price strings by removing quotes and currency symbols
                const parsePrice = (priceStr) => {
                    if (!priceStr) return null;
                    // Remove quotes, currency symbols, and convert scientific notation
                    const cleanPrice = priceStr.toString()
                        .replace(/["$]/g, '')
                        .replace(/E\+/g, 'e+'); // Handle scientific notation
                    const price = parseFloat(cleanPrice);
                    return isNaN(price) ? null : price;
                };

                // Parse dimensions string
                const parseDimensions = (dimensionsStr) => {
                    if (!dimensionsStr) return null;
                    const match = dimensionsStr.match(/(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*(?:inches|cm)/i);
                    if (match) {
                        return {
                            length: parseFloat(match[1]),
                            width: parseFloat(match[2]),
                            height: parseFloat(match[3]),
                            unit: dimensionsStr.includes('cm') ? 'CM' : 'INCHES'
                        };
                    }
                    return null;
                };

                // Parse delivery information
                const parseDelivery = (deliveryArr) => {
                    if (!deliveryArr || !Array.isArray(deliveryArr)) return null;
                    return {
                        free_delivery: deliveryArr.some(d => d.toLowerCase().includes('free delivery')),
                        estimated_delivery: deliveryArr[0] || null,
                        fastest_delivery: deliveryArr[1] || null
                    };
                };

                // Parse features
                const parseFeatures = (featuresArr) => {
                    if (!featuresArr || !Array.isArray(featuresArr)) return [];
                    return featuresArr.map(feature => feature.trim()).filter(Boolean);
                };

                // Parse variations
                const parseVariations = (variationsStr) => {
                    try {
                        if (!variationsStr) return [];
                        const variations = JSON.parse(variationsStr.replace(/'/g, '"'));
                        return variations.map(variation => ({
                            asin: variation.asin,
                            name: variation.name,
                            sku: variation.asin,
                            title: variation.name
                        }));
                    } catch (e) {
                        return [];
                    }
                };

                // Parse categories
                const parseCategories = (categoriesStr) => {
                    try {
                        let categories = [];
                        if (!categoriesStr) return categories;

                        if (categoriesStr.startsWith('[')) {
                            categories = JSON.parse(categoriesStr.replace(/'/g, '"'));
                        } else {
                            categories = categoriesStr.split(',').map(cat => cat.trim()).filter(Boolean);
                        }

                        // Store each full path as a single collection
                        return [
                            {
                                title: categories.join(' > '),
                                handle: categories.join(' > ').toLowerCase().replace(/[^a-z0-9]+/g, '-'),
                                fullPath: categories.join(' > '),
                                level: categories.length,
                                type: 'collection',
                                published: true,
                                publishedAt: new Date().toISOString()
                            }
                        ];
                    } catch (e) {
                        console.error('Error parsing categories:', e);
                        return [];
                    }
                };

                // Parse stock status
                const parseStockStatus = (availabilityStr, stockQuantityStr) => {
                    const stockStatus = availabilityStr?.toLowerCase() || '';
                    const stockQuantity = parseInt(stockQuantityStr) || 0;

                    const isInStock = stockStatus.includes('in stock') || 
                                    stockStatus.includes('available') || 
                                    stockStatus.includes('in stock soon') ||
                                    stockQuantity > 0;

                    const quantity = isInStock ? Math.max(1, stockQuantity) : 0;
                    const inventoryPolicy = isInStock ? 'CONTINUE' : 'DENY';

                    let status = 'OUT_OF_STOCK';
                    if (isInStock) {
                        if (stockStatus.includes('in stock soon')) {
                            status = 'COMING_SOON';
                        } else if (quantity > 0) {
                            status = 'IN_STOCK';
                        } else {
                            status = 'AVAILABLE';
                        }
                    }

                    return {
                        isInStock,
                        inventoryPolicy,
                        status,
                        quantity,
                        availability: stockStatus
                    };
                };

                // Parse weight with unit conversion
                const parseWeight = (weightStr) => {
                    if (!weightStr) return { value: 0, unit: 'KILOGRAMS' };
                    
                    // Convert to string and clean up
                    const cleanStr = weightStr.toString().toLowerCase().trim();
                    
                    // Extract numeric value and unit
                    const match = cleanStr.match(/(\d*\.?\d+)\s*(kg|g|lbs|oz|lb|pound|pounds|gram|grams|kilogram|kilograms|ounce|ounces)/i);
                    if (!match) return { value: 0, unit: 'KILOGRAMS' };

                    const value = parseFloat(match[1]);
                    const unit = match[2].toLowerCase();

                    // Convert to kilograms
                    let weightInKg = value;
                    switch (unit) {
                        case 'g':
                        case 'gram':
                        case 'grams':
                            weightInKg = value / 1000;
                            break;
                        case 'lbs':
                        case 'lb':
                        case 'pound':
                        case 'pounds':
                            weightInKg = value * 0.453592;
                            break;
                        case 'oz':
                        case 'ounce':
                        case 'ounces':
                            weightInKg = value * 0.0283495;
                            break;
                        // kg is already in kilograms
                    }

                    // Round to 3 decimal places to avoid floating point issues
                    weightInKg = Math.round(weightInKg * 1000) / 1000;

                    return {
                        value: weightInKg,
                        unit: 'KILOGRAMS',
                        originalValue: value,
                        originalUnit: unit
                    };
                };

                // --- Robust image extraction (WooCommerce-style) ---
                const images = [];

                // Main image fields
                if (record['image_url']) {
                  images.push(record['image_url'].trim());
                }
                if (record['main_image']) {
                  const mainImage = record['main_image'].trim();
                  if (mainImage && !images.includes(mainImage)) images.push(mainImage);
                }

                // Additional images (comma-separated or array)
                if (record['images']) {
                  let imageUrls = [];
                  if (Array.isArray(record['images'])) {
                    imageUrls = record['images'];
                  } else if (typeof record['images'] === 'string') {
                    imageUrls = record['images'].split(',');
                  }
                  imageUrls.map(url => url.trim())
                    .filter(Boolean)
                    .forEach(url => {
                      if (!images.includes(url)) images.push(url);
                    });
                }

                // Additional image fields (e.g., additional_image_1, additional_image_2, etc.)
                for (let i = 1; i <= 10; i++) {
                  const key = `additional_image_${i}`;
                  if (record[key]) {
                    const url = record[key].trim();
                    if (url && !images.includes(url)) images.push(url);
                  }
                }

                // Featured image (if present)
                if (record['featured_image']) {
                  const featured = record['featured_image'].trim();
                  if (featured && !images.includes(featured)) images.unshift(featured);
                }

                // Images from variations (if you support variant-level images)
                if (record.variations && Array.isArray(record.variations)) {
                  record.variations.forEach(variant => {
                    if (variant.image_url && !images.includes(variant.image_url)) {
                      images.push(variant.image_url.trim());
                    }
                  });
                }

                // Convert to Shopify image objects
                const validImages = images.filter(
                  url => url && url !== 'null' && url !== null && url !== undefined && url.trim() !== ''
                );
                const imageObjects = validImages.map((url, index) => ({
                  src: url,
                  position: index + 1
                }));

                // Robustly extract brand and manufacturer from possible column names
                const brand = record.brand || record.Brand || record.brand_name || record['Brand Name'] || '';
                const manufacturer = record.manufacturer || record.Manufacturer || '';
                // Debug log
                console.log('Parsed brand:', brand, 'manufacturer:', manufacturer);

                // Parse all the data
                const categories = parseCategories(record.categories);
                const variations = parseVariations(record.variations);
                const features = parseFeatures(record.features);
                const stockInfo = parseStockStatus(record.availability, record.stock_quantity);
                const finalPrice = parsePrice(record.final_price);
                const initialPrice = parsePrice(record.initial_price);
                const itemWeight = parseWeight(record.item_weight);
                const dimensions = parseDimensions(record.product_dimensions);
                const delivery = parseDelivery(record.delivery);

                // Only set compareAtPrice if initialPrice is a valid number
                const compareAtPrice = (typeof initialPrice === 'number' && !isNaN(initialPrice)) ? initialPrice : null;

                // Get primary category for product type
                const primaryCategory = categories.length > 0 ? categories[0].title : 'Default';

                // Create base product with enhanced details
                const product = {
                    title: record.title,
                    description: record.description,
                    brand: brand,
                    manufacturer: manufacturer,
                    productType: primaryCategory,
                    tags: categories.map(cat => cat.title),
                    collections: categories.map(cat => ({
                        title: cat.title,
                        handle: cat.handle,
                        parent: cat.parent,
                        fullPath: cat.fullPath,
                        type: 'collection',
                        published: true,
                        publishedAt: new Date().toISOString()
                    })),
                    price: finalPrice || 0,
                    compareAtPrice: compareAtPrice,
                    sku: record.asin,
                    barcode: record.upc,
                    weight: itemWeight.value,
                    weightUnit: itemWeight.unit,
                    inventoryQuantity: stockInfo.quantity,
                    inventoryPolicy: stockInfo.inventoryPolicy,
                    status: stockInfo.status,
                    availability: stockInfo.availability,
                    images: imageObjects,
                    options: [],
                    variants: [],
                    metafields: {
                        specifications: {
                            model_number: record.model_number,
                            manufacturer: record.manufacturer,
                            department: record.department,
                            country_of_origin: record.country_of_origin,
                            date_first_available: record.date_first_available,
                            dimensions: dimensions,
                            rating: parseFloat(record.rating) || null,
                            reviews_count: parseInt(record.reviews_count) || 0,
                            images_count: parseInt(record.images_count) || 0,
                            video_count: parseInt(record.video_count) || 0
                        },
                        features: features,
                        brand: record.brand,
                        model: record.model_number,
                        color: record.color,
                        size: record.size,
                        material: record.material,
                        dimensions: dimensions,
                        warranty: record.warranty,
                        shipping_weight: itemWeight.value,
                        shipping_weight_unit: itemWeight.unit,
                        shipping_dimensions: dimensions,
                        country_of_origin: record.country_of_origin,
                        bullet_points: record.bullet_points,
                        rating: parseFloat(record.rating) || null,
                        review_count: parseInt(record.reviews_count) || 0,
                        best_seller_rank: parseInt(record.root_bs_rank) || null,
                        category_rank: parseInt(record.bs_rank) || null,
                        subcategory_rank: parseInt(record.subcategory_rank) || null,
                        prime_eligible: record.prime_eligible === 'true',
                        fba_eligible: record.fba_eligible === 'true',
                        stock_status: stockInfo.status,
                        stock_quantity: stockInfo.quantity,
                        availability: stockInfo.availability,
                        restock_date: record.restock_date,
                        shipping_info: delivery,
                        return_policy: record.return_policy,
                        categories: categories,
                        price_details: {
                            current_price: finalPrice,
                            original_price: initialPrice,
                            compare_at_price: initialPrice || finalPrice,
                            currency: record.currency,
                            discount: record.discount,
                            last_updated: new Date().toISOString()
                        },
                        weight_details: {
                            item_weight: itemWeight.value,
                            item_weight_unit: itemWeight.unit,
                            original_item_weight: itemWeight.originalValue,
                            original_item_weight_unit: itemWeight.originalUnit
                        },
                        inventory: {
                            quantity: stockInfo.quantity,
                            policy: stockInfo.inventoryPolicy,
                            status: stockInfo.status,
                            availability: stockInfo.availability
                        }
                    }
                };

                // Add variations if they exist
                if (variations && variations.length > 0) {
                    const optionNames = new Set();
                    variations.forEach(variation => {
                        const nameParts = variation.name.split(' ');
                        if (nameParts.length > 0) {
                            optionNames.add(nameParts[0]);
                        }
                    });

                    product.options = Array.from(optionNames).map(name => ({
                        name,
                        values: variations
                            .filter(v => v.name.startsWith(name))
                            .map(v => v.name.split(' ').slice(1).join(' '))
                    }));

                    product.variants = variations.map(variation => {
                        const variantFinalPrice = parsePrice(variation.price || record.final_price);
                        const variantInitialPrice = parsePrice(variation.compare_at_price || record.initial_price);
                        const variantCompareAtPrice = (typeof variantInitialPrice === 'number' && !isNaN(variantInitialPrice)) ? variantInitialPrice : null;
                        const variantStockInfo = parseStockStatus(
                            variation.stock_status || record.availability,
                            variation.stock_quantity || record.stock_quantity
                        );
                        const variantWeight = parseWeight(variation.weight || record.item_weight);

                        return {
                            title: variation.name,
                            price: variantFinalPrice || 0,
                            compareAtPrice: variantCompareAtPrice,
                            sku: variation.asin || record.asin,
                            barcode: variation.upc || record.upc,
                            weight: variantWeight.value,
                            weightUnit: variantWeight.unit,
                            inventoryQuantity: variantStockInfo.quantity,
                            inventoryPolicy: variantStockInfo.inventoryPolicy,
                            status: variantStockInfo.status,
                            availability: variantStockInfo.availability,
                            metafields: {
                                stock_status: variantStockInfo.status,
                                stock_quantity: variantStockInfo.quantity,
                                availability: variantStockInfo.availability,
                                categories: categories,
                                price_details: {
                                    current_price: variantFinalPrice,
                                    original_price: variantInitialPrice,
                                    compare_at_price: variantInitialPrice || variantFinalPrice,
                                    currency: record.currency,
                                    discount: record.discount,
                                    last_updated: new Date().toISOString()
                                },
                                weight_details: {
                                    item_weight: variantWeight.value,
                                    item_weight_unit: variantWeight.unit,
                                    original_item_weight: variantWeight.originalValue,
                                    original_item_weight_unit: variantWeight.originalUnit
                                },
                                inventory: {
                                    quantity: variantStockInfo.quantity,
                                    policy: variantStockInfo.inventoryPolicy,
                                    status: variantStockInfo.status,
                                    availability: variantStockInfo.availability
                                }
                            }
                        };
                    });
                } else {
                    // Add default variant if no variations
                    product.variants = [{
                        title: 'Default',
                        price: finalPrice || 0,
                        compareAtPrice: compareAtPrice,
                        sku: record.asin,
                        barcode: record.upc,
                        weight: itemWeight.value,
                        weightUnit: itemWeight.unit,
                        inventoryQuantity: stockInfo.quantity,
                        inventoryPolicy: stockInfo.inventoryPolicy,
                        status: stockInfo.status,
                        availability: stockInfo.availability,
                        metafields: {
                            stock_status: stockInfo.status,
                            stock_quantity: stockInfo.quantity,
                            availability: stockInfo.availability,
                            categories: categories,
                            price_details: {
                                current_price: finalPrice,
                                original_price: initialPrice,
                                compare_at_price: initialPrice || finalPrice,
                                currency: record.currency,
                                discount: record.discount,
                                last_updated: new Date().toISOString()
                            },
                            weight_details: {
                                item_weight: itemWeight.value,
                                item_weight_unit: itemWeight.unit,
                                original_item_weight: itemWeight.originalValue,
                                original_item_weight_unit: itemWeight.originalUnit
                            },
                            inventory: {
                                quantity: stockInfo.quantity,
                                policy: stockInfo.inventoryPolicy,
                                status: stockInfo.status,
                                availability: stockInfo.availability
                            }
                        }
                    }];
                }

                // Add features and specifications to description
                let enhancedDescription = product.description;

                if (features && features.length > 0) {
                    enhancedDescription += '\n\nFeatures:\n' + features.join('\n');
                }

                // Add categories to description
                if (categories && categories.length > 0) {
                    enhancedDescription += '\n\nCategories:\n';
                    categories.forEach(category => {
                        enhancedDescription += `${category.fullPath}\n`;
                    });
                }

                // Add pricing information to description
                enhancedDescription += `\nPricing Information:\n`;
                enhancedDescription += `Current Price: ${record.currency} ${finalPrice?.toFixed(2) || 'N/A'}\n`;
                if (initialPrice) {
                    enhancedDescription += `Original Price: ${record.currency} ${initialPrice.toFixed(2)}\n`;
                    if (finalPrice && initialPrice > finalPrice) {
                        const savings = initialPrice - finalPrice;
                        const savingsPercentage = (savings / initialPrice * 100).toFixed(0);
                        enhancedDescription += `You Save: ${record.currency} ${savings.toFixed(2)} (${savingsPercentage}%)\n`;
                    }
                }

                // Add stock information to description
                enhancedDescription += `\nStock Information:\n`;
                enhancedDescription += `Availability: ${stockInfo.availability}\n`;
                enhancedDescription += `Status: ${stockInfo.status}\n`;
                if (stockInfo.quantity > 0) {
                    enhancedDescription += `Quantity in Stock: ${stockInfo.quantity}\n`;
                }
                if (record.restock_date) {
                    enhancedDescription += `Restock Date: ${record.restock_date}\n`;
                }

                // Add weight information to description
                enhancedDescription += `\nWeight Information:\n`;
                enhancedDescription += `Item Weight: ${itemWeight.originalValue} ${itemWeight.originalUnit}\n`;
                if (dimensions) {
                    enhancedDescription += `Dimensions: ${dimensions.length} x ${dimensions.width} x ${dimensions.height} ${dimensions.unit}\n`;
                }

                // Add shipping information to description
                if (delivery) {
                    enhancedDescription += `\nShipping Information:\n`;
                    if (delivery.free_delivery) {
                        enhancedDescription += `Free Delivery Available\n`;
                    }
                    if (delivery.estimated_delivery) {
                        enhancedDescription += `Estimated Delivery: ${delivery.estimated_delivery}\n`;
                    }
                    if (delivery.fastest_delivery) {
                        enhancedDescription += `Fastest Delivery: ${delivery.fastest_delivery}\n`;
                    }
                }

                product.description = enhancedDescription;

                return product;
            });
        } catch (error) {
            console.error('Error parsing Amazon CSV:', error);
            throw new Error('Failed to parse Amazon CSV file');
        }
    },

    async exportToCSV(products) {
        const columns = [
            'timestamp','title','seller_name','brand','description','initial_price','final_price','currency','availability','reviews_count','categories','asin','buybox_seller','number_of_sellers','root_bs_rank','answered_questions','domain','images_count','url','video_count','image_url','item_weight','rating','product_dimensions','seller_id','date_first_available','discount','model_number','manufacturer','department','plus_content','upc','video','top_review','variations','delivery','features','format','buybox_prices','parent_asin','input_asin','ingredients','origin_url','bought_past_month','is_available','root_bs_category','bs_category','bs_rank','badge','subcategory_rank','amazon_choice','images','product_details','prices_breakdown','country_of_origin'
        ];
        const getFirst = (...args) => args.find(v => v !== undefined && v !== null && v !== '');
        const records = products.map((product, idx) => {
            // Support Shopify structure: check variants[0] as well as top-level
            const variant = Array.isArray(product.variants) && product.variants[0] ? product.variants[0] : {};
            const initial_price = getFirst(
                product.compareAtPrice,
                product.initial_price,
                product.sale_price,
                product.regular_price,
                product.price,
                variant.compareAtPrice,
                variant.initial_price,
                variant.sale_price,
                variant.regular_price,
                variant.price,
                ''
            );
            const final_price = getFirst(
                product.price,
                product.final_price,
                product.current_price,
                product.sale_price,
                product.compareAtPrice,
                variant.price,
                variant.final_price,
                variant.current_price,
                variant.sale_price,
                variant.compareAtPrice,
                ''
            );
            const inventory = getFirst(
                product.inventoryQuantity,
                product.stock,
                product.quantity,
                product.inventory,
                variant.inventoryQuantity,
                variant.stock,
                variant.quantity,
                variant.inventory,
                0
            );
            const availability = getFirst(product.availability, inventory > 0 ? 'In Stock' : 'Out of Stock', 'Out of Stock');
            return {
                'timestamp': product.timestamp || '',
                'title': product.title || '',
                'seller_name': product.seller_name || '',
                'brand': product.brand || product.vendor || '',
                'description': product.description || product.bodyHtml || '',
                'initial_price': initial_price,
                'final_price': final_price,
                'currency': product.currency || '',
                'availability': availability,
                'reviews_count': product.reviews_count || '',
                'categories': JSON.stringify([
                  ...(product.productType ? [product.productType] : []),
                  ...(Array.isArray(product.tags) ? product.tags : [])
                ]),
                'asin': product.asin || product.sku || '',
                'buybox_seller': product.buybox_seller || '',
                'number_of_sellers': product.number_of_sellers || '',
                'root_bs_rank': product.root_bs_rank || '',
                'answered_questions': product.answered_questions || '',
                'domain': product.domain || '',
                'images_count': product.images_count || (Array.isArray(product.images) ? product.images.length : ''),
                'url': product.url || '',
                'video_count': product.video_count || '',
                'image_url': product.image_url || (Array.isArray(product.images) && product.images[0] ? product.images[0].src : ''),
                'item_weight': product.weight || '',
                'rating': product.rating || '',
                'product_dimensions': product.product_dimensions || '',
                'seller_id': product.seller_id || '',
                'date_first_available': product.date_first_available || '',
                'discount': product.discount || '',
                'model_number': product.model_number || '',
                'manufacturer': product.manufacturer || '',
                'department': product.department || '',
                'plus_content': product.plus_content || '',
                'upc': product.upc || product.barcode || '',
                'video': product.video || '',
                'top_review': product.top_review || '',
                'variations': product.variations ? JSON.stringify(product.variations) : '',
                'delivery': product.delivery ? JSON.stringify(product.delivery) : '',
                'features': product.features ? JSON.stringify(product.features) : '',
                'format': product.format || '',
                'buybox_prices': product.buybox_prices ? JSON.stringify(product.buybox_prices) : '',
                'parent_asin': product.parent_asin || '',
                'input_asin': product.input_asin || '',
                'ingredients': product.ingredients || '',
                'origin_url': product.origin_url || '',
                'bought_past_month': product.bought_past_month || '',
                'is_available': product.is_available || '',
                'root_bs_category': product.root_bs_category || '',
                'bs_category': product.bs_category || '',
                'bs_rank': product.bs_rank || '',
                'badge': product.badge || '',
                'subcategory_rank': product.subcategory_rank || '',
                'amazon_choice': product.amazon_choice || '',
                'images': Array.isArray(product.images) ? JSON.stringify(product.images.map(img => img.src)) : '',
                'product_details': product.product_details ? JSON.stringify(product.product_details) : '',
                'prices_breakdown': product.prices_breakdown ? JSON.stringify(product.prices_breakdown) : '',
                'country_of_origin': product.country_of_origin || ''
            };
        });
            return new Promise((resolve, reject) => {
            stringify(records, { header: true, columns }, (err, output) => {
                if (err) reject(err);
                else resolve(output);
            });
        });
    }
}; 