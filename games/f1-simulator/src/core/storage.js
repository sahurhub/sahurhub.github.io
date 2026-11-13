// Persistent saves in the browser's IndexedDB (settings, lap records, career data later).
// Falls back to memory if the browser blocks storage, so the game still runs.
const DB_NAME = 'f1sim', STORE = 'kv', VERSION = 1;
let dbPromise = null;
const memory = new Map();

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
  return dbPromise;
}

export async function load(key, fallback = null) {
  const db = await open();
  if (!db) return memory.has(key) ? memory.get(key) : fallback;
  return new Promise((resolve) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result === undefined ? fallback : req.result);
    req.onerror = () => resolve(fallback);
  });
}

export async function save(key, value) {
  memory.set(key, value);
  const db = await open();
  if (!db) return false;
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => resolve(false);
  });
}

export async function remove(key) {
  memory.delete(key);
  const db = await open();
  if (!db) return;
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

export const DEFAULT_SETTINGS = {
  quality: 'medium',
  volume: 0.7,
  assists: { tc: 2, abs: 1, autoGear: true, autoAero: true, steer: true, stability: true },
  difficulty: 70,
  camera: 'chase',
  keys: null,
  driver: 'norris',
  laps: 5,
  grid: 'mid',
};

export async function loadSettings() {
  const s = await load('settings', {});
  return { ...DEFAULT_SETTINGS, ...s, assists: { ...DEFAULT_SETTINGS.assists, ...(s.assists || {}) } };
}
