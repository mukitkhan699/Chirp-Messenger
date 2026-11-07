/**
 * Chat view — header, message thread and the welcome / empty state.
 */

import { h, clear, reconcile, qs } from '../core/dom.js';
import { store, actions, findMessage } from '../state/app.js';
import { iconSvg } from './icons.js';
import { openMenu, openPopover, closePopover } from './popover.js';
import {
  escapeHtml,
  findUrls,
  formatDay,
  formatTime,
  initials,
  colorFromString,
  copyText,
  truncate,
} from '../core/utils.js';
import { QUICK_REACTIONS } from './emoji.js';
import { openEmojiPicker } from './emoji-picker.js';
import { bridge } from './bridge.js';

const els = {
  header: null,
  avatar: null,
  title: null,
  subtitle: null,
  scroll: null,
  list: null,
  actions: null,
};

let onReplyRef = null;

/* ------------------------------------------------------------------ *
 * Text rendering
 * ------------------------------------------------------------------ */

/**
 * Render message text as safe HTML: code blocks, inline code, links and
 * line breaks. The input is escaped first, so nothing can inject markup.
 */
export function renderBody(text = '') {
  let html = escapeHtml(text);

  // Fenced code blocks first (their contents are escaped already).
  html = html.replace(/```([\s\S]*?)```/g, (_, code) => `<pre><code>${code.trim()}</code></pre>`);

  // Inline code.
  html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');

  // Links.
  html = html.replace(/(https?:\/\/[^\s<]+)/g, (url) => {
    const safe = url.replace(/[.,;:)]+$/, '');
    const tail = url.slice(safe.length);
    return `<a href="${safe}" target="_blank" rel="noopener noreferrer">${safe}</a>${tail}`;
  });

  // Line breaks (but not inside <pre>).
  return html.replace(/\n/g, '<br>');
}

/* ------------------------------------------------------------------ *
 * Message pieces
 * ------------------------------------------------------------------ */

function statusTick(message) {
  if (message.direction !== 'out') return null;
  const map = {
    sending: { icon: 'clock', cls: '', label: 'Sending…' },
    sent: { icon: 'check', cls: '', label: 'Sent' },
    delivered: { icon: 'checkDouble', cls: '', label: 'Delivered' },
    read: { icon: 'checkDouble', cls: 'is-read', label: 'Seen' },
    failed: { icon: 'x', cls: 'is-failed', label: 'Failed to send' },
  };
  const status = map[message.status] || map.sent;
  return h(
    'span',
    { class: `tick ${status.cls}`, title: status.label, 'aria-label': status.label },
    iconSvg(status.icon, { size: 13 }),
  );
}

function scrollToMessage(messageId) {
  const el = qs(`[data-message-id="${messageId}"]`);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('message-highlight');
    setTimeout(() => el.classList.remove('message-highlight'), 1800);
  }
}

function replyPreview(message) {
  const target = message.replyTo ? findMessage(message.convId, message.replyTo) : null;
  if (!target) return null;
  const author = target.direction === 'out' ? 'You' : store.get(`peers.${target.convId}.profile.name`) || 'Peer';
  return h(
    'div',
    {
      class: 'bubble-reply',
      role: 'button',
      tabindex: '0',
      title: 'Jump to message',
      onClick: (event) => {
        event.stopPropagation();
        scrollToMessage(message.replyTo);
      },
      onKeydown: (event) => {
        if (event.key === 'Enter') {
          event.stopPropagation();
          scrollToMessage(message.replyTo);
        }
      },
    },
    h('span', { class: 'reply-author' }, author),
    h('span', { class: 'reply-text' }, target.deleted ? 'Message deleted' : truncate(target.body || 'Attachment', 90)),
  );
}

