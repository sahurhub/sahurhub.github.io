// Save layer. The game talks only to SaveManager; the storage backend is an adapter.
// To move saves to a server later, write an adapter with the same three async methods
// (load, save, remove) that calls your API, and pass it to new SaveManager(adapter).
//
//   adapter.load(key)        -> Promise<object|null>
//   adapter.save(key, data)  -> Promise<void>
//   adapter.remove(key)      -> Promise<void>

export class LocalStorageAdapter {
  constructor(prefix = 'deliveryrush.') { this.prefix = prefix; }
  async load(key) {
    try {
      const raw = localStorage.getItem(this.prefix + key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.warn('[save] could not read', key, e);
      return null;
    }
  }
  async save(key, data) {
    try {
      localStorage.setItem(this.prefix + key, JSON.stringify(data));
    } catch (e) {
      console.warn('[save] could not write', key, e);
      throw e;
    }
  }
  async remove(key) {
    try { localStorage.removeItem(this.prefix + key); } catch (e) { /* ignore */ }
  }
}

// In-memory adapter: used when localStorage is blocked (private mode) so the game still runs.
export class MemoryAdapter {
  constructor() { this.data = {}; }
  async load(key) { return this.data[key] ? JSON.parse(this.data[key]) : null; }
  async save(key, data) { this.data[key] = JSON.stringify(data); }
  async remove(key) { delete this.data[key]; }
}

function storageWorks() {
  try {
    const k = '__dr_test__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return true;
  } catch (e) { return false; }
}

export class SaveManager {
  constructor(adapter) {
    const noSave = new URLSearchParams(location.search).has('nosave');
    this.adapter = adapter || (!noSave && storageWorks() ? new LocalStorageAdapter() : new MemoryAdapter());
    this.persistent = !(this.adapter instanceof MemoryAdapter);
    this.slot = 'profile';
    this.lastSave = 0;
    this.saving = false;
    this.dirty = false;
  }
  async loadProfile() { return this.adapter.load(this.slot); }
  async saveProfile(profile) {
    if (this.saving) { this.dirty = true; return false; }
    this.saving = true;
    try {
      profile.savedAt = Date.now();
      await this.adapter.save(this.slot, profile);
      this.lastSave = performance.now();
      return true;
    } catch (e) {
      return false;
    } finally {
      this.saving = false;
      if (this.dirty) { this.dirty = false; this.saveProfile(profile); }
    }
  }
  async deleteProfile() { await this.adapter.remove(this.slot); }
  async loadSettings() { return this.adapter.load('settings'); }
  async saveSettings(s) { try { await this.adapter.save('settings', s); } catch (e) { /* ignore */ } }
}
