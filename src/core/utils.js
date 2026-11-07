/**
 * Shared utility helpers.
 * Pure functions only — no DOM, no state. Safe to import anywhere.
 */

let idCounter = 0;

/** Short, collision-resistant id with an optional human-readable prefix. */
export function uid(prefix = 'id') {
  idCounter = (idCounter + 1) % 100000;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}${idCounter.toString(36)}${rand}`;
}

/** Debounce a function by `ms` milliseconds. */
export function debounce(fn, ms = 200) {
  let timer = null;
  const wrapped = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
  wrapped.cancel = () => clearTimeout(timer);
  return wrapped;
}

/** Throttle a function to at most one call per `ms` milliseconds. */
export function throttle(fn, ms = 200) {
  let last = 0;
  let pending = null;
  return (...args) => {
    const now = Date.now();
    const remaining = ms - (now - last);
    if (remaining <= 0) {
      last = now;
      fn(...args);
    } else if (!pending) {
      pending = setTimeout(() => {
        last = Date.now();
        pending = null;
        fn(...args);
      }, remaining);
    }
  };
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const clamp = (n, min, max) => Math.min(Math.max(n, min), max);

export function groupBy(items, keyFn) {
  const out = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!out.has(key)) out.set(key, []);
    out.get(key).push(item);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Formatting
 * ------------------------------------------------------------------ */

const pad2 = (n) => String(n).padStart(2, '0');

/** 24h-ish clock time, e.g. "14:32". */
export function formatTime(ts) {
  const d = new Date(ts);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** "Today" / "Yesterday" / "Mar 4, 2026" — for date dividers. */
export function formatDay(ts) {
  const d = new Date(ts);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfDate = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayMs = 86400000;
  if (startOfDate === startOfToday) return 'Today';
  if (startOfDate === startOfToday - dayMs) return 'Yesterday';
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

/** Compact relative time for conversation list subtitles. */
export function formatRelative(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const min = 60000;
  if (diff < min) return 'now';
  if (diff < 60 * min) return `${Math.floor(diff / min)}m`;
  const hours = diff / (60 * min);
  if (hours < 24) return `${Math.floor(hours)}h`;
  const days = diff / (86400000);
  if (days < 7) return `${Math.floor(days)}d`;
  return formatDay(ts);
}

/** "1.2 MB", "840 KB" */
export function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}

/** "just now", "5m ago", "2h ago" */
export function formatDistance(ts) {
  if (!ts) return 'never';
  const diff = Date.now() - ts;
  const sec = Math.floor(diff / 1000);
  if (sec < 10) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

/* ------------------------------------------------------------------ *
 * Text
 * ------------------------------------------------------------------ */

export function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** First letters of up to two words, e.g. "Ada Lovelace" -> "AL". */
export function initials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Deterministic pleasant colour for a name, used for avatars. */
export function colorFromString(str = '') {
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 68% 52%)`;
}

/** Detect links in a blob of text. */
export function findUrls(text = '') {
  const matches = String(text).match(/https?:\/\/[^\s<>"')]+/gi) || [];
  return [...new Set(matches)];
}

/** Truncate for previews. */
export function truncate(text = '', max = 80) {
  const clean = String(text).replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

/* ------------------------------------------------------------------ *
 * Browser helpers
 * ------------------------------------------------------------------ */

/** Copy text to the clipboard with a legacy fallback. */
export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to legacy path */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/** Trigger a browser download for a blob. */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Is the browser currently in dark mode? */
export function prefersDark() {
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** Read a file as a base64 string (without the data-uri prefix). */
export function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

/** Load an image file and draw it into a square canvas -> data URL. */
export function readFileAsSquareDataUrl(file, size = 256) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const scale = Math.max(size / img.width, size / img.height);
        const w = img.width * scale;
        const hgt = img.height * scale;
        ctx.drawImage(img, (size - w) / 2, (size - hgt) / 2, w, hgt);
        resolve(canvas.toDataURL('image/jpeg', 0.86));
      };
      img.onerror = () => reject(new Error('Could not decode image'));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(reader.error || new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}