function attachmentBlock(message) {
  const attachment = message.attachment;
  if (!attachment) return null;

  if (attachment.kind === 'image' && attachment.dataUrl) {
    return h(
      'div',
      {
        class: 'attachment-image',
        onClick: () => openLightbox(attachment.dataUrl, attachment.name),
      },
      h('img', { src: attachment.dataUrl, alt: attachment.name || 'Shared image' }),
    );
  }

  if (attachment.kind === 'file') {
    return h(
      'a',
      {
        class: 'attachment',
        href: attachment.dataUrl || '#',
        download: attachment.name || 'file',
        title: 'Save file to device storage',
        onClick: (event) => {
          if (!attachment.dataUrl) {
            event.preventDefault();
            actions.toast('File is still transferring…', { type: 'info' });
          }
        },
      },
      h('span', { class: 'attachment-icon' }, iconSvg('file', { size: 18 })),
      h(
        'span',
        { class: 'attachment-meta' },
        h('span', { class: 'attachment-name' }, attachment.name || 'File'),
        h('span', { class: 'attachment-size' }, attachment.sizeLabel || ''),
      ),
      iconSvg('download', { size: 16 }),
    );
  }

  return null;
}

function reactionBar(message) {
  const reactions = message.reactions || {};
  const entries = Object.entries(reactions).filter(([, ids]) => ids.length);
  if (!entries.length) return null;
  return h(
    'div',
    { class: 'reaction-bar' },
    ...entries.map(([emoji, ids]) =>
      h(
        'button',
        {
          class: `reaction-chip${ids.includes(message.id) ? ' is-mine' : ''}`,
          type: 'button',
          title: `${ids.length} reaction${ids.length > 1 ? 's' : ''}`,
          onClick: () => onReaction(message, emoji),
        },
        h('span', {}, emoji),
        h('span', { class: 'count' }, String(ids.length)),
      ),
    ),
  );
}

function messageActions(message) {
  const actionsRow = h('div', { class: 'message-actions' });

  actionsRow.append(
    h(
      'button',
      {
        class: 'message-action',
        title: 'Reply',
        'aria-label': 'Reply to this message',
        onClick: () => onReplyRef?.(message),
      },
      iconSvg('reply', { size: 15 }),
    ),
    h(
      'button',
      {
        class: 'message-action',
        title: 'React',
        'aria-label': 'Add a reaction',
        onClick: (event) => openReactionPicker(event.currentTarget, message),
      },
      iconSvg('smile', { size: 15 }),
    ),
    h(
      'button',
      {
        class: 'message-action',
        title: 'More',
        'aria-label': 'More actions',
        onClick: (event) => openMessageMenu(event.currentTarget, message),
      },
      iconSvg('more', { size: 15 }),
    ),
  );
  return actionsRow;
}

function openReactionPicker(anchor, message) {
  const bar = h(
    'div',
    { class: 'reaction-popover' },
    ...QUICK_REACTIONS.map((emoji) =>
      h(
        'button',
        {
          class: 'reaction-option',
          type: 'button',
          title: emoji,
          onClick: () => {
            closePopover();
            onReaction(message, emoji);
          },
        },
        emoji,
      ),
    ),
    h(
      'button',
      {
        class: 'reaction-option add-reaction-btn',
        type: 'button',
        title: 'More emoji',
        'aria-label': 'More reactions',
        onClick: (event) => {
          closePopover();
          openEmojiPicker(anchor, (emoji) => onReaction(message, emoji));
        },
      },
      iconSvg('plus', { size: 16 }),
    ),
  );
  openPopover(anchor, bar, { align: 'end' });
}

function onReaction(message, emoji) {
  actions.toggleReaction(message.convId, message.id, emoji);
  bridge.sendReaction(message.convId, message.id, emoji);
}

function openMessageMenu(anchor, message) {
  const isOut = message.direction === 'out';
  const items = [
    {
      label: 'Reply',
      icon: 'reply',
      onSelect: () => onReplyRef?.(message),
    },
    {
      label: 'Copy text',
      icon: 'copy',
      onSelect: async () => {
        const ok = await copyText(message.body || '');
        actions.toast(ok ? 'Copied to clipboard' : 'Could not copy', { type: ok ? 'success' : 'error' });
      },
    },
  ];

  if (isOut && !message.deleted) {
    items.push(
      {
        label: 'Edit',
        icon: 'edit',
        onSelect: () => {
          actions.setEditing(message);
          const input = qs('#composer-input');
          if (input) {
            input.value = message.body || '';
            input.focus();
            input.dispatchEvent(new Event('input'));
          }
        },
      },
      {
        label: 'Delete',
        icon: 'trash',
        danger: true,
        onSelect: () => {
          actions.deleteMessage(message.convId, message.id);
          bridge.sendDelete(message.convId, message.id);
        },
      },
    );
  }

  openMenu(anchor, items, { align: 'end' });
}

