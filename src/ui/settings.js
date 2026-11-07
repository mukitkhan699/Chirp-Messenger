/**
 * Settings panel — profile, appearance, privacy, notifications and data.
 */

import { h, clear, qs } from '../core/dom.js';
import { store, actions } from '../state/app.js';
import { iconSvg } from './icons.js';
import { db, settingsStore } from '../services/db.js';
import { notifications } from '../services/notify.js';
import { confirmModal } from './modal.js';
import { formatDistance, formatBytes, initials, colorFromString } from '../core/utils.js';

const ACCENTS = [
  ['indigo', 'Indigo'],
  ['violet', 'Violet'],
  ['cyan', 'Cyan'],
  ['emerald', 'Emerald'],
  ['amber', 'Amber'],
  ['rose', 'Rose'],
];

const WALLPAPERS = [
  ['aurora', 'Aurora'],
  ['grid', 'Grid'],
  ['paper', 'Paper'],
  ['none', 'None'],
];

function section(title, children) {
  return h(
    'div',
    { class: 'settings-group' },
    h('div', { class: 'eyebrow' }, title),
    ...children,
  );
}

function toggleRow(title, description, checked, onChange) {
  const button = h('button', {
    class: 'switch',
    role: 'switch',
    type: 'button',
    'aria-checked': String(Boolean(checked)),
    'aria-label': title,
    onClick: () => {
      const next = button.getAttribute('aria-checked') !== 'true';
      button.setAttribute('aria-checked', String(next));
      onChange(next);
    },
  });
  return h(
    'div',
    { class: 'settings-row' },
    h(
      'div',
      { class: 'settings-row-text' },
      h('div', { class: 'settings-row-title' }, title),
      description ? h('div', { class: 'settings-row-desc' }, description) : null,
    ),
    button,
  );
}

function selectRow(title, description, options, current, onChange) {
  const select = h(
    'select',
    { class: 'select', style: { width: 'auto', minWidth: '140px' }, onChange: (e) => onChange(e.target.value) },
    ...options.map(([value, label]) =>
      h('option', { value, selected: value === current }, label),
    ),
  );
  return h(
    'div',
    { class: 'settings-row' },
    h(
      'div',
      { class: 'settings-row-text' },
      h('div', { class: 'settings-row-title' }, title),
      description ? h('div', { class: 'settings-row-desc' }, description) : null,
    ),
    select,
  );
}

function profileSection() {
  const profile = store.get('profile');

  return section('Profile', [
    h(
      'div',
      { class: 'settings-row' },
      h(
        'div',
        { class: 'avatar avatar-lg' },
        profile.avatar
          ? h('img', { src: profile.avatar, alt: '' })
          : h('span', { style: { background: colorFromString(profile.name || 'chirp') } },
              initials(profile.name || 'chirp')),
      ),
      h(
        'div',
        { class: 'settings-row-text' },
        h('div', { class: 'settings-row-title' }, profile.name || 'Set a display name'),
        h('div', { class: 'settings-row-desc' }, profile.status || 'Available'),
      ),
      h(
        'button',
        { class: 'btn btn-sm', onClick: () => actions.openModal('profile') },
        'Edit',
      ),
    ),
    h(
      'div',
      { class: 'settings-row' },
      h(
        'div',
        { class: 'settings-row-text' },
        h('div', { class: 'settings-row-title' }, 'Your peer ID'),
        h('div', { class: 'settings-row-desc' }, store.get('connection.peerId') || 'Not connected yet'),
      ),
      h(
        'button',
        { class: 'btn btn-sm', onClick: () => actions.openModal('newId') },
        'Change',
      ),
    ),
  ]);
}

