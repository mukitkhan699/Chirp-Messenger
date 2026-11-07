/**
 * PeerJS transport.
 *
 * Wraps the PeerJS global and turns it into a small, typed service:
 *  - one `Peer` instance for this device
 *  - many concurrent data connections (one per remote peer)
 *  - every inbound frame decoded and re-emitted on the bus
 *
 * The service knows nothing about the UI — it only emits events.
 */

import { bus, EVENTS } from '../core/bus.js';
import { encode, decode, MSG } from './protocol.js';

const DEFAULT_ICE = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
  {
    urls: 'turn:numb.viagenie.ca',
    username: 'webrtc@live.com',
    credential: 'muazkh',
  },
];

export class PeerService {
  constructor() {
    /** @type {any} */
    this.peer = null;
    /** @type {Map<string, any>} remote peer id -> data connection */
    this.connections = new Map();
    this.id = null;
    this.status = 'offline';
    this._destroyed = false;
  }

  /** Boot the peer. Resolves with the assigned peer id. */
  start(peerId, { iceServers = DEFAULT_ICE } = {}) {
    return new Promise((resolve, reject) => {
      if (typeof Peer === 'undefined') {
        reject(new Error('PeerJS failed to load — check vendor/peerjs.min.js'));
        return;
      }
      this.destroy();
      this._destroyed = false;
      this.status = 'connecting';
      bus.emit(EVENTS.PEER_STATUS, { status: 'connecting' });

      this.peer = new Peer(peerId || undefined, {
        config: { iceServers },
        debug: 1,
      });

      this.peer.on('open', (id) => {
        this.id = id;
        this.status = 'online';
        bus.emit(EVENTS.PEER_OPEN, { id });
        bus.emit(EVENTS.PEER_STATUS, { status: 'online', id });
        resolve(id);
      });

      this.peer.on('connection', (connection) => {
        this._bindConnection(connection, true);
      });

      this.peer.on('call', (call) => {
        bus.emit(EVENTS.CALL_INCOMING, { peerId: call.peer, call });
      });

      this.peer.on('error', (error) => {
        const kind = error?.type || 'unknown';
        if (kind === 'unavailable-id') {
          this.status = 'offline';
          bus.emit(EVENTS.PEER_ERROR, {
            error,
            fatal: true,
            message: 'That username is already taken. Pick another one.',
          });
          reject(error);
          return;
        }
        if (kind === 'peer-unavailable') {
          bus.emit(EVENTS.PEER_ERROR, {
            error,
            fatal: false,
            message: 'That peer is not online right now.',
          });
          return;
        }
        if (kind === 'network' || kind === 'server-error' || kind === 'socket-error') {
          bus.emit(EVENTS.PEER_ERROR, {
            error,
            fatal: false,
            message: 'Lost the signalling connection — retrying.',
          });
          return;
        }
        bus.emit(EVENTS.PEER_ERROR, { error, fatal: false, message: error?.message || 'Peer error' });
      });

      this.peer.on('disconnected', () => {
        this.status = 'reconnecting';
        bus.emit(EVENTS.PEER_DISCONNECTED, {});
        bus.emit(EVENTS.PEER_STATUS, { status: 'reconnecting' });
        if (!this._destroyed) {
          try {
            this.peer.reconnect();
          } catch {
            /* peer may already be gone */
          }
        }
      });

      this.peer.on('close', () => {
        this.status = 'offline';
        bus.emit(EVENTS.PEER_STATUS, { status: 'offline' });
      });
    });
  }

  /**
   * Attach listeners to a data connection.
   * @param {any} connection
   * @param {boolean} [incoming] true when the remote side dialled us
   */
  _bindConnection(connection, incoming = false) {
    const peerId = connection.peer;
    this.connections.set(peerId, connection);

    connection.on('open', () => {
      bus.emit(EVENTS.CONN_OPEN, { peerId, incoming });
    });

    connection.on('data', (raw) => {
      const envelope = decode(raw);
      if (!envelope) return;
      if (!envelope.from) envelope.from = peerId;
      bus.emit(EVENTS.CONN_DATA, { peerId, envelope });
    });

    connection.on('close', () => {
      this.connections.delete(peerId);
      bus.emit(EVENTS.CONN_CLOSE, { peerId });
    });

    connection.on('error', (error) => {
      bus.emit(EVENTS.CONN_ERROR, { peerId, error });
    });
  }

  /** Open a data connection to a remote peer. */
  connect(remoteId) {
    if (!this.peer) throw new Error('Peer is not ready yet');
    const existing = this.connections.get(remoteId);
    if (existing && existing.open) return existing;

    const connection = this.peer.connect(remoteId, {
      reliable: true,
      serialization: 'none',
    });
    this._bindConnection(connection);
    return connection;
  }

  /** Close the connection to a remote peer. */
  disconnect(remoteId) {
    const connection = this.connections.get(remoteId);
    if (connection) {
      try {
        connection.close();
      } catch {
        /* already closed */
      }
      this.connections.delete(remoteId);
    }
  }

  /** True when we have an open data channel to the peer. */
  isConnected(remoteId) {
    const connection = this.connections.get(remoteId);
    return Boolean(connection && connection.open);
  }

  /** Send a typed message to one peer. */
  send(remoteId, type, data = null, extra = {}) {
    const connection = this.connections.get(remoteId);
    if (!connection || !connection.open) return false;
    try {
      connection.send(encode(type, data, { ...extra, from: this.id }));
      return true;
    } catch (err) {
      console.error('[peer] send failed', err);
      return false;
    }
  }

  /** Send a typed message to every connected peer. */
  broadcast(type, data = null, extra = {}) {
    let sent = 0;
    for (const peerId of this.connections.keys()) {
      if (this.send(peerId, type, data, extra)) sent += 1;
    }
    return sent;
  }

  /** Send a pre-serialised frame (used by the file chunker). */
  sendRaw(remoteId, frame) {
    const connection = this.connections.get(remoteId);
    if (!connection || !connection.open) return false;
    try {
      connection.send(frame);
      return true;
    } catch (err) {
      console.error('[peer] raw send failed', err);
      return false;
    }
  }

  /** Tear the whole peer down (used when changing your username). */
  destroy() {
    this._destroyed = true;
    for (const connection of this.connections.values()) {
      try {
        connection.close();
      } catch {
        /* ignore */
      }
    }
    this.connections.clear();
    if (this.peer) {
      try {
        this.peer.destroy();
      } catch {
        /* ignore */
      }
      this.peer = null;
    }
    this.status = 'offline';
    this.id = null;
  }
}

export { MSG };
