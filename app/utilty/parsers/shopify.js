import { normalizeCustomerData, normalizeOrderData } from './normalizers';

/**
 * Maps Shopify CSV headers to our normalized field names
 */
const SHOPIFY_CUSTOMER_FIELD_MAP = {
  'First Name': 'firstName',
  'Last Name': 'lastName',
  'Email': 'email',
  'Company': 'company',
  'Address1': 'address1',
  'Address2': 'address2',
  'City': 'city',
  'Province': 'state',
  'Province Code': 'stateCode',
  'Zip': 'zip',
  'Country': 'country',
  'Country Code': 'countryCode',
  'Phone': 'phone',
  'Accepts Marketing': 'acceptsMarketing',
  'Total Orders': 'totalOrders',
  'Total Spent': 'totalSpent',
  'Tags': 'tags',
  'Note': 'notes',
  'Tax Exempt': 'taxExempt',
  'Created Date': 'createdAt',
  'Updated Date': 'updatedAt'
};

/**
 * Maps Shopify order CSV headers to our normalized field names
 */
const SHOPIFY_ORDER_FIELD_MAP = {
  'Name': 'orderNumber',
  'Email': 'email',
  'Created at': 'createdAt',
  'Updated at': 'updatedAt',
  'Total': 'total',
  'Subtotal': 'subtotal',
  'Total tax': 'tax',
  'Total shipping': 'shipping',
  'Currency': 'currency',
  'Financial Status': 'financialStatus',
  'Fulfillment Status': 'fulfillmentStatus',
  'Shipping Address1': 'shippingAddress.address1',
  'Shipping Address2': 'shippingAddress.address2',
  'Shipping City': 'shippingAddress.city',
  'Shipping Province': 'shippingAddress.state',
  'Shipping Zip': 'shippingAddress.zip',
  'Shipping Country': 'shippingAddress.country',
  'Shipping Phone': 'shippingAddress.phone',
  'Billing Address1': 'billingAddress.address1',
  'Billing Address2': 'billingAddress.address2',
  'Billing City': 'billingAddress.city',
  'Billing Province': 'billingAddress.state',
  'Billing Zip': 'billingAddress.zip',
  'Billing Country': 'billingAddress.country',
  'Billing Phone': 'billingAddress.phone'
};

/**
 * Parses Shopify customer data from CSV or API response
 * @param {Object|Array} data - Raw customer data from Shopify
 * @param {string} source - Source of the data ('csv' or 'api')
 * @returns {Object|Array} Normalized customer data
 */
export const parseShopifyCustomer = (data, source = 'api') => {
  if (source === 'csv') {
    // Handle CSV data
    const normalizedData = {};
    Object.entries(SHOPIFY_CUSTOMER_FIELD_MAP).forEach(([shopifyField, ourField]) => {
      if (data[shopifyField] !== undefined) {
        normalizedData[ourField] = data[shopifyField];
      }
    });
    return normalizeCustomerData({ ...normalizedData, platform: 'shopify' });
  }

  // Handle API data
  return normalizeCustomerData({
    ...data,
    platform: 'shopify',
    platformCustomerId: data.id
  });
};

/**
 * Parses Shopify order data from CSV or API response
 * @param {Object|Array} data - Raw order data from Shopify
 * @param {string} source - Source of the data ('csv' or 'api')
 * @returns {Object|Array} Normalized order data
 */
export const parseShopifyOrder = (data, source = 'api') => {
  if (source === 'csv') {
    // Handle CSV data
    const normalizedData = {};
    Object.entries(SHOPIFY_ORDER_FIELD_MAP).forEach(([shopifyField, ourField]) => {
      if (data[shopifyField] !== undefined) {
        normalizedData[ourField] = data[shopifyField];
      }
    });
    return normalizeOrderData({ ...normalizedData, platform: 'shopify' });
  }

  // Handle API data
  return normalizeOrderData({
    ...data,
    platform: 'shopify',
    platformOrderId: data.id,
    items: data.line_items?.map(item => ({
      id: item.product_id,
      name: item.title,
      sku: item.sku,
      quantity: item.quantity,
      price: item.price,
      total: item.price * item.quantity
    }))
  });
};

export const shopifyParser = {
  parseCustomer: parseShopifyCustomer,
  parseOrder: parseShopifyOrder,
  fieldMaps: {
    customer: SHOPIFY_CUSTOMER_FIELD_MAP,
    order: SHOPIFY_ORDER_FIELD_MAP
  }
}; 