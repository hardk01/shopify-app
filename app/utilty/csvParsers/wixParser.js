import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify';

export const wixParser = {
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

      const WIX_IMAGE_BASE_URL = "https://static.wixstatic.com/media/";

      // Process each record
      return records.map(record => {
        // Clean up the record by removing empty strings and undefined values
        const cleanRecord = Object.entries(record).reduce((acc, [key, value]) => {
          if (value !== undefined && value !== '') {
            acc[key] = value;
          }
          return acc;
        }, {});

        // Title/Description
        const title = cleanRecord.name || cleanRecord.Name || cleanRecord.title || cleanRecord['Product Name'] || 'Untitled';
        const description = cleanRecord.description || cleanRecord.Description || cleanRecord['Product Description'] || '';

        // Vendor/Brand
        const brand = cleanRecord.brand || cleanRecord.Brand || '';
        const vendor = brand;

        // Price/CompareAtPrice/Discount
        let price = parseFloat(cleanRecord.price || cleanRecord.Price || '0') || 0;
        let compareAtPrice = undefined;
        const discountMode = (cleanRecord.discountMode || '').toUpperCase();
        const discountValue = parseFloat(cleanRecord.discountValue || '0') || 0;

        if (discountMode === 'PERCENT' && discountValue > 0) {
          compareAtPrice = price;
          price = Math.round((price - (price * discountValue / 100)) * 100) / 100;
        } else if (discountMode === 'AMOUNT' && discountValue > 0) {
          compareAtPrice = price;
          price = Math.round((price - discountValue) * 100) / 100;
        }

        // SKU/Barcode
        const sku = cleanRecord.sku || cleanRecord.SKU || '';
        const barcode = cleanRecord.barcode || cleanRecord.Barcode || '';

        // Weight
        const weight = parseFloat(cleanRecord.weight || cleanRecord.Weight || '0') || 0;
        const weightUnit = (cleanRecord.weight_unit || cleanRecord.weightUnit || cleanRecord.WeightUnit || 'kg').toLowerCase();

        // Inventory
        const inventoryQuantity = parseInt(cleanRecord.inventory || cleanRecord.Inventory || '0') || 0;
        const inventoryPolicy = inventoryQuantity > 0 ? 'CONTINUE' : 'DENY';

        // Status
        const visible = (cleanRecord.visible || cleanRecord.Visible || '').toString().toLowerCase();
        const status = visible === 'true' || visible === 'yes' || visible === '1' ? 'active' : 'draft';

        // Images (support ; or , as separator)
        let imageField = cleanRecord.productImageUrl || cleanRecord.images || cleanRecord.Images || '';
        let imageUrls = imageField.split(/[;,]/).map(url => url.trim()).filter(url => url && url !== 'null');
        // Deduplicate
        imageUrls = [...new Set(imageUrls)];
        const images = imageUrls.map((src, i) => {
          // Handle Wix image URLs
          let url = src;
          if (!url.startsWith('http')) {
            // If it's a Wix image ID (e.g., "539049_10e38390e9a04328b4ea217a768ec236~mv2.jpg")
            if (url.includes('~mv2')) {
              url = `https://static.wixstatic.com/media/${url}`;
            } else {
              // If it's a relative path or other format
              url = `https://static.wixstatic.com/media/${url}`;
            }
          }
          return { src: url, position: i + 1 };
        });

        // Collections
        const collections = (cleanRecord.collection || cleanRecord.collections || cleanRecord.Categories || '').split(',').map(c => c.trim()).filter(Boolean);
        // Tags
        const tags = (cleanRecord.tags || '').split(',').map(t => t.trim()).filter(Boolean);

        // Process variant options
        const options = [];
        for (let i = 1; i <= 6; i++) {
          const optionName = cleanRecord[`productOptionName${i}`];
          const optionType = cleanRecord[`productOptionType${i}`];
          const optionDesc = cleanRecord[`productOptionDescription${i}`];

          if (optionName && optionDesc) {
            // Split optionDesc into values array
            const values = optionDesc.split(';').map(opt => {
              if (opt.includes(':')) {
                return opt.split(':')[1].trim();
              }
              return opt.trim();
            }).filter(Boolean);
            options.push({
              name: optionName,
              values
            });
          }
        }

        // Process additional info
        const additionalInfo = [];
        for (let i = 1; i <= 6; i++) {
          const title = cleanRecord[`additionalInfoTitle${i}`];
          const description = cleanRecord[`additionalInfoDescription${i}`];
          if (title && description) {
            additionalInfo.push({
              title,
              description
            });
          }
        }

        // Process custom text fields
        const customTextFields = [];
        for (let i = 1; i <= 2; i++) {
          const field = cleanRecord[`customTextField${i}`];
          const charLimit = cleanRecord[`customTextCharLimit${i}`];
          const mandatory = cleanRecord[`customTextMandatory${i}`];
          if (field) {
            customTextFields.push({
              field,
              charLimit: parseInt(charLimit || '0', 10),
              mandatory: mandatory === 'TRUE'
            });
          }
        }

        // Variants (basic: one per product, can be expanded for more complex logic)
        const variants = [
          {
            title: (options[0] && options[0].values && options[0].values[0]) ? options[0].values[0] : title,
            price,
            compareAtPrice,
            sku,
            barcode,
            weight,
            weightUnit,
            inventoryQuantity,
            inventoryPolicy,
            inventory_quantity: inventoryQuantity,
            stock_quantity: inventoryQuantity
          }
        ];

        // Metafields: store extra info
        const metafields = [];
        // Ribbon, surcharge, discount, cost, etc.
        if (cleanRecord.ribbon) metafields.push({ namespace: 'wix', key: 'ribbon', value: cleanRecord.ribbon, type: 'single_line_text_field' });
        if (cleanRecord.surcharge) metafields.push({ namespace: 'wix', key: 'surcharge', value: cleanRecord.surcharge, type: 'single_line_text_field' });
        if (cleanRecord.discountMode) metafields.push({ namespace: 'wix', key: 'discountMode', value: cleanRecord.discountMode, type: 'single_line_text_field' });
        if (cleanRecord.discountValue) metafields.push({ namespace: 'wix', key: 'discountValue', value: cleanRecord.discountValue, type: 'single_line_text_field' });
        if (cleanRecord.cost) metafields.push({ namespace: 'wix', key: 'cost', value: cleanRecord.cost, type: 'single_line_text_field' });
        // Additional info
        for (let i = 1; i <= 6; i++) {
          if (cleanRecord[`additionalInfoTitle${i}`] || cleanRecord[`additionalInfoDescription${i}`]) {
            metafields.push({
              namespace: 'wix',
              key: `additionalInfo${i}`,
              value: `${cleanRecord[`additionalInfoTitle${i}`] || ''}: ${cleanRecord[`additionalInfoDescription${i}`] || ''}`.trim(),
              type: 'single_line_text_field'
            });
          }
        }
        // Custom text fields
        for (let i = 1; i <= 2; i++) {
          if (cleanRecord[`customTextField${i}`]) {
            metafields.push({
              namespace: 'wix',
              key: `customTextField${i}`,
              value: cleanRecord[`customTextField${i}`],
              type: 'single_line_text_field'
            });
          }
          if (cleanRecord[`customTextCharLimit${i}`]) {
            metafields.push({
              namespace: 'wix',
              key: `customTextCharLimit${i}`,
              value: cleanRecord[`customTextCharLimit${i}`],
              type: 'single_line_text_field'
            });
          }
          if (cleanRecord[`customTextMandatory${i}`]) {
            metafields.push({
              namespace: 'wix',
              key: `customTextMandatory${i}`,
              value: cleanRecord[`customTextMandatory${i}`],
              type: 'single_line_text_field'
            });
          }
        }

        return {
          handleId: cleanRecord.handleId,
          fieldType: cleanRecord.fieldType,
          name: cleanRecord.name,
          description: cleanRecord.description,
          productImageUrl: cleanRecord.productImageUrl,
          collection: cleanRecord.collection,
          sku: cleanRecord.sku,
          ribbon: cleanRecord.ribbon,
          price: cleanRecord.price,
          surcharge: cleanRecord.surcharge,
          visible: cleanRecord.visible,
          discountMode: cleanRecord.discountMode,
          discountValue: cleanRecord.discountValue,
          inventory: cleanRecord.inventory,
          weight: cleanRecord.weight,
          cost: cleanRecord.cost,
          brand: cleanRecord.brand,
          productType: cleanRecord.product_type || cleanRecord.productType || cleanRecord.Type || '',
          tags,
          collections,
          compareAtPrice,
          barcode,
          weightUnit,
          inventoryQuantity,
          inventoryPolicy,
          images,
          options,
          variants,
          additionalInfo,
          customTextFields,
          metafields
        };
      });
    } catch (error) {
      console.error('Error parsing Wix CSV:', error);
      throw error;
    }
  },
  async exportToCSV(products) {
    const columns = [
      'handleId','fieldType','name','description','productImageUrl','collection','sku','ribbon','price','surcharge','visible','discountMode','discountValue','inventory','weight','cost','productOptionName1','productOptionType1','productOptionDescription1','productOptionName2','productOptionType2','productOptionDescription2','productOptionName3','productOptionType3','productOptionDescription3','productOptionName4','productOptionType4','productOptionDescription4','productOptionName5','productOptionType5','productOptionDescription5','productOptionName6','productOptionType6','productOptionDescription6','additionalInfoTitle1','additionalInfoDescription1','additionalInfoTitle2','additionalInfoDescription2','additionalInfoTitle3','additionalInfoDescription3','additionalInfoTitle4','additionalInfoDescription4','additionalInfoTitle5','additionalInfoDescription5','additionalInfoTitle6','additionalInfoDescription6','customTextField1','customTextCharLimit1','customTextMandatory1','customTextField2','customTextCharLimit2','customTextMandatory2','brand',''];
    const records = [];
    products.forEach(product => {
      const options = product.options || [];
      const metafields = product.metafields || [];
      const getOption = (idx, field) => {
        const option = options[idx-1] || {};
        if (field === 'name') return option.name || '';
        if (field === 'type') return option.type || '';
        if (field === 'desc') return Array.isArray(option.values) ? option.values.join(';') : (option.values || '');
        return '';
      };
      const getAdditionalInfo = (idx, type) => {
        const mf = metafields.find(m => m.key === `additionalInfo${idx}`);
        if (!mf) return '';
        if (type === 'title') return (mf.value.split(':')[0] || '').trim();
        if (type === 'desc') return (mf.value.split(':').slice(1).join(':') || '').trim();
        return '';
      };
      const getCustomText = (idx, key) => {
        const mf = metafields.find(m => m.key === `customTextField${idx}` || m.key === `customTextCharLimit${idx}` || m.key === `customTextMandatory${idx}`);
        if (!mf) return '';
        if (key === 'field') return mf.key === `customTextField${idx}` ? mf.value : '';
        if (key === 'limit') return mf.key === `customTextCharLimit${idx}` ? mf.value : '';
        if (key === 'mandatory') return mf.key === `customTextMandatory${idx}` ? mf.value : '';
        return '';
      };
      (product.variants || [{}]).forEach(variant => {
        records.push({
          handleId: product.handle || '',
          fieldType: 'Product',
          name: product.title || '',
          description: product.description || product.bodyHtml || '',
          productImageUrl: Array.isArray(product.images) ? product.images.map(img => img.src).join(';') : '',
          collection: Array.isArray(product.collections) ? product.collections.join(',') : (product.collections || ''),
          sku: variant.sku || '',
          ribbon: metafields.find(m => m.key === 'ribbon')?.value || '',
          price: variant.price || '',
          surcharge: metafields.find(m => m.key === 'surcharge')?.value || '',
          visible: product.status === 'active' ? 'TRUE' : 'FALSE',
          discountMode: metafields.find(m => m.key === 'discountMode')?.value || '',
          discountValue: metafields.find(m => m.key === 'discountValue')?.value || '',
          inventory: variant.inventory_quantity || '',
          weight: variant.weight || '',
          cost: metafields.find(m => m.key === 'cost')?.value || '',
          productOptionName1: getOption(1, 'name'),
          productOptionType1: getOption(1, 'type'),
          productOptionDescription1: getOption(1, 'desc'),
          productOptionName2: getOption(2, 'name'),
          productOptionType2: getOption(2, 'type'),
          productOptionDescription2: getOption(2, 'desc'),
          productOptionName3: getOption(3, 'name'),
          productOptionType3: getOption(3, 'type'),
          productOptionDescription3: getOption(3, 'desc'),
          productOptionName4: getOption(4, 'name'),
          productOptionType4: getOption(4, 'type'),
          productOptionDescription4: getOption(4, 'desc'),
          productOptionName5: getOption(5, 'name'),
          productOptionType5: getOption(5, 'type'),
          productOptionDescription5: getOption(5, 'desc'),
          productOptionName6: getOption(6, 'name'),
          productOptionType6: getOption(6, 'type'),
          productOptionDescription6: getOption(6, 'desc'),
          additionalInfoTitle1: getAdditionalInfo(1, 'title'),
          additionalInfoDescription1: getAdditionalInfo(1, 'desc'),
          additionalInfoTitle2: getAdditionalInfo(2, 'title'),
          additionalInfoDescription2: getAdditionalInfo(2, 'desc'),
          additionalInfoTitle3: getAdditionalInfo(3, 'title'),
          additionalInfoDescription3: getAdditionalInfo(3, 'desc'),
          additionalInfoTitle4: getAdditionalInfo(4, 'title'),
          additionalInfoDescription4: getAdditionalInfo(4, 'desc'),
          additionalInfoTitle5: getAdditionalInfo(5, 'title'),
          additionalInfoDescription5: getAdditionalInfo(5, 'desc'),
          additionalInfoTitle6: getAdditionalInfo(6, 'title'),
          additionalInfoDescription6: getAdditionalInfo(6, 'desc'),
          customTextField1: getCustomText(1, 'field'),
          customTextCharLimit1: getCustomText(1, 'limit'),
          customTextMandatory1: getCustomText(1, 'mandatory'),
          customTextField2: getCustomText(2, 'field'),
          customTextCharLimit2: getCustomText(2, 'limit'),
          customTextMandatory2: getCustomText(2, 'mandatory'),
          brand: product.brand || '',
          '': '' // for trailing tab
        });
      });
    });
    return new Promise((resolve, reject) => {
      stringify(records, { header: true, columns }, (err, output) => {
        if (err) reject(err);
        else resolve(output);
      });
    });
  }
}; 