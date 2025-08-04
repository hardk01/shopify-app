import { parse } from 'csv-parse/sync';

/**
 * Maps WooCommerce CSV headers to our normalized field names
 */
const WOOCOMMERCE_CSV_FIELD_MAP = {
  // Order Information
  'Order Number': 'orderNumber',
  'Order Status': 'status',
  'Order Date': 'createdAt',
  'Customer Note': 'note',
  
  // Billing Information
  'First Name (Billing)': 'billingFirstName',
  'Last Name (Billing)': 'billingLastName',
  'Company (Billing)': 'billingCompany',
  'Address 1&2 (Billing)': 'billingAddress',
  'City (Billing)': 'billingCity',
  'State Code (Billing)': 'billingState',
  'Postcode (Billing)': 'billingPostcode',
  'Country Code (Billing)': 'billingCountry',
  'Email (Billing)': 'billingEmail',
  'Phone (Billing)': 'billingPhone',
  
  // Shipping Information
  'First Name (Shipping)': 'shippingFirstName',
  'Last Name (Shipping)': 'shippingLastName',
  'Address 1&2 (Shipping)': 'shippingAddress',
  'City (Shipping)': 'shippingCity',
  'State Code (Shipping)': 'shippingState',
  'Postcode (Shipping)': 'shippingPostcode',
  'Country Code (Shipping)': 'shippingCountry',
  
  // Payment and Amount Information
  'Payment Method Title': 'paymentMethod',
  'Cart Discount Amount': 'discountAmount',
  'Order Subtotal Amount': 'subtotal',
  'Order Shipping Amount': 'shipping',
  'Order Total Amount': 'total',
  'Order Total Tax Amount': 'tax',
  
  // Item Information
  'Item #': 'itemId',
  'Item Name': 'itemName',
  'Quantity (- Refund)': 'itemQuantity',
  'Item Cost': 'itemPrice',
  'SKU': 'itemSku'
};

/**
 * Helper function to split address into address1 and address2
 */
function splitAddress(address) {
  if (!address) return { address1: '', address2: '' };
  const parts = address.split(',').map(part => part.trim());
  return {
    address1: parts[0] || '',
    address2: parts.slice(1).join(', ') || ''
  };
}

/**
 * Parses WooCommerce CSV data into normalized format
 * @param {Object} row - Single row from WooCommerce CSV
 * @returns {Object} Normalized order data
 */
function parseWooCommerceCsvRow(row) {
  const normalizedData = {};
  
  // Map all fields from the CSV
  Object.entries(WOOCOMMERCE_CSV_FIELD_MAP).forEach(([csvField, normalizedField]) => {
    if (row[csvField] !== undefined) {
      normalizedData[normalizedField] = row[csvField];
    }
  });

  // Create customer object from billing information
  const customer = {
    firstName: normalizedData.billingFirstName,
    lastName: normalizedData.billingLastName,
    email: normalizedData.billingEmail,
    phone: normalizedData.billingPhone
  };

  // Create billing address
  const billingAddressParts = splitAddress(normalizedData.billingAddress);
  const billingAddress = {
    firstName: normalizedData.billingFirstName,
    lastName: normalizedData.billingLastName,
    address1: billingAddressParts.address1,
    address2: billingAddressParts.address2,
    city: normalizedData.billingCity,
    state: normalizedData.billingState,
    zip: normalizedData.billingPostcode,
    country: normalizedData.billingCountry,
    phone: normalizedData.billingPhone
  };

  // Create shipping address
  const shippingAddressParts = splitAddress(normalizedData.shippingAddress);
  const shippingAddress = {
    firstName: normalizedData.shippingFirstName,
    lastName: normalizedData.shippingLastName,
    address1: shippingAddressParts.address1,
    address2: shippingAddressParts.address2,
    city: normalizedData.shippingCity,
    state: normalizedData.shippingState,
    zip: normalizedData.shippingPostcode,
    country: normalizedData.shippingCountry
  };

  // Create line item
  const lineItem = {
    id: normalizedData.itemId,
    name: normalizedData.itemName,
    sku: normalizedData.itemSku,
    quantity: parseInt(normalizedData.itemQuantity) || 1,
    price: parseFloat(normalizedData.itemPrice) || 0,
    total: (parseFloat(normalizedData.itemPrice) || 0) * (parseInt(normalizedData.itemQuantity) || 1)
  };

  // Create the normalized order object
  return {
    id: null,
    orderNumber: normalizedData.orderNumber,
    customerId: null,
    email: normalizedData.billingEmail,
    createdAt: normalizedData.createdAt,
    updatedAt: null,
    status: normalizedData.status?.toLowerCase() || 'completed',
    total: parseFloat(normalizedData.total) || 0,
    subtotal: parseFloat(normalizedData.subtotal) || 0,
    tax: parseFloat(normalizedData.tax) || 0,
    shipping: parseFloat(normalizedData.shipping) || 0,
    // currency: 'USD',
    customer: customer,
    shippingAddress: shippingAddress,
    billingAddress: billingAddress,
    items: [lineItem],
    platform: 'woocommerce',
    platformOrderId: null,
    note: normalizedData.note
  };
}

/**
 * Groups CSV rows by order number
 * @param {Array} rows - Array of CSV rows
 * @returns {Object} Orders grouped by order number
 */
function groupOrdersByOrderNumber(rows) {
  const orderMap = new Map();
  
  rows.forEach(row => {
    const orderNumber = row['Order Number'];
    if (!orderMap.has(orderNumber)) {
      orderMap.set(orderNumber, []);
    }
    orderMap.get(orderNumber).push(row);
  });
  
  return orderMap;
}

/**
 * Processes WooCommerce CSV data
 * @param {Array} rows - Array of CSV rows
 * @returns {Array} Array of normalized orders
 */
export function processWooCommerceCsv(rows) {
  const orderMap = groupOrdersByOrderNumber(rows);
  const orders = [];
  
  orderMap.forEach((orderRows, orderNumber) => {
    // Parse the first row to get order details
    const baseOrder = parseWooCommerceCsvRow(orderRows[0]);
    
    // If there are multiple items, combine them
    if (orderRows.length > 1) {
      baseOrder.items = orderRows.map(row => {
        const itemData = parseWooCommerceCsvRow(row);
        return itemData.items[0];
      });
    }
    
    orders.push(baseOrder);
  });
  
  return orders;
} 