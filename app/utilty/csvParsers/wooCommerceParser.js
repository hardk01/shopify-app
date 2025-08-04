import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify';

const WOOCOMMERCE_FIELDS = [
  'ID', 'Type', 'SKU', 'Name', 'Published', 'Is featured?', 'Visibility in catalogue',
  'Short description', 'Description', 'Date sale price starts', 'Date sale price ends',
  'Tax status', 'Tax class', 'In stock?', 'Stock', 'Low stock amount', 'Backorders allowed?',
  'Sold individually?', 'Weight (kg)', 'Length (cm)', 'Width (cm)', 'Height (cm)',
  'Allow customer reviews?', 'Purchase note', 'Sale price', 'Regular price', 'Categories',
  'Tags', 'Shipping class', 'Images', 'Download limit', 'Download expiry days', 'Parent',
  'Grouped products', 'Upsells', 'Cross-sells', 'External URL', 'Button text', 'Position',
  'Attribute 1 name', 'Attribute 1 value(s)', 'Attribute 1 visible', 'Attribute 1 global',
  'Attribute 2 name', 'Attribute 2 value(s)', 'Attribute 2 visible', 'Attribute 2 global',
  'Attribute 3 name', 'Attribute 3 value(s)', 'Attribute 3 visible', 'Attribute 3 global'
];

