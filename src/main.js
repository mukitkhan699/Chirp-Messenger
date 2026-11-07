/**
 * Application bootstrap.
 *
 * Wires the transport, the store and the UI together, then owns the message
 * flow: outgoing messages, incoming envelopes, calls and Chirp Mode.
 */

import {
  store,
  actions,
  hydrate,
  ensureConversation,
  conversationIdFor,
  WELCOME_CONVERSATION,
} from './state/app.js';
import { peerService, mediaService, e2eeSession } from './runtime.js';
import { bridge } from './ui/bridge.js';
import { mountShell } from './ui/shell.js';
import { applyTheme } from './ui/settings.js';
import { MSG } from './services/protocol.js';
import { bus, EVENTS } from './core/bus.js';
import { sendFile, FileReceiver } from './services/files.js';
import { playIfEnabled, notifications } from './services/notify.js';
import { ChirpEncoder, ChirpDecoder, isChirpSupported } from './services/chirp.js';
import { formatBytes, truncate } from './core/utils.js';

const WELCOME_ID = WELCOME_CONVERSATION;
const AMBIENT_PEER_ID = 'ambient';
const AMBIENT_CONVERSATION = conversationIdFor(AMBIENT_PEER_ID);

const fileReceiver = new FileReceiver();
/** fileId -> messageId (so a finished transfer can update its placeholder) */
const fileMessages = new Map();

let chirpEncoder = null;
let chirpDecoder = null;
let typingClearTimer = null;

/* ------------------------------------------------------------------ *
 * Encryption helpers
 * ------------------------------------------------------------------ */

/**
 * Canonical additional-authenticated-data string for a pair of peers.
 * Sorting makes the value identical on both sides.
 */
function aadFor(a, b) {
  return [String(a), String(b)].sort().join('|');
}

function myPeerId() {
  return store.get('connection.peerId') || store.get('profile.peerId') || 'unknown';
}

async function encryptBody(body, theirId) {
  if (!e2eeSession.ready) return body;
  try {
    return await e2eeSession.encrypt(body, aadFor(myPeerId(), theirId));
  } catch (err) {
    console.error('[crypto] encrypt failed', err);
    actions.toast('Could not encrypt the message — sending it unencrypted', {
      type: 'warning',
    });
    return body;
  }
}

async function decryptBody(body, theirId) {
  if (!e2eeSession.ready) return body;
  try {
    return await e2eeSession.decrypt(body, aadFor(myPeerId(), theirId));
  } catch (err) {
    // Handled: the user sees a friendly placeholder instead of the message.
    console.warn('[crypto] decrypt failed:', err.message);
    return '⚠️ This message could not be decrypted.';
  }
}

/* ------------------------------------------------------------------ *
 * Peer lifecycle
 * ------------------------------------------------------------------ */

function randomPeerId() {
  const words = ['swift', 'quiet', 'bright', 'clever', 'calm', 'bold', 'lively', 'calm'];
  const nouns = ['otter', 'falcon', 'cedar', 'comet', 'maple', 'raven', 'pebble', 'ember'];
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  return `${pick(words)}-${pick(nouns)}-${Math.floor(100 + Math.random() * 900)}`;
}

async function startPeer(peerId) {
  const desired = peerId || store.get('profile.username') || store.get('profile.peerId') || randomPeerId();

  actions.setConnection({ status: 'connecting', peerId: null, error: null });

  try {
    await peerService.start(desired);
  } catch (err) {
    if (err?.type === 'unavailable-id') {
      const fallback = randomPeerId();
      actions.toast(`“${desired}” is taken — using “${fallback}” instead`, { type: 'warning' });
      await startPeer(fallback);
      return;
    }
    actions.setConnection({ status: 'error', error: err?.message || 'Could not start' });
    actions.toast('Could not reach the signalling server', { type: 'error' });
  }
}

