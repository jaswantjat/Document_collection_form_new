import { describe, expect, it } from 'vitest';
import {
  createDocumentIssue,
  getDocumentIssueMessage,
  getExtractionFailureIssueCode,
} from './documentIssues';

describe('documentIssues', () => {
  it('hides raw temporary extraction errors behind customer-safe copy', () => {
    expect(getDocumentIssueMessage('temporary-error', 'extract unavailable')).toContain(
      'la lectura automática no pudo completarse'
    );
    expect(createDocumentIssue('temporary-error', 'extract unavailable').message).toContain(
      'la lectura automática no pudo completarse'
    );
  });

  it('keeps customer-safe temporary extraction detail when present', () => {
    const message = getDocumentIssueMessage(
      'temporary-error',
      'Error en el análisis. Inténtalo de nuevo en unos segundos.',
    );
    expect(message).toContain('la lectura automática no pudo completarse');
    expect(message).toContain('Error en el análisis');
  });

  it('keeps explicit corrective messaging for wrong documents', () => {
    const message = 'Este archivo no corresponde al IBI.';
    expect(getDocumentIssueMessage('wrong-document', message)).toBe(message);
  });

  it('maps extraction responses to the right issue codes', () => {
    expect(getExtractionFailureIssueCode({ reason: 'wrong-document' })).toBe('wrong-document');
    expect(getExtractionFailureIssueCode({ isUnreadable: true })).toBe('unreadable');
    expect(getExtractionFailureIssueCode({ isWrongSide: true })).toBe('wrong-side');
    expect(getExtractionFailureIssueCode({ reason: 'temporary-error' })).toBe('temporary-error');
    expect(getExtractionFailureIssueCode({})).toBe('temporary-error');
  });
});
