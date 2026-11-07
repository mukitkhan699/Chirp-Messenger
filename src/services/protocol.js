/**
 * Wire protocol.
 *
 * Every payload that crosses a PeerJS data channel is a JSON envelope:
 *
 *   { v: 1, t: 'chat', id: 'msg_x', ts: 1712345678, from: 'alice', d: {...} }
 *
 * The receiver accepts legacy clients too: a bare string is interpreted as a
 * plain chat message, so the modern app can still talk to the original
 * `script.js` build.
 */

export const PROTOCOL_VERSION = 1;

export const MSG = {
  CHAT: 'chat',
  TYPING: 'typing',
  READ: 'read',
  REACTION: 'reaction',
  EDIT: 'edit',
  DELETE: 'delete',
  REPLY: 'reply',
  FILE: 'file',
  FILE_CHUNK: 'file:chunk',
  PROFILE: 'profile',
  ACK: 'ack',
  PING: 'ping',
  PONG: 'pong',
  SYSTEM: 'system',
  CHIRP: 'chirp',
};

/** Maximum size (bytes) of a single data-channel frame we will send. */
export const CHUNK_SIZE = 48 * 1024;

/** Maximum size of a whole file we allow to transfer over the data channel (up to 64MB). */
export const MAX_FILE_BYTES = 64 * 1024 * 1024;

/**
 * Build an envelope.
 * @param {string} type one of MSG.*
 * @param {any} data payload
 * @param {object} [extra] additional envelope fields (e.g. `{ id, from }`)
 */
export function encode(type, data = null, extra = {}) {
  const envelope = {
    v: PROTOCOL_VERSION,
    t: type,
    id: extra.id || `m_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    ts: Date.now(),
    from: extra.from || null,
    d: data,
  };
  if (extra.replyTo) envelope.replyTo = extra.replyTo;
  if (extra.extra) Object.assign(envelope, extra.extra);
  return JSON.stringify(envelope);
}

/**
 * Parse an incoming frame.
 * @param {string|object} raw
 * @returns {{type:string,id:string,ts:number,from:string|null,data:any,replyTo?:string}|null}
 */
export function decode(raw) {
  if (raw == null) return null;

  // Legacy client: plain text over the wire.
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed.startsWith('{')) {
      return {
        type: MSG.CHAT,
        id: `legacy_${Date.now().toString(36)}`,
        ts: Date.now(),
        from: null,
        data: { body: raw, legacy: true },
      };
    }
    try {
      raw = JSON.parse(trimmed);
    } catch {
      return null;
    }
  }

  if (typeof raw !== 'object' || !raw.t) return null;

  return {
    type: raw.t,
    id: raw.id || null,
    ts: raw.ts || Date.now(),
    from: raw.from || null,
    replyTo: raw.replyTo || null,
    data: raw.d ?? null,
  };
}

/**
 * Split a file payload into chunks that fit in a data-channel frame.
 *
 * Every chunk but the last holds a multiple of three bytes, so its base64
 * representation has no padding. Concatenating the base64 chunks therefore
 * produces one valid base64 document that can be decoded in a single step.
 *
 * @param {Uint8Array} bytes
 * @param {number} [size]
 * @returns {string[]} base64 chunks
 */
export function chunkBytes(bytes, size = CHUNK_SIZE) {
  const chunks = [];
  const step = Math.max(3, Math.floor(size / 3) * 3);
  for (let i = 0; i < bytes.length; i += step) {
    let binary = '';
    const slice = bytes.subarray(i, i + step);
    for (let j = 0; j < slice.length; j += 1) binary += String.fromCharCode(slice[j]);
    chunks.push(btoa(binary));
  }
  return chunks;
}

/**
 * Reassemble base64 chunks back into the original bytes.
 *
 * @param {string[]} chunks
 * @returns {Uint8Array}
 */
export function joinChunks(chunks) {
  const binary = atob(chunks.join(''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Build a "file" envelope descriptor shared by both ends. */
export function describeFile({ name, type, size, mime }) {
  return {
    name: name || 'file',
    type: type || 'application/octet-stream',
    mime: mime || type || 'application/octet-stream',
    size: size || 0,
  };
}