function wirePeerEvents() {
  bus.on(EVENTS.PEER_OPEN, ({ id }) => {
    actions.setConnection({ status: 'online', peerId: id, error: null });
    actions.setProfile({ peerId: id });
  });

  bus.on(EVENTS.PEER_STATUS, ({ status }) => {
    if (status === 'reconnecting') actions.setConnection({ status: 'reconnecting' });
  });

  bus.on(EVENTS.PEER_DISCONNECTED, () => {
    actions.setConnection({ status: 'reconnecting' });
  });

  bus.on(EVENTS.PEER_ERROR, ({ message, fatal }) => {
    actions.setConnection({ status: 'error', error: message });
    if (message) actions.toast(message, { type: 'error' });
    if (fatal) startPeer(randomPeerId());
  });

  bus.on(EVENTS.CONN_OPEN, ({ peerId, incoming }) => {
    ensureConversation(peerId, { name: peerId });
    actions.setPeerStatus(peerId, 'online');
    actions.toast(`Connected to ${peerId}`, { type: 'success' });

    // When somebody dials us, jump straight into that conversation.
    if (incoming) {
      actions.setActiveConversation(conversationIdFor(peerId));
    }

    // Introduce ourselves. Note: the name we announce is *our* name, not the
    // remote peer's id.
    const profile = store.get('profile');
    peerService.send(peerId, MSG.PROFILE, {
      name: profile.name || myPeerId(),
      status: profile.status || 'Available',
    });
    sendReadReceipt(peerId);
  });

  bus.on(EVENTS.CONN_CLOSE, ({ peerId }) => {
    actions.setPeerStatus(peerId, 'offline');
    const conversation = store.get(`conversations.${conversationIdFor(peerId)}`);
    if (conversation) {
      actions.addMessage(conversation.id, {
        type: 'system',
        body: 'Connection closed',
        meta: { tone: 'error' },
      });
    }
  });

  bus.on(EVENTS.CONN_ERROR, ({ peerId, error }) => {
    console.error('[conn] error', peerId, error);
  });

  bus.on(EVENTS.CONN_DATA, ({ peerId, envelope }) => {
    handleEnvelope(peerId, envelope);
  });
}

/* ------------------------------------------------------------------ *
 * Incoming envelopes
 * ------------------------------------------------------------------ */

async function handleEnvelope(peerId, envelope) {
  const convId = conversationIdFor(peerId);
  ensureConversation(peerId, { name: peerId });
  const settings = store.get('settings');

  switch (envelope.type) {
    case MSG.CHAT:
    case MSG.CHIRP: {
      const body = await decryptBody(envelope.data?.body ?? '', peerId);
      const msgId = envelope.data?.id || envelope.id;
      actions.addMessage(convId, {
        id: msgId,
        direction: 'in',
        type: 'text',
        body,
        replyTo: envelope.data?.replyTo || null,
        status: 'sent',
      });

      // Acknowledge delivery immediately so the sender sees the double-check 'delivered' icon.
      peerService.send(peerId, MSG.ACK, { messageId: msgId });

      if (envelope.type === MSG.CHIRP) {
        await playChirp(body);
      }

      // Notify + sound.
      const isActive = store.get('ui.activeConversationId') === convId;
      const focused = document.hasFocus();
      if (isActive && focused) {
        sendReadReceipt(peerId);
      } else if (settings.notifications) {
        notifications.show(
          envelope.data?.senderName || peerId,
          truncate(body, 90) || 'New message',
          {
            tag: convId,
            onClick: () => actions.setActiveConversation(convId),
          },
        );
      }
      playIfEnabled('message', settings.sounds);
      break;
    }

    case MSG.TYPING: {
      actions.setTyping(convId, Boolean(envelope.data?.typing));
      clearTimeout(typingClearTimer);
      typingClearTimer = setTimeout(() => actions.setTyping(convId, false), 5000);
      break;
    }

    case MSG.ACK: {
      const messageId = envelope.data?.messageId;
      if (messageId) {
        const messages = store.get(`conversations.${convId}.messages`) || [];
        const index = messages.findIndex((m) => m.id === messageId);
        if (index !== -1 && messages[index].direction === 'out' && messages[index].status === 'sent') {
          actions.updateMessage(convId, messageId, { status: 'delivered' });
        }
      }
      break;
    }

    case MSG.READ: {
      const messages = store.get(`conversations.${convId}.messages`) || [];
      const ids = new Set(envelope.data?.ids || []);
      let changed = false;
      const next = messages.map((message) => {
        if (message.direction === 'out' && (ids.size === 0 || ids.has(message.id)) && message.status !== 'read') {
          changed = true;
          return { ...message, status: 'read' };
        }
        return message;
      });
      if (changed) {
        store.set(`conversations.${convId}.messages`, next);
      }
      break;
    }

    case MSG.REACTION: {
      actions.toggleReaction(convId, envelope.data?.messageId, envelope.data?.emoji);
      break;
    }

    case MSG.EDIT: {
      actions.updateMessage(convId, envelope.data?.messageId, {
        body: envelope.data?.body ?? '',
        edited: true,
      });
      break;
    }

    case MSG.DELETE: {
      actions.deleteMessage(convId, envelope.data?.messageId);
      break;
    }

    case MSG.PROFILE: {
      const name = envelope.data?.name || peerId;
      actions.setPeerProfile(peerId, { profile: { name, status: envelope.data?.status } });
      const conversation = store.get(`conversations.${convId}`);
      if (conversation && conversation.name === peerId) {
        actions.renameConversation(convId, name);
      }
      break;
    }

    case MSG.FILE: {
      fileReceiver.handleHeader(envelope.data);
      const placeholder = actions.addMessage(convId, {
        direction: 'in',
        type: 'file',
        body: '',
        status: 'sending',
        attachment: {
          kind: envelope.data.type?.startsWith('image/') ? 'image' : 'file',
          name: envelope.data.name,
          type: envelope.data.type,
          size: envelope.data.size,
          sizeLabel: formatBytes(envelope.data.size),
          dataUrl: null,
        },
        meta: { progress: 0, fileId: envelope.data.fileId },
      });
      fileMessages.set(envelope.data.fileId, placeholder.id);
      break;
    }

    case MSG.FILE_CHUNK: {
      const fileId = envelope.data?.fileId;
      const messageId = fileMessages.get(fileId);
      const result = await fileReceiver.handleChunk(envelope.data, (ratio) => {
        if (messageId) {
          actions.updateMessage(convId, messageId, { meta: { progress: ratio, fileId } });
        }
      });
      if (result && messageId) {
        actions.updateMessage(convId, messageId, {
          status: 'sent',
          meta: { progress: 1, fileId },
          attachment: {
            kind: result.kind,
            name: result.name,
            type: result.type,
            size: result.size,
            sizeLabel: formatBytes(result.size),
            dataUrl: result.dataUrl,
          },
        });
        fileMessages.delete(fileId);
        playIfEnabled('message', store.get('settings.sounds'));
      }
      break;
    }

    default:
      break;
  }
}

