import { parseWooCommerceCsvRow, groupOrdersByOrderNumber, processWooCommerceCsv } from '../woocommerce-csv';

describe('WooCommerce CSV Parser', () => {
  const mockCsvRow = {
    'Order Number': '36952',
    'Order Status': 'Completed',
    'Order Date': '2025-06-01 18:26',
    'Customer Note': '',
    'First Name (Billing)': 'Vijay',
    'Last Name (Billing)': 'Richards',
    'Company (Billing)': '',
    'Address 1&2 (Billing)': 'A498, Block K, GM Infinite Ecity Town Phase 2, Thirupalya',
    'City (Billing)': 'Bengaluru',
    'State Code (Billing)': 'KA',
    'Postcode (Billing)': '560100',
    'Country Code (Billing)': 'IN',
    'Email (Billing)': 'vijay.richards@yahoo.co.in',
    'Phone (Billing)': ' +919945700335',
    'First Name (Shipping)': 'Vijay',
    'Last Name (Shipping)': 'Richards',
    'Address 1&2 (Shipping)': 'A498, Block K, GM Infinite Ecity Town Phase 2, Thirupalya',
    'City (Shipping)': 'Bengaluru',
    'State Code (Shipping)': 'KA',
    'Postcode (Shipping)': '560100',
    'Country Code (Shipping)': 'IN',
    'Payment Method Title': 'Credit Card/Debit Card/NetBanking',
    'Cart Discount Amount': '0',
    'Cart Discount Amount(inc. tax)': '0',
    'Order Subtotal Amount': '411.86',
    'Order Shipping Amount': '0',
    'Order Refund Amount': '0',
    'Order Total Amount': '486.00',
    'Order Total Tax Amount': '74.14',
    'SKU': 'SHJ125',
    'Item #': '1',
    'Item Name': 'Steelo Homely Container 125 Ml | 6 Pcs Set',
    'Quantity (- Refund)': '2',
    'Item Cost': '205.93',
    'Coupon Code': '',
    'Discount Amount': '',
    'Discount Amount Tax': ''
  };

  describe('parseWooCommerceCsvRow', () => {
    it('should parse a single CSV row correctly', () => {
      const result = parseWooCommerceCsvRow(mockCsvRow);
      
      expect(result).toMatchObject({
        orderNumber: '36952',
        status: 'Completed',
        createdAt: '2025-06-01 18:26',
        platform: 'woocommerce',
        billingAddress: {
          firstName: 'Vijay',
          lastName: 'Richards',
          address1: 'A498, Block K, GM Infinite Ecity Town Phase 2, Thirupalya',
          city: 'Bengaluru',
          state: 'KA',
          zip: '560100',
          country: 'IN',
          email: 'vijay.richards@yahoo.co.in',
          phone: ' +919945700335'
        },
        shippingAddress: {
          firstName: 'Vijay',
          lastName: 'Richards',
          address1: 'A498, Block K, GM Infinite Ecity Town Phase 2, Thirupalya',
          city: 'Bengaluru',
          state: 'KA',
          zip: '560100',
          country: 'IN'
        },
        paymentMethod: 'Credit Card/Debit Card/NetBanking',
        subtotal: 411.86,
        shipping: 0,
        total: 486.00,
        tax: 74.14,
        items: [{
          sku: 'SHJ125',
          id: '1',
          name: 'Steelo Homely Container 125 Ml | 6 Pcs Set',
          quantity: 2,
          price: 205.93,
          total: 411.86
        }]
      });
    });

    it('should handle missing fields gracefully', () => {
      const incompleteRow = {
        'Order Number': '36952',
        'Order Status': 'Completed'
      };
      
      const result = parseWooCommerceCsvRow(incompleteRow);
      
      expect(result).toMatchObject({
        orderNumber: '36952',
        status: 'Completed',
        platform: 'woocommerce'
      });
    });
  });

  describe('groupOrdersByOrderNumber', () => {
    it('should group multiple items from the same order', () => {
      const mockCsvRows = [
        {
          'Order Number': '36948',
          'SKU': 'SHJ750X4',
          'Item Name': 'Item 1',
          'Quantity (- Refund)': '1',
          'Item Cost': '293.22'
        },
        {
          'Order Number': '36948',
          'SKU': 'SHJ200X6',
          'Item Name': 'Item 2',
          'Quantity (- Refund)': '1',
          'Item Cost': '233.05'
        }
      ];

      const result = groupOrdersByOrderNumber(mockCsvRows);
      
      expect(result).toHaveLength(1);
      expect(result[0].items).toHaveLength(2);
      expect(result[0].items[0].name).toBe('Item 1');
      expect(result[0].items[1].name).toBe('Item 2');
    });
  });

  describe('processWooCommerceCsv', () => {
    it('should process multiple orders with multiple items', () => {
      const mockCsvRows = [
        {
          'Order Number': '36948',
          'Order Status': 'Completed',
          'SKU': 'SHJ750X4',
          'Item Name': 'Item 1',
          'Quantity (- Refund)': '1',
          'Item Cost': '293.22'
        },
        {
          'Order Number': '36948',
          'Order Status': 'Completed',
          'SKU': 'SHJ200X6',
          'Item Name': 'Item 2',
          'Quantity (- Refund)': '1',
          'Item Cost': '233.05'
        },
        {
          'Order Number': '36947',
          'Order Status': 'Completed',
          'SKU': 'SVAC250',
          'Item Name': 'Item 3',
          'Quantity (- Refund)': '1',
          'Item Cost': '224.58'
        }
      ];

      const result = processWooCommerceCsv(mockCsvRows);
      
      expect(result).toHaveLength(2); // Two unique orders
      expect(result[0].items).toHaveLength(2); // First order has 2 items
      expect(result[1].items).toHaveLength(1); // Second order has 1 item
    });
  });
}); 