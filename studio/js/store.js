// IndexedDB storage for finished videos and imported music.
const DB = 'aivideostudio';
let dbPromise;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('music')) db.createObjectStore('music', { keyPath: 'name' });
      if (!db.objectStoreNames.contains('runs')) db.createObjectStore('runs', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(store, mode, fn) {
  return open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => resolve(req && req.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

export const store = {
  async putProject(p) { return tx('projects', 'readwrite', s => s.put(p)); },
  async getProject(id) { return tx('projects', 'readonly', s => s.get(id)); },
  async deleteProject(id) { return tx('projects', 'readwrite', s => s.delete(id)); },
  async listProjects() {
    const all = await tx('projects', 'readonly', s => s.getAll());
    return (all || []).sort((a, b) => b.createdAt - a.createdAt).map(({ videoBlob, thumbBlob, ...rest }) => ({ ...rest, hasVideo: !!videoBlob, thumbBlob }));
  },
  async putMusic(name, blob) { return tx('music', 'readwrite', s => s.put({ name, blob })); },
  async getMusic(name) { const r = await tx('music', 'readonly', s => s.get(name)); return r && r.blob; },
  async listMusic() { const all = await tx('music', 'readonly', s => s.getAllKeys()); return all || []; },
  async deleteMusic(name) { return tx('music', 'readwrite', s => s.delete(name)); },
  // Checkpoints of a run in progress, so a page reload (Safari memory pressure) can resume instead of restarting.
  async putRun(run) { return tx('runs', 'readwrite', s => s.put(run)); },
  async getRun(id = 'current') { return tx('runs', 'readonly', s => s.get(id)); },
  async deleteRun(id = 'current') { return tx('runs', 'readwrite', s => s.delete(id)); },
};

export async function requestPersistentStorage() {
  try { if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist(); } catch {}
  return false;
}
