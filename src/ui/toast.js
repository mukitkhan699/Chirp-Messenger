/**
 * Toast notifications.
 *
 * Rendered into a fixed stack at the bottom of the viewport. Toasts live in
 * the store so any module can raise one without knowing about the DOM.
 */

import { h, clear } from '../core/dom.js';
import { store, actions } from '../state/app.js';
import { iconSvg } from './icons.js';

let stack = null;

function ensureStack() {
  if (stack && document.body.contains(stack)) return stack;
  stack = h('div', { class: 'toast-stack', role: 'status', 'aria-live': 'polite' });
  document.body.appendChild(stack);
  return stack;
}

const ICON_FOR = {
  success: 'check',
  error: 'x',
  warning: 'info',
  info: 'info',
};

function renderToast(toast) {
  const el = h(
    'div',
    { class: `toast is-${toast.type}` },
    h('span', { class: 'toast-icon' }, iconSvg(ICON_FOR[toast.type] || 'info', { size: 18 })),
    h('span', { class: 'grow' }, toast.message),
    toast.action
      ? h(
          'button',
          {
            class: 'toast-action',
            onClick: () => {
              toast.action.onClick?.();
              actions.dismissToast(toast.id);
            },
          },
          toast.action.label,
        )
      : null,
    h(
      'button',
      {
        class: 'icon-btn',
        style: { width: '24px', height: '24px' },
        'aria-label': 'Dismiss notification',
        onClick: () => actions.dismissToast(toast.id),
      },
      iconSvg('x', { size: 14 }),
    ),
  );
  return el;
}

export function mountToasts() {
  const root = ensureStack();
  store.subscribe('ui.toasts', (toasts) => {
    clear(root);
    for (const toast of toasts || []) {
      root.appendChild(renderToast(toast));
    }
  });
}
