import { describe, it, expect } from 'vitest';
import type { AIExtraction, DNIData, DocSlot, UploadedPhoto } from '@/types';
import {
  getIdentityDocumentKind,
  isSingleSidedIdentityKind,
  isIdentityDocumentComplete,
  getIdentityDocumentDoneLabel,
  getIdentityDocumentPendingLabel,
  isDNIBackRequired,
} from './identityDocument';

function createMockPhoto(id = 'photo-1'): UploadedPhoto {
  return {
    id,
    preview: 'data:image/jpeg;base64,test',
    timestamp: Date.now(),
    sizeBytes: 1024,
  };
}

function createMockExtraction(kind?: 'dni-card' | 'nie-card' | 'nie-certificate'): AIExtraction {
  return {
    extractedData: {},
    confidence: 0.95,
    isCorrectDocument: true,
    documentTypeDetected: kind || 'dni-card',
    identityDocumentKind: kind,
    needsManualReview: false,
    confirmedByUser: true,
  };
}

function createDocSlot(photo: UploadedPhoto | null, extraction: AIExtraction | null): DocSlot {
  return {
    photo,
    extraction,
  };
}

describe('identityDocument', () => {
  describe('isIdentityDocumentComplete', () => {
    // Test 1: front only (DNI card) → isIdentityDocumentComplete = false (back required)
    it('Test 1: front only (DNI card) → should NOT be complete (back required)', () => {
      const dni: Pick<DNIData, 'front' | 'back'> = {
        front: createDocSlot(createMockPhoto('front-1'), createMockExtraction('dni-card')),
        back: createDocSlot(null, null),
      };
      expect(isIdentityDocumentComplete(dni)).toBe(false);
    });

    // Test 2: front only (NIE card) → isIdentityDocumentComplete = true
    it('Test 2: front only (NIE card) → should be complete', () => {
      const dni: Pick<DNIData, 'front' | 'back'> = {
        front: createDocSlot(createMockPhoto('front-2'), createMockExtraction('nie-card')),
        back: createDocSlot(null, null),
      };
      expect(isIdentityDocumentComplete(dni)).toBe(true);
    });

    // Test 3: front only (NIE cert) → isIdentityDocumentComplete = true
    it('Test 3: front only (NIE cert) → should be complete', () => {
      const dni: Pick<DNIData, 'front' | 'back'> = {
        front: createDocSlot(createMockPhoto('front-3'), createMockExtraction('nie-certificate')),
        back: createDocSlot(null, null),
      };
      expect(isIdentityDocumentComplete(dni)).toBe(true);
    });

    // Test 4: front only (passport/unknown) → isIdentityDocumentComplete = true
    it('Test 4: front only (passport/unknown) → should be complete', () => {
      const dni: Pick<DNIData, 'front' | 'back'> = {
        front: createDocSlot(createMockPhoto('front-4'), createMockExtraction()),
        back: createDocSlot(null, null),
      };
      expect(isIdentityDocumentComplete(dni)).toBe(true);
    });

    // Test 5: both front and back → isIdentityDocumentComplete = true
    it('Test 5: both front and back → should be complete', () => {
      const dni: Pick<DNIData, 'front' | 'back'> = {
        front: createDocSlot(createMockPhoto('front-5'), createMockExtraction('dni-card')),
        back: createDocSlot(createMockPhoto('back-5'), createMockExtraction()),
      };
      expect(isIdentityDocumentComplete(dni)).toBe(true);
    });

    // Test 6: no photos at all → isIdentityDocumentComplete = false
    it('Test 6: no photos at all → should not be complete', () => {
      const dni: Pick<DNIData, 'front' | 'back'> = {
        front: createDocSlot(null, null),
        back: createDocSlot(null, null),
      };
      expect(isIdentityDocumentComplete(dni)).toBe(false);
    });

    // Test 7: back only (no front) → isIdentityDocumentComplete = false
    it('Test 7: back only (no front) → should not be complete', () => {
      const dni: Pick<DNIData, 'front' | 'back'> = {
        front: createDocSlot(null, null),
        back: createDocSlot(createMockPhoto('back-7'), createMockExtraction()),
      };
      expect(isIdentityDocumentComplete(dni)).toBe(false);
    });

    // Test 7b: combined DNI image (both sides in one photo, notes contains 'combined') → complete
    it('Test 7b: combined DNI image → should be complete (both sides in one photo)', () => {
      const combinedExtraction: AIExtraction = {
        ...createMockExtraction('dni-card'),
        notes: 'combined image',
      };
      const dni: Pick<DNIData, 'front' | 'back'> = {
        front: createDocSlot(createMockPhoto('front-7b'), combinedExtraction),
        back: createDocSlot(null, null),
      };
      expect(isIdentityDocumentComplete(dni)).toBe(true);
    });

    // Test 7c: front photo present but extraction null (still processing) → complete (don't block until kind known)
    it('Test 7c: front photo with null extraction → complete (do not block while extraction pending)', () => {
      const dni: Pick<DNIData, 'front' | 'back'> = {
        front: createDocSlot(createMockPhoto('front-7c'), null),
        back: createDocSlot(null, null),
      };
      expect(isIdentityDocumentComplete(dni)).toBe(true);
    });
  });

  describe('getIdentityDocumentPendingLabel', () => {
    // Test 8: pendingLabel: DNI card front only → "Falta la trasera" (back is required for DNI cards)
    it('Test 8: DNI card front only → should return "Falta la trasera"', () => {
      const front = createDocSlot(createMockPhoto('front-8'), createMockExtraction('dni-card'));
      const back = createDocSlot(null, null);
      expect(getIdentityDocumentPendingLabel(front, back)).toBe('Falta la trasera');
    });

    // Test 9: pendingLabel: back only → "Falta la frontal"
    it('Test 9: back only → should return "Falta la frontal"', () => {
      const front = createDocSlot(null, null);
      const back = createDocSlot(createMockPhoto('back-9'), createMockExtraction());
      expect(getIdentityDocumentPendingLabel(front, back)).toBe('Falta la frontal');
    });

    // Test 10: pendingLabel: both → null
    it('Test 10: both front and back → should return null', () => {
      const front = createDocSlot(createMockPhoto('front-10'), createMockExtraction('dni-card'));
      const back = createDocSlot(createMockPhoto('back-10'), createMockExtraction());
      expect(getIdentityDocumentPendingLabel(front, back)).toBeNull();
    });

    // Test 11: pendingLabel: neither → null
    it('Test 11: neither front nor back → should return null', () => {
      const front = createDocSlot(null, null);
      const back = createDocSlot(null, null);
      expect(getIdentityDocumentPendingLabel(front, back)).toBeNull();
    });

    // Test 11b: NIE certificate front only → null (back not required)
    it('Test 11b: NIE certificate front only → should return null (no back required)', () => {
      const front = createDocSlot(createMockPhoto('front-11b'), createMockExtraction('nie-certificate'));
      const back = createDocSlot(null, null);
      expect(getIdentityDocumentPendingLabel(front, back)).toBeNull();
    });

    // Test 11c: combined DNI front only → null (back not required, both sides in one photo)
    it('Test 11c: combined DNI image front only → should return null (back not required)', () => {
      const combinedExtraction: AIExtraction = { ...createMockExtraction('dni-card'), notes: 'combined image' };
      const front = createDocSlot(createMockPhoto('front-11c'), combinedExtraction);
      const back = createDocSlot(null, null);
      expect(getIdentityDocumentPendingLabel(front, back)).toBeNull();
    });
  });

  describe('isDNIBackRequired', () => {
    it('returns true for DNI card with front only', () => {
      const front = createDocSlot(createMockPhoto('f'), createMockExtraction('dni-card'));
      expect(isDNIBackRequired(front)).toBe(true);
    });

    it('returns false for NIE certificate', () => {
      const front = createDocSlot(createMockPhoto('f'), createMockExtraction('nie-certificate'));
      expect(isDNIBackRequired(front)).toBe(false);
    });

    it('returns false for NIE card', () => {
      const front = createDocSlot(createMockPhoto('f'), createMockExtraction('nie-card'));
      expect(isDNIBackRequired(front)).toBe(false);
    });

    it('returns false for combined DNI image', () => {
      const ext: AIExtraction = { ...createMockExtraction('dni-card'), notes: 'combined image' };
      const front = createDocSlot(createMockPhoto('f'), ext);
      expect(isDNIBackRequired(front)).toBe(false);
    });

    it('returns false when no front photo', () => {
      const front = createDocSlot(null, null);
      expect(isDNIBackRequired(front)).toBe(false);
    });
  });

  describe('getIdentityDocumentDoneLabel', () => {
    it('should return "DNI / NIE — ambas caras" when both front and back are present', () => {
      const dni: Pick<DNIData, 'front' | 'back'> = {
        front: createDocSlot(createMockPhoto('front'), createMockExtraction('dni-card')),
        back: createDocSlot(createMockPhoto('back'), createMockExtraction()),
      };
      expect(getIdentityDocumentDoneLabel(dni)).toBe('DNI / NIE — ambas caras');
    });

    it('should return "NIE — certificado válido" for NIE certificate with front only', () => {
      const dni: Pick<DNIData, 'front' | 'back'> = {
        front: createDocSlot(createMockPhoto('front'), createMockExtraction('nie-certificate')),
        back: createDocSlot(null, null),
      };
      expect(getIdentityDocumentDoneLabel(dni)).toBe('NIE — certificado válido');
    });

    it('should return "NIE — documento válido" for NIE card with front only', () => {
      const dni: Pick<DNIData, 'front' | 'back'> = {
        front: createDocSlot(createMockPhoto('front'), createMockExtraction('nie-card')),
        back: createDocSlot(null, null),
      };
      expect(getIdentityDocumentDoneLabel(dni)).toBe('NIE — documento válido');
    });

    it('should return "DNI / NIE — cara principal" for DNI card with front only', () => {
      const dni: Pick<DNIData, 'front' | 'back'> = {
        front: createDocSlot(createMockPhoto('front'), createMockExtraction('dni-card')),
        back: createDocSlot(null, null),
      };
      expect(getIdentityDocumentDoneLabel(dni)).toBe('DNI / NIE — cara principal');
    });

    it('should return "DNI / NIE — cara principal" for passport (unknown kind) with front only', () => {
      const extraction: AIExtraction = {
        extractedData: {},
        confidence: 0.95,
        isCorrectDocument: true,
        documentTypeDetected: 'passport',
        identityDocumentKind: 'passport' as any,
        needsManualReview: false,
        confirmedByUser: true,
      };
      const dni: Pick<DNIData, 'front' | 'back'> = {
        front: createDocSlot(createMockPhoto('front'), extraction),
        back: createDocSlot(null, null),
      };
      expect(getIdentityDocumentDoneLabel(dni)).toBe('DNI / NIE — cara principal');
    });

    it('should return "DNI / NIE — cara trasera" when only back is present', () => {
      const dni: Pick<DNIData, 'front' | 'back'> = {
        front: createDocSlot(null, null),
        back: createDocSlot(createMockPhoto('back'), createMockExtraction()),
      };
      expect(getIdentityDocumentDoneLabel(dni)).toBe('DNI / NIE — cara trasera');
    });

    it('should return "DNI / NIE" when no photos are present', () => {
      const dni: Pick<DNIData, 'front' | 'back'> = {
        front: createDocSlot(null, null),
        back: createDocSlot(null, null),
      };
      expect(getIdentityDocumentDoneLabel(dni)).toBe('DNI / NIE');
    });
  });

  describe('getIdentityDocumentKind', () => {
    it('should return the identity document kind from extraction', () => {
      const extraction = createMockExtraction('dni-card');
      expect(getIdentityDocumentKind(extraction)).toBe('dni-card');
    });

    it('should return null for invalid kind', () => {
      const extraction = createMockExtraction();
      extraction.identityDocumentKind = 'invalid-kind' as any;
      expect(getIdentityDocumentKind(extraction)).toBeNull();
    });

    it('should return null for missing extraction', () => {
      expect(getIdentityDocumentKind(null)).toBeNull();
      expect(getIdentityDocumentKind(undefined)).toBeNull();
    });
  });

  describe('isSingleSidedIdentityKind', () => {
    it('should return true for nie-card', () => {
      expect(isSingleSidedIdentityKind('nie-card')).toBe(true);
    });

    it('should return true for nie-certificate', () => {
      expect(isSingleSidedIdentityKind('nie-certificate')).toBe(true);
    });

    it('should return false for dni-card', () => {
      expect(isSingleSidedIdentityKind('dni-card')).toBe(false);
    });

    it('should return false for null', () => {
      expect(isSingleSidedIdentityKind(null)).toBe(false);
    });
  });
});
