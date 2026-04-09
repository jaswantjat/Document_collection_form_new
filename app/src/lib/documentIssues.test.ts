import { describe, expect, it } from 'vitest';
import { createDocumentIssue, getDocumentIssueMessage } from './documentIssues';

describe('documentIssues', () => {
  it('normalizes temporary extraction failures to customer-safe copy', () => {
    expect(getDocumentIssueMessage('temporary-error', 'extract unavailable')).toContain(
      'la lectura automática no pudo completarse'
    );
    expect(createDocumentIssue('temporary-error', 'extract unavailable').message).toContain(
      'la lectura automática no pudo completarse'
    );
  });

  it('keeps explicit corrective messaging for wrong documents', () => {
    const message = 'Este archivo no corresponde al IBI.';
    expect(getDocumentIssueMessage('wrong-document', message)).toBe(message);
  });
});