function appearanceSection() {
  const settings = store.get('settings');

  const themeButtons = h(
    'div',
    { class: 'segmented' },
    ...[
      ['system', 'Auto', 'monitor'],
      ['light', 'Light', 'sun'],
      ['dark', 'Dark', 'moon'],
    ].map(([value, label, icon]) =>
      h(
        'button',
        {
          type: 'button',
          role: 'tab',
          'aria-selected': String(settings.theme === value),
          onClick: () => {
            actions.setSetting('theme', value);
            applyTheme();
          },
        },
        h('span', { class: 'row gap-1' }, iconSvg(icon, { size: 14 }), label),
      ),
    ),
  );

  const accentRow = h(
    'div',
    { class: 'row gap-2', style: { flexWrap: 'wrap' } },
    ...ACCENTS.map(([value, label]) =>
      h(
        'button',
        {
          class: 'accent-dot',
          type: 'button',
          title: label,
          'aria-label': `${label} accent`,
          'data-accent-value': value,
          style: { background: `hsl(${accentHue(value)} 70% 58%)` },
          onClick: () => {
            actions.setSetting('accent', value);
            applyTheme();
          },
        },
      ),
    ),
  );

  const wallpaperRow = h(
    'div',
    { class: 'segmented' },
    ...WALLPAPERS.map(([value, label]) =>
      h(
        'button',
        {
          type: 'button',
          role: 'tab',
          'aria-selected': String(settings.wallpaper === value),
          onClick: () => {
            actions.setSetting('wallpaper', value);
            applyTheme();
          },
        },
        label,
      ),
    ),
  );

  return section('Appearance', [
    h(
      'div',
      { class: 'settings-row' },
      h(
        'div',
        { class: 'settings-row-text' },
        h('div', { class: 'settings-row-title' }, 'Theme'),
        h('div', { class: 'settings-row-desc' }, 'Follow the system or pick one'),
      ),
      themeButtons,
    ),
    h(
      'div',
      { class: 'settings-row' },
      h(
        'div',
        { class: 'settings-row-text' },
        h('div', { class: 'settings-row-title' }, 'Accent colour'),
      ),
      accentRow,
    ),
    h(
      'div',
      { class: 'settings-row' },
      h(
        'div',
        { class: 'settings-row-text' },
        h('div', { class: 'settings-row-title' }, 'Chat background'),
      ),
      wallpaperRow,
    ),
    toggleRow('Compact mode', 'Tighter spacing and smaller avatars', settings.compactMode, (value) =>
      actions.setSetting('compactMode', value),
    ),
  ]);
}

function accentHue(name) {
  const map = { indigo: 243, violet: 268, cyan: 190, emerald: 158, amber: 36, rose: 346 };
  return map[name] ?? 243;
}

function privacySection() {
  const settings = store.get('settings');
  return section('Privacy & security', [
    h(
      'div',
      { class: 'settings-row' },
      h(
        'div',
        { class: 'settings-row-text' },
        h('div', { class: 'settings-row-title' }, 'End-to-end encryption'),
        h(
          'div',
          { class: 'settings-row-desc' },
          'Encrypt message payloads with a passphrase you and your peer share.',
        ),
      ),
      h(
        'button',
        { class: 'btn btn-sm', onClick: () => actions.openModal('encryption') },
        'Configure',
      ),
    ),
    toggleRow('Read receipts', 'Let peers know when you have read their message', settings.readReceipts, (value) =>
      actions.setSetting('readReceipts', value),
    ),
    toggleRow('Typing indicators', 'Show others when you are typing', settings.typingIndicators, (value) =>
      actions.setSetting('typingIndicators', value),
    ),
  ]);
}

function chirpSection() {
  const settings = store.get('settings');
  const status = h('div', { class: 'chirp-panel hidden' });

  const syncStatus = () => {
    const listening = store.get('ui.chirpListening');
    status.classList.toggle('hidden', !listening);
    if (!listening) return;
    clear(status);
    status.append(
      iconSvg('radio', { size: 16 }),
      h('span', {}, `Listening for chirps… ${store.get('ui.chirpStatus') || ''}`.trim()),
    );
  };

  store.subscribe('ui.chirpListening', syncStatus);
  store.subscribe('ui.chirpStatus', syncStatus);
  syncStatus();

  return section('Chirp Mode', [
    h(
      'p',
      { class: 'muted', style: { fontSize: 'var(--text-xs)', lineHeight: '1.6' } },
      'Chirp Mode plays outgoing messages as audible tones and decodes tones captured by your microphone — the original Chirp experiment, built into the messenger.',
    ),
    toggleRow(
      'Send messages as tones',
      'Outgoing messages play as audible tones as well as being delivered',
      settings.chirpMode,
      (value) => actions.setSetting('chirpMode', value),
    ),
    toggleRow(
      'Listen for chirps',
      'Use the microphone to turn audible tones into messages',
      settings.chirpListen,
      (value) => actions.setSetting('chirpListen', value),
    ),
    status,
  ]);
}

