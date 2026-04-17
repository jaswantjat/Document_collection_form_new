import type { AIExtraction, DNIData, DocSlot } from '@/types';

export type IdentityDocumentKind = 'dni-card' | 'nie-card' | 'nie-certificate' | 'passport';

function isIdentityDocumentKind(value: unknown): value is IdentityDocumentKind {
  return value === 'dni-card' || value === 'nie-card' || value === 'nie-certificate' || value === 'passport';
}

export function getIdentityDocumentKind(extraction?: AIExtraction | null): IdentityDocumentKind | null {
  const kind = extraction?.identityDocumentKind;
  return isIdentityDocumentKind(kind) ? kind : null;
}

export function isSingleSidedIdentityKind(kind: IdentityDocumentKind | null): boolean {
  return kind === 'nie-card' || kind === 'nie-certificate' || kind === 'passport';
}

function isCombinedDNIImage(extraction?: AIExtraction | null): boolean {
  return !!extraction?.notes?.toLowerCase().includes('combined');
}

export function isIdentityDocumentComplete(dni: Pick<DNIData, 'front' | 'back'>): boolean {
  if (!dni.front.photo) return false;
  const kind = getIdentityDocumentKind(dni.front.extraction);
  if (!kind) return !!dni.back.photo;
  if (!isSingleSidedIdentityKind(kind) && !isCombinedDNIImage(dni.front.extraction)) {
    return !!dni.back.photo;
  }
  return true;
}

export function getIdentityDocumentDoneLabel(dni: Pick<DNIData, 'front' | 'back'>): string {
  const kind = getIdentityDocumentKind(dni.front.extraction);
  if (dni.front.photo && dni.back.photo) return 'DNI / NIE — ambas caras';
  if (dni.front.photo && kind === 'nie-certificate') return 'NIE — certificado válido';
  if (dni.front.photo && kind === 'nie-card') return 'NIE — documento válido';
  if (dni.front.photo && kind === 'passport') return 'Pasaporte — documento válido';
  if (dni.front.photo && isCombinedDNIImage(dni.front.extraction)) return 'DNI / NIE — ambas caras';
  if (dni.front.photo) return 'DNI / NIE — cara principal';
  if (dni.back.photo) return 'DNI / NIE — cara trasera';
  return 'DNI / NIE';
}

export function isDNIBackRequired(front: DocSlot): boolean {
  if (!front.photo) return false;
  const kind = getIdentityDocumentKind(front.extraction);
  if (!kind) return true;
  return !isSingleSidedIdentityKind(kind) && !isCombinedDNIImage(front.extraction);
}

export function getIdentityDocumentPendingLabel(front: DocSlot, back: DocSlot): string | null {
  if (!front.photo && back.photo) return 'Falta la frontal';
  if (front.photo && !back.photo) {
    const kind = getIdentityDocumentKind(front.extraction);
    if (!kind || (kind === 'dni-card' && !isCombinedDNIImage(front.extraction))) {
      return 'Falta la trasera';
    }
  }
  return null;
}

export function shouldStoreAsAdditionalIdentityDocument(
  dni: Pick<DNIData, 'front' | 'back'>,
  incomingSide: 'front' | 'back' | null | undefined,
): boolean {
  if (incomingSide !== 'front' || !dni.front.photo) return false;
  return !isDNIBackRequired(dni.front) || !!dni.back.photo;
}
