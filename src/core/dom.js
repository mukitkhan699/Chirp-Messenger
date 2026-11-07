/**
 * Tiny DOM layer.
 *
 * `h()` builds elements without innerHTML (no XSS via string templates),
 * `reconcile()` performs keyed list diffing so the chat view can update
 * individual messages instead of re-rendering the whole thread.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';
const SVG_TAGS = new Set([
  'svg', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'g', 'text',
  'defs', 'linearGradient', 'stop', 'ellipse', 'use', 'tspan', 'filter',
]);

function applyProps(el, props) {
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;

    if (key === 'class' || key === 'className') {
      const cls = Array.isArray(value)
        ? value.filter(Boolean).join(' ')
        : String(value);
      if (cls) el.setAttribute('class', cls);
      continue;
    }
    if (key === 'style') {
      if (typeof value === 'string') el.setAttribute('style', value);
      else Object.assign(el.style, value);
      continue;
    }
    if (key === 'dataset') {
      Object.assign(el.dataset, value);
      continue;
    }
    if (key === 'html') {
      el.innerHTML = value;
      continue;
    }
    if (key === 'ref' && typeof value === 'function') {
      value(el);
      continue;
    }
    if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
      continue;
    }
    if (key === 'value' && 'value' in el) {
      el.value = value;
      continue;
    }
    if (key === 'checked' || key === 'disabled' || key === 'selected' || key === 'hidden') {
      el[key] = Boolean(value);
      continue;
    }
    if (value === true) {
      el.setAttribute(key, '');
      continue;
    }
    el.setAttribute(key, String(value));
  }
}

function appendChildren(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false || child === true) continue;
    el.appendChild(
      child instanceof Node ? child : document.createTextNode(String(child)),
    );
  }
}

/**
 * Create an element.
 * @param {string} tag
 * @param {object|null} props
 * @param {...any} children
 */
export function h(tag, props = null, ...children) {
  const el = SVG_TAGS.has(tag)
    ? document.createElementNS(SVG_NS, tag)
    : document.createElement(tag);
  if (props) applyProps(el, props);
  appendChildren(el, children);
  return el;
}

/** Build a document fragment. */
export function frag(...children) {
  const f = document.createDocumentFragment();
  appendChildren(f, children);
  return f;
}

/** Remove every child of a node. */
export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

/** Append children to a parent (accepts nodes, strings and arrays). */
export function mount(parent, ...children) {
  appendChildren(parent, children);
  return parent;
}

/** Replace the children of a node with new content. */
export function replace(parent, ...children) {
  clear(parent);
  appendChildren(parent, children);
  return parent;
}

/** Delegated event listener: fires when the event target matches `selector`. */
export function delegate(root, type, selector, handler) {
  root.addEventListener(type, (event) => {
    const match = event.target.closest?.(selector);
    if (match && root.contains(match)) handler(event, match);
  });
}

/**
 * Keyed list reconciliation.
 *
 * Keeps a map of key -> element, reorders only what moved, and lets the
 * caller patch elements that already exist.
 *
 * The `update` callback may either mutate the element in place (returning
 * nothing) or return a replacement element, which is swapped in for it.
 * It must never detach the element itself — that would break the ordering
 * pass below and duplicate rows.
 *
 * @param {HTMLElement} container
 * @param {Array} items
 * @param {object} handlers
 * @param {(item:any, index:number)=>string} handlers.key
 * @param {(item:any, index:number)=>HTMLElement} handlers.create
 * @param {(el:HTMLElement, item:any, index:number)=>HTMLElement|void} [handlers.update]
 */
export function reconcile(container, items, { key, create, update }) {
  const existing = new Map();
  for (const child of [...container.children]) {
    const k = child.dataset?.reconcileKey;
    if (k != null) existing.set(k, child);
    else child.remove();
  }

  const nextKeys = items.map((item, i) => key(item, i));
  const ordered = items.map((item, i) => {
    const k = nextKeys[i];
    let el = existing.get(k);
    if (el) {
      existing.delete(k);
      const replacement = update ? update(el, item, i) : undefined;
      if (replacement && replacement !== el) {
        // Swap the old element out for the new one.
        el.remove();
        el = replacement;
      }
    } else {
      el = create(item, i);
    }
    el.dataset.reconcileKey = k;
    return el;
  });

  // Remove leftovers that are no longer part of the list.
  for (const [, el] of existing) el.remove();

  // Re-append in order — appendChild moves nodes, so this is cheap.
  ordered.forEach((el, i) => {
    const current = container.children[i];
    if (current !== el) container.insertBefore(el, current || null);
  });
}

export const qs = (selector, root = document) => root.querySelector(selector);
export const qsa = (selector, root = document) => [...root.querySelectorAll(selector)];

/** Inline SVG icon from a path string, sized by CSS. */
export function icon(paths, { size = 20, viewBox = '0 0 24 24', strokeWidth = 1.8 } = {}) {
  const svg = h('svg', {
    viewBox,
    width: size,
    height: size,
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': strokeWidth,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
  });
  for (const d of [].concat(paths)) {
    svg.appendChild(h('path', { d }));
  }
  return svg;
}

/** Run a callback on the next animation frame. */
export function nextFrame(fn) {
  return requestAnimationFrame(() => requestAnimationFrame(fn));
}

/** Observe an element's size (for the auto-growing composer). */
export function observeSize(el, cb) {
  const ro = new ResizeObserver(cb);
  ro.observe(el);
  return () => ro.disconnect();
}
