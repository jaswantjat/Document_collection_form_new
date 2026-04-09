import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { clearSubmissionAttempt, getOrCreateSubmissionAttempt } from './submissionAttempt';

const storage = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => { storage.set(key, value); },
  removeItem: (key: string) => { storage.delete(key); },
});

describe('submissionAttempt', () => {
  beforeEach(() => storage.clear());
  afterEach(() => storage.clear());

  it('reuses the same attempt id until it is cleared', () => {
    const first = getOrCreateSubmissionAttempt('ELT-1');
    const second = getOrCreateSubmissionAttempt('ELT-1');

    expect(first).toBeTruthy();
    expect(second).toBe(first);
  });

  it('creates a new attempt id after clear', () => {
    const first = getOrCreateSubmissionAttempt('ELT-2');
    clearSubmissionAttempt('ELT-2');
    const second = getOrCreateSubmissionAttempt('ELT-2');

    expect(second).not.toBe(first);
  });
});
