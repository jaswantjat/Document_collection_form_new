import { describe, expect, it } from 'vitest';
import {
  clearProjectLocalState,
  getProjectCodeFromUrl,
} from './projectLocalStateRecovery';

function createStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    removeItem(key: string) {
      values.delete(key);
    },
  };
}

describe('project local state recovery', () => {
  it('extracts the project code from current and legacy form URLs', () => {
    expect(getProjectCodeFromUrl('https://documentos.eltex.es/?code=ELT20260083')).toBe('ELT20260083');
    expect(getProjectCodeFromUrl('https://documentos.eltex.es/?project=ELT20260083')).toBe('ELT20260083');
    expect(getProjectCodeFromUrl('not a url')).toBeNull();
  });

  it('clears only the affected project backup and saved section', async () => {
    const storage = createStorage();
    storage.setItem('eltex_form_backup_ELT20260083', 'bad-local-draft');
    storage.setItem('eltex_section_ELT20260083', 'property-docs');
    storage.setItem('eltex_form_backup_ELT20260081', 'other-draft');

    await clearProjectLocalState('ELT20260083', storage, null);

    expect(storage.getItem('eltex_form_backup_ELT20260083')).toBeNull();
    expect(storage.getItem('eltex_section_ELT20260083')).toBeNull();
    expect(storage.getItem('eltex_form_backup_ELT20260081')).toBe('other-draft');
  });
});