function openLightbox(src, name) {
  const close = () => lightbox.remove();
  const lightbox = h(
    'div',
    { class: 'lightbox', onClick: close },
    h('img', { src, alt: name || '' }),
    h(
      'button',
      { class: 'icon-btn lightbox-close', 'aria-label': 'Close image', onClick: close },
      iconSvg('x', { size: 20 }),
    ),
  );
  document.addEventListener('keydown', function onKey(event) {
    if (event.key === 'Escape') {
      close();
      document.removeEventListener('keydown', onKey);
    }
  });
  document.body.appendChild(lightbox);
}

function renderMessage(item) {
  const message = item.message;
  const conversation = store.get(`conversations.${message.convId}`) || {};
  const peerName =
    store.get(`peers.${message.convId.replace(/^peer:/, '')}.profile.name`) ||
    conversation.name ||
    'Peer';

  const bubble = h('div', { class: `bubble${message.deleted ? ' is-deleted' : ''}` });

  if (message.deleted) {
    bubble.appendChild(h('span', {}, 'This message was deleted'));
  } else {
    const reply = replyPreview(message);
    if (reply) bubble.appendChild(reply);
    const attachment = attachmentBlock(message);
    if (attachment) bubble.appendChild(attachment);
    if (message.body) {
      bubble.appendChild(h('div', { html: renderBody(message.body) }));
    }
  }

  const meta = h(
    'div',
    { class: 'bubble-meta' },
    message.edited ? h('span', { class: 'edited-tag' }, 'edited') : null,
    h('span', {}, formatTime(message.ts)),
    statusTick(message),
  );

  const stack = h('div', { class: 'message-stack' }, bubble, meta, reactionBar(message));

  const row = h(
    'div',
    {
      class: `message-row is-${message.direction}${item.grouped ? ' is-grouped' : ''}`,
      'data-message-id': message.id,
    },
    h(
      'div',
      { class: 'message-avatar-slot' },
      item.grouped || message.direction === 'out'
        ? null
        : h(
            'div',
            { class: 'avatar avatar-sm' },
            h(
              'span',
              { style: { background: colorFromString(peerName) } },
              initials(peerName),
            ),
          ),
    ),
    stack,
    messageActions(message),
  );

  return row;
}

/* ------------------------------------------------------------------ *
 * Thread building
 * ------------------------------------------------------------------ */

const GROUP_WINDOW = 5 * 60 * 1000;

/** Flatten a conversation into renderable items (dividers, notes, messages). */
export function buildThread(conversation) {
  const items = [];
  const messages = conversation?.messages || [];
  let lastDirection = null;
  let lastTs = 0;
  let lastDay = null;

  for (const message of messages) {
    const day = new Date(message.ts).toDateString();
    if (day !== lastDay) {
      items.push({ type: 'day', id: `day-${day}`, ts: message.ts });
      lastDay = day;
      lastDirection = null;
    }

    if (message.type === 'system') {
      items.push({
        type: 'system',
        id: message.id,
        ts: message.ts,
        text: message.body,
        tone: message.meta?.tone,
      });
      lastDirection = null;
      continue;
    }

    const grouped =
      lastDirection === message.direction && Math.abs(message.ts - lastTs) < GROUP_WINDOW;

    items.push({ type: 'message', id: message.id, ts: message.ts, message, grouped });
    lastDirection = message.direction;
    lastTs = message.ts;
  }

  return items;
}

/* ------------------------------------------------------------------ *
 * Rendering
 * ------------------------------------------------------------------ */

