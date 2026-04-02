const DB_NAME = 'eltex_form_db';
const DB_VERSION = 1;
const STORE_NAME = 'form_backups';
const BACKUP_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface IndexedDBBackupEntry {
  projectCode: string;
  savedAt: number;
  formData: unknown;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'projectCode' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function writeIndexedDBBackup(projectCode: string, formData: unknown): Promise<void> {
  try {
    const db = await openDB();
    const entry: IndexedDBBackupEntry = { projectCode, savedAt: Date.now(), formData };
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(entry);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // IndexedDB unavailable — fail silently
  }
}

export async function readIndexedDBBackup(projectCode: string): Promise<{ formData: unknown; savedAt: number } | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(projectCode);
      req.onsuccess = () => {
        const entry = req.result as IndexedDBBackupEntry | undefined;
        if (!entry) { resolve(null); return; }
        if (Date.now() - entry.savedAt > BACKUP_TTL_MS) { resolve(null); return; }
        resolve({ formData: entry.formData, savedAt: entry.savedAt });
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function clearIndexedDBBackup(projectCode: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(projectCode);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // ignore
  }
}
