import { shopifyParser } from './shopify';
import { woocommerceParser } from './woocommerce';
import { bigcommerceParser } from './bigcommerce';
import { normalizeCustomerData, normalizeOrderData } from './normalizers';

export const PLATFORMS = {
  SHOPIFY: 'shopify',
  WOOCOMMERCE: 'woocommerce',
  BIGCOMMERCE: 'bigcommerce'
};

export const getParser = (platform) => {
  switch (platform.toLowerCase()) {
    case PLATFORMS.SHOPIFY:
      return shopifyParser;
    case PLATFORMS.WOOCOMMERCE:
      return woocommerceParser;
    case PLATFORMS.BIGCOMMERCE:
      return bigcommerceParser;
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
};

export {
  normalizeCustomerData,
  normalizeOrderData
}; 