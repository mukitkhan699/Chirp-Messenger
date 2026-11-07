/**
 * Dialogs — the modal content for connecting, profiling, identity and
 * encryption. Each dialog is registered with the modal system and opened
 * through the store.
 */

import { h } from '../core/dom.js';
import { defineModal } from './modal.js';
import { actions, store } from '../state/app.js';
import { iconSvg } from './icons.js';
import { e2eeSession } from '../runtime.js';
import { bridge } from './bridge.js';
import { copyText, initials, colorFromString } from '../core/utils.js';
import { E2EE } from '../services/crypto.js';

/* ------------------------------------------------------------------ *
 * Connect to a peer
 * ------------------------------------------------------------------ */

defineModal('connect', ({ initial = '' } = {}) => {
  const input = h('input', {
    class: 'input',
    type: 'text',
    placeholder: 'e.g. ada-lovelace',
    value: initial,
    autocomplete: 'off',
    spellcheck: 'false',
  });

  const submit = () => {
    const peerId = input.value.trim();
    if (!peerId) {
      actions.toast('Enter a peer ID first', { type: 'warning' });
      input.focus();
      return;
    }
    actions.closeModal();
    bridge.connect(peerId);
    actions.toast(`Connecting to ${peerId}…`, { type: 'info' });
  };

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') submit();
  });

  return {
    title: 'Start a conversation',
    subtitle: 'Share your peer ID with a friend, then enter theirs to connect.',
    body: [
      h(
        'div',
        { class: 'field' },
        h('label', { class: 'label', for: 'connect-peer-id' }, 'Their peer ID'),
        input,
      ),
      h(
        'div',
        {
          class: 'chirp-panel',
          style: {
            background: 'var(--surface-2)',
            borderColor: 'var(--border)',
            color: 'var(--text-muted)',
          },
        },
        iconSvg('info', { size: 16 }),
        h(
          'span',
          {},
          'Chirp is peer-to-peer: messages travel directly between browsers over WebRTC.',
        ),
      ),
    ],
    footer: [
      () => h('button', { class: 'btn btn-ghost', onClick: () => actions.closeModal() }, 'Cancel'),
      () => h('button', { class: 'btn btn-primary', onClick: submit }, 'Connect'),
    ],
  };
});

/** Open the "start a conversation" dialog. */
export function openConnectModal(initial = '') {
  actions.openModal('connect', { initial });
}

/* ------------------------------------------------------------------ *
 * New peer ID
 * ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ *
 * Username onboarding (first launch)
 * ------------------------------------------------------------------ */

defineModal('usernamePrompt', ({ onSave } = {}) => {
  const input = h('input', {
    class: 'input',
    type: 'text',
    id: 'onboarding-username-input',
    placeholder: 'Enter your username (e.g. alex)',
    autocomplete: 'username',
    spellcheck: 'false',
    autofocus: 'true',
  });

  const submit = () => {
    const value = input.value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (!value) {
      actions.toast('Please enter a username to continue', { type: 'warning' });
      input.focus();
      return;
    }
    actions.closeModal();
    actions.setProfile({ name: value, peerId: value, username: value });
    actions.toast(`Welcome, ${value}!`, { type: 'success' });
    if (onSave) {
      onSave(value);
    } else {
      window.dispatchEvent(new CustomEvent('chirp:restart-peer', { detail: { peerId: value } }));
    }
  };

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') submit();
  });

  return {
    title: 'Choose your username',
    subtitle: 'Welcome to Chirp! Choose a username to identify yourself in chats and calls.',
    body: [
      h(
        'div',
        { class: 'field' },
        h('label', { class: 'label', for: 'onboarding-username-input' }, 'Username'),
        input,
      ),
      h(
        'div',
        {
          class: 'chirp-panel',
          style: {
            background: 'var(--surface-2)',
            borderColor: 'var(--border)',
            color: 'var(--text-muted)',
          },
        },
        iconSvg('user', { size: 16 }),
        h(
          'span',
          {},
          'Your username will be saved on this device and used automatically whenever you return.',
        ),
      ),
    ],
    footer: [
      () => h('button', { class: 'btn btn-primary', id: 'onboarding-save-btn', onClick: submit }, 'Get Started'),
    ],
  };
});

defineModal('newId', () => {
  const input = h('input', {
    class: 'input',
    type: 'text',
    placeholder: 'Choose a username',
    autocomplete: 'off',
    spellcheck: 'false',
  });

  const submit = () => {
    const value = input.value.trim();
    if (!value) {
      actions.toast('Pick a username first', { type: 'warning' });
      return;
    }
    if (value === 'mukit123') {
      actions.toast('That username is reserved by the owner', { type: 'warning' });
      return;
    }
    actions.closeModal();
    actions.setProfile({ peerId: value });
    actions.toast(`Switching to “${value}”…`, { type: 'info' });
    window.dispatchEvent(new CustomEvent('chirp:restart-peer', { detail: { peerId: value } }));
  };

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') submit();
  });

  return {
    title: 'New peer ID',
    subtitle: 'Your ID is how other people reach you. Pick something memorable.',
    body: [
      h('div', { class: 'field' }, h('label', { class: 'label' }, 'New username'), input),
    ],
    footer: [
      () => h('button', { class: 'btn btn-ghost', onClick: () => actions.closeModal() }, 'Cancel'),
      () => h('button', { class: 'btn btn-primary', onClick: submit }, 'Create ID'),
    ],
  };
});

