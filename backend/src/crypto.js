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

/**
 * Derive AES-GCM CryptoKey from secret string.
 */
async function getCryptoKey(secretKey, usages) {
  const enc = new TextEncoder();
  const rawKey = enc.encode(String(secretKey || 'default-secret-key-salt-clip-editor-2026'));
  const hash = await crypto.subtle.digest('SHA-256', rawKey);
  return crypto.subtle.importKey(
    'raw',
    hash,
    { name: 'AES-GCM' },
    false,
    usages
  );
}

/**
 * Encrypt a sensitive token using AES-GCM (256-bit).
 * @param {string} plainText - Plain text access token
 * @param {string} secretKey - Application encryption key
 * @returns {Promise<string>} Format: "enc:iv_hex:ciphertext_hex"
 */
export async function encryptToken(plainText, secretKey) {
  if (!plainText) return '';
  const enc = new TextEncoder();
  const key = await getCryptoKey(secretKey, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipherBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(plainText)
  );

  const ivHex = Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join('');
  const cipherHex = Array.from(new Uint8Array(cipherBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
  return `enc:${ivHex}:${cipherHex}`;
}

/**
 * Decrypt an AES-GCM encrypted token.
 * Gracefully handles legacy plaintext tokens if not prefixed with "enc:".
 * @param {string} encryptedText - Encrypted token string
 * @param {string} secretKey - Application encryption key
 * @returns {Promise<string>} Plain text token
 */
export async function decryptToken(encryptedText, secretKey) {
  if (!encryptedText) return '';
  if (!encryptedText.startsWith('enc:')) {
    return encryptedText;
  }
  const parts = encryptedText.split(':');
  if (parts.length !== 3) return '';
  const [, ivHex, cipherHex] = parts;
  try {
    const iv = new Uint8Array(ivHex.match(/.{1,2}/g).map(b => parseInt(b, 16)));
    const cipherBytes = new Uint8Array(cipherHex.match(/.{1,2}/g).map(b => parseInt(b, 16)));

    const key = await getCryptoKey(secretKey, ['decrypt']);
    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      cipherBytes
    );
    return new TextDecoder().decode(decryptedBuffer);
  } catch (err) {
    console.error('Failed to decrypt token:', err.message);
    return '';
  }
}

/**
 * Sign an OAuth state payload with HMAC-SHA256.
 * Formatted as `${payloadBase64Url}.${signatureHex}`.
 */
export async function signOAuthState(payload, secretKey) {
  const data = {
    ...payload,
    ts: Date.now(),
    nonce: generateRandomHex(8)
  };
  const jsonStr = JSON.stringify(data);
  const payloadB64 = btoa(jsonStr).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const enc = new TextEncoder();
  const rawKey = enc.encode(String(secretKey || 'oauth-state-secret-salt-2026'));
  const hmacKey = await crypto.subtle.importKey(
    'raw',
    rawKey,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const sigBuffer = await crypto.subtle.sign('HMAC', hmacKey, enc.encode(payloadB64));
  const sigHex = Array.from(new Uint8Array(sigBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${payloadB64}.${sigHex}`;
}

/**
 * Verify an HMAC-SHA256 signed OAuth state and enforce expiration (15 minutes).
 * Falls back gracefully to legacy unsigned base64 if within maxAge.
 */
export async function verifyOAuthState(stateString, secretKey, maxAgeMs = 15 * 60 * 1000) {
  if (!stateString || typeof stateString !== 'string') {
    throw new Error('Missing or invalid OAuth state parameter');
  }

  const parts = stateString.split('.');
  if (parts.length !== 2) {
    // Check legacy base64 for backwards compatibility
    try {
      const legacyJson = atob(stateString.replace(/-/g, '+').replace(/_/g, '/'));
      const legacyData = JSON.parse(legacyJson);
      if (legacyData && (Date.now() - (legacyData.ts || 0) < maxAgeMs)) {
        return legacyData;
      }
    } catch {}
    throw new Error('Malformed or expired OAuth state');
  }

  const [payloadB64, sigHex] = parts;
  const enc = new TextEncoder();
  const rawKey = enc.encode(String(secretKey || 'oauth-state-secret-salt-2026'));
  const hmacKey = await crypto.subtle.importKey(
    'raw',
    rawKey,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );

  const sigBytes = new Uint8Array(sigHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
  const isValid = await crypto.subtle.verify('HMAC', hmacKey, sigBytes, enc.encode(payloadB64));

  if (!isValid) {
    throw new Error('Invalid OAuth state signature (tampering or CSRF detected)');
  }

  let jsonStr = '';
  try {
    let base64 = payloadB64.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4 !== 0) {
      base64 += '=';
    }
    jsonStr = atob(base64);
  } catch {
    throw new Error('Failed to decode OAuth state payload');
  }

  const payload = JSON.parse(jsonStr);
  if (Date.now() - (payload.ts || 0) > maxAgeMs) {
    throw new Error('OAuth authorization session expired. Please connect again.');
  }

  return payload;
}


