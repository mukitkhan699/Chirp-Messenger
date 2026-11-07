/**
 * Runtime singletons.
 *
 * Long-lived service instances that need to be reachable from the UI without
 * being threaded through every function. Kept in one file so the dependency
 * graph stays obvious: UI -> runtime -> services.
 */

import { PeerService } from './services/peer.js';
import { MediaService } from './services/media.js';
import { E2EE, toBase64 } from './services/crypto.js';

export const peerService = new PeerService();
export const mediaService = new MediaService(peerService);

/**
 * End-to-end encryption session.
 *
 * A passphrase is stretched into an AES-GCM key with a *deterministic* salt
 * derived from the passphrase itself. That way two peers who typed the same
 * passphrase derive the same key without any key-exchange round trip.
 */
export const e2eeSession = {
  e2ee: new E2EE(),
  enabled: false,
  passphrase: null,
  key: null,
  fingerprint: null,

  /** True when a usable key is loaded. */
  get ready() {
    return Boolean(this.enabled && this.key);
  },

  /**
   * Derive and store the session key for a passphrase.
   * @param {string} passphrase
   * @returns {Promise<string>} the key fingerprint
   */
  async setPassphrase(passphrase) {
    if (!passphrase || !passphrase.trim()) {
      this.reset();
      return null;
    }
    const normalized = passphrase.trim();
    const salt = await this.deriveSalt(normalized);
    this.key = await this.e2ee.deriveKey(normalized, salt);
    this.passphrase = normalized;
    this.enabled = true;
    this.fingerprint = await this.e2ee.fingerprint(this.key);
    return this.fingerprint;
  },

  /** Turn encryption off and drop the key. */
  reset() {
    this.enabled = false;
    this.passphrase = null;
    this.key = null;
    this.fingerprint = null;
  },

  /**
   * Derive a stable 16-byte salt from a passphrase.
   * @param {string} passphrase
   * @returns {Promise<string>} base64 salt
   */
  async deriveSalt(passphrase) {
    const data = new TextEncoder().encode(`chirp-e2ee-v1:${passphrase}`);
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
    return toBase64(digest.slice(0, 16));
  },

  /**
   * Encrypt a plaintext payload.
   * @param {string} plaintext
   * @param {string} aad additional authenticated data
   * @returns {Promise<string>} base64 blob (JSON payload)
   */
  async encrypt(plaintext, aad) {
    if (!this.ready) return plaintext;
    const payload = await this.e2ee.encrypt(this.key, plaintext, aad);
    return JSON.stringify(payload);
  },

  /**
   * Decrypt a payload produced by {@link E2EE#encrypt}.
   * @param {string} raw
   * @param {string} aad
   * @returns {Promise<string>}
   */
  async decrypt(raw, aad) {
    if (!this.ready) return raw;
    let payload;
    try {
      payload = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
      return raw; // not an encrypted payload
    }
    if (!payload || payload.v !== 1) return raw;
    return this.e2ee.decrypt(this.key, payload, aad);
  },
};