/* ------------------------------------------------------------------ *
 * Profile
 * ------------------------------------------------------------------ */

defineModal('profile', () => {
  const profile = store.get('profile');
  const nameInput = h('input', { class: 'input', type: 'text', value: profile.name || '', placeholder: 'Your display name' });
  const statusInput = h('input', { class: 'input', type: 'text', value: profile.status || '', placeholder: 'Available' });

  const preview = h(
    'div',
    { class: 'avatar avatar-xl' },
    profile.avatar
      ? h('img', { src: profile.avatar, alt: '' })
      : h('span', { style: { background: colorFromString(profile.name || 'chirp') } },
          initials(profile.name || 'chirp')),
  );

  const fileInput = h('input', {
    type: 'file',
    accept: 'image/*',
    class: 'hidden',
    onChange: async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      const { readFileAsSquareDataUrl } = await import('../core/utils.js');
      try {
        const dataUrl = await readFileAsSquareDataUrl(file, 256);
        actions.setProfile({ avatar: dataUrl });
        clear(preview);
        preview.appendChild(h('img', { src: dataUrl, alt: '' }));
        actions.toast('Avatar updated', { type: 'success' });
      } catch {
        actions.toast('Could not read that image', { type: 'error' });
      }
    },
  });

  return {
    title: 'Your profile',
    subtitle: 'How you appear to the people you chat with.',
    body: [
      h(
        'div',
        { class: 'row gap-4' },
        preview,
        h(
          'div',
          { class: 'col gap-2 grow' },
          h('button', { class: 'btn btn-sm', onClick: () => fileInput.click() }, 'Change photo'),
          profile.avatar
            ? h(
                'button',
                {
                  class: 'btn btn-sm btn-ghost',
                  onClick: () => {
                    actions.setProfile({ avatar: null });
                    clear(preview);
                    preview.appendChild(
                      h('span', { style: { background: colorFromString(profile.name || 'chirp') } },
                        initials(profile.name || 'chirp')),
                    );
                  },
                },
                'Remove',
              )
            : null,
          fileInput,
        ),
      ),
      h('div', { class: 'field' }, h('label', { class: 'label' }, 'Display name'), nameInput),
      h('div', { class: 'field' }, h('label', { class: 'label' }, 'Status'), statusInput),
    ],
    footer: [
      () => h('button', { class: 'btn btn-ghost', onClick: () => actions.closeModal() }, 'Cancel'),
      () =>
        h(
          'button',
          {
            class: 'btn btn-primary',
            onClick: () => {
              actions.setProfile({
                name: nameInput.value.trim(),
                status: statusInput.value.trim(),
              });
              actions.closeModal();
              actions.toast('Profile updated', { type: 'success' });
            },
          },
          'Save',
        ),
    ],
  };
});

/* ------------------------------------------------------------------ *
 * End-to-end encryption
 * ------------------------------------------------------------------ */

