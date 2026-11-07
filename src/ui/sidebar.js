/**
 * Sidebar — identity, search and the conversation list.
 */

import { h, clear, reconcile, qs } from '../core/dom.js';
import { store, actions, listConversations } from '../state/app.js';
import { iconSvg } from './icons.js';
import { openMenu } from './popover.js';
import { copyText, initials, colorFromString, formatRelative, truncate } from '../core/utils.js';
import { openConnectModal } from './dialogs.js';

const listEl = { current: null };
const searchEl = { current: null };
const identityEl = { current: null };

function conversationPreview(conversation) {
  const messages = conversation.messages || [];
  const last = messages[messages.length - 1];
  if (!last) return { text: 'No messages yet', draft: false };
  const prefix = last.direction === 'out' ? 'You: ' : '';
  if (last.type === 'file') {
    return { text: `${prefix}📎 ${last.attachment?.name || 'Attachment'}`, draft: false };
  }
  if (last.deleted) return { text: `${prefix}Message deleted`, draft: false };
  return { text: prefix + truncate(last.body || '', 48), draft: false };
}

function conversationItem(conversation) {
  const isActive = store.get('ui.activeConversationId') === conversation.id;
  const preview = conversationPreview(conversation);
  const status = store.get(`peers.${conversation.peerId}.status`);
  const unread = conversation.unread || 0;

  const item = h(
    'button',
    {
      class: `conversation-item${isActive ? ' is-active' : ''}`,
      type: 'button',
      'data-conv-id': conversation.id,
      onClick: () => actions.setActiveConversation(conversation.id),
      onContextmenu: (event) => {
        event.preventDefault();
        openConversationMenu(event.currentTarget, conversation);
      },
    },
    h(
      'div',
      { class: 'avatar' },
      conversation.avatar
        ? h('img', { src: conversation.avatar, alt: '' })
        : h('span', { style: { background: colorFromString(conversation.name || conversation.peerId) } },
            initials(conversation.name || conversation.peerId)),
      status === 'online'
        ? h('span', { class: 'avatar-status is-online' })
        : null,
    ),
    h(
      'div',
      { class: 'conversation-body' },
      h(
        'div',
        { class: 'conversation-top' },
        h('span', { class: 'conversation-name' }, conversation.name || conversation.peerId),
        h('span', { class: 'conversation-time' }, formatRelative(conversation.lastActivity)),
      ),
      h(
        'div',
        { class: 'conversation-preview' },
        conversation.typing
          ? h('span', { class: 'draft-tag' }, 'typing…')
          : h('span', { class: 'truncate' }, preview.text),
      ),
    ),
    conversation.pinned ? h('span', { class: 'pinned-flag' }, iconSvg('pin', { size: 13 })) : null,
    unread ? h('span', { class: 'unread-pill' }, unread > 99 ? '99+' : String(unread)) : null,
  );
  return item;
}

function openConversationMenu(anchor, conversation) {
  openMenu(anchor, [
    {
      label: conversation.pinned ? 'Unpin conversation' : 'Pin conversation',
      icon: 'pin',
      onSelect: () => actions.togglePin(conversation.id),
    },
    {
      label: conversation.muted ? 'Unmute' : 'Mute notifications',
      icon: conversation.muted ? 'volume' : 'bellOff',
      onSelect: () => actions.toggleMuted(conversation.id),
    },
    '-',
    {
      label: 'Delete conversation',
      icon: 'trash',
      danger: true,
      onSelect: () => {
        actions.deleteConversation(conversation.id);
        actions.toast('Conversation deleted', { type: 'success' });
      },
    },
  ]);
}

function renderConversations() {
  const root = listEl.current;
  if (!root) return;

  const query = (store.get('ui.searchQuery') || '').trim().toLowerCase();
  let conversations = listConversations();

  if (query) {
    conversations = conversations.filter((conversation) => {
      const inName = (conversation.name || '').toLowerCase().includes(query);
      const inMessages = (conversation.messages || []).some((m) =>
        (m.body || '').toLowerCase().includes(query),
      );
      return inName || inMessages;
    });
  }

  if (!conversations.length) {
    clear(root);
    root.appendChild(
      h(
        'div',
        { class: 'empty-state' },
        iconSvg(query ? 'search' : 'chat', { size: 30 }),
        h('span', {}, query ? 'No conversations match your search' : 'No conversations yet'),
        query
          ? null
          : h(
              'button',
              { class: 'btn btn-soft btn-sm', onClick: () => openConnectModal() },
              'Start a chat',
            ),
      ),
    );
    return;
  }

  reconcile(root, conversations, {
    key: (conversation) => conversation.id,
    create: conversationItem,
    update: (_element, conversation) => conversationItem(conversation),
  });
}

