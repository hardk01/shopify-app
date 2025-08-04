import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify';

export const walmartParser = {
    async parseCSV(csvText) {
        try {
            const records = parse(csvText, {
                columns: true,
                skip_empty_lines: true,
                trim: true
            });

            return records.map(row => {
                // Title/Description
                const title = row['Product Name'] || 'Untitled';
                const description = row['Description'] || '';

                // Price
                const price = parseFloat(row['Price'] || '0') || 0;

                // SKU
                const sku = row['SKU'] || '';

                // Images
                let imageField = row['Image URL'] || '';
                let imageUrls = imageField.split(/[;,]/).map(url => url.trim()).filter(url => url && url !== 'null');
                imageUrls = [...new Set(imageUrls)];
                const images = imageUrls.map((src, i) => ({ src, position: i + 1 }));

                // Inventory
                const inventoryQuantity = parseInt(row['Quantity'] || '0') || 0;
                const inventoryPolicy = inventoryQuantity > 0 ? 'CONTINUE' : 'DENY';

                // Status (Walmart doesn't have a direct state in this export, so default to active)
                const status = 'active';

                // Category (use only last part for productType)
                const categoryPath = row['Category'] || '';
                const productType = categoryPath.split('>').map(s => s.trim()).filter(Boolean).pop() || '';

                // Brand
                const vendor = row['Brand'] || '';

                // Metafields for extra info
                const metafields = [
                  { key: 'sku', value: sku, namespace: 'walmart', type: 'single_line_text_field' },
                  { key: 'brand', value: vendor, namespace: 'walmart', type: 'single_line_text_field' }
                ];

                // No variations in this format, so do not add options/variants
                return {
                    title,
                    description,
                    productType,
                    price,
                    sku,
                    images,
                    inventoryQuantity,
                    inventoryPolicy,
                    status,
                    vendor,
                    metafields
                };
            });
        } catch (error) {
            console.error('Error parsing Walmart CSV:', error);
            throw new Error('Failed to parse Walmart CSV file');
        }
    },
    async exportToCSV(products) {
        const columns = [
            'SKU',
            'Product Name',
            'Description',
            'Price',
            'Quantity',
            'Category',
            'Brand',
            'Image URL'
        ];
        const records = products.map(product => {
            return {
                'SKU': product.sku || '',
                'Product Name': product.title || '',
                'Description': product.description || '',
                'Price': product.price || '',
                'Quantity': product.inventoryQuantity || '',
                'Category': product.productType || '',
                'Brand': product.vendor || '',
                'Image URL': Array.isArray(product.images) ? product.images.map(img => img.src).join(';') : '',
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