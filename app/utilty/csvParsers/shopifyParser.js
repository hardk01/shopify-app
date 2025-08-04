import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify';

const STANDARD_SHOPIFY_FIELDS = [
  'Handle','Title','Body (HTML)','Vendor','Product Category','Type','Tags','Published',
  'Option1 Name','Option1 Value','Option1 Linked To',
  'Option2 Name','Option2 Value','Option2 Linked To',
  'Option3 Name','Option3 Value','Option3 Linked To',
  'Variant SKU','Variant Grams','Variant Inventory Tracker','Variant Inventory Qty',
  'Variant Inventory Policy','Variant Fulfillment Service','Variant Price','Variant Compare At Price',
  'Variant Requires Shipping','Variant Taxable','Variant Barcode','Image Src','Image Position','Image Alt Text','Gift Card',
  'SEO Title','SEO Description','Google Shopping / Google Product Category','Google Shopping / Gender','Google Shopping / Age Group','Google Shopping / MPN','Google Shopping / Condition','Google Shopping / Custom Product','Google Shopping / Custom Label 0','Google Shopping / Custom Label 1','Google Shopping / Custom Label 2','Google Shopping / Custom Label 3','Google Shopping / Custom Label 4','fabric (product.metafields.custom.fabric)','Variant Image','Variant Weight Unit','Variant Tax Code','Cost per item','Status'
];

