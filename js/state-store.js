const DB_NAME = 'rhythm-state-v1';
const DB_VERSION = 1;
const STORE = 'snapshots';
const MIGRATED_SUFFIX = ':indexeddb-migrated';

function hasLocalStorage() {
  return typeof localStorage !== 'undefined';
}

function hasIndexedDb() {
  return typeof indexedDB !== 'undefined';
}

function localMigrationKey(key) {
  return `${key}${MIGRATED_SUFFIX}`;
}

function readLocalState(key) {
  if (!hasLocalStorage()) return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

function saveLocalState(key, state) {
  if (!hasLocalStorage()) return;
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch (_) {}
}

function clearLocalState(key) {
  if (!hasLocalStorage()) return;
  try {
    localStorage.removeItem(key);
    localStorage.removeItem(localMigrationKey(key));
  } catch (_) {}
}

function markMigrated(key) {
  if (!hasLocalStorage()) return;
  try {
    localStorage.setItem(localMigrationKey(key), new Date().toISOString());
    localStorage.removeItem(key);
  } catch (_) {}
}

function openDb() {
  return new Promise((resolve, reject) => {
    let request;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (error) {
      reject(error);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'key' });
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function withStore(mode, action) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const store = transaction.objectStore(STORE);
    let result;
    try {
      result = action(store);
    } catch (error) {
      db.close();
      reject(error);
      return;
    }
    transaction.oncomplete = () => {
      db.close();
      resolve(result);
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
    transaction.onabort = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

function requestValue(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readIndexedState(key) {
  return withStore('readonly', (store) => requestValue(store.get(key)));
}

async function writeIndexedState(key, state) {
  const record = { key, data: state, updatedAt: new Date().toISOString(), schema: state?.version || 1 };
  await withStore('readwrite', (store) => {
    store.put(record);
    return null;
  });
  return record;
}

async function clearIndexedState(key) {
  await withStore('readwrite', (store) => {
    store.delete(key);
    return null;
  });
}

export async function loadStoredState(key) {
  const localState = readLocalState(key);
  if (!hasIndexedDb()) return { state: localState, driver: 'localStorage', migrated: false };

  try {
    const record = await readIndexedState(key);
    if (record?.data) return { state: record.data, driver: 'indexedDB', migrated: false, updatedAt: record.updatedAt };
    if (!localState) return { state: null, driver: 'indexedDB', migrated: false };

    const migrated = await writeIndexedState(key, localState);
    markMigrated(key);
    return { state: migrated.data, driver: 'indexedDB', migrated: true, updatedAt: migrated.updatedAt };
  } catch (error) {
    return { state: localState, driver: 'localStorage', migrated: false, fallback: true, error };
  }
}

export async function saveStoredState(key, state) {
  if (!hasIndexedDb()) {
    saveLocalState(key, state);
    return { driver: 'localStorage', fallback: false };
  }

  try {
    const record = await writeIndexedState(key, state);
    markMigrated(key);
    return { driver: 'indexedDB', fallback: false, updatedAt: record.updatedAt };
  } catch (error) {
    saveLocalState(key, state);
    return { driver: 'localStorage', fallback: true, error };
  }
}

export async function clearStoredState(key) {
  if (hasIndexedDb()) {
    try {
      await clearIndexedState(key);
    } catch (_) {}
  }
  clearLocalState(key);
}
