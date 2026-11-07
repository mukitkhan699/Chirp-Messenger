/**
 * Composer — the message input bar.
 *
 * Handles text entry, attachments (click, drag & drop and paste), emoji
 * insertion, replies, edits and the Chirp Mode toggle.
 */

import { h, clear, qs } from '../core/dom.js';
import { store, actions } from '../state/app.js';
import { iconSvg } from './icons.js';
import { openEmojiPicker } from './emoji-picker.js';
import { bridge } from './bridge.js';
import { debounce, formatBytes, readFileAsBase64 } from '../core/utils.js';

const MAX_FILE_BYTES = 12 * 1024 * 1024;

const els = {
  wrap: null,
  input: null,
  send: null,
  banner: null,
  chirpToggle: null,
};

let lastTypingSent = 0;
let typingTimer = null;

function currentConversationId() {
  return store.get('ui.activeConversationId');
}

function isDisabled() {
  const id = currentConversationId();
  if (!id || id === 'welcome') return true;
  return false;
}

function autoResize() {
  const input = els.input;
  if (!input) return;
  input.style.height = 'auto';
  input.style.height = `${Math.min(input.scrollHeight, 148)}px`;
}

/* ------------------------------------------------------------------ *
 * Banner (reply / edit)
 * ------------------------------------------------------------------ */

function renderBanner() {
  const banner = els.banner;
  if (!banner) return;
  clear(banner);

  const editing = store.get('ui.editing');
  const replyTo = store.get('ui.replyTo');

  if (editing) {
    banner.classList.remove('hidden');
    banner.append(
      h('span', { class: 'feature-icon' }, iconSvg('edit', { size: 15 })),
      h(
        'span',
        { class: 'grow truncate' },
        h('span', { style: { fontWeight: '600' } }, 'Editing message'),
      ),
      h(
        'button',
        {
          class: 'icon-btn',
          'aria-label': 'Cancel edit',
          onClick: () => {
            actions.setEditing(null);
            els.input.value = '';
            autoResize();
          },
        },
        iconSvg('x', { size: 15 }),
      ),
    );
    return;
  }

  if (replyTo) {
    banner.classList.remove('hidden');
    banner.append(
      h('span', { class: 'feature-icon' }, iconSvg('reply', { size: 15 })),
      h(
        'span',
        { class: 'grow truncate' },
        h('span', { style: { fontWeight: '600' } }, 'Replying to'),
      ),
      h(
        'button',
        {
          class: 'icon-btn',
          'aria-label': 'Cancel reply',
          onClick: () => actions.setReplyTo(null),
        },
        iconSvg('x', { size: 15 }),
      ),
    );
    return;
  }

  banner.classList.add('hidden');
}

/* ------------------------------------------------------------------ *
 * Sending
 * ------------------------------------------------------------------ */

function doSend() {
  const convId = currentConversationId();
  if (!convId || convId === 'welcome') return;

  const text = els.input.value.trim();
  if (!text) return;

  const editing = store.get('ui.editing');
  if (editing) {
    bridge.sendEdit(convId, editing.id, text);
    actions.setEditing(null);
  } else {
    bridge.sendMessage(convId, text);
  }

  els.input.value = '';
  autoResize();
  bridge.sendTyping(convId, false);
  lastTypingSent = 0;
}

/* ------------------------------------------------------------------ *
 * Attachments
 * ------------------------------------------------------------------ */

async function handleFiles(fileList) {
  const convId = currentConversationId();
  if (!convId || convId === 'welcome') return;

  for (const file of Array.from(fileList || [])) {
    if (file.size > MAX_FILE_BYTES) {
      actions.toast(`${file.name} is too large (max ${formatBytes(MAX_FILE_BYTES)})`, {
        type: 'error',
      });
      continue;
    }
    try {
      const isImage = file.type.startsWith('image/');
      const dataUrl = await readFileAsBase64(file);
      await bridge.sendFile(convId, file, {
        dataUrl,
        kind: isImage ? 'image' : 'file',
      });
    } catch (err) {
      actions.toast(`Could not attach ${file.name}`, { type: 'error' });
    }
  }
}

/* ------------------------------------------------------------------ *
 * Mount
 * ------------------------------------------------------------------ */

