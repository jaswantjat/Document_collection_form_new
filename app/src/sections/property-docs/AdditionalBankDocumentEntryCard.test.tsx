import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { AdditionalBankDocumentEntryCard } from '@/sections/property-docs/AdditionalBankDocumentEntryCard';
import type { AdditionalBankDocumentEntry } from '@/types';

function makeEntry(): AdditionalBankDocumentEntry {
  return {
    id: 'payroll-1',
    type: 'payroll',
    files: [{
      id: 'payroll-file',
      filename: 'payroll.pdf',
      mimeType: 'application/pdf',
      dataUrl: 'data:application/pdf;base64,JVBERi0xLjQK',
      timestamp: 1,
      sizeBytes: 120,
    }],
    extraction: {
      extractedData: {
        holderName: 'Ana Pérez López',
        issuerName: 'Empresa Demo',
        period: 'Marzo 2026',
        amount: '1.250 EUR',
        summary: 'AI summary text',
      },
      confidence: 0.96,
      isCorrectDocument: true,
      documentTypeDetected: 'Payroll',
      needsManualReview: true,
      confirmedByUser: true,
    },
    issue: {
      code: 'manual-review',
      message: 'Hemos guardado el documento, pero conviene revisarlo antes de tramitarlo.',
      updatedAt: '2026-04-15T00:00:00Z',
    },
  };
}

describe('AdditionalBankDocumentEntryCard', () => {
  it('shows the Spanish label and manual-review badge without rendering AI summary fields', () => {
    const html = renderToStaticMarkup(
      createElement(AdditionalBankDocumentEntryCard, {
        accept: 'image/jpeg,application/pdf',
        busy: false,
        entry: makeEntry(),
        formatFileSize: (sizeBytes: number) => `${sizeBytes} B`,
        onRemove: () => undefined,
        onReplace: () => undefined,
      })
    );

    expect(html).toContain('Nómina');
    expect(html).toContain('Revisar');
    expect(html).not.toContain('AI summary text');
    expect(html).not.toContain('Ana Pérez López');
    expect(html).not.toContain('Empresa Demo');
    expect(html).not.toContain('Marzo 2026');
  });
});
