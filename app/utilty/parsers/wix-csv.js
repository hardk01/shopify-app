import { parse } from 'csv-parse/sync';

/**
 * Maps Wix CSV headers to our normalized field names
 */
const WIX_CSV_FIELD_MAP = {
  // Order Information
  'Order number': 'orderNumber',
  'Date created': 'createdAt',
  'Time': 'createdTime',
  'Total order quantity': 'totalQuantity',
  'Contact email': 'email',
  'Note from customer': 'customerNote',
  'Additional checkout info': 'checkoutInfo',
  
  // Item Information
  'Item': 'itemName',
  'Variant': 'itemVariant',
  'SKU': 'itemSku',
  'Qty': 'itemQuantity',
  'Quantity refunded': 'itemQuantityRefunded',
  'Price': 'itemPrice',
  'Weight': 'itemWeight',
  'Custom text': 'itemCustomText',
  'Deposit amount': 'itemDepositAmount',
  
  // Delivery Information
  'Delivery method': 'deliveryMethod',
  'Delivery time': 'deliveryTime',
  'Recipient name': 'recipientName',
  'Recipient phone': 'recipientPhone',
  'Recipient company name': 'recipientCompany',
  'Delivery country': 'deliveryCountry',
  'Delivery state': 'deliveryState',
  'Delivery city': 'deliveryCity',
  'Delivery address': 'deliveryAddress',
  'Delivery zip/postal code': 'deliveryZip',
  
  // Billing Information
  'Billing name': 'billingName',
  'Billing phone': 'billingPhone',
  'Billing company name': 'billingCompany',
  'Billing country': 'billingCountry',
  'Billing state': 'billingState',
  'Billing city': 'billingCity',
  'Billing address': 'billingAddress',
  'Billing zip/postal code': 'billingZip',
  
  // Payment Information
  'Payment status': 'paymentStatus',
  'Payment method': 'paymentMethod',
  'Coupon code': 'couponCode',
  'Gift card amount': 'giftCardAmount',
  'Shipping rate': 'shippingRate',
  'Total tax': 'totalTax',
  'Total': 'total',
  'Currency': 'currency',
  'Refunded amount': 'refundedAmount',
  'Net amount': 'netAmount',
  
  // Fulfillment Information
  'Fulfillment status': 'fulfillmentStatus',
  'Tracking number': 'trackingNumber',
  'Fulfillment service': 'fulfillmentService',
  'Shipping label': 'shippingLabel'
};

/**
 * Parses Wix CSV data into normalized format
 * @param {Object} row - Single row from Wix CSV
 * @returns {Object} Normalized order data
 */
