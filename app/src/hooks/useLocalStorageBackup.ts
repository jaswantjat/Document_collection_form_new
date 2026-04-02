import { useEffect, useRef } from 'react';

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
  try {
    const entry: LocalBackupEntry = {
      version: BACKUP_VERSION,
      savedAt: Date.now(),
      projectCode,
      formData: cleanFormDataForStorage(formData),
    };
    localStorage.setItem(backupKey(projectCode), JSON.stringify(entry));
  } catch {
    // Storage might be full or unavailable — fail silently
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