function renderIdentity() {
  const root = identityEl.current;
  if (!root) return;

  const profile = store.get('profile');
  const connection = store.get('connection');
  // Only show the live peer ID — the persisted one may already be stale.
  const peerId = connection.peerId || 'connecting…';
  const statusClass =
    connection.status === 'online'
      ? 'is-online'
      : connection.status === 'connecting' || connection.status === 'reconnecting'
        ? 'is-connecting'
        : connection.status === 'error'
          ? 'is-error'
          : '';

  clear(root);
  root.append(
    h(
      'div',
      { class: 'identity-row' },
      h(
        'div',
        { class: 'avatar avatar-lg' },
        profile.avatar
          ? h('img', { src: profile.avatar, alt: '' })
          : h('span', { style: { background: colorFromString(profile.name || peerId) } },
              initials(profile.name || peerId)),
      ),
      h(
        'div',
        { class: 'grow' },
        h('div', { class: 'identity-name' }, profile.name || peerId),
        h(
          'div',
          { class: 'identity-status' },
          h('span', { class: `status-dot ${statusClass}` }),
          h(
            'span',
            {},
            connection.status === 'online'
              ? 'Online'
              : connection.status === 'connecting'
                ? 'Connecting…'
                : connection.status === 'reconnecting'
                  ? 'Reconnecting…'
                  : connection.status === 'error'
                    ? 'Connection error'
                    : 'Offline',
          ),
        ),
      ),
      h(
        'button',
        {
          class: 'icon-btn',
          title: 'Profile & settings',
          'aria-label': 'Profile and settings',
          onClick: () => actions.setPanel('settings'),
        },
        iconSvg('settings', { size: 18 }),
      ),
    ),
    h(
      'div',
      { class: 'id-chip' },
      h('span', { class: 'grow', id: 'own-peer-id' }, peerId),
      h(
        'button',
        {
          class: 'icon-btn',
          style: { width: '26px', height: '26px' },
          title: 'Copy your ID',
          'aria-label': 'Copy your peer ID',
          onClick: async () => {
            const ok = await copyText(peerId);
            actions.toast(ok ? 'Peer ID copied' : 'Could not copy', {
              type: ok ? 'success' : 'error',
            });
          },
        },
        iconSvg('copy', { size: 14 }),
      ),
      h(
        'button',
        {
          class: 'icon-btn',
          style: { width: '26px', height: '26px' },
          title: 'New ID',
          'aria-label': 'Generate a new peer ID',
          onClick: () => actions.openModal('newId'),
        },
        iconSvg('refresh', { size: 14 }),
      ),
    ),
  );
}

export function mountSidebar(root) {
  const header = h(
    'div',
    { class: 'sidebar-header' },
    h(
      'div',
      { class: 'brand' },
      h('span', { class: 'brand-mark' }, iconSvg('zap', { size: 18 })),
      h('span', {}, 'Chirp'),
    ),
    h(
      'div',
      { class: 'sidebar-actions' },
      h(
        'button',
        {
          class: 'icon-btn mobile-only',
          title: 'Conversations',
          'aria-label': 'Show conversations',
          onClick: () => store.set('ui.sidebarOpen', true),
        },
        iconSvg('chat', { size: 18 }),
      ),
      h(
        'button',
        {
          class: 'icon-btn',
          title: 'New chat',
          'aria-label': 'Start a new chat',
          onClick: () => openConnectModal(),
        },
        iconSvg('plus', { size: 18 }),
      ),
      h(
        'button',
        {
          class: 'icon-btn',
          title: 'Settings',
          'aria-label': 'Open settings',
          onClick: () => actions.setPanel('settings'),
        },
        iconSvg('settings', { size: 18 }),
      ),
    ),
  );

  const search = h(
    'div',
    { class: 'sidebar-search' },
    h(
      'div',
      { class: 'input-group' },
      h('span', { class: 'input-icon' }, iconSvg('search', { size: 16 })),
      h('input', {
        class: 'input',
        type: 'search',
        placeholder: 'Search conversations',
        'aria-label': 'Search conversations',
        onInput: (event) => actions.setSearchQuery(event.target.value),
      }),
    ),
  );

  const list = h('div', { class: 'conversation-list', id: 'conversation-list' });
  const identity = h('div', { class: 'identity' });

  root.append(header, search, list, identity);
  listEl.current = list;
  searchEl.current = qs('input', search);
  identityEl.current = identity;

  store.subscribe('conversations', renderConversations);
  store.subscribe('ui.searchQuery', () => {
    renderConversations();
  });
  store.subscribe('ui.activeConversationId', renderConversations);
  store.subscribe('profile', renderIdentity);
  store.subscribe('connection', renderIdentity);
  store.subscribe('peers', renderConversations);

  renderConversations();
  renderIdentity();
}
