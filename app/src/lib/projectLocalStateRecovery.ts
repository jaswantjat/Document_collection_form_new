const DB_NAME = 'eltex_form_db';
const STORE_NAME = 'form_backups';
const BACKUP_KEY_PREFIX = 'eltex_form_backup_';
const SECTION_KEY_PREFIX = 'eltex_section_';

interface StorageLike {
  removeItem(key: string): void;
}

interface IndexedDBLike {
  open(name: string): IDBOpenDBRequest;
}

export function getProjectCodeFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get('code') || parsed.searchParams.get('project');
  } catch {
    return null;
  }
}

function clearLocalStorageKeys(projectCode: string, storage: StorageLike | null): void {
  if (!storage) return;
  storage.removeItem(`${BACKUP_KEY_PREFIX}${projectCode}`);
  storage.removeItem(`${SECTION_KEY_PREFIX}${projectCode}`);
}

function clearIndexedDBBackup(projectCode: string, indexedDBRef: IndexedDBLike | null): Promise<void> {
  if (!indexedDBRef) return Promise.resolve();
  return new Promise((resolve) => {
    const request = indexedDBRef.open(DB_NAME);
    request.onerror = () => resolve();
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.close();
        resolve();
        return;
      }
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); resolve(); };
      tx.objectStore(STORE_NAME).delete(projectCode);
    };
  });
}

export async function clearProjectLocalState(
  projectCode: string,
  storage: StorageLike | null = typeof localStorage !== 'undefined' ? localStorage : null,
  indexedDBRef: IndexedDBLike | null = typeof indexedDB !== 'undefined' ? indexedDB : null
): Promise<void> {
  clearLocalStorageKeys(projectCode, storage);
  await clearIndexedDBBackup(projectCode, indexedDBRef);
}
