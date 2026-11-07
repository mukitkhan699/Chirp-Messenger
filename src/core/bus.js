/**
 * A minimal pub/sub event bus used to decouple services from the UI.
 *
 * Services emit; views listen. Nothing in `services/` imports anything from
 * `ui/`, which keeps the dependency direction strictly one-way.
 */

const channels = new Map();

export const bus = {
  /** Subscribe to a channel. Returns an unsubscribe function. */
  on(type, handler) {
    if (!channels.has(type)) channels.set(type, new Set());
    channels.get(type).add(handler);
    return () => bus.off(type, handler);
  },

  /** Subscribe to a channel for a single delivery. */
  once(type, handler) {
    const wrapped = (payload) => {
      bus.off(type, wrapped);
      handler(payload);
    };
    return bus.on(type, wrapped);
  },

  /** Unsubscribe a handler from a channel. */
  off(type, handler) {
    const set = channels.get(type);
    if (!set) return;
    set.delete(handler);
    if (!set.size) channels.delete(type);
  },

  /** Emit a payload on a channel. */
  emit(type, payload) {
    const set = channels.get(type);
    if (!set) return;
    for (const handler of [...set]) {
      try {
        handler(payload, type);
      } catch (err) {
        console.error(`[bus] handler failed for "${type}"`, err);
      }
    }
  },

  /** Remove every subscription (used on teardown). */
  clear() {
    channels.clear();
  },
};

/** Canonical event names, so typos surface as undefined channels. */
export const EVENTS = {
  PEER_OPEN: 'peer:open',
  PEER_ERROR: 'peer:error',
  PEER_DISCONNECTED: 'peer:disconnected',
  PEER_STATUS: 'peer:status',
  CONN_OPEN: 'conn:open',
  CONN_CLOSE: 'conn:close',
  CONN_DATA: 'conn:data',
  CONN_ERROR: 'conn:error',
  CALL_INCOMING: 'call:incoming',
  CALL_OUTGOING: 'call:outgoing',
  CALL_CONNECTED: 'call:connected',
  CALL_ENDED: 'call:ended',
  CALL_ERROR: 'call:error',
  MEDIA_TRACK: 'media:track',
  CHIRP_RECEIVED: 'chirp:received',
  NOTIFY: 'notify',
  TOAST: 'toast',
  NAVIGATE: 'navigate',
};
