/**
 * Web Crypto Helper for Cloudflare Workers
 * Uses standard SubtleCrypto (PBKDF2 with SHA-256) for secure password hashing.
 * No native or Node C++ binary dependencies.
 */

const PBKDF2_ITERATIONS = 100000;
const KEY_LEN = 32; // 256 bits

/**
 * Generate a cryptographically secure random hex string.
 * @param {number} bytes - Number of bytes
 * @returns {string} Hex string
 */
export function generateRandomHex(bytes = 16) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate a random session token.
 */
export function generateSessionToken() {
  return 'vcs_' + generateRandomHex(32);
}

/**
 * Hash a password with a given salt using PBKDF2.
 * @param {string} password - Plain text password
 * @param {string} saltHex - Hex encoded salt
 * @returns {Promise<string>} Hex encoded hash
 */
export async function hashPassword(password, saltHex) {
  const enc = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );

  // Convert hex salt to Uint8Array
  const saltBytes = new Uint8Array(saltHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256'
    },
    passwordKey,
    KEY_LEN * 8
  );

  return Array.from(new Uint8Array(derivedBits))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Verify a plain text password against stored hash and salt.
 * @param {string} password - Plain text password
 * @param {string} saltHex - Stored salt hex
 * @param {string} storedHashHex - Stored hash hex
 * @returns {Promise<boolean>} True if password matches
 */
export async function verifyPassword(password, saltHex, storedHashHex) {
  if (!password || !saltHex || !storedHashHex) return false;
  const computedHash = await hashPassword(password, saltHex);
  return computedHash === storedHashHex;
}
