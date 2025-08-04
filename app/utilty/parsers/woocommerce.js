import { normalizeCustomerData, normalizeOrderData } from './normalizers';

/**
 * Maps WooCommerce CSV headers to our normalized field names
 */
const WOOCOMMERCE_CUSTOMER_FIELD_MAP = {
  'First Name (Billing)': 'firstName',
  'Last Name (Billing)': 'lastName',
  'Company (Billing)': 'company',
  'Address 1&2 (Billing)': 'address1',
  'City (Billing)': 'city',
  'State Code (Billing)': 'state',
  'Postcode (Billing)': 'zip',
  'Country Code (Billing)': 'country',
  'Email (Billing)': 'email',
  'Phone (Billing)': 'phone'
};

/**
 * Maps WooCommerce order CSV headers to our normalized field names
 */
const WOOCOMMERCE_ORDER_FIELD_MAP = {
  'Order Number': 'orderNumber',
  'Order Status': 'status',
  'Order Date': 'createdAt',
  'Customer Note': 'notes',
  'First Name (Billing)': 'billingAddress.firstName',
  'Last Name (Billing)': 'billingAddress.lastName',
  'Company (Billing)': 'billingAddress.company',
  'Address 1&2 (Billing)': 'billingAddress.address1',
  'City (Billing)': 'billingAddress.city',
  'State Code (Billing)': 'billingAddress.state',
  'Postcode (Billing)': 'billingAddress.zip',
  'Country Code (Billing)': 'billingAddress.country',
  'Email (Billing)': 'billingAddress.email',
  'Phone (Billing)': 'billingAddress.phone',
  'First Name (Shipping)': 'shippingAddress.firstName',
  'Last Name (Shipping)': 'shippingAddress.lastName',
  'Address 1&2 (Shipping)': 'shippingAddress.address1',
  'City (Shipping)': 'shippingAddress.city',
  'State Code (Shipping)': 'shippingAddress.state',
  'Postcode (Shipping)': 'shippingAddress.zip',
  'Country Code (Shipping)': 'shippingAddress.country',
  'Payment Method Title': 'paymentMethod',
  'Order Subtotal Amount': 'subtotal',
  'Order Shipping Amount': 'shipping',
  'Order Total Amount': 'total',
  'Order Total Tax Amount': 'tax',
  'SKU': 'items.sku',
  'Item #': 'items.id',
  'Item Name': 'items.name',
  'Quantity (- Refund)': 'items.quantity',
  'Item Cost': 'items.price',
  'Coupon Code': 'couponCode',
  'Discount Amount': 'discount',
  'Discount Amount Tax': 'discountTax'
};

/**
 * Parses WooCommerce customer data from CSV or API response
 * @param {Object|Array} data - Raw customer data from WooCommerce
 * @param {string} source - Source of the data ('csv' or 'api')
 * @returns {Object|Array} Normalized customer data
 */
export const parseWooCommerceCustomer = (data, source = 'api') => {
  if (source === 'csv') {
    // Handle CSV data
    const normalizedData = {};
    Object.entries(WOOCOMMERCE_CUSTOMER_FIELD_MAP).forEach(([wooField, ourField]) => {
      if (data[wooField] !== undefined) {
        normalizedData[ourField] = data[wooField];
      }
    });
    return normalizeCustomerData({ ...normalizedData, platform: 'woocommerce' });
  }

  // Handle API data
  return normalizeCustomerData({
    ...data,
    platform: 'woocommerce',
    platformCustomerId: data.id,
    firstName: data.first_name,
    lastName: data.last_name,
    address1: data.billing?.address_1,
    address2: data.billing?.address_2,
    city: data.billing?.city,
    state: data.billing?.state,
    zip: data.billing?.postcode,
    country: data.billing?.country,
    phone: data.billing?.phone
  });
};

/**
 * Parses WooCommerce order data from CSV or API response
 * @param {Object|Array} data - Raw order data from WooCommerce
 * @param {string} source - Source of the data ('csv' or 'api')
 * @returns {Object|Array} Normalized order data
 */
export const parseWooCommerceOrder = (data, source = 'api') => {
  if (source === 'csv') {
    // Handle CSV data
    const normalizedData = {};
    Object.entries(WOOCOMMERCE_ORDER_FIELD_MAP).forEach(([wooField, ourField]) => {
      if (data[wooField] !== undefined) {
        // Handle nested fields
        if (ourField.includes('.')) {
          const [parent, child] = ourField.split('.');
          normalizedData[parent] = normalizedData[parent] || {};
          normalizedData[parent][child] = data[wooField];
        } else {
          normalizedData[ourField] = data[wooField];
        }
      }
    });

    // Convert numeric fields
    if (normalizedData.subtotal) normalizedData.subtotal = parseFloat(normalizedData.subtotal);
    if (normalizedData.shipping) normalizedData.shipping = parseFloat(normalizedData.shipping);
    if (normalizedData.total) normalizedData.total = parseFloat(normalizedData.total);
    if (normalizedData.tax) normalizedData.tax = parseFloat(normalizedData.tax);
    if (normalizedData.discount) normalizedData.discount = parseFloat(normalizedData.discount);
    if (normalizedData.discountTax) normalizedData.discountTax = parseFloat(normalizedData.discountTax);

    // Handle items array
    if (normalizedData.items) {
      normalizedData.items = [{
        sku: normalizedData.items.sku,
        id: normalizedData.items.id,
        name: normalizedData.items.name,
        quantity: parseInt(normalizedData.items.quantity || 0),
        price: parseFloat(normalizedData.items.price || 0),
        total: parseFloat(normalizedData.items.price || 0) * parseInt(normalizedData.items.quantity || 0)
      }];
    }

    return normalizeOrderData({ ...normalizedData, platform: 'woocommerce' });
  }

  // Handle API data
  return normalizeOrderData({
    ...data,
    platform: 'woocommerce',
    platformOrderId: data.id,
    items: data.line_items?.map(item => ({
      id: item.product_id,
      name: item.name,
      sku: item.sku,
      quantity: item.quantity,
      price: item.price,
      total: item.total
    })),
    shippingAddress: {
      firstName: data.shipping?.first_name,
      lastName: data.shipping?.last_name,
      address1: data.shipping?.address_1,
      address2: data.shipping?.address_2,
      city: data.shipping?.city,
      state: data.shipping?.state,
      zip: data.shipping?.postcode,
      country: data.shipping?.country
    },
    billingAddress: {
      firstName: data.billing?.first_name,
      lastName: data.billing?.last_name,
      address1: data.billing?.address_1,
      address2: data.billing?.address_2,
      city: data.billing?.city,
      state: data.billing?.state,
      zip: data.billing?.postcode,
      country: data.billing?.country,
      phone: data.billing?.phone
    }
  });
};

export const woocommerceParser = {
  parseCustomer: parseWooCommerceCustomer,
  parseOrder: parseWooCommerceOrder,
  fieldMaps: {
    customer: WOOCOMMERCE_CUSTOMER_FIELD_MAP,
    order: WOOCOMMERCE_ORDER_FIELD_MAP
  }
}; 