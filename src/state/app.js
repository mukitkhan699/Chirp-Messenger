/**
 * Application state.
 *
 * One store holds everything the UI renders. Views subscribe to slices of
 * it via `store.subscribe(path, cb)`; all mutations go through the `actions`
 * exported here so persistence stays in one place.
 */

import { createStore } from '../core/store.js';
import { bus, EVENTS } from '../core/bus.js';
import { uid } from '../core/utils.js';
import {
  db,
  settingsStore,
  profileStore,
  DEFAULT_SETTINGS,
  DEFAULT_PROFILE,
} from '../services/db.js';

export const WELCOME_CONVERSATION = 'welcome';

const initialState = {
  profile: { ...DEFAULT_PROFILE },
  settings: { ...DEFAULT_SETTINGS },
  ui: {
    activeConversationId: WELCOME_CONVERSATION,
    sidebarOpen: true,
    searchQuery: '',
    modal: null,
    panel: null,
    toasts: [],
    replyTo: null,
    editing: null,
    chirpListening: false,
  },
  /** remote peer id -> { status, lastSeen, profile } */
  peers: {},
  /** conversation id -> conversation */
  conversations: {},
  calls: { active: null, history: [] },
  connection: { status: 'offline', peerId: null, error: null },
};

export const store = createStore(initialState);

/* ------------------------------------------------------------------ *
 * Persistence
 * ------------------------------------------------------------------ */

let persistTimer = null;

function schedulePersist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(persist, 400);
}

/** Write conversations, messages and call history to IndexedDB. */
export async function persist() {
  const conversations = Object.values(store.get('conversations') || {});
  try {
    await db.clear('conversations');
    await db.clear('messages');
    await db.clear('calls');
    await db.putMany(
      'conversations',
      conversations.map((conv) => ({ ...conv, messages: undefined })),
    );
    await db.putMany(
      'messages',
      conversations.flatMap((conv) =>
        (conv.messages || []).map((m) => ({ ...m, convId: conv.id })),
      ),
    );
    await db.putMany('calls', store.get('calls.history') || []);
  } catch (err) {
    console.warn('[state] persist failed', err);
  }
}

/** Load settings, profile and chat history from disk. */
export async function hydrate() {
  const settings = settingsStore.load();
  const profile = profileStore.load();
  store.set('settings', settings);
  store.set('profile', profile);

  let conversations = {};
  let calls = [];

  try {
    const [storedConversations, storedMessages, storedCalls] = await Promise.all([
      db.all('conversations'),
      db.all('messages'),
      db.all('calls'),
    ]);
    conversations = {};
    for (const conv of storedConversations) {
      conversations[conv.id] = { ...conv, messages: [] };
    }
    for (const message of storedMessages) {
      const conv = conversations[message.convId];
      if (!conv) continue;
      conv.messages.push(message);
    }
    for (const conv of Object.values(conversations)) {
      conv.messages.sort((a, b) => a.ts - b.ts);
    }
    calls = storedCalls || [];
  } catch (err) {
    console.warn('[state] hydrate failed', err);
  }

  store.set('conversations', conversations);
  store.set('calls.history', calls);
  return { settings, profile };
}

/* ------------------------------------------------------------------ *
 * Conversation helpers
 * ------------------------------------------------------------------ */

/** Stable conversation id for a peer. */
export function conversationIdFor(peerId) {
  return `peer:${peerId}`;
}

/** Get a conversation, creating it if needed. */
export function ensureConversation(peerId, { name, silent = false } = {}) {
  const id = conversationIdFor(peerId);
  const existing = store.get(`conversations.${id}`);
  if (existing) {
    // Only seed a name when there is none. Once a peer shares a display name
    // (or the user renames the chat) we must not overwrite it again.
    if (name && !existing.name) {
      store.set(`conversations.${id}.name`, name);
      schedulePersist();
    }
    return existing;
  }
  const conversation = {
    id,
    peerId,
    name: name || peerId,
    messages: [],
    unread: 0,
    typing: false,
    draft: '',
    pinned: false,
    muted: false,
    createdAt: Date.now(),
    lastActivity: Date.now(),
  };
  store.set(`conversations.${id}`, conversation);
  if (!silent) schedulePersist();
  return conversation;
}

