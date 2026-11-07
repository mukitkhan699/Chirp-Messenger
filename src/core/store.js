/**
 * A tiny reactive store.
 *
 * State is a plain object addressed by dotted paths ("conversations.list").
 * Subscribers are notified when the subscribed path — or any of its
 * descendants — changes. Equality is checked with `Object.is` so views can
 * cheaply skip work.
 */

function toPath(path) {
  if (Array.isArray(path)) return path.slice();
  if (typeof path === 'number') return [path];
  return String(path).split('.').filter(Boolean);
}

function getIn(state, path) {
  let cursor = state;
  for (const key of path) {
    if (cursor == null) return undefined;
    cursor = cursor[key];
  }
  return cursor;
}

function setIn(state, path, value) {
  if (!path.length) return value;
  const [key, ...rest] = path;
  const isIndex = typeof key === 'number';
  const base = Array.isArray(state) ? state.slice() : { ...state };
  if (rest.length) {
    base[key] = setIn(base[key] ?? {}, rest, value);
  } else {
    base[key] = value;
  }
  return isIndex ? base : base;
}

function affects(path, changed) {
  // Does a change at `changed` affect the subscriber at `path`?
  if (changed.length < path.length) return false;
  for (let i = 0; i < path.length; i += 1) {
    if (path[i] !== changed[i]) return false;
  }
  return true;
}

export function createStore(initialState = {}) {
  let state = initialState;
  /** @type {Map<string, Set<Function>>} */
  const subscribers = new Map();
  let notifying = false;
  let dirty = [];

  function notify(path) {
    dirty.push(path);
    if (notifying) return;
    notifying = true;
    try {
      while (dirty.length) {
        const changed = dirty.shift();
        const matches = [];
        for (const [subPath, set] of subscribers) {
          const parsed = toPath(subPath);
          if (affects(parsed, changed)) matches.push([subPath, set, parsed]);
        }
        for (const [subPath, set, parsed] of matches) {
          const value = getIn(state, parsed);
          for (const fn of [...set]) {
            try {
              fn(value, state);
            } catch (err) {
              console.error('[store] subscriber failed for', subPath, err);
            }
          }
        }
      }
    } finally {
      notifying = false;
      dirty = [];
    }
  }

  return {
    /** Read the whole state (read-only by convention). */
    get state() {
      return state;
    },

    /** Read a value at a dotted path. */
    get(path) {
      return getIn(state, toPath(path));
    },

    /** Write a value at a dotted path and notify subscribers. */
    set(path, value) {
      const parsed = toPath(path);
      const next = setIn(state, parsed, value);
      if (next === state) return value;
      state = next;
      notify(parsed);
      return value;
    },

    /** Merge a shallow object into the state root. */
    patch(obj) {
      const merged = { ...state, ...obj };
      const changed = [];
      for (const key of Object.keys(obj)) {
        if (!Object.is(state[key], obj[key])) changed.push([key]);
      }
      state = merged;
      changed.forEach(notify);
      return state;
    },

    /** Apply a function to the value at a path. */
    update(path, fn) {
      const parsed = toPath(path);
      const current = getIn(state, parsed);
      return this.set(path, fn(current));
    },

    /**
     * Subscribe to a path. The callback fires when that path or one of its
     * descendants changes. Returns an unsubscribe function.
     */
    subscribe(path, callback) {
      const key = Array.isArray(path) ? path.join('.') : String(path);
      if (!subscribers.has(key)) subscribers.set(key, new Set());
      subscribers.get(key).add(callback);
      return () => {
        const set = subscribers.get(key);
        if (!set) return;
        set.delete(callback);
        if (!set.size) subscribers.delete(key);
      };
    },

    /** Replace the entire state (used when hydrating from storage). */
    replace(nextState) {
      const previous = state;
      state = nextState;
      // Notify per top-level key so fine-grained subscribers still fire.
      const keys = new Set([...Object.keys(previous || {}), ...Object.keys(nextState || {})]);
      for (const key of keys) notify([key]);
    },
  };
}