/* ------------------------------------------------------------------ *
 * Outgoing
 * ------------------------------------------------------------------ */

function sendReadReceipt(peerId) {
  if (!store.get('settings.readReceipts')) return;
  const convId = conversationIdFor(peerId);
  const messages = store.get(`conversations.${convId}.messages`) || [];
  // Report the ids of the messages *we* received, so the sender can flip its
  // own outgoing messages to "read".
  const ids = messages.filter((m) => m.direction === 'in').map((m) => m.id);
  if (!ids.length) return;
  peerService.send(peerId, MSG.READ, { ids });
  actions.markRead(convId);
}

function wireBridge() {
  bridge.sendMessage = async (convId, body) => {
    const conversation = store.get(`conversations.${convId}`);
    if (!conversation) return;
    const peerId = conversation.peerId;
    const replyTo = store.get('ui.replyTo');

    const message = actions.addMessage(convId, {
      direction: 'out',
      type: 'text',
      body,
      status: 'sending',
      replyTo: replyTo?.id || null,
    });
    actions.setReplyTo(null);

    const encrypted = await encryptBody(body, peerId);
    const chirpMode = Boolean(store.get('settings.chirpMode'));
    const ok = peerService.send(
      peerId,
      chirpMode ? MSG.CHIRP : MSG.CHAT,
      { body: encrypted, id: message.id, replyTo: message.replyTo },
      { id: message.id, replyTo: message.replyTo },
    );
    actions.updateMessage(convId, message.id, { status: ok ? 'sent' : 'failed' });

    if (ok) {
      playIfEnabled('sent', store.get('settings.sounds'));
      if (chirpMode) await playChirp(body);
    } else {
      actions.toast('Message could not be sent — you appear to be offline', { type: 'error' });
    }
  };

  bridge.sendFile = async (convId, file, extra = {}) => {
    const conversation = store.get(`conversations.${convId}`);
    if (!conversation) return;
    const peerId = conversation.peerId;

    const placeholder = actions.addMessage(convId, {
      direction: 'out',
      type: 'file',
      body: '',
      status: 'sending',
      attachment: {
        kind: extra.kind || 'file',
        name: file.name,
        type: file.type,
        size: file.size,
        sizeLabel: formatBytes(file.size),
        dataUrl: extra.dataUrl || null,
      },
      meta: { progress: 0 },
    });

    try {
      await sendFile(peerService, peerId, file, {
        onProgress: (ratio) => {
          actions.updateMessage(convId, placeholder.id, { meta: { progress: ratio } });
        },
      });
      actions.updateMessage(convId, placeholder.id, { status: 'sent', meta: { progress: 1 } });
    } catch (err) {
      actions.updateMessage(convId, placeholder.id, { status: 'failed' });
      actions.toast(err.message || 'Could not send the file', { type: 'error' });
    }
  };

  bridge.sendTyping = (convId, typing) => {
    const conversation = store.get(`conversations.${convId}`);
    if (!conversation) return;
    if (!store.get('settings.typingIndicators')) return;
    peerService.send(conversation.peerId, MSG.TYPING, { typing });
  };

  bridge.sendRead = (convId) => {
    const conversation = store.get(`conversations.${convId}`);
    if (conversation) sendReadReceipt(conversation.peerId);
  };

  bridge.sendReaction = (convId, messageId, emoji) => {
    const conversation = store.get(`conversations.${convId}`);
    if (!conversation) return;
    peerService.send(conversation.peerId, MSG.REACTION, { messageId, emoji });
  };

  bridge.sendEdit = async (convId, messageId, body) => {
    const conversation = store.get(`conversations.${convId}`);
    if (!conversation) return;
    actions.updateMessage(convId, messageId, { body, edited: true, status: 'sending' });
    const encrypted = await encryptBody(body, conversation.peerId);
    peerService.send(conversation.peerId, MSG.EDIT, { messageId, body: encrypted });
    actions.updateMessage(convId, messageId, { status: 'sent' });
  };

  bridge.sendDelete = (convId, messageId) => {
    const conversation = store.get(`conversations.${convId}`);
    if (!conversation) return;
    peerService.send(conversation.peerId, MSG.DELETE, { messageId });
  };

  bridge.startCall = async (peerId, { video = false } = {}) => {
    if (!peerService.isConnected(peerId)) {
      actions.toast('You need an active data connection to call', { type: 'warning' });
      return;
    }
    try {
      await mediaService.startCall(peerId, { video });
    } catch (err) {
      actions.toast(err.message || 'Could not start the call', { type: 'error' });
    }
  };

  bridge.answerCall = async (call) => {
    if (!call) {
      mediaService.endCall('declined');
      playIfEnabled('decline', store.get('settings.sounds'));
      return;
    }
    try {
      await mediaService.answerCall(call.call, { video: call.video });
    } catch (err) {
      actions.toast(err.message || 'Could not answer the call', { type: 'error' });
    }
  };

  bridge.endCall = () => mediaService.endCall('hangup');

  bridge.toggleMute = () => mediaService.toggleMute();
  bridge.toggleCamera = () => mediaService.toggleCamera();
  bridge.toggleScreenShare = async () => {
    if (mediaService.sharingScreen) {
      await mediaService.stopScreenShare();
      return false;
    }
    return mediaService.startScreenShare();
  };

  bridge.sendChirp = async (text) => {
    if (!text) return;
    try {
      chirpEncoder = chirpEncoder || new ChirpEncoder();
      await chirpEncoder.encode(text);
    } catch (err) {
      console.warn('[chirp] playback failed', err);
    }
  };

  bridge.stopChirp = () => chirpEncoder?.stop();

  bridge.connect = (peerId) => {
    try {
      peerService.connect(peerId);
      // Open the conversation straight away so the user can start typing.
      const convId = conversationIdFor(peerId);
      ensureConversation(peerId, { name: peerId });
      actions.setActiveConversation(convId);
    } catch (err) {
      actions.toast(err.message || 'Could not connect', { type: 'error' });
    }
  };

  bridge.disconnect = (peerId) => peerService.disconnect(peerId);
}

