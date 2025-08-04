import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify';

export const ebayParser = {
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

                // SKU/CustomLabel
                const sku = row['CustomLabel'] || row['ItemID'] || '';

                // Images
                let imageField = row['PictureURL'] || row['PictureURLs'] || '';
                let imageUrls = imageField.split(/[;,]/).map(url => url.trim()).filter(url => url && url !== 'null');
                imageUrls = [...new Set(imageUrls)];
                const images = imageUrls.map((src, i) => ({ src, position: i + 1 }));

                // Inventory
                const inventoryQuantity = parseInt(row['Quantity'] || '0') || 0;
                const inventoryPolicy = inventoryQuantity > 0 ? 'CONTINUE' : 'DENY';

                // Status (eBay doesn't have a direct state in this export, so default to active)
                const status = 'active';

                // Category (use only last part for productType)
                const categoryPath = row['Category'] || '';
                const productType = categoryPath.split('>').map(s => s.trim()).filter(Boolean).pop() || '';

                // Metafields for extra info
                const metafields = [
                  { key: 'action', value: row['Action'] || '', namespace: 'ebay', type: 'single_line_text_field' },
                  { key: 'item_id', value: row['ItemID'] || '', namespace: 'ebay', type: 'single_line_text_field' },
                  { key: 'condition_id', value: row['ConditionID'] || '', namespace: 'ebay', type: 'single_line_text_field' },
                  { key: 'format', value: row['Format'] || '', namespace: 'ebay', type: 'single_line_text_field' },
                  { key: 'duration', value: row['Duration'] || '', namespace: 'ebay', type: 'single_line_text_field' },
                  { key: 'location', value: row['Location'] || '', namespace: 'ebay', type: 'single_line_text_field' },
                  { key: 'shipping_profile', value: row['ShippingProfile'] || '', namespace: 'ebay', type: 'single_line_text_field' },
                  { key: 'return_profile', value: row['ReturnProfile'] || '', namespace: 'ebay', type: 'single_line_text_field' },
                  { key: 'payment_profile', value: row['PaymentProfile'] || '', namespace: 'ebay', type: 'single_line_text_field' }
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
                    metafields
                };
            });
        } catch (error) {
            console.error('Error parsing eBay CSV:', error);
            throw new Error('Failed to parse eBay CSV file');
        }
    },
    async exportToCSV(products) {
        const columns = [
            'Action',
            'ItemID',
            'Title',
            'Description',
            'ConditionID',
            'Price',
            'Quantity',
            'Category',
            'CustomLabel',
            'PictureURL',
            'Format',
            'Duration',
            'Location',
            'ShippingProfile',
            'ReturnProfile',
            'PaymentProfile'
        ];
        const records = products.map(product => {
            const metafields = product.metafields || [];
            const getMeta = key => (metafields.find(m => m.key === key)?.value || '');
            return {
                'Action': getMeta('action') || 'Add',
                'ItemID': getMeta('item_id') || '',
                'Title': product.title || '',
                'Description': product.description || '',
                'ConditionID': getMeta('condition_id') || '',
                'Price': product.price || '',
                'Quantity': product.inventoryQuantity || '',
                'Category': product.productType || '',
                'CustomLabel': product.sku || '',
                'PictureURL': Array.isArray(product.images) ? product.images.map(img => img.src).join(';') : '',
                'Format': getMeta('format') || '',
                'Duration': getMeta('duration') || '',
                'Location': getMeta('location') || '',
                'ShippingProfile': getMeta('shipping_profile') || '',
                'ReturnProfile': getMeta('return_profile') || '',
                'PaymentProfile': getMeta('payment_profile') || '',
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