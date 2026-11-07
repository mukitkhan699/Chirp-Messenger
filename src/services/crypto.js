/**
 * @file services/crypto.js
 * Optional end-to-end encryption for Chirp Messenger.
 *
 * Two peers that share a passphrase can encrypt their message payloads before
 * the bytes are handed to the PeerJS/WebRTC data channel. Everything in this
 * module is built on the browser-native Web Crypto API (`crypto.subtle`), so
 * there is no server round-trip, no bundler and no third-party dependency.
 *
 * Overview:
 * - Passphrase-derived keys: PBKDF2-HMAC-`SHA-256`, 150 000 iterations, a
 *   random 16-byte salt and a 256-bit AES-GCM output key.
 * - Message payloads: AES-256-GCM with a fresh random 96-bit IV per message.
 *   Optional additional authenticated data (AAD) binds the ciphertext to the
 *   conversation and sender it belongs to, so a payload cannot be replayed
 *   into a different conversation.
 * - Session keys: random 256-bit AES-GCM keys that stay extractable so a peer
 *   can export them and confirm the shared key out-of-band through a short
 *   human-readable fingerprint (for example `A3F9-21BC-77D0`).
 *
 * The module has no import-time side effects: importing it never touches
 * `crypto` and never throws, not even in an insecure context where
 * `crypto.subtle` is missing. Use {@link assertAvailable} to detect that case.
 *
 * @module services/crypto
 */

/**
 * Parameters used when stretching a passphrase into a symmetric key.
 * @type {{ ITERATIONS: number, HASH: string, KEY_BITS: number }}
 */
export const KDF = { ITERATIONS: 150000, HASH: 'SHA-256', KEY_BITS: 256 };

/** Size (in bytes) of the random PBKDF2 salt. */
const SALT_BYTES = 16;

/** Size (in bytes) of the AES-GCM initialisation vector. */
const IV_BYTES = 12;

/** Size (in bytes) of a raw AES-256 key. */
const KEY_BYTES = KDF.KEY_BITS / 8;

/** Number of leading SHA-256 digest bytes rendered in a fingerprint. */
const FINGERPRINT_BYTES = 6;

/** Length of the random identifier attached to a session key. */
const SESSION_ID_LENGTH = 12;

/** URL-safe base36 alphabet used by {@link randomId}. */
const ID_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

/** Adjectives used to build readable passphrases. */
const ADJECTIVES = [
  'swift', 'quiet', 'brave', 'calm', 'bright', 'silent', 'lucky', 'gentle',
  'wild', 'clever', 'bold', 'mellow', 'sunny', 'frosty', 'amber', 'nimble',
  'lively', 'polished', 'rugged', 'solemn',
];

/** Nouns used to build readable passphrases. */
const NOUNS = [
  'tiger', 'orchid', 'falcon', 'harbor', 'cedar', 'comet', 'lantern', 'otter',
  'maple', 'ember', 'willow', 'raven', 'canyon', 'pebble', 'summit', 'heron',
  'fjord', 'clover', 'delta', 'marlin',
];

/**
 * Returns the ambient Web Crypto implementation.
 * @returns {Crypto}
 * @throws {Error} When the environment exposes no Web Crypto implementation.
 */
function getCrypto() {
  const webCrypto = globalThis.crypto;
  if (!webCrypto || typeof webCrypto.getRandomValues !== 'function') {
    throw new Error('Web Crypto is not available in this environment');
  }
  return webCrypto;
}

/**
 * Asserts that `crypto.subtle` is usable.
 * @returns {Crypto}
 * @throws {Error} When `crypto.subtle` is missing (insecure context).
 */
export function assertAvailable() {
  const webCrypto = getCrypto();
  if (!webCrypto.subtle || typeof webCrypto.subtle.encrypt !== 'function') {
    throw new Error(
      'crypto.subtle is not available — end-to-end encryption requires a secure context (HTTPS or http://localhost)',
    );
  }
  return webCrypto;
}

/**
 * Normalises any binary input into a `Uint8Array` view.
 * @param {ArrayBuffer|ArrayBufferView|Uint8Array} input
 * @returns {Uint8Array}
 */
