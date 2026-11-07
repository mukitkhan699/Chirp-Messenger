/**
 * File transfer over the PeerJS data channel.
 *
 * Data channels cap a single frame at roughly 16 KB once framing overhead is
 * accounted for, so files are split into chunks, sent with a header first and
 * reassembled on the other side.
 */

import { MSG, chunkBytes, joinChunks } from './protocol.js';
import { uid } from '../core/utils.js';

/** Raw bytes per chunk (base64 grows this by ~4/3). */
export const CHUNK_SIZE = 16 * 1024;

/** Files above this size are rejected. */
export const MAX_FILE_BYTES = 12 * 1024 * 1024;

const yieldToUi = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Send a file to a peer, chunk by chunk.
 *
 * @param {import('./peer.js').PeerService} peerService
 * @param {string} peerId
 * @param {File} file
 * @param {{ onProgress?: (ratio:number)=>void, isImage?: boolean }} [options]
 * @returns {Promise<{ fileId:string, name:string, size:number, type:string }>}
 */
export async function sendFile(peerService, peerId, file, { onProgress } = {}) {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error('File is too large');
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const chunks = chunkBytes(bytes, CHUNK_SIZE);
  const fileId = uid('file');

  peerService.send(peerId, MSG.FILE, {
    fileId,
    name: file.name || 'file',
    type: file.type || 'application/octet-stream',
    size: file.size,
    total: chunks.length,
  });

  for (let index = 0; index < chunks.length; index += 1) {
    const ok = peerService.send(peerId, MSG.FILE_CHUNK, { fileId, index, data: chunks[index] });
    if (!ok) throw new Error('Connection lost while sending the file');
    onProgress?.((index + 1) / chunks.length);
    if (index % 4 === 0) await yieldToUi();
  }

  return { fileId, name: file.name, size: file.size, type: file.type };
}

/**
 * Reassembles incoming file transfers.
 */
export class FileReceiver {
  constructor() {
    /** @type {Map<string, {header:object, chunks:string[], received:number}>} */
    this.pending = new Map();
    /** @type {Map<string, (result:object)=>void>} */
    this.waiters = new Map();
  }

  /**
   * Handle a file header frame.
   * @param {object} header
   */
  handleHeader(header) {
    this.pending.set(header.fileId, { header, chunks: new Array(header.total), received: 0 });
  }

  /**
   * Handle a chunk frame.
   * @param {object} payload
   * @param {(progress:number)=>void} [onProgress]
   * @returns {Promise<object|null>} the completed file when the last chunk arrives
   */
  async handleChunk(payload, onProgress) {
    const entry = this.pending.get(payload.fileId);
    if (!entry) return null;
    entry.chunks[payload.index] = payload.data;
    entry.received += 1;

    if (entry.received >= entry.header.total) {
      this.pending.delete(payload.fileId);
      const bytes = joinChunks(entry.chunks);
      const blob = new Blob([bytes], { type: entry.header.type });
      const dataUrl = await blobToDataUrl(blob);
      const result = {
        fileId: payload.fileId,
        name: entry.header.name,
        type: entry.header.type,
        size: entry.header.size,
        dataUrl,
        kind: entry.header.type?.startsWith('image/') ? 'image' : 'file',
      };
      const waiter = this.waiters.get(payload.fileId);
      if (waiter) {
        this.waiters.delete(payload.fileId);
        waiter(result);
      }
      return result;
    }

    onProgress?.(entry.received / entry.header.total);
    return null;
  }

  /**
   * Wait for a file to complete.
   * @param {string} fileId
   * @param {number} [timeoutMs]
   * @returns {Promise<object>}
   */
  wait(fileId, timeoutMs = 60000) {
    const existing = this.pending.get(fileId);
    if (existing && existing.received >= existing.header.total) {
      return Promise.resolve(null);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters.delete(fileId);
        reject(new Error('Timed out waiting for the file'));
      }, timeoutMs);
      this.waiters.set(fileId, (result) => {
        clearTimeout(timer);
        resolve(result);
      });
    });
  }
}

/**
 * Convert a blob into a data URL.
 * @param {Blob} blob
 * @returns {Promise<string>}
 */
export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error('Could not read the file'));
    reader.readAsDataURL(blob);
  });
}
