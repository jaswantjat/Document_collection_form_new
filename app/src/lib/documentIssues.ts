import type { DocumentIssue, DocumentIssueCode } from '@/types';

const DEFAULT_ISSUE_MESSAGES: Record<DocumentIssueCode, string> = {
  'manual-review': 'Hemos guardado el documento, pero conviene revisarlo antes de tramitarlo.',
  'temporary-error': 'Hemos guardado el documento, pero la lectura automática no pudo completarse. Puedes continuar y revisarlo más tarde.',
  'unreadable': 'No hemos podido leer el documento. Sube una foto más nítida o un PDF legible.',
  'wrong-document': 'El archivo no parece corresponder a este documento. Revísalo y súbelo de nuevo.',
  'wrong-side': 'La imagen corresponde a la cara equivocada. Revisa el documento y vuelve a subirlo.',
};

export function getDocumentIssueMessage(code: DocumentIssueCode, message?: string): string {
  if (code === 'temporary-error') {
    return DEFAULT_ISSUE_MESSAGES[code];
  }
  const trimmedMessage = message?.trim();
  return trimmedMessage || DEFAULT_ISSUE_MESSAGES[code];
}

export function createDocumentIssue(code: DocumentIssueCode, message: string): DocumentIssue {
  return {
    code,
    message: getDocumentIssueMessage(code, message),
    updatedAt: new Date().toISOString(),
  };
}

export function isRecoverableDocumentIssue(code: DocumentIssueCode): boolean {
  return code === 'manual-review' || code === 'temporary-error';
}
