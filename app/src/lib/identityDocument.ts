import type { AIExtraction, DNIData, DocSlot } from '@/types';

export type IdentityDocumentKind = 'dni-card' | 'nie-card' | 'nie-certificate';

function isIdentityDocumentKind(value: unknown): value is IdentityDocumentKind {
  return value === 'dni-card' || value === 'nie-card' || value === 'nie-certificate';
}

export function getIdentityDocumentKind(extraction?: AIExtraction | null): IdentityDocumentKind | null {
  const kind = extraction?.identityDocumentKind;
  return isIdentityDocumentKind(kind) ? kind : null;
}

export function isSingleSidedIdentityKind(kind: IdentityDocumentKind | null): boolean {
  return kind === 'nie-card' || kind === 'nie-certificate';
}

export function isIdentityDocumentComplete(dni: Pick<DNIData, 'front' | 'back'>): boolean {
  return !!dni.front.photo;
}

export function getIdentityDocumentDoneLabel(dni: Pick<DNIData, 'front' | 'back'>): string {
  const kind = getIdentityDocumentKind(dni.front.extraction);
  if (dni.front.photo && dni.back.photo) return 'DNI / NIE — ambas caras';
  if (dni.front.photo && kind === 'nie-certificate') {
    return 'NIE — certificado válido';
  }
  if (dni.front.photo && kind === 'nie-card') {
    return 'NIE — documento válido';
  }
  if (dni.front.photo) return 'DNI / NIE — cara principal';
  if (dni.back.photo) return 'DNI / NIE — cara trasera';
  return 'DNI / NIE';
}

export function getIdentityDocumentPendingLabel(front: DocSlot, back: DocSlot): string | null {
  if (!front.photo && back.photo) return 'Falta la frontal';
  return null;
}