function toBytes(input) {
  if (input === null || input === undefined) {
    throw new Error('Expected an ArrayBuffer or Uint8Array, received ' + String(input));
  }
  if (input instanceof Uint8Array) return input;
  if (ArrayBuffer.isView(input)) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  }
  if (input instanceof ArrayBuffer || Object.prototype.toString.call(input) === '[object ArrayBuffer]') {
    return new Uint8Array(input);
  }
  throw new Error('Expected an ArrayBuffer or Uint8Array');
}

/**
 * Encodes binary data as a base64 string.
 * @param {ArrayBuffer|Uint8Array} bytes
 * @returns {string}
 */
export function toBase64(bytes) {
  const view = toBytes(bytes);
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < view.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, view.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * Decodes a base64 string into bytes.
 * @param {string} str
 * @returns {Uint8Array}
 */
export function fromBase64(str) {
  if (typeof str !== 'string') {
    throw new Error('fromBase64 expects a base64 string, received ' + typeof str);
  }
  const normalized = str.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
  let binary;
  try {
    binary = atob(padded);
  } catch {
    throw new Error('Invalid base64 string');
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Generates a cryptographically random, URL-safe identifier.
 * @param {number} [length=12]
 * @returns {string}
 */
export function randomId(length = 12) {
  if (!Number.isInteger(length) || length < 1) {
    throw new Error('randomId requires a positive integer length, received ' + String(length));
  }
  const webCrypto = getCrypto();
  const limit = 256 - (256 % ID_ALPHABET.length);
  const chars = [];
  const buffer = new Uint8Array(Math.max(length, 16));
  while (chars.length < length) {
    webCrypto.getRandomValues(buffer);
    for (let i = 0; i < buffer.length && chars.length < length; i += 1) {
      const value = buffer[i];
      if (value >= limit) continue;
      chars.push(ID_ALPHABET[value % ID_ALPHABET.length]);
    }
  }
  return chars.join('');
}

/**
 * Returns a uniform random integer in the inclusive range `[min, max]`.
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function randomInt(min, max) {
  if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
    throw new Error(`Invalid random range ${min}..${max}`);
  }
  const webCrypto = getCrypto();
  const span = max - min + 1;
  const limit = 256 - (256 % span);
  const buffer = new Uint8Array(1);
  let value = 0;
  do {
    webCrypto.getRandomValues(buffer);
    value = buffer[0];
  } while (value >= limit);
  return min + (value % span);
}

/**
 * Picks one entry from a word list.
 * @param {string[]} list
 * @returns {string}
 */
function pickWord(list) {
  return list[randomInt(0, list.length - 1)];
}

/**
 * Builds a readable passphrase such as `swift-tiger-42-orchid`.
 * @returns {string}
 */
function buildPassphrase() {
  const words = [pickWord(ADJECTIVES), pickWord(NOUNS), pickWord(NOUNS)];
  const number = randomInt(10, 99);
  return `${words[0]}-${words[1]}-${number}-${words[2]}`;
}

/**
 * Detects a `CryptoKey`-like object.
 * @param {*} value
 * @returns {boolean}
 */
function isCryptoKey(value) {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof value.type === 'string' &&
      value.algorithm &&
      typeof value.algorithm === 'object',
  );
}

/**
 * Validates that a key is an AES-GCM `CryptoKey`.
 * @param {CryptoKey} key
 */
function assertAesKey(key) {
  if (!isCryptoKey(key)) throw new Error('Expected a CryptoKey');
  if (key.algorithm.name !== 'AES-GCM') {
    throw new Error(`Expected an AES-GCM key, received "${key.algorithm.name}"`);
  }
}

/**
 * Creates an `AbortError` for a cancelled operation.
 * @param {AbortSignal} [signal]
 * @returns {Error}
 */
function createAbortError(signal) {
  const reason = signal && signal.reason;
  if (reason instanceof Error) return reason;
  const error = new Error('Key derivation was aborted');
  error.name = 'AbortError';
  return error;
}

/**
 * Rejects as soon as `signal` aborts, even if the wrapped promise is pending.
 * @template T
 * @param {Promise<T>} promise
 * @param {AbortSignal} [signal]
 * @returns {Promise<T>}
 */
function withAbortSignal(promise, signal) {
  if (!signal) return promise;
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(createAbortError(signal));
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

/**
 * Formats bytes as uppercase hexadecimal.
 * @param {Uint8Array} bytes
 * @returns {string}
 */
function bytesToHex(bytes) {
  let hex = '';
  for (let i = 0; i < bytes.length; i += 1) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex.toUpperCase();
}

/**
 * Extracts the raw bytes of a key.
 * @param {CryptoKey|Uint8Array|ArrayBuffer|string} key
 * @returns {Promise<Uint8Array>}
 */
async function exportRawKeyBytes(key) {
  if (key === null || key === undefined) {
    throw new Error('Expected a CryptoKey or raw key bytes');
  }
  if (typeof key === 'string') {
    const raw = fromBase64(key);
    if (raw.length !== KEY_BYTES) {
      throw new Error(`Expected ${KEY_BYTES} key bytes, received ${raw.length}`);
    }
    return raw;
  }
  if (isCryptoKey(key)) {
    if (key.extractable !== true) {
      throw new Error('This CryptoKey is not extractable and cannot be fingerprinted');
    }
    const raw = await crypto.subtle.exportKey('raw', key);
    return new Uint8Array(raw);
  }
  const raw = toBytes(key);
  if (raw.length !== KEY_BYTES) {
    throw new Error(`Expected ${KEY_BYTES} key bytes, received ${raw.length}`);
  }
  return raw;
}

/**
 * Derives an AES-GCM key from a passphrase and a base64 salt.
 * @param {string} passphrase
 * @param {string} saltB64
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<CryptoKey>}
 */
async function deriveKeyFromPassphrase(passphrase, saltB64, options = {}) {
  const webCrypto = assertAvailable();
  const { signal } = options;
  if (typeof passphrase !== 'string' || passphrase.length === 0) {
    throw new Error('deriveKey requires a non-empty passphrase string');
  }
  if (signal !== undefined && signal !== null && typeof signal.addEventListener !== 'function') {
    throw new Error('deriveKey expects an AbortSignal as the "signal" option');
  }
  if (signal && signal.aborted) throw createAbortError(signal);
  const salt = fromBase64(saltB64);
  if (salt.length !== SALT_BYTES) {
    throw new Error(
      `deriveKey expects a ${SALT_BYTES}-byte salt encoded as base64, received ${salt.length} bytes`,
    );
  }
  const passphraseBytes = new TextEncoder().encode(passphrase.normalize('NFKC'));
  const baseKey = await webCrypto.subtle.importKey(
    'raw',
    passphraseBytes,
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );
  return withAbortSignal(
    webCrypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: KDF.ITERATIONS, hash: KDF.HASH },
      baseKey,
      { name: 'AES-GCM', length: KDF.KEY_BITS },
      true,
      ['encrypt', 'decrypt'],
    ),
    signal,
  );
}

/**
 * Encrypts a string with AES-GCM.
 * @param {CryptoKey} key
 * @param {string} plaintext
 * @param {string} [aad='']
 * @returns {Promise<{ v: number, alg: string, iv: string, ct: string }>}
 */
async function encryptWithKey(key, plaintext, aad = '') {
  const webCrypto = assertAvailable();
  assertAesKey(key);
  if (typeof plaintext !== 'string') {
    throw new Error('encrypt expects the plaintext to be a string');
  }
  if (typeof aad !== 'string') {
    throw new Error('encrypt expects the additional data to be a string');
  }
  const iv = webCrypto.getRandomValues(new Uint8Array(IV_BYTES));
  const algorithm = { name: 'AES-GCM', iv };
  if (aad.length > 0) {
    algorithm.additionalData = new TextEncoder().encode(aad);
  }
  const ciphertext = await webCrypto.subtle.encrypt(
    algorithm,
    key,
    new TextEncoder().encode(plaintext),
  );
  return { v: 1, alg: 'AES-GCM', iv: toBase64(iv), ct: toBase64(ciphertext) };
}

/**
 * Decrypts a payload produced by {@link encryptWithKey}.
 * @param {CryptoKey} key
 * @param {{ v: number, alg: string, iv: string, ct: string }} payload
 * @param {string} [aad='']
 * @returns {Promise<string>}
 */
async function decryptWithKey(key, payload, aad = '') {
  const webCrypto = assertAvailable();
  assertAesKey(key);
  if (!payload || typeof payload !== 'object') {
    throw new Error('decrypt expects a payload object');
  }
  if (payload.v !== 1) {
    throw new Error(`Unsupported payload version: ${String(payload.v)}`);
  }
  if (payload.alg !== 'AES-GCM') {
    throw new Error(`Unsupported payload algorithm: ${String(payload.alg)}`);
  }
  if (typeof payload.iv !== 'string' || typeof payload.ct !== 'string') {
    throw new Error('decrypt expects base64 "iv" and "ct" strings');
  }
  if (typeof aad !== 'string') {
    throw new Error('decrypt expects the additional data to be a string');
  }
  let iv;
  let ciphertext;
  try {
    iv = fromBase64(payload.iv);
    ciphertext = fromBase64(payload.ct);
  } catch {
    throw new Error('Could not decrypt message — wrong passphrase or corrupted data');
  }
  if (iv.length !== IV_BYTES) {
    throw new Error('Could not decrypt message — wrong passphrase or corrupted data');
  }
  const algorithm = { name: 'AES-GCM', iv };
  if (aad.length > 0) {
    algorithm.additionalData = new TextEncoder().encode(aad);
  }
  let plaintext;
  try {
    plaintext = await webCrypto.subtle.decrypt(algorithm, key, ciphertext);
  } catch {
    throw new Error('Could not decrypt message — wrong passphrase or corrupted data');
  }
  return new TextDecoder().decode(plaintext);
}

/**
 * Creates a random 16-byte salt.
 * @returns {Promise<string>}
 */
async function createSalt() {
  const webCrypto = assertAvailable();
  return toBase64(webCrypto.getRandomValues(new Uint8Array(SALT_BYTES)));
}

/**
 * Creates a random, extractable AES-256-GCM session key.
 * @returns {Promise<{ key: CryptoKey, id: string, fingerprint: string }>}
 */
async function createSessionKeyPair() {
  const webCrypto = assertAvailable();
  const key = await webCrypto.subtle.generateKey(
    { name: 'AES-GCM', length: KDF.KEY_BITS },
    true,
    ['encrypt', 'decrypt'],
  );
  const id = randomId(SESSION_ID_LENGTH);
  const fingerprint = await computeFingerprint(key);
  return { key, id, fingerprint };
}

/**
 * Imports a raw session key from its base64 representation.
 * @param {string} rawB64
 * @returns {Promise<CryptoKey>}
 */
async function importRawSessionKey(rawB64) {
  const webCrypto = assertAvailable();
  const raw = fromBase64(rawB64);
  if (raw.length !== KEY_BYTES) {
    throw new Error(`importSessionKey expects a ${KEY_BYTES}-byte base64 key, received ${raw.length} bytes`);
  }
  return webCrypto.subtle.importKey('raw', raw, { name: 'AES-GCM', length: KDF.KEY_BITS }, true, [
    'encrypt',
    'decrypt',
  ]);
}

/**
 * Exports a session key as a base64 string.
 * @param {CryptoKey} key
 * @returns {Promise<string>}
 */
async function exportRawSessionKey(key) {
  const webCrypto = assertAvailable();
  assertAesKey(key);
  if (key.extractable !== true) {
    throw new Error('exportSessionKey requires an extractable key');
  }
  const raw = await webCrypto.subtle.exportKey('raw', key);
  return toBase64(raw);
}

/**
 * Computes a short, human-verifiable fingerprint of a key.
 * @param {CryptoKey|Uint8Array|ArrayBuffer|string} key
 * @returns {Promise<string>}
 */
async function computeFingerprint(key) {
  const webCrypto = assertAvailable();
  const raw = await exportRawKeyBytes(key);
  const digest = new Uint8Array(await webCrypto.subtle.digest('SHA-256', raw));
  const hex = bytesToHex(digest.subarray(0, FINGERPRINT_BYTES));
  return hex.replace(/(.{4})(?=.)/g, '$1-');
}

/**
 * End-to-end encryption helpers.
 *
 * Every operation is available both as an instance method and as a static
 * method, so the app can use whichever style it prefers.
 */
export class E2EE {
  /**
   * Derives an AES-GCM 256 key from a passphrase and a base64 salt.
   * @param {string} passphrase
   * @param {string} saltB64
   * @param {{ signal?: AbortSignal }} [options]
   * @returns {Promise<CryptoKey>}
   */
  async deriveKey(passphrase, saltB64, options = {}) {
    return deriveKeyFromPassphrase(passphrase, saltB64, options);
  }

  /** Static alias of {@link E2EE#deriveKey}. */
  static async deriveKey(passphrase, saltB64, options = {}) {
    return deriveKeyFromPassphrase(passphrase, saltB64, options);
  }

  /**
   * Encrypts a string with AES-GCM using a fresh random IV.
   * @param {CryptoKey} key
   * @param {string} plaintext
   * @param {string} [aad='']
   * @returns {Promise<{ v: number, alg: string, iv: string, ct: string }>}
   */
  async encrypt(key, plaintext, aad = '') {
    return encryptWithKey(key, plaintext, aad);
  }

  /** Static alias of {@link E2EE#encrypt}. */
  static async encrypt(key, plaintext, aad = '') {
    return encryptWithKey(key, plaintext, aad);
  }

  /**
   * Decrypts a payload produced by {@link E2EE#encrypt}.
   * @param {CryptoKey} key
   * @param {{ v: number, alg: string, iv: string, ct: string }} payload
   * @param {string} [aad='']
   * @returns {Promise<string>}
   */
  async decrypt(key, payload, aad = '') {
    return decryptWithKey(key, payload, aad);
  }

  /** Static alias of {@link E2EE#decrypt}. */
  static async decrypt(key, payload, aad = '') {
    return decryptWithKey(key, payload, aad);
  }

  /**
   * Generates a random 16-byte salt.
   * @returns {Promise<string>}
   */
  async generateSalt() {
    return createSalt();
  }

  /** Static alias of {@link E2EE#generateSalt}. */
  static generateSalt() {
    return createSalt();
  }

  /**
   * Creates a random, extractable AES-256-GCM session key.
   * @returns {Promise<{ key: CryptoKey, id: string, fingerprint: string }>}
   */
  async createSessionKey() {
    return createSessionKeyPair();
  }

  /** Static alias of {@link E2EE#createSessionKey}. */
  static createSessionKey() {
    return createSessionKeyPair();
  }

  /**
   * Imports a raw session key from its base64 representation.
   * @param {string} rawB64
   * @returns {Promise<CryptoKey>}
   */
  async importSessionKey(rawB64) {
    return importRawSessionKey(rawB64);
  }

  /** Static alias of {@link E2EE#importSessionKey}. */
  static importSessionKey(rawB64) {
    return importRawSessionKey(rawB64);
  }

  /**
   * Exports a session key as a base64 string.
   * @param {CryptoKey} key
   * @returns {Promise<string>}
   */
  async exportSessionKey(key) {
    return exportRawSessionKey(key);
  }

  /** Static alias of {@link E2EE#exportSessionKey}. */
  static exportSessionKey(key) {
    return exportRawSessionKey(key);
  }

  /**
   * Computes a short, human-verifiable fingerprint of a key.
   * @param {CryptoKey|Uint8Array|ArrayBuffer|string} key
   * @returns {Promise<string>}
   */
  async fingerprint(key) {
    return computeFingerprint(key);
  }

  /** Static alias of {@link E2EE#fingerprint}. */
  static fingerprint(key) {
    return computeFingerprint(key);
  }

  /**
   * Builds a readable passphrase such as `swift-tiger-42-orchid`.
   * @returns {string}
   */
  static generatePassphrase() {
    return buildPassphrase();
  }
}