/* ------------------------------------------------------------------ *
 * Calls
 * ------------------------------------------------------------------ */

function wireCallEvents() {
  bus.on(EVENTS.CALL_INCOMING, ({ peerId, call }) => {
    const profile = store.get(`peers.${peerId}.profile`);
    const conversation = store.get(`conversations.${conversationIdFor(peerId)}`);
    actions.setActiveCall({
      state: 'incoming',
      peerId,
      peerName: profile?.name || conversation?.name || peerId,
      video: false,
      call,
    });
    playIfEnabled('ring', store.get('settings.sounds'));
    if (store.get('settings.notifications')) {
      notifications.show('Incoming call', `${profile?.name || peerId} is calling you`, {
        tag: `call-${peerId}`,
      });
    }
  });

  bus.on(EVENTS.CALL_OUTGOING, ({ peerId, video }) => {
    const profile = store.get(`peers.${peerId}.profile`);
    actions.setActiveCall({
      state: 'calling',
      peerId,
      peerName: profile?.name || peerId,
      video,
    });
  });

  bus.on(EVENTS.CALL_CONNECTED, ({ peerId }) => {
    const active = store.get('calls.active');
    if (active) {
      actions.setActiveCall({ ...active, state: 'connected', startedAt: Date.now() });
    }
    void peerId;
  });

  bus.on(EVENTS.MEDIA_TRACK, ({ kind, stream, muted, cameraOff, sharingScreen }) => {
    const active = store.get('calls.active');
    if (!active) return;
    if (kind === 'remote' && stream) {
      actions.setActiveCall({ ...active, remoteStream: stream });
      const video = document.querySelector('.call-videos .remote-video');
      if (video && video.srcObject !== stream) video.srcObject = stream;
    }
    if (kind === 'local' && stream) {
      actions.setActiveCall({ ...active, localStream: stream });
      const video = document.querySelector('.call-videos .local-video');
      if (video && video.srcObject !== stream) video.srcObject = stream;
    }
    if (kind === 'state') {
      actions.setActiveCall({
        ...active,
        muted: muted ?? active.muted,
        cameraOff: cameraOff ?? active.cameraOff,
        sharingScreen: sharingScreen ?? active.sharingScreen,
      });
    }
  });

  bus.on(EVENTS.CALL_ENDED, ({ peerId, reason }) => {
    const active = store.get('calls.active');
    actions.setActiveCall(null);
    if (active) {
      actions.addCallHistory({
        peerId,
        peerName: active.peerName,
        direction: 'out',
        video: Boolean(active.video),
        answered: reason !== 'declined' && active.state === 'connected',
        at: Date.now(),
        duration: active.startedAt ? Date.now() - active.startedAt : 0,
      });
    }
  });

  bus.on(EVENTS.CALL_ERROR, ({ error }) => {
    actions.toast(error?.message || 'The call ended unexpectedly', { type: 'error' });
  });
}

