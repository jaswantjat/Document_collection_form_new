import { describe, expect, it } from 'vitest';
import {
  clearChunkReloadAttempt,
  clearRuntimeErrorRecoveryAttempt,
  getRuntimeErrorRecoveryAction,
  isChunkLoadError,
  markChunkReloadAttempt,
  markRuntimeErrorRecoveryAttempt,
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

    expect(
      isChunkLoadError({
        name: 'SyntaxError',
        message: "Unexpected token '<'",
      })
    ).toBe(true);

    expect(
      isChunkLoadError({
        name: 'SyntaxError',
        message: "expected expression, got '<'",
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

describe('runtime project recovery tracking', () => {
  it('reloads once, then clears project-local state, then stops auto-recovering', () => {
    const storage = createStorage();
    const error = {
      name: 'TypeError',
      message: "Cannot read properties of undefined (reading 'map')",
    };
    const url = 'https://documentos.eltex.es/?code=ELT20260083';

    expect(getRuntimeErrorRecoveryAction(error, storage, url, 1000)).toBe('reload');

    markRuntimeErrorRecoveryAttempt(storage, url, 'reload', 1000);
    expect(getRuntimeErrorRecoveryAction(error, storage, url, 2000)).toBe('clear-project-state');

    markRuntimeErrorRecoveryAttempt(storage, url, 'cleared', 2000);
    expect(getRuntimeErrorRecoveryAction(error, storage, url, 3000)).toBe('none');

    clearRuntimeErrorRecoveryAttempt(storage, url);
    expect(getRuntimeErrorRecoveryAction(error, storage, url, 4000)).toBe('reload');
  });

  it('does not run project-local recovery for chunk errors or pages without a project code', () => {
    const storage = createStorage();
    const chunkError = {
      name: 'TypeError',
      message: 'Failed to fetch dynamically imported module',
    };
    const runtimeError = {
      name: 'TypeError',
      message: "Cannot read properties of undefined (reading 'map')",
    };

    expect(getRuntimeErrorRecoveryAction(chunkError, storage, 'https://documentos.eltex.es/?code=ELT1')).toBe('none');
    expect(getRuntimeErrorRecoveryAction(runtimeError, storage, 'https://documentos.eltex.es/')).toBe('none');
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

  it('auto-reloads html parse errors caused by stale lazy chunks', () => {
    const storage = createStorage();
    const error = {
      name: 'SyntaxError',
      message: "Unexpected token '<'",
    };

    expect(
      shouldAutoReloadChunkError(error, storage, 'https://documentos.eltex.es/dashboard')
    ).toBe(true);
  });
});
