import { getParser } from '../index';
import { validateCsvHeaders, parseCsvData, transformCsvData, validateTransformedData } from '../csv-utils';

describe('Parser System', () => {
  describe('getParser', () => {
    it('should return Shopify parser for shopify platform', () => {
      const parser = getParser('shopify');
      expect(parser).toBeDefined();
      expect(parser.parseCustomer).toBeDefined();
      expect(parser.parseOrder).toBeDefined();
    });

    it('should return WooCommerce parser for woocommerce platform', () => {
      const parser = getParser('woocommerce');
      expect(parser).toBeDefined();
      expect(parser.parseCustomer).toBeDefined();
      expect(parser.parseOrder).toBeDefined();
    });

    it('should return BigCommerce parser for bigcommerce platform', () => {
      const parser = getParser('bigcommerce');
      expect(parser).toBeDefined();
      expect(parser.parseCustomer).toBeDefined();
      expect(parser.parseOrder).toBeDefined();
    });

    it('should throw error for unsupported platform', () => {
      expect(() => getParser('unsupported')).toThrow('Unsupported platform');
    });
  });

  describe('CSV Utilities', () => {
    const mockFieldMap = {
      'First Name': 'firstName',
      'Last Name': 'lastName',
      'Email': 'email'
    };

    describe('validateCsvHeaders', () => {
      it('should validate correct headers', () => {
        const headers = ['First Name', 'Last Name', 'Email'];
        const result = validateCsvHeaders(headers, mockFieldMap);
        expect(result.isValid).toBe(true);
        expect(result.missingFields).toHaveLength(0);
      });

      it('should detect missing headers', () => {
        const headers = ['First Name', 'Email'];
        const result = validateCsvHeaders(headers, mockFieldMap);
        expect(result.isValid).toBe(false);
        expect(result.missingFields).toContain('Last Name');
      });

      it('should detect extra headers', () => {
        const headers = ['First Name', 'Last Name', 'Email', 'Extra Field'];
        const result = validateCsvHeaders(headers, mockFieldMap);
        expect(result.extraFields).toContain('Extra Field');
      });
    });

    describe('transformCsvData', () => {
      it('should transform CSV data correctly', () => {
        const data = [{
          'First Name': 'John',
          'Last Name': 'Doe',
          'Email': 'john@example.com'
        }];
        const result = transformCsvData(data, mockFieldMap);
        expect(result[0]).toEqual({
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com'
        });
      });

      it('should handle nested fields', () => {
        const data = [{
          'Shipping First Name': 'John',
          'Shipping Last Name': 'Doe'
        }];
        const fieldMap = {
          'Shipping First Name': 'shippingAddress.firstName',
          'Shipping Last Name': 'shippingAddress.lastName'
        };
        const result = transformCsvData(data, fieldMap);
        expect(result[0].shippingAddress).toEqual({
          firstName: 'John',
          lastName: 'Doe'
        });
      });
    });

    describe('validateTransformedData', () => {
      it('should validate customer data correctly', () => {
        const data = {
          email: 'john@example.com',
          firstName: 'John',
          lastName: 'Doe'
        };
        const result = validateTransformedData(data, 'customer');
        expect(result.isValid).toBe(true);
      });

      it('should detect invalid customer data', () => {
        const data = {
          email: 'invalid-email',
          firstName: 'John'
        };
        const result = validateTransformedData(data, 'customer');
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Missing required field: lastName');
        expect(result.errors).toContain('Invalid email format');
      });

      it('should validate order data correctly', () => {
        const data = {
          orderNumber: '123',
          email: 'john@example.com',
          total: '100.00'
        };
        const result = validateTransformedData(data, 'order');
        expect(result.isValid).toBe(true);
      });

      it('should detect invalid order data', () => {
        const data = {
          orderNumber: '123',
          email: 'invalid-email',
          total: 'invalid'
        };
        const result = validateTransformedData(data, 'order');
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Invalid email format');
        expect(result.errors).toContain('Invalid total amount');
      });
    });
  });
}); 