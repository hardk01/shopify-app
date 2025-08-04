import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify';

export const customParser = {
    async parseCSV(csvText) {
        const records = parse(csvText, {
            columns: true,
            skip_empty_lines: true,
            trim: true
        });
        return records.map(row => {
            return {
                id: row['ID'] || '',
                title: row['Title'] || '',
                description: row['Description'] || '',
                handle: row['Handle'] || '',
                vendor: row['Vendor'] || '',
                productType: row['Type'] || '',
                tags: row['Tags'] ? row['Tags'].split(',').map(t => t.trim()).filter(Boolean) : [],
                images: row['Images'] ? row['Images'].split(',').map(src => ({ src: src.trim() })).filter(img => img.src) : [],
                status: row['Status'] || '',
                variants: [{
                    sku: row['SKU'] || '',
                    price: row['Price'] || '',
                    compareAtPrice: row['Compare At Price'] || '',
                    inventoryQuantity: row['Inventory'] || ''
                }]
            };
        });
    },
    async exportToCSV(products) {
        const columns = [
            'ID', 'Title', 'Description', 'SKU', 'Price', 'Compare At Price', 'Inventory', 'Status', 'Type', 'Vendor', 'Tags', 'Images', 'Handle'
        ];
        const records = products.map(product => [
            product.id ? (product.id.split('/').pop()) : (idx + 1) || '',
            product.title || '',
            product.description || '',
            product.variants && product.variants[0] ? product.variants[0].sku || '' : '',
            product.variants && product.variants[0] ? product.variants[0].price || '' : '',
            product.variants && product.variants[0] ? product.variants[0].compareAtPrice || '' : '',
            product.variants && product.variants[0] ? product.variants[0].inventoryQuantity || '' : '',
            product.status || '',
            product.productType || '',
            product.vendor || '',
            Array.isArray(product.tags) ? product.tags.join(',') : (product.tags || ''),
            Array.isArray(product.images) ? product.images.map(img => img.src).join(',') : '',
            product.handle || ''
        ]);
        return new Promise((resolve, reject) => {
            stringify([columns, ...records], (err, output) => {
                if (err) reject(err);
                else resolve(output);
            });
        });
    },
};