export const shopifyParser = {
  async parseCSV(csvText) {
    console.log('[ShopifyParser] Starting CSV parse');
    const records = parse(csvText, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    });
    console.log('[ShopifyParser] Parsed records:', records.length);
    
    const productMap = new Map();
    const lastOptionNames = {};
    
    for (const row of records) {
      // Normalize all keys to lower case for matching
      const normalizedRow = {};
      Object.keys(row).forEach(k => {
        normalizedRow[k.toLowerCase().trim()] = row[k];
      });
      
      const handle = normalizedRow['handle'] || '';
      if (!handle) {
        console.log('[ShopifyParser] Skipping row - no handle found');
        continue;
      }
      
      // Carry forward option names for each handle
      const option1Name = normalizedRow['option1 name'] || lastOptionNames[handle]?.option1Name || 'Title';
      const option2Name = normalizedRow['option2 name'] || lastOptionNames[handle]?.option2Name || '';
      const option3Name = normalizedRow['option3 name'] || lastOptionNames[handle]?.option3Name || '';
      lastOptionNames[handle] = { option1Name, option2Name, option3Name };
      
      let product = productMap.get(handle);
      if (!product) {
        product = {
          handle,
          title: normalizedRow['title'] || 'Untitled',
          body_html: normalizedRow['body (html)'] || '',
          vendor: normalizedRow['vendor'] || '',
          product_type: normalizedRow['type'] || '',
          product_category: normalizedRow['product category'] || '',
          tags: (normalizedRow['tags'] || '').split(',').map(t => t.trim()).filter(Boolean),
          status: normalizedRow['status'] || 'active',
          images: [],
          variants: [],
          metafields: []
        };
        productMap.set(handle, product);
        // Log only category, type, and tags for debugging
        console.log('[ShopifyParser][DEBUG] handle:', handle, 'type:', product.product_type, 'category:', product.product_category, 'tags:', product.tags);
      }
      
      // Images
      const imageSrc = normalizedRow['image src'];
      if (imageSrc && !product.images.some(img => img.src === imageSrc)) {
        product.images.push({
          src: imageSrc,
          position: parseInt(normalizedRow['image position'] || '1'),
          alt: normalizedRow['image alt text'] || ''
        });
      }
      
      // Variants
      const option1Value = normalizedRow['option1 value'] || 'Default Title';
      const option2Value = normalizedRow['option2 value'] || '';
      const option3Value = normalizedRow['option3 value'] || '';
      const sku = normalizedRow['variant sku'] || '';
      const price = normalizedRow['variant price'] || '';
      const inventoryQty = parseInt(normalizedRow['variant inventory qty'] || '0');
      
      if (sku || price || option1Value) {
        const variant = {
          option1Name,
          option1Value,
          option2Name,
          option2Value,
          option3Name,
          option3Value,
          price,
          sku,
          compare_at_price: normalizedRow['variant compare at price'] || '',
          inventory_quantity: inventoryQty,
          inventory_policy: normalizedRow['variant inventory policy'] || 'deny',
          inventory_management: normalizedRow['variant inventory tracker'] || 'shopify',
          barcode: normalizedRow['variant barcode'] || '',
          requires_shipping: normalizedRow['variant requires shipping'] === 'TRUE',
          taxable: normalizedRow['variant taxable'] === 'TRUE'
        };
        product.variants.push(variant);
        console.log('[ShopifyParser] Added variant to product:', handle, variant);
      }
      
      // Metafields
      Object.keys(row).forEach(header => {
        const isMetafieldColumn = /product\.metafields\./i.test(header);
        const isStandard = STANDARD_SHOPIFY_FIELDS.map(f => f.toLowerCase().trim()).includes(header.toLowerCase().trim());
        if (isMetafieldColumn || !isStandard) {
          const value = row[header];
          if (value && value !== '') {
            // Try to extract namespace/key
            const match = header.match(/product\.metafields\.(\w+)\.(\w+)/);
            if (match) {
              product.metafields.push({
                namespace: match[1],
                key: match[2],
                value,
                type: 'single_line_text_field'
              });
            } else {
              product.metafields.push({
                namespace: 'custom',
                key: header.replace(/[^a-z0-9_]/gi, '_').toLowerCase(),
                value,
                type: 'single_line_text_field'
              });
            }
          }
        }
      });
    }
    
    // Finalize products
    const products = Array.from(productMap.values()).map(product => {
      // Filter out empty/invalid variants
      product.variants = product.variants.filter(v => {
        const isValid = (
          (v.price && v.price.trim() !== '') ||
          (v.sku && v.sku.trim() !== '') ||
          (v.option1Value && v.option1Value.trim() !== '' && v.option1Value.trim().toLowerCase() !== 'default title')
        );
        if (!isValid) {
          console.log('[ShopifyParser] Filtered out invalid variant:', v);
        }
        return isValid;
      });
      
      // If no variants, create a default variant
      if (!product.variants.length) {
        console.log('[ShopifyParser] No valid variants for product:', product.handle, '- creating default variant');
        product.variants = [{
          option1: 'Default Title',
          price: '0',
          sku: '',
          inventory_quantity: 0,
          inventory_policy: 'deny'
        }];
      }
      
      return product;
    }).filter(product => product.variants && product.variants.length > 0);
    
    console.log('[ShopifyParser] Final products:', products.length);
    if (products.length > 0) {
      console.log('[ShopifyParser] First product:', JSON.stringify(products[0], null, 2));
    }
    
    return products;
  },
  async exportToCSV(products) {
    const records = [];
    
    products.forEach((product) => {
      const handle = product.handle || '';
      const images = Array.isArray(product.images) ? product.images : [];
      
      // Get variants from product
      const variants = product.variants || [];
      
      // Get option names from product options
      const optionNames = product.options ? product.options.map(opt => opt.name) : [];
      
      // Helper for inventory quantity
      const getInventoryQty = (variant) =>
        variant.inventory_quantity ?? variant.inventoryQuantity ?? variant.quantity ?? '';
      
      // First row - main product with first variant
      if (variants.length > 0) {
        const firstVariant = variants[0];
        const getOptionValue = (variant, idx) => {
          if (variant.selectedOptions && variant.selectedOptions[idx]) {
            return variant.selectedOptions[idx].value;
          }
          return variant[`option${idx+1}Value`] || variant[`option${idx+1}`] || '';
        };
        const mainRow = {
          'Handle': handle,
          'Title': product.title || '',
          'Body (HTML)': product.body_html || product.bodyHtml || '',
          'Vendor': product.vendor || '',
          'Product Category': product.product_category || '',
          'Type': product.product_type || product.productType || '',
          'Tags': Array.isArray(product.tags) ? product.tags.join(',') : (product.tags || ''),
          'Published': product.status === 'active' ? 'true' : 'false',
          'Option1 Name': optionNames[0] || '',
          'Option1 Value': getOptionValue(firstVariant, 0),
          'Option1 Linked To': '',
          'Option2 Name': optionNames[1] || '',
          'Option2 Value': getOptionValue(firstVariant, 1),
          'Option2 Linked To': '',
          'Option3 Name': optionNames[2] || '',
          'Option3 Value': getOptionValue(firstVariant, 2),
          'Option3 Linked To': '',
          'Variant SKU': firstVariant.sku || '',
          'Variant Grams': '0.0',
          'Variant Inventory Tracker': 'shopify',
          'Variant Inventory Qty': getInventoryQty(firstVariant),
          'Variant Inventory Policy': 'continue',
          'Variant Fulfillment Service': 'manual',
          'Variant Price': firstVariant.price || '',
          'Variant Compare At Price': firstVariant.compare_at_price || '',
          'Variant Requires Shipping': 'true',
          'Variant Taxable': 'true',
          'Variant Barcode': '',
          'Image Src': images[0]?.src || '',
          'Image Position': '1',
          'Image Alt Text': '',
          'Gift Card': 'false',
          'Variant Weight Unit': 'kg',
          'Status': 'active'
        };
        records.push(mainRow);
      }

      // Additional rows for remaining variants
      variants.slice(1).forEach(variant => {
        const getOptionValue = (variant, idx) => {
          if (variant.selectedOptions && variant.selectedOptions[idx]) {
            return variant.selectedOptions[idx].value;
          }
          return variant[`option${idx+1}Value`] || variant[`option${idx+1}`] || '';
        };
        const variantRow = {
          'Handle': handle,
          'Option1 Value': getOptionValue(variant, 0),
          'Option2 Value': getOptionValue(variant, 1),
          'Option3 Value': getOptionValue(variant, 2),
          'Variant SKU': variant.sku || '',
          'Variant Grams': '0.0',
          'Variant Inventory Tracker': 'shopify',
          'Variant Inventory Qty': getInventoryQty(variant),
          'Variant Inventory Policy': 'continue',
          'Variant Fulfillment Service': 'manual',
          'Variant Price': variant.price || '',
          'Variant Compare At Price': variant.compare_at_price || '',
          'Variant Requires Shipping': 'true',
          'Variant Taxable': 'true',
          'Variant Barcode': '',
          'Variant Weight Unit': 'kg',
          'Status': 'active'
        };
        records.push(variantRow);
      });
    });

    return new Promise((resolve, reject) => {
      stringify(records, {
        header: true,
        columns: STANDARD_SHOPIFY_FIELDS
      }, (err, output) => {
        if (err) reject(err);
        else resolve(output);
      });
    });
  }
};

