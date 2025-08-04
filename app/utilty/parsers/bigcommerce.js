import { normalizeCustomerData, normalizeOrderData } from './normalizers';

/**
 * Maps BigCommerce CSV headers to our normalized field names
 */
const BIGCOMMERCE_CUSTOMER_FIELD_MAP = {
  'Customer ID': 'id',
  'First Name': 'firstName',
  'Last Name': 'lastName',
  'Email': 'email',
  'Company': 'company',
  'Phone': 'phone',
  'Address 1': 'address1',
  'Address 2': 'address2',
  'City': 'city',
  'State': 'state',
  'Zip': 'zip',
  'Country': 'country',
  'Customer Group': 'customerGroup',
  'Notes': 'notes',
  'Date Created': 'createdAt',
  'Date Modified': 'updatedAt',
  'Total Orders': 'totalOrders',
  'Total Spent': 'totalSpent'
};

/**
 * Maps BigCommerce order CSV headers to our normalized field names
 */
const BIGCOMMERCE_ORDER_FIELD_MAP = {
  'Order ID': 'id',
  'Date Created': 'createdAt',
  'Date Modified': 'updatedAt',
  'Status': 'status',
  'Customer ID': 'customerId',
  'Email': 'email',
  'Total': 'total',
  'Subtotal': 'subtotal',
  'Tax': 'tax',
  'Shipping': 'shipping',
  'Currency': 'currency',
  'Shipping First Name': 'shippingAddress.firstName',
  'Shipping Last Name': 'shippingAddress.lastName',
  'Shipping Address 1': 'shippingAddress.address1',
  'Shipping Address 2': 'shippingAddress.address2',
  'Shipping City': 'shippingAddress.city',
  'Shipping State': 'shippingAddress.state',
  'Shipping Zip': 'shippingAddress.zip',
  'Shipping Country': 'shippingAddress.country',
  'Shipping Phone': 'shippingAddress.phone',
  'Billing First Name': 'billingAddress.firstName',
  'Billing Last Name': 'billingAddress.lastName',
  'Billing Address 1': 'billingAddress.address1',
  'Billing Address 2': 'billingAddress.address2',
  'Billing City': 'billingAddress.city',
  'Billing State': 'billingAddress.state',
  'Billing Zip': 'billingAddress.zip',
  'Billing Country': 'billingAddress.country',
  'Billing Phone': 'billingAddress.phone'
};

/**
 * Parses BigCommerce customer data from CSV or API response
 * @param {Object|Array} data - Raw customer data from BigCommerce
 * @param {string} source - Source of the data ('csv' or 'api')
 * @returns {Object|Array} Normalized customer data
 */
export const parseBigCommerceCustomer = (data, source = 'api') => {
  if (source === 'csv') {
    // Handle CSV data
    const normalizedData = {};
    Object.entries(BIGCOMMERCE_CUSTOMER_FIELD_MAP).forEach(([bcField, ourField]) => {
      if (data[bcField] !== undefined) {
        normalizedData[ourField] = data[bcField];
      }
    });
    return normalizeCustomerData({ ...normalizedData, platform: 'bigcommerce' });
  }

  // Handle API data
  return normalizeCustomerData({
    ...data,
    platform: 'bigcommerce',
    platformCustomerId: data.id,
    address1: data.addresses?.[0]?.street_1,
    address2: data.addresses?.[0]?.street_2,
    city: data.addresses?.[0]?.city,
    state: data.addresses?.[0]?.state,
    zip: data.addresses?.[0]?.zip,
    country: data.addresses?.[0]?.country,
    phone: data.addresses?.[0]?.phone
  });
};

/**
 * Parses BigCommerce order data from CSV or API response
 * @param {Object|Array} data - Raw order data from BigCommerce
 * @param {string} source - Source of the data ('csv' or 'api')
 * @returns {Object|Array} Normalized order data
 */
export const parseBigCommerceOrder = (data, source = 'api') => {
  if (source === 'csv') {
    // Handle CSV data
    const normalizedData = {};
    Object.entries(BIGCOMMERCE_ORDER_FIELD_MAP).forEach(([bcField, ourField]) => {
      if (data[bcField] !== undefined) {
        normalizedData[ourField] = data[bcField];
      }
    });
    return normalizeOrderData({ ...normalizedData, platform: 'bigcommerce' });
  }

  // Handle API data
  return normalizeOrderData({
    ...data,
    platform: 'bigcommerce',
    platformOrderId: data.id,
    items: data.products?.map(item => ({
      id: item.product_id,
      name: item.name,
      sku: item.sku,
      quantity: item.quantity,
      price: item.price_ex_tax,
      total: item.total_ex_tax
    })),
    shippingAddress: {
      firstName: data.shipping_addresses?.[0]?.first_name,
      lastName: data.shipping_addresses?.[0]?.last_name,
      address1: data.shipping_addresses?.[0]?.street_1,
      address2: data.shipping_addresses?.[0]?.street_2,
      city: data.shipping_addresses?.[0]?.city,
      state: data.shipping_addresses?.[0]?.state,
      zip: data.shipping_addresses?.[0]?.zip,
      country: data.shipping_addresses?.[0]?.country,
      phone: data.shipping_addresses?.[0]?.phone
    },
    billingAddress: {
      firstName: data.billing_address?.first_name,
      lastName: data.billing_address?.last_name,
      address1: data.billing_address?.street_1,
      address2: data.billing_address?.street_2,
      city: data.billing_address?.city,
      state: data.billing_address?.state,
      zip: data.billing_address?.zip,
      country: data.billing_address?.country,
      phone: data.billing_address?.phone
    }
  });
};

export const bigcommerceParser = {
  parseCustomer: parseBigCommerceCustomer,
  parseOrder: parseBigCommerceOrder,
  fieldMaps: {
    customer: BIGCOMMERCE_CUSTOMER_FIELD_MAP,
    order: BIGCOMMERCE_ORDER_FIELD_MAP
  }
}; 