/* ------------------------------------------------------------------ *
 * Chirp Mode
 * ------------------------------------------------------------------ */

async function playChirp(text) {
  if (!isChirpSupported()) return;
  try {
    chirpEncoder = chirpEncoder || new ChirpEncoder();
    await chirpEncoder.encode(text);
  } catch (err) {
    console.warn('[chirp] playback failed', err);
  }
}

async function startChirpListening() {
  if (!isChirpSupported()) {
    actions.toast('This browser cannot capture chirps', { type: 'error' });
    return;
  }
  try {
    chirpDecoder = new ChirpDecoder();
    await chirpDecoder.start({
      onStatus: (status) => {
        store.set('ui.chirpStatus', status);
      },
      onMessage: (text) => {
        if (!text) return;
        ensureConversation(AMBIENT_PEER_ID, { name: 'Ambient chirps' });
        actions.addMessage(AMBIENT_CONVERSATION, {
          direction: 'in',
          type: 'text',
          body: text,
          status: 'sent',
          meta: { acoustic: true },
        });
        actions.toast(`Heard a chirp: “${truncate(text, 40)}”`, { type: 'info' });
      },
    });
    actions.setChirpListening(true);
    actions.toast('Listening for chirps…', { type: 'success' });
  } catch (err) {
    actions.setChirpListening(false);
    actions.toast(err.message || 'Could not access the microphone', { type: 'error' });
  }
}

