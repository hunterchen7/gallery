/**
 * Authentication utilities using Web Crypto API
 *
 * The auth flow:
 * 1. Generate an encrypted API key using the generate-auth-key script
 * 2. Store ENCRYPTED_API_KEY in environment variables
 * 3. User enters password in UI to decrypt the key
 * 4. Decrypted key is stored in localStorage for session persistence
 * 5. API requests include the decrypted key for verification
 */

const AUTH_STORAGE_KEY = "gallery_auth_key";
const SALT = "gallery-auth-salt-v1"; // Fixed salt for key derivation

/**
 * Derive a cryptographic key from a password using PBKDF2
 */
async function deriveKey(password: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(password);
  const saltBuffer = encoder.encode(SALT);

  // Import password as key material
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    passwordBuffer,
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  // Derive AES-GCM key
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: saltBuffer,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/**
 * Encrypt a string using AES-GCM with a password-derived key
 * Returns base64-encoded string: iv (12 bytes) + ciphertext
 */
export async function encrypt(
  plaintext: string,
  password: string,
): Promise<string> {
  const key = await deriveKey(password);
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);

  // Generate random IV
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // Encrypt
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    data,
  );

  // Combine IV + ciphertext and encode as base64
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);

  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt a base64-encoded encrypted string using AES-GCM
 */
export async function decrypt(
  encrypted: string,
  password: string,
): Promise<string> {
  const key = await deriveKey(password);

  // Decode base64
  const combined = new Uint8Array(
    atob(encrypted)
      .split("")
      .map((c) => c.charCodeAt(0)),
  );

  // Extract IV and ciphertext
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);

  // Decrypt
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext,
  );

  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}

/**
 * Store the decrypted auth key in localStorage
 */
export function storeAuthKey(key: string): void {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(AUTH_STORAGE_KEY, key);
  }
}

/**
 * Retrieve the stored auth key from localStorage
 */
export function getStoredAuthKey(): string | null {
  if (typeof localStorage !== "undefined") {
    return localStorage.getItem(AUTH_STORAGE_KEY);
  }
  return null;
}

/**
 * Clear the stored auth key (logout)
 */
export function clearAuthKey(): void {
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  }
}

/**
 * Check if user is authenticated (has a stored key)
 */
export function isAuthenticated(): boolean {
  return getStoredAuthKey() !== null;
}

/**
 * Attempt to decrypt the encrypted API key with the given password
 * If successful, stores the decrypted key and returns true
 */
export async function attemptLogin(
  encryptedApiKey: string,
  password: string,
): Promise<boolean> {
  try {
    const decryptedKey = await decrypt(encryptedApiKey, password);
    storeAuthKey(decryptedKey);
    return true;
  } catch {
    return false;
  }
}

/**
 * Generate a random API key (for use in the key generation script)
 */
export function generateApiKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
