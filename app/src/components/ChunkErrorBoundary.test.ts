import { describe, expect, it } from 'vitest';
import {
  clearChunkReloadAttempt,
  isChunkLoadError,
  markChunkReloadAttempt,
  shouldAutoReloadChunkError,
} from './ChunkErrorBoundary';

function createStorage() {
  const values = new Map<string, string>();

  return {
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

describe('isChunkLoadError', () => {
  it('recognizes common browser messages for failed lazy imports', () => {
    expect(
      isChunkLoadError({
        name: 'TypeError',
        message: 'Failed to fetch dynamically imported module',
      })
    ).toBe(true);

    expect(
      isChunkLoadError({
        name: 'TypeError',
        message: 'Importing a module script failed.',
      })
    ).toBe(true);

    expect(
      isChunkLoadError({
        name: 'TypeError',
        message: 'Load failed',
      })
    ).toBe(true);
  });

  it('does not classify generic runtime crashes as chunk load errors', () => {
    expect(
      isChunkLoadError({
        name: 'TypeError',
        message: "Cannot read properties of undefined (reading 'foo')",
      })
    ).toBe(false);
  });
});

describe('chunk reload attempt tracking', () => {
  it('allows one automatic reload per url and then stops retrying', () => {
    const storage = createStorage();
    const error = {
      name: 'TypeError',
      message: 'Importing a module script failed.',
    };
    const url = 'https://documentos.eltex.es/?code=ELT123';

    expect(shouldAutoReloadChunkError(error, storage, url)).toBe(true);

    markChunkReloadAttempt(storage, url);

    expect(shouldAutoReloadChunkError(error, storage, url)).toBe(false);

    clearChunkReloadAttempt(storage, url);

    expect(shouldAutoReloadChunkError(error, storage, url)).toBe(true);
  });

  it('does not auto-reload generic runtime errors', () => {
    const storage = createStorage();
    const error = {
      name: 'TypeError',
      message: 'Unexpected token',
    };

    expect(
      shouldAutoReloadChunkError(error, storage, 'https://documentos.eltex.es/')
    ).toBe(false);
  });
});