function parseWixCsvRow(row) {
  try {
    if (!row) {
      throw new Error('No row data provided');
    }

    // Create a case-insensitive map of the row fields with normalized keys
    const rowMap = {};
    Object.keys(row).forEach(key => {
      const normalizedKey = key.toLowerCase().trim().replace(/[\u200B-\u200D\uFEFF]/g, '');
      rowMap[normalizedKey] = key;
    });

    // Try to get order number using normalized lookup
    const orderNumberKey = rowMap['ordernumber'] || rowMap['order number'] || rowMap['ordernumber'] || rowMap['order_number'];
    
    if (!orderNumberKey) {
      throw new Error('Order number field not found in CSV');
    }

    const rawOrderNumber = row[orderNumberKey];
    
    if (!rawOrderNumber) {
      throw new Error('No order number value found');
    }

    const orderNumber = String(rawOrderNumber).replace(/^"|"$/g, '').trim();

    // Create the normalized order object
    const normalizedData = {};
    
    // Map all fields from the CSV using normalized lookup
    Object.entries(WIX_CSV_FIELD_MAP).forEach(([csvField, normalizedField]) => {
      const normalizedKey = csvField.toLowerCase().trim().replace(/[\u200B-\u200D\uFEFF]/g, '');
      const fieldKey = rowMap[normalizedKey];
      if (fieldKey && row[fieldKey] !== undefined) {
        normalizedData[normalizedField] = row[fieldKey];
      }
    });

    // Create customer object
    const customer = {
      email: normalizedData.email,
      note: normalizedData.customerNote
    };

    // Create billing address
    const billingAddress = {
      name: normalizedData.billingName,
      phone: normalizedData.billingPhone,
      company: normalizedData.billingCompany,
      address: normalizedData.billingAddress,
      city: normalizedData.billingCity,
      state: normalizedData.billingState,
      zip: normalizedData.billingZip,
      country: normalizedData.billingCountry
    };

    // Create shipping address
    const shippingAddress = {
      name: normalizedData.recipientName,
      phone: normalizedData.recipientPhone,
      company: normalizedData.recipientCompany,
      address: normalizedData.deliveryAddress,
      city: normalizedData.deliveryCity,
      state: normalizedData.deliveryState,
      zip: normalizedData.deliveryZip,
      country: normalizedData.deliveryCountry
    };

    // Create line item
    const lineItem = {
      name: normalizedData.itemName,
      variant: normalizedData.itemVariant,
      sku: normalizedData.itemSku,
      quantity: parseInt(normalizedData.itemQuantity) || 0,
      quantityRefunded: parseInt(normalizedData.itemQuantityRefunded) || 0,
      price: parseFloat(normalizedData.itemPrice) || 0,
      weight: parseFloat(normalizedData.itemWeight) || 0,
      customText: normalizedData.itemCustomText,
      depositAmount: parseFloat(normalizedData.itemDepositAmount) || 0
    };

    // Create the normalized order object
    return {
      id: null,
      orderNumber: orderNumber,
      customerId: null,
      email: normalizedData.email,
      createdAt: normalizedData.createdAt,
      createdTime: normalizedData.createdTime,
      updatedAt: null,
      status: normalizedData.paymentStatus?.toLowerCase() || 'paid',
      total: parseFloat(normalizedData.total) || 0,
      subtotal: parseFloat(normalizedData.total) - (parseFloat(normalizedData.shippingRate) || 0) - (parseFloat(normalizedData.totalTax) || 0),
      tax: parseFloat(normalizedData.totalTax) || 0,
      shipping: parseFloat(normalizedData.shippingRate) || 0,
      currency: normalizedData.currency || 'USD',
      customer: customer,
      shippingAddress: shippingAddress,
      billingAddress: billingAddress,
      items: [lineItem],
      platform: 'wix',
      platformOrderId: null,
      note: normalizedData.customerNote,
      checkoutInfo: normalizedData.checkoutInfo,
      payment: {
        status: normalizedData.paymentStatus,
        method: normalizedData.paymentMethod,
        couponCode: normalizedData.couponCode,
        giftCardAmount: parseFloat(normalizedData.giftCardAmount) || 0,
        refundedAmount: parseFloat(normalizedData.refundedAmount) || 0,
        netAmount: parseFloat(normalizedData.netAmount) || 0
      },
      fulfillment: {
        status: normalizedData.fulfillmentStatus,
        trackingNumber: normalizedData.trackingNumber,
        service: normalizedData.fulfillmentService,
        shippingLabel: normalizedData.shippingLabel
      }
    };
  } catch (error) {
    throw error;
  }
}

/**
 * Groups CSV rows by order number
 * @param {Array} rows - Array of CSV rows
 * @returns {Object} Orders grouped by order number
 */
function groupOrdersByOrderNumber(rows) {
  const orderMap = new Map();
  
  rows.forEach(row => {
    const orderNumber = row['Order number'];
    if (!orderMap.has(orderNumber)) {
      orderMap.set(orderNumber, []);
    }
    orderMap.get(orderNumber).push(row);
  });
  
  return orderMap;
}

/**
 * Processes Wix CSV data
 * @param {Array} rows - Array of CSV rows
 * @returns {Array} Array of normalized orders
 */
export function processWixCsv(rows) {
  const orderMap = groupOrdersByOrderNumber(rows);
  const orders = [];
  
  orderMap.forEach((orderRows, orderNumber) => {
    // Parse the first row to get order details
    const baseOrder = parseWixCsvRow(orderRows[0]);
    
    // If there are multiple items, combine them
    if (orderRows.length > 1) {
      baseOrder.items = orderRows.map(row => {
        const itemData = parseWixCsvRow(row);
        return itemData.items[0];
      });
    }
    
    orders.push(baseOrder);
  });
  
  return orders;
} 