function notificationsSection() {
  const settings = store.get('settings');
  const permission = notifications.permission;

  return section('Notifications', [
    toggleRow('Desktop notifications', 'Show a system notification for new messages', settings.notifications, async (value) => {
      actions.setSetting('notifications', value);
      if (value && permission !== 'granted') {
        const result = await notifications.request();
        if (result !== 'granted') {
          actions.setSetting('notifications', false);
          actions.toast('Notification permission was blocked by the browser', { type: 'warning' });
        }
      }
    }),
    toggleRow('Sounds', 'Play a chime for messages and a ringtone for calls', settings.sounds, (value) =>
      actions.setSetting('sounds', value),
    ),
    toggleRow('Link previews', 'Expand links with a preview card', settings.linkPreviews, (value) =>
      actions.setSetting('linkPreviews', value),
    ),
  ]);
}

function callsSection() {
  const history = store.get('calls.history') || [];

  const items = history.length
    ? history.slice(0, 12).map((entry) =>
        h(
          'div',
          { class: 'call-log-item' },
          h(
            'span',
            { class: `call-log-icon is-${entry.direction === 'in' ? 'in' : 'out'}` },
            iconSvg(entry.direction === 'in' ? 'phoneIncoming' : 'phone', { size: 16 }),
          ),
          h(
            'div',
            { class: 'grow' },
            h('div', { style: { fontSize: 'var(--text-sm)' } }, entry.peerName || entry.peerId),
            h('div', { class: 'muted', style: { fontSize: 'var(--text-2xs)' } }, formatDistance(entry.at)),
          ),
          h(
            'span',
            { class: `badge ${entry.answered ? 'badge-success' : 'badge-danger'}` },
            entry.answered ? 'Connected' : 'Missed',
          ),
        ),
      )
    : [h('div', { class: 'muted', style: { fontSize: 'var(--text-xs)' } }, 'No calls yet.')];

  return section('Calls', items);
}

