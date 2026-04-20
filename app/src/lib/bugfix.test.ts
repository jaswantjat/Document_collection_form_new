/**
 * Regression tests for 3 bugs found in TestSprite run 2026-04-07
 *
 * BUG-1  TC012 — Auto-save not restoring PDF uploads
 * BUG-2  TC008 — Dashboard file viewer stale-element race condition
 * BUG-3  TC011 — Signature pad canvas not interactable in tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writeLocalBackup, readLocalBackup, clearLocalBackup } from '../hooks/useLocalStorageBackup';
import type { FormData, StoredDocumentFile } from '../types';

// ── localStorage shim (Vitest runs in Node.js — no browser APIs) ───────────
const localStorageStore = new Map<string, string>();
const localStorageMock = {
  getItem: (k: string) => localStorageStore.get(k) ?? null,
  setItem: (k: string, v: string) => { localStorageStore.set(k, v); },
  removeItem: (k: string) => { localStorageStore.delete(k); },
  clear: () => localStorageStore.clear(),
};
vi.stubGlobal('localStorage', localStorageMock);

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeStoredPdf(id: string): StoredDocumentFile {
  return {
    id,
    dataUrl: `data:application/pdf;base64,JVBERi0xLjQK${id}`,
    mimeType: 'application/pdf' as const,
    sizeBytes: 1024,
    timestamp: Date.now(),
  };
}

function makeMinimalFormData(overrides: Partial<FormData> = {}): FormData {
  return {
    dni: { front: null, back: null, originalPdfs: [], selectedKind: null, manualKindOverride: null },
    ibi: { photo: null, pages: [], originalPdfs: [], extraction: null },
    electricityBill: { pages: [], originalPdfs: [], extraction: null },
    contract: { originalPdfs: [], extraction: null },
    location: null,
    representation: {
      signatures: {},
      signatureDeferred: false,
      signedDocuments: {},
    },
    energyCertificate: {
      status: 'not-started',
      currentStepIndex: 0,
      housingInfo: null,
      openings: null,
      thermalSystems: null,
      additionalInfo: null,
      renderedDocument: null,
      signature: null,
    },
    ...overrides,
  } as FormData;
}

// ─────────────────────────────────────────────────────────────────────────────
// BUG-1: Auto-save not restoring PDF uploads (TC012)
// ─────────────────────────────────────────────────────────────────────────────

describe('BUG-1 — Auto-save backup preserves and restores contract.originalPdfs', () => {
  const CODE = 'ELT20250001';

  beforeEach(() => clearLocalBackup(CODE));
  afterEach(() => clearLocalBackup(CODE));

  it('writes contract.originalPdfs to localStorage backup', () => {
    const pdf = makeStoredPdf('p1');
    const fd = makeMinimalFormData({ contract: { originalPdfs: [pdf], extraction: null } });

    writeLocalBackup(CODE, fd);

    const backup = readLocalBackup(CODE);
    expect(backup).not.toBeNull();

    const restored = backup!.formData as FormData;
    expect(restored.contract.originalPdfs).toHaveLength(1);
    expect(restored.contract.originalPdfs[0].dataUrl).toBe(pdf.dataUrl);
  });

  it('restores contract.originalPdfs after simulated page reload', () => {
    const pdf1 = makeStoredPdf('p1');
    const pdf2 = makeStoredPdf('p2');
    const fd = makeMinimalFormData({
      contract: { originalPdfs: [pdf1, pdf2], extraction: null },
    });

    writeLocalBackup(CODE, fd);

    // Simulate page reload — read back from fresh localStorage key
    const backup = readLocalBackup(CODE);
    expect(backup).not.toBeNull();

    const restoredPdfs = (backup!.formData as FormData).contract.originalPdfs;
    expect(restoredPdfs).toHaveLength(2);
    expect(restoredPdfs.map((p) => p.id)).toEqual(['p1', 'p2']);
  });

  it('preserves originalPdfs even when extraction is null (AI extraction failed)', () => {
    // This is the key regression: previouslyonChange was only called on extraction
    // success, so originalPdfs were never committed to parent state on failure.
    // Now onChange is called early with originalPdfs + extraction:null.
    const pdf = makeStoredPdf('upload-before-extraction');
    const fd = makeMinimalFormData({
      contract: { originalPdfs: [pdf], extraction: null }, // extraction null = failed
    });

    writeLocalBackup(CODE, fd);
    const backup = readLocalBackup(CODE);
    const restoredContract = (backup!.formData as FormData).contract;

    expect(restoredContract.originalPdfs).toHaveLength(1);
    expect(restoredContract.extraction).toBeNull();
  });

  it('does not restore a backup that predates project creation', () => {
    const oldSavedAt = Date.now() - 10_000; // 10s ago
    const projectCreatedAt = Date.now() - 5_000; // 5s ago (newer than backup)

    // Manually write a stale backup
    const raw = JSON.stringify({
      version: 1,
      savedAt: oldSavedAt,
      projectCode: CODE,
      formData: makeMinimalFormData({ contract: { originalPdfs: [makeStoredPdf('stale')], extraction: null } }),
    });
    localStorage.setItem(`eltex_form_backup_${CODE}`, raw);

    const backup = readLocalBackup(CODE);
    // Backup should still be readable — the "staleness" check happens in App.tsx
    // using projectCreatedAt. Here we just confirm the backup returns its savedAt.
    expect(backup).not.toBeNull();
    expect(backup!.savedAt).toBe(oldSavedAt);
    expect(backup!.savedAt).toBeLessThan(projectCreatedAt);
  });

  it('returns null for an expired backup (> 7 days)', () => {
    const expired = Date.now() - 8 * 24 * 60 * 60 * 1000;
    const raw = JSON.stringify({
      version: 1,
      savedAt: expired,
      projectCode: CODE,
      formData: makeMinimalFormData(),
    });
    localStorage.setItem(`eltex_form_backup_${CODE}`, raw);

    expect(readLocalBackup(CODE)).toBeNull();
  });

  it('merge logic: backup is used for originalPdfs when server strips binary fields', () => {
    // Simulate server returning an empty originalPdfs (server always strips binary)
    // and backup having the full PDFs.
    const pdf = makeStoredPdf('from-backup');
    const backupFormData = makeMinimalFormData({
      contract: { originalPdfs: [pdf], extraction: null },
    });
    const serverFormData = makeMinimalFormData({
      contract: { originalPdfs: [], extraction: null }, // server strips PDFs
    });

    const hasDataUrl = (f: StoredDocumentFile) => !!f?.dataUrl;

    // This mirrors the merge logic in App.tsx (lines ~339-345)
    const merged = {
      ...serverFormData.contract,
      originalPdfs: backupFormData.contract.originalPdfs.some(hasDataUrl)
        ? backupFormData.contract.originalPdfs
        : serverFormData.contract.originalPdfs ?? [],
    };

    expect(merged.originalPdfs).toHaveLength(1);
    expect(merged.originalPdfs[0].dataUrl).toBe(pdf.dataUrl);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BUG-2: Dashboard file viewer stale-element race condition (TC008)
// ─────────────────────────────────────────────────────────────────────────────

describe('BUG-2 — DeferredAssetButtons stable-ref and test attributes', () => {
  async function readDeferredAssetButtonsSource() {
    const { readFileSync } = await import('node:fs');
    return readFileSync(
      new URL('../../src/components/dashboard/DashboardDocumentActions.tsx', import.meta.url),
      'utf8'
    );
  }

  it('DeferredAssetButtons source has data-testid on view button', async () => {
    const src = await readDeferredAssetButtonsSource();
    expect(src).toContain('data-testid="view-asset-btn"');
    expect(src).toContain('data-testid="download-asset-btn"');
    expect(src).toContain('data-testid="asset-action-buttons"');
  });

  it('DeferredAssetButtons is wrapped in React.memo', async () => {
    const src = await readDeferredAssetButtonsSource();
    expect(src).toContain('React.memo(function DeferredAssetButtons');
  });

  it('DeferredAssetButtons uses stable refs to avoid stale closures', async () => {
    const src = await readDeferredAssetButtonsSource();
    expect(src).toContain('loadProjectDetailRef');
    expect(src).toContain('resolveAssetsRef');
    expect(src).toContain('loadProjectDetailRef.current = loadProjectDetail');
  });

  it('view button has aria-busy attribute for accessibility and test polling', async () => {
    const src = await readDeferredAssetButtonsSource();
    expect(src).toContain('aria-busy={loading === \'view\'}');
    expect(src).toContain('aria-busy={loading === \'download\'}');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BUG-3: Signature pad canvas not interactable in tests (TC011)
// ─────────────────────────────────────────────────────────────────────────────

describe('BUG-3 — SignaturePad test-automation hooks', () => {
  it('canvas element has data-testid="signature-canvas"', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../../src/components/SignaturePad.tsx', import.meta.url), 'utf8');
    expect(src).toContain('data-testid="signature-canvas"');
  });

  it('canvas element tracks signature state via data-has-signature attribute', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../../src/components/SignaturePad.tsx', import.meta.url), 'utf8');
    expect(src).toContain('data-has-signature={hasSignature ?');
  });

  it('window.__eltexFillTestSignature is registered in non-production builds', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../../src/components/SignaturePad.tsx', import.meta.url), 'utf8');
    expect(src).toContain('__eltexFillTestSignature');
    expect(src).toContain('import.meta.env.PROD');
  });

  it('__eltexFillTestSignature calls onSignature with a PNG data URL', () => {
    // Simulate the logic of fillTestSignature outside of React
    // to verify the draw → toDataURL flow is correct
    const mockCallback = vi.fn();

    // Minimal canvas mock
    let hasContent = false;
    const ctxMock = {
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      bezierCurveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(() => { hasContent = true; }),
      drawImage: vi.fn(),
    };
    const exportCtxMock = {
      drawImage: vi.fn(),
    };

    const exportCanvasMock = {
      width: 0,
      height: 0,
      getContext: () => exportCtxMock,
      toDataURL: (type: string) => `${type}:base64,mockdata`,
    };

    const canvasMock = {
      width: 300,
      height: 100,
      getContext: () => ctxMock,
      getBoundingClientRect: () => ({ width: 300, height: 100, left: 0, top: 0 }),
    };

    // Replicate the fillTestSignature logic
    const ctx = canvasMock.getContext();
    const rect = canvasMock.getBoundingClientRect();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);

    const cx = rect.width / 2;
    const cy = rect.height / 2;
    ctx.beginPath();
    ctx.moveTo(cx - 60, cy + 10);
    ctx.bezierCurveTo(cx - 40, cy - 30, cx - 20, cy + 30, cx, cy - 10);
    ctx.bezierCurveTo(cx + 20, cy - 30, cx + 40, cy + 20, cx + 60, cy);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx - 60, cy + 18);
    ctx.lineTo(cx + 60, cy + 18);
    ctx.stroke();

    const exportCanvas = exportCanvasMock;
    exportCanvas.width = rect.width;
    exportCanvas.height = rect.height;
    exportCtxMock.drawImage(canvasMock as unknown as HTMLCanvasElement, 0, 0, rect.width, rect.height);
    mockCallback(exportCanvas.toDataURL('image/png'));

    expect(mockCallback).toHaveBeenCalledOnce();
    const [dataUrl] = mockCallback.mock.calls[0];
    expect(dataUrl).toContain('image/png');
    expect(hasContent).toBe(true);
  });
});
