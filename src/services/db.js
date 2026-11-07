/**
 * Persistence layer.
 *
 * IndexedDB is the primary store (chat history can get big); localStorage is
 * the fallback for settings and profile, which are small and must survive
 * even when IndexedDB is blocked (private mode, older WebViews).
 */

const DB_NAME = 'chirp-messenger';
const DB_VERSION = 1;
const STORES = ['conversations', 'messages', 'calls', 'kv'];

let dbPromise = null;
let useFallback = false;

/** localStorage can throw in private mode — wrap every access. */
function safeLocal() {
  try {
    const probe = '__chirp_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('conversations')) {
        db.createObjectStore('conversations', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('messages')) {
        const store = db.createObjectStore('messages', { keyPath: 'id' });
        store.createIndex('convId', 'convId', { unique: false });
        store.createIndex('ts', 'ts', { unique: false });
      }
      if (!db.objectStoreNames.contains('calls')) {
        db.createObjectStore('calls', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('kv')) {
        db.createObjectStore('kv');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB open failed'));
    request.onblocked = () => reject(new Error('IndexedDB blocked'));
  }).catch((err) => {
    useFallback = true;
    console.warn('[db] falling back to localStorage:', err?.message);
    return null;
  });
  return dbPromise;
}

function tx(db, store, mode) {
  return db.transaction(store, mode).objectStore(store);
}

function req(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/* ------------------------------------------------------------------ *
 * Public API
 * ------------------------------------------------------------------ */

export const db = {
  /** True when IndexedDB is being used (vs. the localStorage fallback). */
  get usingFallback() {
    return useFallback;
  },

  async ready() {
    await openDb();
    return true;
  },

  /** Put a record into a store (object stores use `keyPath`). */
  async put(store, value) {
    const database = await openDb();
    if (!database) {
      localStorage.setItem(`chirp.db.${store}.${value.id ?? 'single'}`, JSON.stringify(value));
      return value;
    }
    await req(tx(database, store, 'readwrite').put(value));
    return value;
  },

  /** Put many records in one transaction. */
  async putMany(store, values) {
    if (!values.length) return [];
    const database = await openDb();
    if (!database) {
      for (const value of values) {
        localStorage.setItem(`chirp.db.${store}.${value.id ?? 'single'}`, JSON.stringify(value));
      }
      return values;
    }
    const storeHandle = tx(database, store, 'readwrite');
    await Promise.all(values.map((value) => req(storeHandle.put(value))));
    return values;
  },

  /** Get one record by key. */
  async get(store, key) {
    const database = await openDb();
    if (!database) {
      const raw = localStorage.getItem(`chirp.db.${store}.${key}`);
      return raw ? JSON.parse(raw) : undefined;
    }
    return req(tx(database, store, 'readonly').get(key));
  },

  /** Get every record in a store. */
  async all(store) {
    const database = await openDb();
    if (!database) {
      const prefix = `chirp.db.${store}.`;
      const out = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (key && key.startsWith(prefix)) {
          try {
            out.push(JSON.parse(localStorage.getItem(key)));
          } catch {
            /* skip corrupt entry */
          }
        }
      }
      return out;
    }
    return req(tx(database, store, 'readonly').getAll());
  },

  /** Get all records matching an index value. */
  async byIndex(store, index, value) {
    const database = await openDb();
    if (!database) {
      const all = await this.all(store);
      return all.filter((item) => item[index] === value);
    }
    const storeHandle = tx(database, store, 'readonly');
    return req(storeHandle.index(index).getAll(value));
  },

  /** Delete a record by key. */
  async remove(store, key) {
    const database = await openDb();
    if (!database) {
      localStorage.removeItem(`chirp.db.${store}.${key}`);
      return;
    }
    await req(tx(database, store, 'readwrite').delete(key));
  },

  /** Delete every record in a store. */
  async clear(store) {
    const database = await openDb();
    if (!database) {
      const prefix = `chirp.db.${store}.`;
      const keys = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (key && key.startsWith(prefix)) keys.push(key);
      }
      keys.forEach((key) => localStorage.removeItem(key));
      return;
    }
    await req(tx(database, store, 'readwrite').clear());
  },

  /** Delete everything we own. */
  async wipe() {
    await Promise.all(STORES.map((store) => this.clear(store)));
  },

  /** Rough size report for the settings screen. */
  async usage() {
    if (navigator.storage?.estimate) {
      try {
        const { usage = 0, quota = 0 } = await navigator.storage.estimate();
        return { usage, quota };
      } catch {
        /* ignore */
      }
    }
    return { usage: 0, quota: 0 };
  },
};

/* ------------------------------------------------------------------ *
 * Settings & profile (small, always localStorage-backed so they load
 * instantly and survive even if IndexedDB is unavailable)
 * ------------------------------------------------------------------ */

const SETTINGS_KEY = 'chirp.settings.v1';
const PROFILE_KEY = 'chirp.profile.v1';

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return { ...fallback, ...JSON.parse(raw) };
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export const DEFAULT_SETTINGS = {
  theme: 'system',
  accent: 'indigo',
  notifications: true,
  sounds: true,
  readReceipts: true,
  typingIndicators: true,
  linkPreviews: true,
  e2ee: false,
  chirpMode: false,
  chirpListen: false,
  enterToSend: true,
  compactMode: false,
  wallpaper: 'aurora',
};

export const DEFAULT_PROFILE = {
  name: '',
  status: 'Available',
  avatar: null,
  peerId: '',
};

export const settingsStore = {
  load() {
    return readJson(SETTINGS_KEY, DEFAULT_SETTINGS);
  },
  save(settings) {
    writeJson(SETTINGS_KEY, settings);
  },
  reset() {
    writeJson(SETTINGS_KEY, DEFAULT_SETTINGS);
  },
};

export const profileStore = {
  load() {
    return readJson(PROFILE_KEY, DEFAULT_PROFILE);
  },
  save(profile) {
    writeJson(PROFILE_KEY, profile);
  },
  reset() {
    writeJson(PROFILE_KEY, DEFAULT_PROFILE);
  },
};