export const wooCommerceParser = {
    async parseCSV(csvText) {
        try {
            const records = parse(csvText, {
                columns: true,
                skip_empty_lines: true,
                trim: true,
                relax_column_count: true,
                skip_records_with_error: true
            });

            if (!records || records.length === 0) {
                throw new Error('CSV file is empty or has no valid data');
            }

            // Add summary log for total records parsed
            console.log('Total records parsed:', records.length);

            // Log parsed CSV columns and normalize keys
            const normalizeKey = key => key.replace(/^\uFEFF/, '').replace(/\uFEFF/, '').trim();
            const firstRecord = records[0];
            console.log('Parsed CSV columns:', Object.keys(firstRecord).map(normalizeKey));

            // Helper to get a field value robustly
            function getField(record, field) {
                // Try exact, BOM, and trimmed
                return record[field] || record[`\uFEFF${field}`] || record[` ${field}`] || record[field.trim()] || '';
            }

            // Log unique and empty IDs
            const allIds = records.map(r => getField(r, 'ID'));
            const uniqueIds = new Set(allIds.filter(Boolean));
            console.log('Unique IDs:', uniqueIds.size, 'Empty IDs:', allIds.filter(id => !id).length);

            // First, group records by parent ID
            const productGroups = {};
            
            // First pass: Create parent products
            records.forEach(record => {
                const type = getField(record, 'Type').toLowerCase() || 'simple';
                const id = getField(record, 'ID') || `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                const parentId = getField(record, 'Parent').replace('id:', '') || '';
                
                // Handle variable products
                if (type === 'variable') {
                    productGroups[id] = {
                        parent: record,
                        variants: [],
                        isSimple: false
                    };
                }
                // Handle simple products
                else if (type === 'simple' && !parentId) {
                    productGroups[id] = {
                        parent: record,
                        variants: [],
                        isSimple: true
                    };
                }
            });

            // Add summary log for total product groups
            console.log('Total product groups:', Object.keys(productGroups).length);

            // Second pass: Add variants to their parents
            let orphanVariants = 0;
            records.forEach(record => {
                const type = getField(record, 'Type').toLowerCase() || 'simple';
                const parentId = getField(record, 'Parent').replace('id:', '') || '';
                
                if (type === 'variation' && parentId) {
                    // Find the parent product by ID (compare as strings)
                    const parentKey = Object.keys(productGroups).find(key => 
                        String(getField(productGroups[key].parent, 'ID')) === String(parentId)
                    );
                    
                    if (parentKey && productGroups[parentKey]) {
                        productGroups[parentKey].variants.push(record);
                    } else {
                        orphanVariants++;
                    }
                }
            });

            // Log number of orphan variants
            console.log('Orphan variants (no parent found):', orphanVariants);

            // Log number of variants for each product group
            Object.entries(productGroups).forEach(([key, group]) => {
                console.log(`Product ${getField(group.parent, 'Name')} (${getField(group.parent, 'ID')}): ${group.variants.length} variants`);
            });

            // Convert grouped records to final format
            const processedProducts = Object.values(productGroups).map(group => {
                const parent = group.parent;
                const variants = group.variants;
                const isSimple = group.isSimple;

                try {
                    // Required fields with fallbacks
                    const title = getField(parent, 'Name') || '';
                    if (!title) {
                        console.warn('Skipping product with no name:', parent);
                        return null;
                    }

                    // Optional fields with fallbacks
                    let description = getField(parent, 'Description') || getField(parent, 'Short description') || '';
                    description = description
                        .replace(/\\n/g, ' ')
                        .replace(/\n/g, ' ')
                        .replace(/\\r/g, ' ')
                        .replace(/\r/g, ' ')
                        .replace(/\\t/g, ' ')
                        .replace(/\t/g, ' ')
                        .replace(/\\"/g, '"')
                        .replace(/\\'/g, "'")
                        .replace(/\\\\/g, '\\')
                        .replace(/\s+/g, ' ')
                        .trim();

                    // Handle categories
                    let categories = [];
                    const categoryString = getField(parent, 'Categories') || '';
                    if (categoryString) {
                        categories = categoryString
                            .split(',')
                            .map(cat => cat.trim())
                            .filter(Boolean)
                            .map(cat => cat.split('>').map(subcat => subcat.trim()).filter(Boolean));
                    }

                    const vendor = categories.length > 0 ? categories[0][0] : '';
                    const productType = getField(parent, 'Type')?.toLowerCase() || 'simple';

                    const tags = (getField(parent, 'Tags') || '').split(',').map(tag => tag.trim()).filter(Boolean);

                    // Handle images
                    const images = (getField(parent, 'Images') || '').split(',').map(url => url.trim()).filter(Boolean);
                    const imageObjects = images.map((url, index) => ({
                        src: url,
                        position: index + 1
                    }));

                    // Status handling
                    const status = (getField(parent, 'Published') || '').toLowerCase() === '1' ? 'ACTIVE' : 'DRAFT';

                    // Process options for variable products
                    const options = [];
                    if (!isSimple) {
                        // Collect all unique option values from variants
                        const attributeName = getField(parent, 'Attribute 1 name') || 'Color';
                        const optionValuesSet = new Set();
                        
                        variants.forEach(variant => {
                            const value = getField(variant, 'Attribute 1 value(s)') || '';
                            if (value) optionValuesSet.add(value.trim());
                        });

                        // If no variants, fall back to parent attribute values
                        if (optionValuesSet.size === 0 && getField(parent, 'Attribute 1 value(s)')) {
                            getField(parent, 'Attribute 1 value(s)').split(',').forEach(val => {
                                if (val.trim()) optionValuesSet.add(val.trim());
                            });
                        }

                        const optionValues = Array.from(optionValuesSet);
                        if (optionValues.length > 0) {
                            options.push({
                                name: attributeName,
                                values: optionValues
                            });
                        }
                    }

                    // Process variants
                    let processedVariants = [];
                    if (isSimple) {
                        // Create a single variant for simple product
                        const price = parseFloat(getField(parent, 'Regular price') || '0');
                        const comparePrice = parseFloat(getField(parent, 'Sale price') || '0');
                        const stock = parseInt(getField(parent, 'Stock') || '0', 10);
                        const weight = parseFloat(getField(parent, 'Weight (kg)') || '0');

                        processedVariants.push({
                            title: 'Default Title',
                            price,
                            compareAtPrice: isNaN(comparePrice) ? null : comparePrice,
                            sku: getField(parent, 'SKU') || '',
                            barcode: getField(parent, 'GTIN, UPC, EAN, or ISBN') || '',
                            weight,
                            weightUnit: 'KILOGRAMS',
                            inventoryQuantity: stock,
                            inventoryPolicy: stock > 0 ? 'continue' : 'deny',
                            inventoryManagement: 'shopify',
                            requires_shipping: true,
                            images: imageObjects,
                            // Add these fields for proper variant linking
                            id: getField(parent, 'ID') || '',
                            metafields: [
                                {
                                    namespace: 'woocommerce',
                                    key: 'variant_id',
                                    value: getField(parent, 'ID') || '',
                                    type: 'string'
                                }
                            ]
                        });
                    } else {
                        // Process variants for variable product
                        processedVariants = variants.map(variant => {
                            const variantTitle = getField(variant, 'Name') || title;
                            const variantPrice = parseFloat(getField(variant, 'Regular price') || '0');
                            const variantComparePrice = parseFloat(getField(variant, 'Sale price') || '0');
                            const variantSku = getField(variant, 'SKU') || '';
                            const variantStock = parseInt(getField(variant, 'Stock') || '0', 10);
                            const variantWeight = parseFloat(getField(variant, 'Weight (kg)') || '0');
                            
                            // Get variant-specific images
                            const variantImages = (getField(variant, 'Images') || '').split(',').map(url => url.trim()).filter(Boolean);
                            const variantImageObjects = variantImages.map((url, index) => ({
                                src: url,
                                position: index + 1
                            }));

                            return {
                                title: variantTitle,
                                price: variantPrice,
                                compareAtPrice: isNaN(variantComparePrice) ? null : variantComparePrice,
                                sku: variantSku,
                                barcode: getField(variant, 'GTIN, UPC, EAN, or ISBN') || '',
                                weight: variantWeight,
                                weightUnit: 'KILOGRAMS',
                                inventoryQuantity: variantStock,
                                inventoryPolicy: variantStock > 0 ? 'continue' : 'deny',
                                inventoryManagement: 'shopify',
                                requires_shipping: true,
                                images: variantImageObjects,
                                option1: getField(variant, 'Attribute 1 value(s)') ? getField(variant, 'Attribute 1 value(s)').trim() : '',
                                option2: getField(variant, 'Attribute 2 value(s)') ? getField(variant, 'Attribute 2 value(s)').trim() : '',
                                option3: getField(variant, 'Attribute 3 value(s)') ? getField(variant, 'Attribute 3 value(s)').trim() : '',
                                // Add these fields for proper variant linking
                                id: getField(variant, 'ID') || '',
                                metafields: [
                                    {
                                        namespace: 'woocommerce',
                                        key: 'variant_id',
                                        value: getField(variant, 'ID') || '',
                                        type: 'string'
                                    },
                                    {
                                        namespace: 'woocommerce',
                                        key: 'parent_id',
                                        value: getField(parent, 'ID') || '',
                                        type: 'string'
                                    }
                                ]
                            };
                        });

                        // If no variants, create a default variant
                        if (processedVariants.length === 0) {
                            const price = parseFloat(getField(parent, 'Regular price') || '0');
                            const comparePrice = parseFloat(getField(parent, 'Sale price') || '0');
                            const stock = parseInt(getField(parent, 'Stock') || '0', 10);
                            const weight = parseFloat(getField(parent, 'Weight (kg)') || '0');

                            processedVariants.push({
                                title: 'Default Title',
                                price,
                                compareAtPrice: isNaN(comparePrice) ? null : comparePrice,
                                sku: getField(parent, 'SKU') || '',
                                barcode: getField(parent, 'GTIN, UPC, EAN, or ISBN') || '',
                                weight,
                                weightUnit: 'KILOGRAMS',
                                inventoryQuantity: stock,
                                inventoryPolicy: stock > 0 ? 'continue' : 'deny',
                                inventoryManagement: 'shopify',
                                requires_shipping: true,
                                images: imageObjects,
                                // Add these fields for proper variant linking
                                id: getField(parent, 'ID') || '',
                                metafields: [
                                    {
                                        namespace: 'woocommerce',
                                        key: 'variant_id',
                                        value: getField(parent, 'ID') || '',
                                        type: 'string'
                                    }
                                ]
                            });
                        }
                    }

                    return {
                        title,
                        description,
                        vendor,
                        productType,
                        tags,
                        images: imageObjects,
                        status,
                        options,
                        collections: categories.map(cat => cat.join(' / ')),
                        variants: processedVariants,
                        // Add these fields for proper product linking
                        id: getField(parent, 'ID') || '',
                        sku: getField(parent, 'SKU') || '',
                        handle: title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
                        // Add metadata for tracking
                        metafields: [
                            {
                                namespace: 'woocommerce',
                                key: 'product_id',
                                value: getField(parent, 'ID') || '',
                                type: 'string'
                            },
                            {
                                namespace: 'woocommerce',
                                key: 'parent_id',
                                value: getField(parent, 'Parent') || '',
                                type: 'string'
                            }
                        ]
                    };
                } catch (error) {
                    console.error('[WooCommerce Parser] Error processing product group:', error, group);
                    return null;
                }
            }).filter(Boolean);

            // Add summary log for total processed products
            console.log('Total processed products:', processedProducts.length);
            return processedProducts;
        } catch (error) {
            console.error('[WooCommerce Parser] Error parsing CSV:', error);
            throw new Error(`Failed to parse WooCommerce CSV file: ${error.message}`);
        }
    },
    async exportToCSV(products) {
        const records = [];
        
        products.forEach((product) => {
            // Get variants from product
            const variants = product.variants || [];
            
            // Get option names from product options
            const optionNames = product.options ? product.options.map(opt => opt.name) : [];
            
            // Generate a unique SKU for the main product if not provided
            const mainProductSku = product.sku || `PROD_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            // First row - main product
            const mainRow = {
                'ID': '',
                'Type': 'variable',
                'SKU': mainProductSku,
                    'Name': product.title || '',
                'Published': product.status === 'active' ? '1' : '0',
                'Is featured?': '0',
                'Visibility in catalogue': 'visible',
                'Short description': product.body_html || product.bodyHtml || '',
                'Description': product.description || '',
                'Date sale price starts': '',
                'Date sale price ends': '',
                'Tax status': 'taxable',
                'Tax class': '',
                'In stock?': '1',
                'Stock': '',
                'Low stock amount': '',
                'Backorders allowed?': '0',
                'Sold individually?': '0',
                'Weight (kg)': '',
                'Length (cm)': '',
                'Width (cm)': '',
                'Height (cm)': '',
                'Allow customer reviews?': '1',
                'Purchase note': '',
                'Sale price': '',
                'Regular price': '',
                'Categories': Array.isArray(product.product_category) ? product.product_category.join(',') : (product.product_category || ''),
                'Tags': Array.isArray(product.tags) ? product.tags.join(',') : (product.tags || ''),
                'Shipping class': '',
                'Images': product.images?.[0]?.src || '',
                'Download limit': '',
                'Download expiry days': '',
                'Parent': '',
                'Grouped products': '',
                'Upsells': '',
                'Cross-sells': '',
                'External URL': '',
                'Button text': '',
                'Position': '0',
                'Attribute 1 name': optionNames[0] || '',
                'Attribute 1 value(s)': product.options?.[0]?.values?.join(',') || '',
                'Attribute 1 visible': '1',
                'Attribute 1 global': '1',
                'Attribute 2 name': optionNames[1] || '',
                'Attribute 2 value(s)': product.options?.[1]?.values?.join(',') || '',
                'Attribute 2 visible': '1',
                'Attribute 2 global': '1',
                'Attribute 3 name': optionNames[2] || '',
                'Attribute 3 value(s)': product.options?.[2]?.values?.join(',') || '',
                'Attribute 3 visible': '1',
                'Attribute 3 global': '1'
            };
            records.push(mainRow);

            // Track used variant combinations to prevent duplicates
            const usedCombinations = new Set();

            // Additional rows for variants
            variants.forEach(variant => {
                // Get the selected options from the variant
                const selectedOptions = variant.selectedOptions || [];
                
                // Map selected options to their respective positions
                const optionValues = {};
                selectedOptions.forEach(opt => {
                    const index = optionNames.indexOf(opt.name);
                    if (index !== -1) {
                        // Make the option value more distinct by including the size
                        if (index === 0) { // Color
                            const sizeValue = selectedOptions.find(o => o.name === 'Size')?.value || '';
                            optionValues[`option${index + 1}`] = `${opt.value} (${sizeValue})`;
                        } else {
                            optionValues[`option${index + 1}`] = opt.value;
                        }
                    }
                });

                // Create a unique combination key
                const combinationKey = `${optionValues.option1 || ''}-${optionValues.option2 || ''}-${optionValues.option3 || ''}`;
                
                // Skip if this combination already exists
                if (usedCombinations.has(combinationKey)) {
                    console.warn(`Skipping duplicate variant combination: ${combinationKey}`);
                    return;
                }
                usedCombinations.add(combinationKey);

                // Generate a unique variant SKU
                const variantSku = `${mainProductSku}_${optionValues.option1 || ''}_${optionValues.option2 || ''}`.replace(/\s+/g, '_').toLowerCase();

                // Create a unique variant name that includes all option values
                const variantName = [
                    product.title,
                    optionValues.option1,
                    optionValues.option2,
                    optionValues.option3
                ].filter(Boolean).join(' - ');

                // Ensure each variant has unique attribute values
                const variantRow = {
                    'ID': '',
                    'Type': 'variation',
                    'SKU': variantSku,
                    'Name': variantName,
                    'Published': '1',
                    'Is featured?': '0',
                    'Visibility in catalogue': 'visible',
                    'Short description': '',
                    'Description': '',
                    'Date sale price starts': '',
                    'Date sale price ends': '',
                    'Tax status': 'taxable',
                    'Tax class': 'parent',
                    'In stock?': '1',
                    'Stock': variant.inventoryQuantity || '',
                    'Low stock amount': '',
                    'Backorders allowed?': '0',
                    'Sold individually?': '0',
                    'Weight (kg)': '',
                    'Length (cm)': '',
                    'Width (cm)': '',
                    'Height (cm)': '',
                    'Allow customer reviews?': '1',
                    'Purchase note': '',
                    'Sale price': '',
                    'Regular price': variant.price || '',
                    'Categories': '',
                    'Tags': '',
                    'Shipping class': '',
                    'Images': variant.image?.src || '',
                    'Download limit': '',
                    'Download expiry days': '',
                    'Parent': mainProductSku,
                    'Grouped products': '',
                    'Upsells': '',
                    'Cross-sells': '',
                    'External URL': '',
                    'Button text': '',
                    'Position': '',
                    'Attribute 1 name': optionNames[0] || '',
                    'Attribute 1 value(s)': optionValues.option1 || '',
                    'Attribute 1 visible': '1',
                    'Attribute 1 global': '1',
                    'Attribute 2 name': optionNames[1] || '',
                    'Attribute 2 value(s)': optionValues.option2 || '',
                    'Attribute 2 visible': '1',
                    'Attribute 2 global': '1',
                    'Attribute 3 name': optionNames[2] || '',
                    'Attribute 3 value(s)': optionValues.option3 || '',
                    'Attribute 3 visible': '1',
                    'Attribute 3 global': '1'
                };

                // Only add the variant if it has at least one option value
                if (optionValues.option1 || optionValues.option2 || optionValues.option3) {
                    records.push(variantRow);
                }
            });
        });

        return new Promise((resolve, reject) => {
            stringify(records, {
                header: true,
                columns: WOOCOMMERCE_FIELDS
            }, (err, output) => {
                if (err) reject(err);
                else resolve(output);
            });
        });
    }
}; 