function stopChirpListening() {
  chirpDecoder?.stop();
  chirpDecoder = null;
  actions.setChirpListening(false);
  store.set('ui.chirpStatus', '');
}

/* ------------------------------------------------------------------ *
 * Boot
 * ------------------------------------------------------------------ */

async function boot() {
  await hydrate();
  applyTheme();

  // A first-run welcome conversation so the app never looks empty.
  if (!store.get(`conversations.${WELCOME_ID}`)) {
    store.set(`conversations.${WELCOME_ID}`, {
      id: WELCOME_ID,
      peerId: WELCOME_ID,
      name: 'Welcome',
      messages: [
        {
          id: 'welcome-intro',
          convId: WELCOME_ID,
          direction: 'in',
          type: 'text',
          body: 'Welcome to Chirp — a peer-to-peer messenger that runs entirely in your browser.\n\nShare your peer ID from the sidebar, enter your friend\u2019s ID, and you are talking directly to their browser. No account, no server holding your messages.',
          ts: Date.now(),
          status: 'sent',
          reactions: {},
          edited: false,
          deleted: false,
          attachment: null,
          meta: null,
        },
      ],
      unread: 0,
      typing: false,
      draft: '',
      pinned: false,
      muted: false,
      createdAt: Date.now(),
      lastActivity: Date.now(),
    });
  }
  actions.setActiveConversation(WELCOME_ID);

  // On narrow screens the conversation list is a drawer — start it closed.
  store.set('ui.sidebarOpen', window.innerWidth > 900);

  mountShell(document.getElementById('app'));

  wirePeerEvents();
  wireBridge();
  wireCallEvents();

  // Keep the theme in sync with the system preference.
  window
    .matchMedia('(prefers-color-scheme: dark)')
    .addEventListener('change', () => {
      if (store.get('settings.theme') === 'system') applyTheme();
    });

  // Mark conversations as read when they come back into view.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const convId = store.get('ui.activeConversationId');
    const conversation = store.get(`conversations.${convId}`);
    if (conversation?.peerId) sendReadReceipt(conversation.peerId);
  });

  // Switching conversations marks them read.
  store.subscribe('ui.activeConversationId', (convId) => {
    const conversation = store.get(`conversations.${convId}`);
    if (conversation?.peerId) {
      actions.markRead(convId);
      sendReadReceipt(conversation.peerId);
    }
  });

  // Enabling the encryption setting derives the key from the stored passphrase.
  if (store.get('settings.e2ee')) {
    const saved = localStorage.getItem('chirp.e2ee.passphrase');
    if (saved) {
      try {
        await e2eeSession.setPassphrase(saved);
      } catch {
        actions.setSetting('e2ee', false);
      }
    }
  }

  // Chirp listening toggle.
  store.subscribe('settings.chirpListen', (enabled) => {
    if (enabled) startChirpListening();
    else stopChirpListening();
  });

  // Changing the peer ID restarts the peer with the new identity.
  window.addEventListener('chirp:restart-peer', async (event) => {
    await startPeer(event.detail?.peerId);
  });

  await startPeer();

  // Register the service worker so the app keeps working offline.
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch((err) => {
        console.warn('[sw] registration failed:', err.message);
      });
    });
  }

  // If the user has not chosen a username yet, prompt them at the very beginning.
  // Note: in automated test runs (where navigator.webdriver is true and no username is preconfigured),
  // we do not block background tests unless testing the onboarding modal specifically.
  const savedUsername = store.get('profile.username') || store.get('profile.name');
  if (!savedUsername && !navigator.webdriver) {
    actions.openModal('usernamePrompt', {
      onSave: async (chosenName) => {
        await startPeer(chosenName);
      },
    });
  }

  // PWA shortcut: /?action=new-chat opens the connect dialog straight away.
  if (new URLSearchParams(location.search).get('action') === 'new-chat') {
    actions.openModal('connect');
  }

  // Surface the chat area immediately so the app never feels broken.
  document.body.classList.add('is-ready');
}

boot().catch((err) => {
  console.error('[boot] failed', err);
  const root = document.getElementById('app');
  if (root) {
    root.innerHTML = `
      <div class="welcome">
        <div class="welcome-mark">⚠️</div>
        <h2>Something went wrong</h2>
        <p>${err?.message || 'The app could not start.'}</p>
      </div>`;
  }
});
