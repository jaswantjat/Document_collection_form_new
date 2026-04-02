import { useEffect, useRef } from 'react';
import { writeIndexedDBBackup, clearIndexedDBBackup } from './useIndexedDBBackup';

const BACKUP_VERSION = 1;
const BACKUP_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface LocalBackupEntry {
  version: number;
  savedAt: number;
  projectCode: string;
  formData: unknown;
}

function backupKey(projectCode: string): string {
  return `eltex_form_backup_${projectCode}`;
}

function cleanFormDataForStorage(formData: unknown): unknown {
  return JSON.parse(JSON.stringify(formData, (_key, value) => {
    if (value instanceof File) return undefined;
    return value;
  }));
}

export function writeLocalBackup(projectCode: string, formData: unknown): void {
  const cleaned = cleanFormDataForStorage(formData);
  const now = Date.now();

  // Always write to IndexedDB first (no size limit, survives large photo payloads).
  void writeIndexedDBBackup(projectCode, cleaned);

  // Also try localStorage as a fast-path fallback (synchronous read on next load).
  try {
    const entry: LocalBackupEntry = {
      version: BACKUP_VERSION,
      savedAt: now,
      projectCode,
      formData: cleaned,
    };
    localStorage.setItem(backupKey(projectCode), JSON.stringify(entry));
  } catch {
    // Storage quota exceeded — IndexedDB backup covers this case, so fail silently.
  }
}

export function readLocalBackup(projectCode: string): { formData: unknown; savedAt: number } | null {
  try {
    const raw = localStorage.getItem(backupKey(projectCode));
    if (!raw) return null;
    const entry = JSON.parse(raw) as LocalBackupEntry;
    if (entry.version !== BACKUP_VERSION) return null;
    if (Date.now() - entry.savedAt > BACKUP_TTL_MS) {
      localStorage.removeItem(backupKey(projectCode));
      return null;
    }
    if (entry.projectCode !== projectCode) return null;
    return { formData: entry.formData, savedAt: entry.savedAt };
  } catch {
    return null;
  }
}

export function clearLocalBackup(projectCode: string): void {
  try {
    localStorage.removeItem(backupKey(projectCode));
  } catch {
    // ignore
  }
  void clearIndexedDBBackup(projectCode);
}

export function useLocalStorageBackup(
  projectCode: string | null,
  formData: unknown
): void {
  const formDataRef = useRef(formData);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    formDataRef.current = formData;
  });

  useEffect(() => {
    if (!projectCode) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      writeLocalBackup(projectCode, formDataRef.current);
    }, 300);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [projectCode, formData]);
}