function renderThread() {
  const root = els.list;
  if (!root) return;

  const conversationId = store.get('ui.activeConversationId');
  const conversation = store.get(`conversations.${conversationId}`);

  if (!conversation) {
    clear(root);
    root.appendChild(welcomeView());
    return;
  }

  const items = buildThread(conversation);

  // Keep the view pinned to the bottom unless the user scrolled up.
  const distanceFromBottom =
    els.scroll.scrollHeight - els.scroll.scrollTop - els.scroll.clientHeight;
  const shouldStick = distanceFromBottom < 140;

  if (!items.length) {
    clear(root);
    root.appendChild(
      h(
        'div',
        { class: 'system-note' },
        `No messages yet — share your peer ID so ${conversation.name || 'your peer'} can reach you.`,
      ),
    );
    return;
  }

  reconcile(root, items, {
    key: (item) => `${item.type}-${item.id}`,
    create: (item) => {
      if (item.type === 'day') {
        return h('div', { class: 'day-divider' }, formatDay(item.ts));
      }
      if (item.type === 'system') {
        return h('div', { class: `system-note${item.tone ? ` is-${item.tone}` : ''}` }, item.text);
      }
      return renderMessage(item);
    },
    update: (_element, item) => {
      if (item.type === 'day') {
        return h('div', { class: 'day-divider' }, formatDay(item.ts));
      }
      if (item.type === 'system') {
        return h('div', { class: `system-note${item.tone ? ` is-${item.tone}` : ''}` }, item.text);
      }
      return renderMessage(item);
    },
  });

  if (shouldStick) scrollToBottom();
}

export function scrollToBottom(smooth = false) {
  if (!els.scroll) return;
  els.scroll.scrollTo({
    top: els.scroll.scrollHeight,
    behavior: smooth ? 'smooth' : 'auto',
  });
}

function welcomeView() {
  const features = [
    ['zap', 'Chirp Mode', 'Send text as audible tones — the original experiment, built in.'],
    ['shield', 'Encrypted', 'Optional AES-256-GCM with a passphrase you and your peer share.'],
    ['video', 'Calls', 'Voice and video with screen sharing, mute and a call log.'],
    ['archive', 'Your history', 'Everything is stored locally in your browser.'],
  ];

  return h(
    'div',
    { class: 'welcome' },
    h('div', { class: 'welcome-mark' }, iconSvg('zap', { size: 36 })),
    h('h2', {}, 'Welcome to Chirp'),
    h(
      'p',
      {},
      'A peer-to-peer messenger with no accounts and no server holding your messages. Copy your ID from the sidebar and send it to a friend to get started.',
    ),
    h(
      'div',
      { class: 'row gap-2' },
      h('button', { class: 'btn btn-primary', onClick: () => actions.openModal('connect') }, 'Start a chat'),
      h('button', { class: 'btn', onClick: () => actions.openModal('about') }, 'What is Chirp?'),
    ),
    h(
      'div',
      { class: 'feature-grid' },
      ...features.map(([icon, title, desc]) =>
        h(
          'div',
          { class: 'feature-card' },
          h('span', { class: 'feature-icon' }, iconSvg(icon, { size: 17 })),
          h('h4', {}, title),
          h('p', {}, desc),
        ),
      ),
    ),
  );
}

/* ------------------------------------------------------------------ *
 * Header
 * ------------------------------------------------------------------ */

