import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify';

export const etsyParser = {
    async parseCSV(csvText) {
        try {
            const records = parse(csvText, {
                columns: true,
                skip_empty_lines: true,
                trim: true
            });

            return records.map(row => {
                // Title/Description
                const title = row['Title'] || 'Untitled';
                const description = row['Description'] || '';

                // Price
                const price = parseFloat(row['Price'] || '0') || 0;

                // SKU
                const sku = row['SKU'] || '';

                // Tags
                const tags = (row['Tags'] || '').split(',').map(t => t.trim()).filter(Boolean);

                // Images
                let imageField = row['Image URL'] || row['Images'] || '';
                let imageUrls = imageField.split(/[;,]/).map(url => url.trim()).filter(url => url && url !== 'null');
                imageUrls = [...new Set(imageUrls)];
                const images = imageUrls.map((src, i) => ({ src, position: i + 1 }));

                // Inventory
                const inventoryQuantity = parseInt(row['Quantity'] || '0') || 0;
                const inventoryPolicy = inventoryQuantity > 0 ? 'CONTINUE' : 'DENY';

                // Status (Etsy doesn't have a direct state in this export, so default to active)
                const status = 'active';

                // Options (Etsy sample doesn't have options, but keep for compatibility)
                const options = [];
                let variantTitle = sku;
                // If you add option columns in the future, set variantTitle to the first option value

                // Variants (one per product in this structure)
                const variants = [
                    {
                        title: variantTitle || 'Default Title',
                        price,
                        sku,
                        inventoryQuantity,
                        inventoryPolicy,
                        inventory_quantity: inventoryQuantity,
                        stock_quantity: inventoryQuantity
                    }
                ];

                return {
                    title,
                    description,
                    price,
                    sku,
                    tags,
                    images,
                    inventoryQuantity,
                    inventoryPolicy,
                    status,
                    options,
                    variants
                };
            });
        } catch (error) {
            console.error('Error parsing Etsy CSV:', error);
            throw new Error('Failed to parse Etsy CSV file');
        }
    },
    async exportToCSV(products) {
        const columns = [
            'Title',
            'Description',
            'Price',
            'Quantity',
            'SKU',
            'Tags',
            'Materials',
            'Image URL',
            'Shipping Profile',
            'Who made it?',
            'When was it made?',
            'Is it a supply?'
        ];
        const records = products.map(product => {
            const variant = Array.isArray(product.variants) && product.variants[0] ? product.variants[0] : {};
            return {
                'Title': product.title || '',
                'Description': product.description || '',
                'Price': variant.price || product.price || '',
                'Quantity': variant.inventoryQuantity || product.inventoryQuantity || '',
                'SKU': product.sku || variant.sku || '',
                'Tags': Array.isArray(product.tags) ? product.tags.join(',') : (product.tags || ''),
                'Materials': product.materials || '',
                'Image URL': Array.isArray(product.images) ? product.images.map(img => img.src).join(',') : '',
                'Shipping Profile': product.shippingProfile || 'Standard Shipping',
                'Who made it?': product.whoMade || 'I did',
                'When was it made?': product.whenMade || '2020-2024',
                'Is it a supply?': product.isSupply || 'No',
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