// Helper function to generate all combinations of option values
function generateCombinations(optionValues) {
  console.log('[Shopify Export] Generating combinations for:', optionValues);
  const options = Object.keys(optionValues);
  if (options.length === 0) {
    console.log('[Shopify Export] No options to generate combinations for');
    return [{}];
  }
  
  const firstOption = options[0];
  const restOptions = options.slice(1);
  const restCombinations = generateCombinations(
    Object.fromEntries(restOptions.map(opt => [opt, optionValues[opt]]))
  );
  
  const combinations = [];
  optionValues[firstOption].forEach(value => {
    restCombinations.forEach(combo => {
      combinations.push({
        [firstOption]: value,
        ...combo
      });
    });
  });
  
  console.log('[Shopify Export] Generated combinations:', combinations);
  return combinations;
}

// Normalization function to ensure correct Shopify structure
function normalizeForShopifyExport(products) {
  console.log('[Shopify Export] Normalizing products:', products.length);
  return products.map(product => {
    console.log('[Shopify Export] Normalizing product:', {
      handle: product.handle,
      title: product.title,
      options: product.options,
      variants: product.variants
    });
    
    // If already normalized, skip
    if (Array.isArray(product.options) && product.options.length > 0 && product.variants && product.variants[0]?.option1) {
      console.log('[Shopify Export] Product already normalized');
      return product;
    }
    
    // Collect all option names and values from variants
    const optionNames = [];
    const optionValues = {};
    (product.variants || []).forEach(variant => {
      for (let i = 1; i <= 3; i++) {
        const name = variant[`option${i}Name`] || variant[`option${i}_name`] || '';
        const value = variant[`option${i}`] || variant[`option${i}_value`] || '';
        if (name) {
          if (!optionNames.includes(name)) optionNames.push(name);
          if (!optionValues[name]) optionValues[name] = [];
          if (value && !optionValues[name].includes(value)) optionValues[name].push(value);
        }
      }
    });
    
    console.log('[Shopify Export] Collected options:', {
      optionNames,
      optionValues
    });
    
    // Build options array
    product.options = optionNames.map(name => ({
      name,
      values: optionValues[name]
    }));
    
    // Ensure each variant has option1, option2, option3
    (product.variants || []).forEach(variant => {
      optionNames.forEach((name, idx) => {
        const val = variant[`option${idx+1}`] || '';
        variant[`option${idx+1}`] = val;
      });
    });
    
    console.log('[Shopify Export] Normalized product:', {
      handle: product.handle,
      options: product.options,
      variants: product.variants
    });
    
    return product;
  });
} 