defineModal('encryption', () => {
  const passphrase = h('input', {
    class: 'input',
    type: 'password',
    placeholder: 'Shared secret',
    autocomplete: 'off',
  });
  const status = h('div', { class: 'chirp-panel hidden' });
  const reveal = h(
    'button',
    {
      class: 'icon-btn',
      type: 'button',
      'aria-label': 'Show passphrase',
      onClick: () => {
        passphrase.type = passphrase.type === 'password' ? 'text' : 'password';
      },
    },
    iconSvg('eye', { size: 16 }),
  );

  const fingerprintLine = h('div', { class: 'mono-line' });

  const refresh = async () => {
    if (!e2eeSession.ready) {
      fingerprintLine.textContent = '';
      return;
    }
    fingerprintLine.textContent = `Key fingerprint: ${e2eeSession.fingerprint}`;
  };

  const enable = async () => {
    const value = passphrase.value.trim();
    if (!value) {
      actions.toast('Enter a shared passphrase', { type: 'warning' });
      return;
    }
    try {
      const fingerprint = await e2eeSession.setPassphrase(value);
      actions.setSetting('e2ee', true);
      // Remember the passphrase so the key survives a reload.
      try {
        localStorage.setItem('chirp.e2ee.passphrase', value);
      } catch {
        /* storage unavailable — the key still works for this session */
      }
      status.classList.remove('hidden');
      status.classList.add('is-success');
      clear(status);
      status.append(
        iconSvg('shield', { size: 16 }),
        h('span', {}, 'Encryption is on. Both peers must use the same passphrase.'),
      );
      await refresh();
      actions.toast('End-to-end encryption enabled', { type: 'success' });
    } catch (err) {
      actions.toast(err.message || 'Could not enable encryption', { type: 'error' });
    }
  };

  const disable = () => {
    e2eeSession.reset();
    actions.setSetting('e2ee', false);
    try {
      localStorage.removeItem('chirp.e2ee.passphrase');
    } catch {
      /* ignore */
    }
    passphrase.value = '';
    status.classList.add('hidden');
    fingerprintLine.textContent = '';
    actions.toast('Encryption disabled', { type: 'info' });
  };

  const generate = () => {
    passphrase.value = E2EE.generatePassphrase();
    passphrase.type = 'text';
  };

  const copyFingerprint = async () => {
    if (!e2eeSession.fingerprint) return;
    const ok = await copyText(e2eeSession.fingerprint);
    actions.toast(ok ? 'Fingerprint copied' : 'Could not copy', { type: ok ? 'success' : 'error' });
  };

  if (e2eeSession.ready) {
    status.classList.remove('hidden');
    status.classList.add('is-success');
    clear(status);
    status.append(
      iconSvg('shield', { size: 16 }),
      h('span', {}, 'Encryption is on. Both peers must use the same passphrase.'),
    );
  }

  return {
    title: 'End-to-end encryption',
    subtitle: 'AES-256-GCM, with the key stretched from your passphrase via PBKDF2.',
    body: [
      h(
        'div',
        { class: 'field' },
        h('label', { class: 'label' }, 'Shared passphrase'),
        h('div', { class: 'input-group' }, passphrase, reveal),
      ),
      h(
        'div',
        { class: 'row gap-2' },
        h('button', { class: 'btn btn-sm', onClick: generate }, 'Generate a passphrase'),
        h('button', { class: 'btn btn-sm btn-primary', onClick: enable }, 'Enable'),
        h('button', { class: 'btn btn-sm btn-ghost', onClick: disable }, 'Disable'),
      ),
      status,
      fingerprintLine,
      h(
        'div',
        { class: 'chirp-panel', style: { background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text-muted)' } },
        iconSvg('info', { size: 16 }),
        h(
          'span',
          {},
          'Your passphrase never leaves this device. Share it with your peer over another channel — both sides must type exactly the same text.',
        ),
      ),
    ],
    footer: [
      () => h('button', { class: 'btn btn-primary', onClick: () => actions.closeModal() }, 'Done'),
    ],
  };
});

/* ------------------------------------------------------------------ *
 * About
 * ------------------------------------------------------------------ */

defineModal('about', () => ({
  title: 'About Chirp Messenger',
  subtitle: 'A peer-to-peer messenger that runs entirely in the browser.',
  body: [
    h(
      'div',
      { class: 'col gap-3' },
      h(
        'div',
        { class: 'row gap-3' },
        h('span', { class: 'brand-mark' }, iconSvg('zap', { size: 18 })),
        h('div', {}, h('div', { style: { fontWeight: '600' } }, 'Chirp Messenger'), h('div', { class: 'muted', style: { fontSize: 'var(--text-xs)' } }, 'v2.0 · rebuilt')),
      ),
      h('p', { class: 'muted', style: { fontSize: 'var(--text-sm)', lineHeight: '1.6' } },
        'Chirp keeps the original spirit — no accounts, no server holding your messages — and rebuilds it with a modern interface and a real application framework: a reactive store, typed wire protocol, IndexedDB persistence and optional end-to-end encryption.'),
      h(
        'div',
        { class: 'col gap-2' },
        h('div', { class: 'eyebrow' }, 'Highlights'),
        ...[
          ['Multi-peer chat', 'Talk to several people at once.'],
          ['Rich messages', 'Replies, reactions, edits, attachments and read receipts.'],
          ['Voice & video calls', 'With mute, camera and screen sharing.'],
          ['Chirp Mode', 'Send text as audible tones — the original experiment, now built in.'],
          ['End-to-end encryption', 'Optional AES-256-GCM with a shared passphrase.'],
          ['Works offline', 'Installable as a PWA; history is stored locally.'],
        ].map(([title, desc]) =>
          h(
            'div',
            { class: 'row gap-3', style: { alignItems: 'flex-start' } },
            h('span', { class: 'feature-icon' }, iconSvg('check', { size: 16 })),
            h(
              'div',
              {},
              h('div', { style: { fontSize: 'var(--text-sm)', fontWeight: '500' } }, title),
              h('div', { class: 'muted', style: { fontSize: 'var(--text-xs)' } }, desc),
            ),
          ),
        ),
      ),
      h(
        'div',
        { class: 'row gap-2' },
        h('a', { class: 'btn btn-sm', href: 'lab/send.html', target: '_blank' }, 'Sonic lab ↗'),
        h('a', { class: 'btn btn-sm', href: 'lab/receive.html', target: '_blank' }, 'Tone decoder ↗'),
      ),
    ),
  ],
  footer: [() => h('button', { class: 'btn btn-primary', onClick: () => actions.closeModal() }, 'Close')],
}));

export { defineModal };
