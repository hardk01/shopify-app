import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify';

export const squarespaceParser = {
    async parseCSV(csvText) {
        try {
            const records = parse(csvText, {
                columns: true,
                skip_empty_lines: true,
                trim: true
            });

            return records.map((row, idx) => {
                // Handle/Title/Description
                const handle = row['Handle'] || '';
                const title = row['Title'] || row['Product Name'] || 'Untitled';
                const description = row['Body (HTML)'] || row['Description'] || row['Product Description'] || '';

                // Vendor/Brand
                const vendor = row['Vendor'] || row['Brand Name'] || '';

                // Type
                const productType = row['Type'] || row['Category'] || '';

                // Tags
                const tags = (row['Tags'] || '').split(',').map(t => t.trim()).filter(Boolean);

                // Price
                const price = parseFloat(row['Variant Price'] || row['Price'] || '0') || 0;

                // SKU
                const sku = row['Variant SKU'] || row['SKU'] || '';

                // Weight (grams to kg)
                const grams = parseFloat(row['Variant Grams'] || '0') || 0;
                const weight = grams / 1000;
                const weightUnit = 'kg';

                // Inventory
                const inventoryQuantity = parseInt(row['Variant Inventory Qty'] || row['Inventory'] || '0') || 0;
                const inventoryPolicy = inventoryQuantity > 0 ? 'CONTINUE' : 'DENY';

                // Status/Published
                const published = (row['Published'] || '').toString().toLowerCase();
                const status = published === 'true' || published === 'yes' || published === '1' ? 'active' : 'draft';

                // Images (support ; or , as separator)
                let imageField = row['Image Src'] || row['Product Image URL'] || row['Images'] || '';
                let imageUrls = imageField.split(/[;,]/).map(url => url.trim()).filter(url => url && url !== 'null');
                imageUrls = [...new Set(imageUrls)];
                const images = imageUrls.map((src, i) => ({ src, position: i + 1 }));

                // Options
                const options = [];
                let variantTitle = title;
                if (row['Option1 Name'] && row['Option1 Value']) {
                    options.push({ name: row['Option1 Name'], values: [row['Option1 Value']] });
                    variantTitle = row['Option1 Value'];
                }
                // Add more options if needed

                // Variants (one per product in this structure)
                const variants = [
                    {
                        title: variantTitle || 'Default Title',
                        price,
                        sku,
                        weight,
                        weightUnit,
                        inventoryQuantity,
                        inventoryPolicy,
                        inventory_quantity: inventoryQuantity,
                        stock_quantity: inventoryQuantity
                    }
                ];

                return {
                    handle,
                    title,
                    description,
                    vendor,
                    productType,
                    tags,
                    price,
                    sku,
                    weight,
                    weightUnit,
                    inventoryQuantity,
                    inventoryPolicy,
                    images,
                    status,
                    options,
                    variants
                };
            });
        } catch (error) {
            console.error('Error parsing Squarespace CSV:', error);
            throw new Error('Failed to parse Squarespace CSV file');
        }
    },
    async exportToCSV(products) {
        const columns = [
            'Handle',
            'Title',
            'Body (HTML)',
            'Vendor',
            'Type',
            'Tags',
            'Published',
            'Option1 Name',
            'Option1 Value',
            'Variant SKU',
            'Variant Grams',
            'Variant Inventory Qty',
            'Variant Price',
            'Image Src'
        ];
        const records = products.map(product => {
            const variant = Array.isArray(product.variants) && product.variants[0] ? product.variants[0] : {};
            return {
                'Handle': product.handle || '',
                'Title': product.title || '',
                'Body (HTML)': product.description || product.body_html || '',
                'Vendor': product.vendor || '',
                'Type': product.productType || '',
                'Tags': Array.isArray(product.tags) ? product.tags.join(',') : (product.tags || ''),
                'Published': product.status === 'active' ? 'TRUE' : 'FALSE',
                'Option1 Name': (product.options && product.options[0] && product.options[0].name) ? product.options[0].name : 'Color',
                'Option1 Value': (product.options && product.options[0] && product.options[0].values && product.options[0].values[0]) ? product.options[0].values[0] : (variant.title || ''),
                'Variant SKU': product.sku || variant.sku || '',
                'Variant Grams': (variant.weight ? Math.round(variant.weight * 1000) : ''),
                'Variant Inventory Qty': variant.inventoryQuantity || product.inventoryQuantity || '',
                'Variant Price': variant.price || product.price || '',
                'Image Src': Array.isArray(product.images) ? product.images.map(img => img.src).join(',') : '',
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