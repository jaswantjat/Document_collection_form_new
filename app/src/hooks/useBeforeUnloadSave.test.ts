import { beforeEach, describe, expect, it, vi } from 'vitest';

const effectCalls: Array<{
  callback: () => void | (() => void);
  deps?: unknown[];
}> = [];

vi.mock('react', () => ({
  useEffect: (callback: () => void | (() => void), deps?: unknown[]) => {
    effectCalls.push({ callback, deps });
  },
  useRef: (initialValue: unknown) => ({ current: initialValue }),
}));

describe('useBeforeUnloadSave', () => {
  beforeEach(() => {
    effectCalls.length = 0;
    vi.resetModules();
    vi.restoreAllMocks();
    if (!globalThis.File) {
      vi.stubGlobal('File', class File {});
    }
  });

  it('tracks source in effect deps and rebuilds the keepalive handler with the new source', async () => {
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });

    vi.stubGlobal('window', { addEventListener, removeEventListener });
    vi.stubGlobal('fetch', fetchMock);

    const { useBeforeUnloadSave } = await import('./useBeforeUnloadSave');

    useBeforeUnloadSave(
      'ELT20250001',
      { step: 'review' },
      'customer',
      'project-token-1'
    );

    const firstEffect = effectCalls[1];
    expect(firstEffect?.deps).toEqual([
      'ELT20250001',
      'customer',
      'project-token-1',
    ]);

    const firstCleanup = firstEffect?.callback();
    const firstHandler = addEventListener.mock.calls.at(-1)?.[1] as (() => void) | undefined;
    expect(firstHandler).toBeTypeOf('function');

    firstHandler?.();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toMatchObject({
      source: 'customer',
      formData: { step: 'review' },
    });

    fetchMock.mockClear();
    addEventListener.mockClear();

    if (typeof firstCleanup === 'function') {
      firstCleanup();
    }

    effectCalls.length = 0;

    useBeforeUnloadSave(
      'ELT20250001',
      { step: 'review' },
      'assessor',
      'project-token-1'
    );

    const secondEffect = effectCalls[1];
    expect(secondEffect?.deps).toEqual([
      'ELT20250001',
      'assessor',
      'project-token-1',
    ]);

    secondEffect?.callback();
    const secondHandler = addEventListener.mock.calls.at(-1)?.[1] as (() => void) | undefined;

    expect(removeEventListener).toHaveBeenCalledWith('beforeunload', firstHandler);
    expect(secondHandler).toBeTypeOf('function');
    expect(secondHandler).not.toBe(firstHandler);

    secondHandler?.();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/project/ELT20250001/save?token=project-token-1');
    expect(request.keepalive).toBe(true);
    expect(request.headers).toMatchObject({
      'Content-Type': 'application/json',
      'x-project-token': 'project-token-1',
    });
    expect(JSON.parse(String(request.body))).toMatchObject({
      source: 'assessor',
      formData: { step: 'review' },
    });
  });
});
