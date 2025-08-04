import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'your-fallback-encryption-key';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const ITERATIONS = 100000;

/**
 * Encrypt data using AES-256-GCM
 */
export async function encrypt(text) {
  try {
    // Generate a random salt
    const salt = crypto.randomBytes(SALT_LENGTH);
    
    // Generate key using PBKDF2
    const key = crypto.pbkdf2Sync(
      ENCRYPTION_KEY,
      salt,
      ITERATIONS,
      KEY_LENGTH,
      'sha512'
    );

    // Generate random IV
    const iv = crypto.randomBytes(IV_LENGTH);

    // Create cipher
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    // Encrypt the text
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    // Get auth tag
    const tag = cipher.getAuthTag();

    // Combine all components
    const result = Buffer.concat([
      salt,
      iv,
      tag,
      Buffer.from(encrypted, 'hex')
    ]);

    return result.toString('base64');
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt data');
  }
}

/**
 * Decrypt data using AES-256-GCM
 */
export async function decrypt(encryptedData) {
  try {
    // Convert from base64
    const buffer = Buffer.from(encryptedData, 'base64');

    // Extract components
    const salt = buffer.slice(0, SALT_LENGTH);
    const iv = buffer.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const tag = buffer.slice(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
    const encrypted = buffer.slice(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);

    // Generate key using PBKDF2
    const key = crypto.pbkdf2Sync(
      ENCRYPTION_KEY,
      salt,
      ITERATIONS,
      KEY_LENGTH,
      'sha512'
    );

    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    // Decrypt the data
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt data');
  }
} 