/** All conversations, newest activity first, pinned on top. */
export function listConversations() {
  const conversations = Object.values(store.get('conversations') || {});
  return conversations.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return (b.lastActivity || 0) - (a.lastActivity || 0);
  });
}

/** Find the message a reply points at. */
export function findMessage(convId, messageId) {
  const messages = store.get(`conversations.${convId}.messages`) || [];
  return messages.find((m) => m.id === messageId) || null;
}

/* ------------------------------------------------------------------ *
 * Actions
 * ------------------------------------------------------------------ */

export const actions = {
  /* ---------------- settings & profile ---------------- */

  setSetting(key, value) {
    const settings = { ...store.get('settings'), [key]: value };
    store.set('settings', settings);
    settingsStore.save(settings);
    schedulePersist();
  },

  resetSettings() {
    settingsStore.reset();
    store.set('settings', { ...DEFAULT_SETTINGS });
  },

  setProfile(patch) {
    const profile = { ...store.get('profile'), ...patch };
    store.set('profile', profile);
    profileStore.save(profile);
  },

  /* ---------------- conversations ---------------- */

  setActiveConversation(id) {
    store.set('ui.activeConversationId', id);
    store.set('ui.replyTo', null);
    store.set('ui.editing', null);
    if (id) {
      store.set(`conversations.${id}.unread`, 0);
      store.set(`conversations.${id}.typing`, false);
    }
  },

  setSearchQuery(query) {
    store.set('ui.searchQuery', query);
  },

  setDraft(convId, text) {
    store.set(`conversations.${convId}.draft`, text);
  },

  togglePin(convId) {
    const pinned = store.get(`conversations.${convId}.pinned`);
    store.set(`conversations.${convId}.pinned`, !pinned);
    schedulePersist();
  },

  toggleMuted(convId) {
    const muted = store.get(`conversations.${convId}.muted`);
    store.set(`conversations.${convId}.muted`, !muted);
    schedulePersist();
  },

  /** Rename a conversation (used when a peer shares their display name). */
  renameConversation(convId, name) {
    if (!name) return;
    store.set(`conversations.${convId}.name`, name);
    schedulePersist();
  },

  /** Append a message to a conversation. */
  addMessage(convId, message) {
    const full = {
      id: message.id || uid('msg'),
      convId,
      direction: message.direction || 'out',
      type: message.type || 'text',
      body: message.body ?? '',
      ts: message.ts || Date.now(),
      status: message.status || 'sent',
      replyTo: message.replyTo || null,
      reactions: message.reactions || {},
      edited: Boolean(message.edited),
      deleted: Boolean(message.deleted),
      attachment: message.attachment || null,
      meta: message.meta || null,
    };
    const messages = [...(store.get(`conversations.${convId}.messages`) || []), full];
    store.set(`conversations.${convId}.messages`, messages);
    store.set(`conversations.${convId}.lastActivity`, full.ts);

    const active = store.get('ui.activeConversationId');
    if (full.direction === 'in' && active !== convId) {
      const unread = (store.get(`conversations.${convId}.unread`) || 0) + 1;
      store.set(`conversations.${convId}.unread`, unread);
    }
    schedulePersist();
    return full;
  },

  /** Patch an existing message. */
  updateMessage(convId, messageId, patch) {
    const messages = store.get(`conversations.${convId}.messages`) || [];
    const index = messages.findIndex((m) => m.id === messageId);
    if (index === -1) return null;
    const updated = { ...messages[index], ...patch };
    const next = [...messages];
    next[index] = updated;
    store.set(`conversations.${convId}.messages`, next);
    schedulePersist();
    return updated;
  },

  /** Soft-delete a message (keeps the placeholder for both sides). */
  deleteMessage(convId, messageId) {
    return this.updateMessage(convId, messageId, {
      deleted: true,
      body: '',
      attachment: null,
      reactions: {},
    });
  },

  /** Toggle a reaction on a message. */
  toggleReaction(convId, messageId, emoji) {
    const message = findMessage(convId, messageId);
    if (!message) return null;
    const reactions = { ...(message.reactions || {}) };
    const list = reactions[emoji] || [];
    const next = list.includes(messageId)
      ? list.filter((id) => id !== messageId)
      : [...list, messageId];
    if (next.length) reactions[emoji] = next;
    else delete reactions[emoji];
    return this.updateMessage(convId, messageId, { reactions });
  },

  /**
   * Mark the *incoming* messages of a conversation as read.
   * Outgoing messages are only marked "read" once the peer confirms it.
   */
  markRead(convId) {
    const messages = store.get(`conversations.${convId}.messages`) || [];
    let changed = false;
    const next = messages.map((m) => {
      if (m.direction === 'in' && m.status !== 'read') {
        changed = true;
        return { ...m, status: 'read' };
      }
      return m;
    });
    if (changed) {
      store.set(`conversations.${convId}.messages`, next);
      schedulePersist();
    }
  },

  setTyping(convId, typing) {
    store.set(`conversations.${convId}.typing`, typing);
  },

  /** Remove a conversation and its messages. */
  deleteConversation(convId) {
    const conversations = { ...store.get('conversations') };
    delete conversations[convId];
    store.set('conversations', conversations);
    store.set('ui.activeConversationId', WELCOME_CONVERSATION);
    schedulePersist();
  },

  /** Wipe every conversation. */
  clearAllChats() {
    store.set('conversations', {});
    store.set('ui.activeConversationId', WELCOME_CONVERSATION);
    schedulePersist();
  },

  /* ---------------- peers & connection ---------------- */

  setPeerStatus(peerId, status) {
    store.set(`peers.${peerId}`, {
      ...(store.get(`peers.${peerId}`) || {}),
      peerId,
      status,
      lastSeen: Date.now(),
    });
  },

  setPeerProfile(peerId, profile) {
    const existing = store.get(`peers.${peerId}`) || { peerId };
    store.set(`peers.${peerId}`, { ...existing, ...profile, lastSeen: Date.now() });
  },

  setConnection(patch) {
    store.set('connection', { ...store.get('connection'), ...patch });
  },

  /* ---------------- calls ---------------- */

  setActiveCall(call) {
    store.set('calls.active', call);
  },

  addCallHistory(entry) {
    const history = [
      { id: uid('call'), ...entry },
      ...(store.get('calls.history') || []),
    ].slice(0, 50);
    store.set('calls.history', history);
    schedulePersist();
  },

  /* ---------------- UI ---------------- */

  openModal(name, props = {}) {
    store.set('ui.modal', { name, props });
  },

  closeModal() {
    store.set('ui.modal', null);
  },

  setPanel(panel) {
    store.set('ui.panel', panel);
  },

  setReplyTo(message) {
    store.set('ui.replyTo', message);
  },

  setEditing(message) {
    store.set('ui.editing', message);
  },

  setChirpListening(listening) {
    store.set('ui.chirpListening', listening);
  },

  toast(message, { type = 'info', duration = 3200, action } = {}) {
    const id = uid('toast');
    const toasts = [...(store.get('ui.toasts') || []), { id, message, type, action }];
    store.set('ui.toasts', toasts);
    setTimeout(() => actions.dismissToast(id), duration);
    return id;
  },

  dismissToast(id) {
    const toasts = (store.get('ui.toasts') || []).filter((t) => t.id !== id);
    store.set('ui.toasts', toasts);
  },

  navigate(view, payload) {
    bus.emit(EVENTS.NAVIGATE, { view, payload });
  },
};

export { bus, EVENTS };
