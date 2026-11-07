/**
 * Popovers and context menus.
 *
 * A single floating layer is reused for every menu so only one can be open
 * at a time. Positioning keeps the panel inside the viewport.
 */

import { h, clear } from '../core/dom.js';
import { iconSvg } from './icons.js';

let layer = null;
let closeHandler = null;

function ensureLayer() {
  if (layer && document.body.contains(layer)) return layer;
  layer = h('div', { id: 'popover-layer' });
  document.body.appendChild(layer);
  return layer;
}

function closePopover() {
  const root = ensureLayer();
  clear(root);
  if (closeHandler) {
    document.removeEventListener('pointerdown', closeHandler, true);
    document.removeEventListener('keydown', closeHandler, true);
    closeHandler = null;
  }
  window.removeEventListener('resize', closePopover);
  window.removeEventListener('scroll', closePopover, true);
}

/**
 * Open a floating panel anchored to an element.
 * @param {HTMLElement} anchor
 * @param {HTMLElement} content
 * @param {{ align?: 'start'|'center'|'end', offset?: number }} [opts]
 */
export function openPopover(anchor, content, { align = 'start', offset = 6 } = {}) {
  const root = ensureLayer();
  clear(root);

  const panel = h('div', { class: 'popover' }, content);
  panel.style.visibility = 'hidden';
  root.appendChild(panel);

  const rect = anchor.getBoundingClientRect();
  const panelRect = panel.getBoundingClientRect();
  const margin = 8;

  let left = rect.left;
  if (align === 'end') left = rect.right - panelRect.width;
  if (align === 'center') left = rect.left + (rect.width - panelRect.width) / 2;

  left = Math.max(margin, Math.min(left, window.innerWidth - panelRect.width - margin));

  let top = rect.bottom + offset;
  if (top + panelRect.height > window.innerHeight - margin) {
    const above = rect.top - panelRect.height - offset;
    top = above > margin ? above : Math.max(margin, window.innerHeight - panelRect.height - margin);
  }

  panel.style.left = `${Math.round(left)}px`;
  panel.style.top = `${Math.round(top)}px`;
  panel.style.position = 'fixed';
  panel.style.visibility = 'visible';

  const onPointerDown = (event) => {
    if (panel.contains(event.target)) return;
    if (anchor.contains(event.target)) return;
    closePopover();
  };
  const onKey = (event) => {
    if (event.key === 'Escape') closePopover();
  };

  setTimeout(() => {
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKey, true);
  }, 0);

  closeHandler = onPointerDown;
  window.addEventListener('resize', closePopover);
  window.addEventListener('scroll', closePopover, true);

  return panel;
}

/**
 * Build a context-menu list.
 * @param {Array<{label:string, icon?:string, danger?:boolean, shortcut?:string, onSelect?:Function}|'-'>} items
 */
export function buildMenu(items) {
  const menu = h('div', { class: 'menu', role: 'menu' });
  for (const item of items) {
    if (item === '-') {
      menu.appendChild(h('div', { class: 'menu-separator' }));
      continue;
    }
    menu.appendChild(
      h(
        'button',
        {
          class: `menu-item${item.danger ? ' is-danger' : ''}`,
          role: 'menuitem',
          onClick: () => {
            closePopover();
            item.onSelect?.();
          },
        },
        h('span', { class: 'menu-icon' }, item.icon ? iconSvg(item.icon, { size: 16 }) : null),
        h('span', { class: 'grow' }, item.label),
        item.shortcut ? h('span', { class: 'menu-shortcut' }, item.shortcut) : null,
      ),
    );
  }
  return menu;
}

/** Open a context menu anchored to an element. */
export function openMenu(anchor, items, opts) {
  return openPopover(anchor, buildMenu(items), opts);
}

export { closePopover };
