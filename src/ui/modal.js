/**
 * Modal dialogs.
 *
 * A single modal host is kept in the DOM; the store decides which modal is
 * open. Each modal definition returns `{ title, subtitle, body, footer }`
 * and can be dismissed with Escape or a backdrop click.
 */

import { h, clear } from '../core/dom.js';
import { store, actions } from '../state/app.js';
import { iconSvg } from './icons.js';

let host = null;

function ensureHost() {
  if (host && document.body.contains(host)) return host;
  host = h('div', { id: 'modal-host' });
  document.body.appendChild(host);
  return host;
}

/** Registered modal builders, keyed by name. */
const registry = new Map();

/**
 * Register a modal.
 * @param {string} name
 * @param {(props:object, api:{close:Function}) => {title?:string, subtitle?:string, body:Node|Node[], footer?:Node|Node[]}} builder
 */
export function defineModal(name, builder) {
  registry.set(name, builder);
}

function renderModal(definition, props) {
  const close = () => actions.closeModal();

  const content = definition.body || [];
  const body = Array.isArray(content) ? content : [content];

  const footerButtons = definition.footer || [];
  const modal = h(
    'div',
    {
      class: 'modal',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': definition.title || 'Dialog',
      onClick: (event) => event.stopPropagation(),
    },
    h(
      'div',
      { class: 'modal-header' },
      h('div', { class: 'modal-title' }, definition.title || ''),
      definition.subtitle ? h('div', { class: 'modal-subtitle' }, definition.subtitle) : null,
    ),
    h('div', { class: 'modal-body' }, ...body.filter(Boolean)),
    footerButtons.length
      ? h(
          'div',
          { class: 'modal-footer' },
          ...footerButtons.filter(Boolean).map((node) =>
            typeof node === 'function' ? node({ close }) : node,
          ),
        )
      : null,
  );

  return h(
    'div',
    {
      class: 'modal-scrim',
      onClick: close,
    },
    modal,
  );
}

export function mountModals() {
  const root = ensureHost();

  const onKey = (event) => {
    if (event.key === 'Escape' && store.get('ui.modal')) {
      // Claim the event so the layer underneath does not close as well.
      event.preventDefault();
      event.stopPropagation();
      actions.closeModal();
    }
  };
  document.addEventListener('keydown', onKey);

  store.subscribe('ui.modal', (modal) => {
    clear(root);
    if (!modal) return;
    const builder = registry.get(modal.name);
    if (!builder) {
      console.warn('[modal] unknown modal:', modal.name);
      return;
    }
    const definition = builder(modal.props || {}, { close: () => actions.closeModal() });
    root.appendChild(renderModal(definition, modal.props || {}));
    // Focus the first control for keyboard users.
    const focusable = root.querySelector('input, textarea, button');
    focusable?.focus();
  });

  return () => document.removeEventListener('keydown', onKey);
}

/** Convenience: a standard confirm dialog. */
export function confirmModal({ title, message, confirmLabel = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      actions.closeModal();
      resolve(value);
    };
    defineModal('__confirm', () => ({
      title,
      body: h('p', { class: 'dim' }, message),
      footer: [
        () =>
          h(
            'button',
            {
              class: 'btn btn-ghost',
              onClick: () => finish(false),
            },
            'Cancel',
          ),
        () =>
          h(
            'button',
            {
              class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`,
              onClick: () => finish(true),
            },
            confirmLabel,
          ),
      ],
    }));
    actions.openModal('__confirm');
  });
}

/** Close button used by modal headers. */
export function modalCloseButton() {
  return h(
    'button',
    {
      class: 'icon-btn',
      'aria-label': 'Close dialog',
      onClick: () => actions.closeModal(),
    },
    iconSvg('x', { size: 18 }),
  );
}
