/**
 * Normalizes customer data to a standard format across all platforms
 * @param {Object} customer - Raw customer data from any platform
 * @returns {Object} Normalized customer data
 */
export const normalizeCustomerData = (customer) => {
  return {
    id: customer.id || customer.customer_id || null,
    email: customer.email?.toLowerCase() || null,
    firstName: customer.first_name || customer.firstName || customer.firstname || null,
    lastName: customer.last_name || customer.lastName || customer.lastname || null,
    phone: customer.phone || customer.telephone || null,
    company: customer.company || customer.company_name || null,
    address1: customer.address1 || customer.address_1 || customer.street_address || null,
    address2: customer.address2 || customer.address_2 || null,
    city: customer.city || null,
    state: customer.state || customer.province || null,
    zip: customer.zip || customer.postal_code || customer.postcode || null,
    country: customer.country || null,
    tags: Array.isArray(customer.tags) ? customer.tags : customer.tags?.split(',').map(tag => tag.trim()) || [],
    notes: customer.note || customer.notes || null,
    createdAt: customer.created_at || customer.createdAt || customer.date_created || null,
    updatedAt: customer.updated_at || customer.updatedAt || customer.date_modified || null,
    totalOrders: customer.total_orders || customer.orders_count || 0,
    totalSpent: customer.total_spent || customer.total_spend || 0,
    acceptsMarketing: customer.accepts_marketing || customer.acceptsMarketing || false,
    platform: customer.platform || null,
    platformCustomerId: customer.platform_customer_id || customer.platformCustomerId || null
  };
};

/**
 * Normalizes order data to a standard format across all platforms
 * @param {Object} order - Raw order data from any platform
 * @returns {Object} Normalized order data
 */
export const normalizeOrderData = (order) => {
  return {
    id: order.id || order.order_id || null,
    orderNumber: order.order_number || order.orderNumber || null,
    customerId: order.customer_id || order.customerId || null,
    email: order.email?.toLowerCase() || null,
    createdAt: order.created_at || order.createdAt || order.date_created || null,
    updatedAt: order.updated_at || order.updatedAt || order.date_modified || null,
    status: order.status?.toLowerCase() || null,
    total: parseFloat(order.total || order.total_price || 0),
    subtotal: parseFloat(order.subtotal || order.subtotal_price || 0),
    tax: parseFloat(order.tax || order.total_tax || 0),
    shipping: parseFloat(order.shipping || order.shipping_total || 0),
    currency: order.currency || 'USD',
    shippingAddress: {
      firstName: order.shipping_first_name || order.shippingFirstName || null,
      lastName: order.shipping_last_name || order.shippingLastName || null,
      address1: order.shipping_address1 || order.shippingAddress1 || null,
      address2: order.shipping_address2 || order.shippingAddress2 || null,
      city: order.shipping_city || order.shippingCity || null,
      state: order.shipping_state || order.shippingState || null,
      zip: order.shipping_zip || order.shippingPostalCode || null,
      country: order.shipping_country || order.shippingCountry || null,
      phone: order.shipping_phone || order.shippingPhone || null
    },
    billingAddress: {
      firstName: order.billing_first_name || order.billingFirstName || null,
      lastName: order.billing_last_name || order.billingLastName || null,
      address1: order.billing_address1 || order.billingAddress1 || null,
      address2: order.billing_address2 || order.billingAddress2 || null,
      city: order.billing_city || order.billingCity || null,
      state: order.billing_state || order.billingState || null,
      zip: order.billing_zip || order.billingPostalCode || null,
      country: order.billing_country || order.billingCountry || null,
      phone: order.billing_phone || order.billingPhone || null
    },
    items: Array.isArray(order.items) ? order.items.map(item => ({
      id: item.id || item.product_id || null,
      name: item.name || item.title || null,
      sku: item.sku || null,
      quantity: parseInt(item.quantity || 0),
      price: parseFloat(item.price || 0),
      total: parseFloat(item.total || item.total_price || 0)
    })) : [],
    platform: order.platform || null,
    platformOrderId: order.platform_order_id || order.platformOrderId || null
  };
}; 