export function mountComposer(root) {
  const input = h('textarea', {
    class: 'composer-input',
    id: 'composer-input',
    rows: '1',
    placeholder: 'Write a message…',
    'aria-label': 'Message',
    onInput: () => {
      autoResize();
      const convId = currentConversationId();
      if (!convId || convId === 'welcome') return;
      const now = Date.now();
      if (now - lastTypingSent > 2500) {
        lastTypingSent = now;
        bridge.sendTyping(convId, true);
      }
      clearTimeout(typingTimer);
      typingTimer = setTimeout(() => {
        bridge.sendTyping(convId, false);
        lastTypingSent = 0;
      }, 3000);
    },
    onKeydown: (event) => {
      const enterToSend = store.get('settings.enterToSend') !== false;
      if (event.key === 'Enter' && !event.shiftKey && enterToSend) {
        event.preventDefault();
        doSend();
      }
      if (event.key === 'Escape') {
        actions.setReplyTo(null);
        actions.setEditing(null);
      }
    },
    onPaste: (event) => {
      const files = Array.from(event.clipboardData?.files || []);
      if (files.length) {
        event.preventDefault();
        handleFiles(files);
      }
    },
  });

  const sendButton = h(
    'button',
    {
      class: 'composer-send',
      id: 'composer-send',
      type: 'button',
      title: 'Send (Enter)',
      'aria-label': 'Send message',
      disabled: true,
      onClick: doSend,
    },
    iconSvg('send', { size: 18 }),
  );

  const emojiButton = h(
    'button',
    {
      class: 'icon-btn',
      type: 'button',
      title: 'Emoji',
      'aria-label': 'Insert emoji',
      onClick: (event) => {
        openEmojiPicker(event.currentTarget, (emoji) => {
          const start = els.input.selectionStart ?? els.input.value.length;
          const end = els.input.selectionEnd ?? els.input.value.length;
          els.input.value = els.input.value.slice(0, start) + emoji + els.input.value.slice(end);
          els.input.focus();
          els.input.selectionStart = els.input.selectionEnd = start + emoji.length;
          autoResize();
        });
      },
    },
    iconSvg('smile', { size: 19 }),
  );

  const attachButton = h(
    'button',
    {
      class: 'icon-btn',
      type: 'button',
      title: 'Attach a file',
      'aria-label': 'Attach a file',
      onClick: () => fileInput.click(),
    },
    iconSvg('paperclip', { size: 19 }),
  );

  const chirpButton = h(
    'button',
    {
      class: 'icon-btn',
      type: 'button',
      id: 'chirp-toggle',
      title: 'Chirp Mode — send this message as audible tones',
      'aria-label': 'Toggle Chirp Mode',
      'aria-pressed': 'false',
      onClick: () => {
        const next = !store.get('settings.chirpMode');
        actions.setSetting('chirpMode', next);
        actions.toast(
          next ? 'Chirp Mode on — messages play as tones' : 'Chirp Mode off',
          { type: 'info' },
        );
      },
    },
    iconSvg('zap', { size: 19 }),
  );

  const fileInput = h('input', {
    type: 'file',
    multiple: true,
    class: 'hidden',
    onChange: (event) => {
      handleFiles(event.target.files);
      event.target.value = '';
    },
  });

  const banner = h('div', { class: 'chirp-panel hidden', style: { marginBottom: 'var(--space-2)' } });

  const tools = h('div', { class: 'composer-tools' }, emojiButton, attachButton, chirpButton, sendButton);

  const composer = h(
    'div',
    { class: 'composer' },
    input,
    tools,
  );

  const wrap = h('div', { class: 'composer-wrap' }, banner, composer, fileInput);

  // Drag & drop anywhere on the composer.
  composer.addEventListener('dragover', (event) => {
    event.preventDefault();
    composer.style.borderColor = 'var(--accent)';
  });
  composer.addEventListener('dragleave', () => {
    composer.style.borderColor = '';
  });
  composer.addEventListener('drop', (event) => {
    event.preventDefault();
    composer.style.borderColor = '';
    if (event.dataTransfer?.files?.length) handleFiles(event.dataTransfer.files);
  });

  root.appendChild(wrap);

  els.wrap = wrap;
  els.input = input;
  els.send = sendButton;
  els.banner = banner;
  els.chirpToggle = chirpButton;

  store.subscribe('ui.replyTo', renderBanner);
  store.subscribe('ui.editing', renderBanner);
  const syncComposer = () => {
    const disabled = isDisabled();
    input.disabled = disabled;
    sendButton.disabled = disabled;
    input.placeholder = disabled ? 'Select a conversation to start chatting' : 'Write a message…';
    input.value = store.get(`conversations.${currentConversationId()}.draft`) || '';
    autoResize();
    renderBanner();
  };

  store.subscribe('ui.activeConversationId', syncComposer);
  store.subscribe('settings.chirpMode', (enabled) => {
    chirpButton.classList.toggle('is-active', Boolean(enabled));
    chirpButton.setAttribute('aria-pressed', String(Boolean(enabled)));
  });

  // Restore the draft for the active conversation.
  syncComposer();

  return {
    focus: () => els.input?.focus(),
    get value() {
      return els.input?.value || '';
    },
  };
}

export { qs };
