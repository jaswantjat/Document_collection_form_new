import { describe, expect, it } from 'vitest';
import { normalizeSingleDniExtractionResponse } from './dniExtraction';

describe('dniExtraction', () => {
  it('converts a successful single-image DNI response into batch-like shape', () => {
    const response = normalizeSingleDniExtractionResponse({
      success: true,
      side: 'front',
      extraction: {
        extractedData: { fullName: 'Geert Elschot', dniNumber: 'Z3806141Z' },
        confidence: 0.94,
        isCorrectDocument: true,
        documentTypeDetected: 'passport',
        identityDocumentKind: 'passport',
        needsManualReview: false,
        confirmedByUser: true,
      },
      needsManualReview: false,
      message: 'Datos extraídos correctamente.',
    });

    expect(response.success).toBe(true);
    expect(response.results).toHaveLength(1);
    expect(response.results?.[0]).toMatchObject({
      side: 'front',
      message: 'Datos extraídos correctamente.',
      extraction: {
        identityDocumentKind: 'passport',
      },
    });
  });

  it('keeps failed single-image DNI responses as save-without-extraction fallbacks', () => {
    const response = normalizeSingleDniExtractionResponse({
      success: false,
      reason: 'temporary-error',
      message: 'Error en el análisis. Inténtalo de nuevo en unos segundos.',
    });

    expect(response).toEqual({
      success: false,
      message: 'Error en el análisis. Inténtalo de nuevo en unos segundos.',
    });
  });
});