function renderHeader() {
  const conversationId = store.get('ui.activeConversationId');
  const conversation = store.get(`conversations.${conversationId}`);
  const peerId = conversation?.peerId;
  const peer = peerId ? store.get(`peers.${peerId}`) : null;
  const name = conversation?.name || peer?.profile?.name || peerId || 'Chirp';
  const connected = peer?.status === 'online' || conversationId === 'welcome';

  clear(els.avatar);
  els.avatar.append(
    h(
      'span',
      { style: { background: colorFromString(name) } },
      initials(name),
    ),
  );

  clear(els.title);
  els.title.appendChild(document.createTextNode(name));

  clear(els.subtitle);
  if (conversationId === 'welcome') {
    els.subtitle.appendChild(h('span', {}, 'Welcome screen'));
  } else if (conversation?.typing) {
    els.subtitle.className = 'chat-subtitle is-typing';
    els.subtitle.appendChild(h('span', {}, 'typing…'));
  } else if (connected) {
    els.subtitle.className = 'chat-subtitle';
    els.subtitle.appendChild(h('span', { class: 'status-dot is-online' }));
    els.subtitle.appendChild(h('span', {}, 'Online'));
  } else {
    els.subtitle.className = 'chat-subtitle';
    els.subtitle.appendChild(h('span', {}, conversationId ? 'Offline' : 'Select a conversation'));
  }

  clear(els.actions);
  if (conversationId && conversationId !== 'welcome') {
    els.actions.append(
      h(
        'button',
        {
          class: 'icon-btn',
          title: 'Voice call',
          'aria-label': 'Start a voice call',
          onClick: () => bridge.startCall(conversation.peerId, { video: false }),
        },
        iconSvg('phone', { size: 18 }),
      ),
      h(
        'button',
        {
          class: 'icon-btn',
          title: 'Video call',
          'aria-label': 'Start a video call',
          onClick: () => bridge.startCall(conversation.peerId, { video: true }),
        },
        iconSvg('video', { size: 18 }),
      ),
      h(
        'button',
        {
          class: 'icon-btn',
          title: 'More',
          'aria-label': 'Conversation options',
          onClick: (event) =>
            openMenu(
              event.currentTarget,
              [
                {
                  label: conversation.pinned ? 'Unpin' : 'Pin conversation',
                  icon: 'pin',
                  onSelect: () => actions.togglePin(conversationId),
                },
                {
                  label: conversation.muted ? 'Unmute' : 'Mute notifications',
                  icon: conversation.muted ? 'volume' : 'bellOff',
                  onSelect: () => actions.toggleMuted(conversationId),
                },
                '-',
                {
                  label: 'Clear messages',
                  icon: 'archive',
                  onSelect: () => {
                    store.set(`conversations.${conversationId}.messages`, []);
                    actions.toast('Messages cleared', { type: 'success' });
                  },
                },
                {
                  label: 'Delete conversation',
                  icon: 'trash',
                  danger: true,
                  onSelect: () => {
                    actions.deleteConversation(conversationId);
                    actions.toast('Conversation deleted', { type: 'success' });
                  },
                },
              ],
              { align: 'end' },
            ),
        },
        iconSvg('more', { size: 18 }),
      ),
    );
  }
}

function renderTypingIndicator() {
  const conversationId = store.get('ui.activeConversationId');
  const conversation = store.get(`conversations.${conversationId}`);
  if (!conversation?.typing) return;
  const existing = qs('.typing-row', els.list);
  if (existing) return;
  els.list.appendChild(
    h(
      'div',
      { class: 'message-row is-in typing-row' },
      h('div', { class: 'message-avatar-slot' }),
      h(
        'div',
        { class: 'typing-bubble' },
        h('span', {}),
        h('span', {}),
        h('span', {}),
      ),
    ),
  );
  scrollToBottom();
}

/* ------------------------------------------------------------------ *
 * Mount
 * ------------------------------------------------------------------ */

export function mountChat(root, { onReply } = {}) {
  onReplyRef = onReply;

  const avatarSlot = h('div', { class: 'avatar avatar-lg' });
  const title = h('div', { class: 'chat-title' });
  const subtitle = h('div', { class: 'chat-subtitle', id: 'chat-peer-status' });
  const actions = h('div', { class: 'chat-header-actions' });

  const header = h(
    'div',
    { class: 'chat-header' },
    h(
      'button',
      {
        class: 'icon-btn mobile-only',
        title: 'Back to conversations',
        'aria-label': 'Back to conversations',
        onClick: () => store.set('ui.sidebarOpen', true),
      },
      iconSvg('arrowLeft', { size: 18 }),
    ),
    h(
      'div',
      { class: 'chat-header-info' },
      avatarSlot,
      h('div', { class: 'grow', style: { minWidth: 0 } }, title, subtitle),
    ),
    actions,
  );

  const list = h('div', { class: 'chat-scroll-inner' });
  const scroll = h('div', { class: 'chat-scroll', id: 'chat-scroll' }, list);

  root.append(header, scroll);
  els.header = header;
  els.avatar = avatarSlot;
  els.title = title;
  els.subtitle = subtitle;
  els.actions = actions;
  els.scroll = scroll;
  els.list = list;

  store.subscribe('conversations', renderThread);
  store.subscribe('conversations', renderHeader);
  store.subscribe('ui.activeConversationId', () => {
    renderHeader();
    renderThread();
    scrollToBottom();
  });
  store.subscribe('peers', renderHeader);
  store.subscribe('profile', renderHeader);

  renderHeader();
  renderThread();

  return { scrollToBottom };
}
