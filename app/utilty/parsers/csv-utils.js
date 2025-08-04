import Papa from 'papaparse';

/**
 * Validates CSV headers against expected field map
 * @param {Array} headers - CSV headers from the file
 * @param {Object} fieldMap - Expected field mapping
 * @returns {Object} Validation result with missing and extra fields
 */
export const validateCsvHeaders = (headers, fieldMap) => {
  const expectedFields = Object.keys(fieldMap);
  const missingFields = expectedFields.filter(field => !headers.includes(field));
  const extraFields = headers.filter(header => !expectedFields.includes(header));

  return {
    isValid: missingFields.length === 0,
    missingFields,
    extraFields
  };
};

/**
 * Parses CSV data with validation
 * @param {string} csvData - Raw CSV data
 * @param {Object} fieldMap - Field mapping for the platform
 * @param {Object} options - Additional parsing options
 * @returns {Object} Parsed and validated data
 */
export const parseCsvData = (csvData, fieldMap, options = {}) => {
  const { skipValidation = false } = options;

  return new Promise((resolve, reject) => {
    Papa.parse(csvData, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors.length > 0) {
          reject(new Error(`CSV parsing errors: ${results.errors.map(e => e.message).join(', ')}`));
          return;
        }

        if (!skipValidation) {
          const validation = validateCsvHeaders(results.meta.fields, fieldMap);
          if (!validation.isValid) {
            reject(new Error(`Invalid CSV headers. Missing fields: ${validation.missingFields.join(', ')}`));
            return;
          }
        }

        resolve({
          data: results.data,
          meta: results.meta
        });
      },
      error: (error) => {
        reject(new Error(`CSV parsing failed: ${error.message}`));
      }
    });
  });
};

/**
 * Transforms CSV data using field mapping
 * @param {Array} data - Parsed CSV data
 * @param {Object} fieldMap - Field mapping for the platform
 * @returns {Array} Transformed data
 */
export const transformCsvData = (data, fieldMap) => {
  return data.map(row => {
    const transformed = {};
    Object.entries(fieldMap).forEach(([csvField, ourField]) => {
      if (row[csvField] !== undefined) {
        // Handle nested fields (e.g., 'shippingAddress.firstName')
        if (ourField.includes('.')) {
          const [parent, child] = ourField.split('.');
          transformed[parent] = transformed[parent] || {};
          transformed[parent][child] = row[csvField];
        } else {
          transformed[ourField] = row[csvField];
        }
      }
    });
    return transformed;
  });
};

/**
 * Validates transformed data
 * @param {Object} data - Transformed data object
 * @param {string} type - Data type ('customer' or 'order')
 * @returns {Object} Validation result
 */
export const validateTransformedData = (data, type) => {
  const errors = [];
  const requiredFields = {
    customer: ['email', 'firstName', 'lastName'],
    order: ['orderNumber', 'email', 'total']
  };

  requiredFields[type].forEach(field => {
    if (!data[field]) {
      errors.push(`Missing required field: ${field}`);
    }
  });

  // Validate email format
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    errors.push('Invalid email format');
  }

  // Validate numeric fields
  if (type === 'order') {
    if (data.total && isNaN(parseFloat(data.total))) {
      errors.push('Invalid total amount');
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}; 