function dataSection() {
  const storageUsage = h('span', { class: 'muted', style: { fontSize: 'var(--text-xs)' } }, 'Calculating…');
  db.usage().then(({ usage, quota }) => {
    storageUsage.textContent = quota
      ? `${formatBytes(usage)} used of ${formatBytes(quota)}`
      : `${formatBytes(usage)} used`;
  });

  return section('Data', [
    h(
      'div',
      { class: 'settings-row' },
      h(
        'div',
        { class: 'settings-row-text' },
        h('div', { class: 'settings-row-title' }, 'Local storage'),
        h('div', { class: 'settings-row-desc' }, 'Your chat history never leaves this device'),
      ),
      storageUsage,
    ),
    h(
      'div',
      { class: 'settings-row' },
      h(
        'div',
        { class: 'settings-row-text' },
        h('div', { class: 'settings-row-title' }, 'Export chat history'),
        h('div', { class: 'settings-row-desc' }, 'Download all conversations as JSON'),
      ),
      h(
        'button',
        {
          class: 'btn btn-sm',
          onClick: async () => {
            const conversations = store.get('conversations') || {};
            const payload = JSON.stringify(
              {
                exportedAt: new Date().toISOString(),
                conversations: Object.values(conversations).map((c) => ({
                  name: c.name,
                  peerId: c.peerId,
                  messages: (c.messages || []).map((m) => ({
                    direction: m.direction,
                    body: m.body,
                    ts: m.ts,
                    type: m.type,
                  })),
                })),
              },
              null,
              2,
            );
            const blob = new Blob([payload], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `chirp-history-${Date.now()}.json`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            actions.toast('Chat history exported', { type: 'success' });
          },
        },
        'Export',
      ),
    ),
    h(
      'div',
      { class: 'settings-row' },
      h(
        'div',
        { class: 'settings-row-text' },
        h('div', { class: 'settings-row-title' }, 'Clear all conversations'),
        h('div', { class: 'settings-row-desc' }, 'Delete every message stored on this device'),
      ),
      h(
        'button',
        {
          class: 'btn btn-sm btn-danger',
          onClick: async () => {
            const ok = await confirmModal({
              title: 'Clear all conversations?',
              message: 'Every message and conversation on this device will be permanently deleted.',
              confirmLabel: 'Delete everything',
              danger: true,
            });
            if (ok) {
              actions.clearAllChats();
              await db.clear('messages');
              actions.toast('All conversations cleared', { type: 'success' });
            }
          },
        },
        'Clear',
      ),
    ),
    h(
      'div',
      { class: 'settings-row' },
      h(
        'div',
        { class: 'settings-row-text' },
        h('div', { class: 'settings-row-title' }, 'Reset settings'),
        h('div', { class: 'settings-row-desc' }, 'Restore every preference to its default'),
      ),
      h(
        'button',
        {
          class: 'btn btn-sm',
          onClick: async () => {
            const ok = await confirmModal({
              title: 'Reset settings?',
              message: 'Theme, notifications and privacy preferences will be restored to defaults.',
              confirmLabel: 'Reset',
            });
            if (ok) {
              actions.resetSettings();
              applyTheme();
              actions.toast('Settings reset', { type: 'success' });
            }
          },
        },
        'Reset',
      ),
    ),
  ]);
}

/** Apply theme + accent + wallpaper to the document. */
export function applyTheme() {
  const settings = store.get('settings');
  const root = document.documentElement;

  const resolved =
    settings.theme === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : settings.theme;

  root.dataset.theme = resolved;
  root.dataset.accent = settings.accent || 'indigo';
  root.dataset.wallpaper = settings.wallpaper || 'aurora';
  root.classList.toggle('is-compact', Boolean(settings.compactMode));
}

export function mountSettings(root) {
  const body = h('div', { class: 'panel-body' });
  const panel = h(
    'div',
    { class: 'panel', id: 'settings-panel' },
    h(
      'div',
      { class: 'panel-header' },
      h('h2', { class: 'chat-title' }, 'Settings'),
      h(
        'button',
        {
          class: 'icon-btn',
          style: { marginLeft: 'auto' },
          'aria-label': 'Close settings',
          onClick: () => actions.setPanel(null),
        },
        iconSvg('x', { size: 18 }),
      ),
    ),
    body,
  );
  root.appendChild(panel);

  const scrim = h('div', { class: 'scrim', onClick: () => actions.setPanel(null) });
  root.appendChild(scrim);

  const render = () => {
    clear(body);
    body.append(
      profileSection(),
      appearanceSection(),
      privacySection(),
      chirpSection(),
      notificationsSection(),
      callsSection(),
      dataSection(),
      h(
        'div',
        { class: 'row gap-2', style: { justifyContent: 'center', paddingTop: 'var(--space-2)' } },
        h(
          'button',
          { class: 'btn btn-sm btn-ghost', onClick: () => actions.openModal('about') },
          iconSvg('info', { size: 15 }),
          'About Chirp',
        ),
      ),
    );
    // Mark the active accent.
    const active = qs('.accent-dot.is-active');
    if (active) active.classList.remove('is-active');
    const current = qs(`[data-accent-value="${store.get('settings.accent')}"]`);
    if (current) current.classList.add('is-active');
  };

  store.subscribe('ui.panel', (name) => {
    panel.classList.toggle('is-open', name === 'settings');
    scrim.classList.toggle('is-open', name === 'settings');
  });
  store.subscribe('settings', render);
  store.subscribe('profile', render);
  store.subscribe('calls.history', render);

  render();

  return { panel };
}
