/**
 * Shared Document Specification Layer
 *
 * Single source of truth for all signed document rendering.
 * Contains template metadata, field positions, signature anchors, and rendering rules.
 *
 * This ensures 100% parity between:
 * - Browser preview rendering
 * - Backend PDF generation
 * - Dashboard frozen images
 */

import type { LocationRegion } from '@/types';

// ============================================================================
// Types
// ============================================================================

export interface DocumentSpec {
  /** Unique identifier for this document type */
  id: DocumentTypeId;
  /** Display name for UI */
  label: string;
  /** Template image asset path */
  templatePath: string;
  /** Page dimensions in pixels */
  pageSize: { width: number; height: number };
  /** Field positions for text overlay */
  fields: FieldPositions;
  /** Signature safe boxes/anchors */
  signatureBoxes: SignatureBox[];
  /** Date formatting rules */
  dateFormat: DateFormatting;
  /** Required data sources to render this document */
  requiredData: RequiredDataSource[];
}

export type DocumentTypeId =
  | 'catalunaIva'
  | 'catalunaGeneralitat'
  | 'catalunaRepresentacio'
  | 'spainIva'
  | 'spainPoder';

export interface FieldPositions {
  /** Persona interessada (interested party) fields */
  personaInteressada: {
    nom?: [number, number, number, number]; // [x1, y1, x2, y2]
    nif?: [number, number, number, number];
    adreca?: [number, number, number, number];
    codiPostal?: [number, number, number, number];
    municipi?: [number, number, number, number];
  };
  /** Representant legal (legal representative) fields - for companies */
  representantLegal?: {
    nom?: [number, number, number, number];
    nif?: [number, number, number, number];
    adreca?: [number, number, number, number];
    codiPostal?: [number, number, number, number];
    municipi?: [number, number, number, number];
  };
  /** Footer fields */
  footer?: {
    lloc?: [number, number, number, number];
    data?: [number, number, number, number];
  };
}

export interface SignatureBox {
  /** Signature identifier */
  id: string;
  /** Bounding box [x1, y1, x2, y2] */
  box: [number, number, number, number];
  /** Which signature goes in this box */
  signatureType: 'customer' | 'rep' | 'representacio' | 'poderRepresentacio';
  /** Label for UI */
  label: string;
}

export interface DateFormatting {
  /** Format string (Catalan locale) */
  format: string; // e.g., "DD/MM/YYYY"
  /** Field position for date */
  field?: [number, number, number, number];
}

export type RequiredDataSource =
  | 'dniFront'
  | 'dniBack'
  | 'electricityBill'
  | 'representation'
  | 'companyData';

// ============================================================================
// Document Specifications
// ============================================================================

/**
 * Catalonia 10% IVA Certificate
 * Template: verify_iva_es_top.png
 */
export const CATALUNA_IVA_SPEC: DocumentSpec = {
  id: 'catalunaIva',
  label: 'Certificat 10% IVA (Catalunya)',
  templatePath: '/verify_iva_es_top.png',
  pageSize: { width: 1410, height: 2100 },
  fields: {
    personaInteressada: {
      nom: [319, 317, 1251, 347],
      nif: [405, 379, 1194, 409],
      adreca: [397, 440, 1194, 470],
      codiPostal: [349, 503, 570, 533],
      municipi: [693, 503, 1236, 533],
    },
    footer: {
      lloc: [231, 1948, 721, 1978],
    },
  },
  signatureBoxes: [
    {
      id: 'catalunaIvaCustomer',
      box: [856, 1760, 1258, 1790],
      signatureType: 'customer',
      label: 'Firma cliente',
    },
  ],
  dateFormat: {
    format: 'DD/MM/YYYY',
    field: [231, 1948, 721, 1978],
  },
  requiredData: ['dniFront', 'dniBack', 'electricityBill'],
};

/**
 * Catalonia Generalitat Document
 * Template: verify_iva_es_bottom.png
 */
export const CATALUNA_GENERALITAT_SPEC: DocumentSpec = {
  id: 'catalunaGeneralitat',
  label: 'Generalitat (Catalunya)',
  templatePath: '/verify_iva_es_bottom_fixed.png',
  pageSize: { width: 1357, height: 1920 },
  fields: {
    personaInteressada: {
      nom: [146, 255, 977, 292],
      nif: [982, 255, 1295, 292],
    },
  },
  signatureBoxes: [
    {
      id: 'catalunaGeneralitatCustomer',
      box: [147, 1389, 1295, 1492],
      signatureType: 'customer',
      label: 'Firma cliente',
    },
  ],
  dateFormat: {
    format: 'DD/MM/YYYY',
  },
  requiredData: ['dniFront'],
};

/**
 * Catalonia Autorització de Representació
 * Template: autoritzacio-representacio.jpg
 */
export const CATALUNA_REPRESENTACIO_SPEC: DocumentSpec = {
  id: 'catalunaRepresentacio',
  label: 'Autorització de Representació (Catalunya)',
  templatePath: '/autoritzacio-representacio.jpg',
  pageSize: { width: 1241, height: 1754 },
  fields: {
    personaInteressada: {
      nom: [388, 244, 812, 276],
      nif: [902, 244, 1095, 276],
      adreca: [190, 282, 812, 314],
      codiPostal: [979, 282, 1095, 314],
      municipi: [202, 321, 812, 354],
    },
    representantLegal: {
      nom: [388, 438, 812, 470],
      nif: [902, 438, 1095, 470],
      adreca: [190, 476, 812, 508],
      codiPostal: [979, 476, 1095, 508],
      municipi: [202, 515, 812, 548],
    },
    footer: {
      lloc: [130, 1459, 560, 1496],
      data: [725, 1459, 1100, 1496],
    },
  },
  signatureBoxes: [
    {
      id: 'catalunaRepresentacioCustomer',
      box: [76, 1552, 575, 1685],
      signatureType: 'representacio',
      label: 'Autorització de Representació',
    },
  ],
  dateFormat: {
    format: 'DD/MM/YYYY',
    field: [725, 1459, 1100, 1496],
  },
  requiredData: ['dniFront', 'dniBack', 'electricityBill', 'representation'],
};

/**
 * Spain 10% IVA Certificate
 * Template: certificat-iva-10-es.png
 */
export const SPAIN_IVA_SPEC: DocumentSpec = {
  id: 'spainIva',
  label: 'Certificat 10% IVA (Espanya)',
  templatePath: '/certificat-iva-10-es.png',
  pageSize: { width: 1410, height: 2100 },
  fields: {
    personaInteressada: {
      nom: [319, 317, 1251, 347],
      nif: [405, 379, 1194, 409],
      adreca: [397, 440, 1194, 470],
      codiPostal: [349, 503, 570, 533],
      municipi: [693, 503, 1236, 533],
    },
    footer: {
      lloc: [231, 1948, 721, 1978],
    },
  },
  signatureBoxes: [
    {
      id: 'spainIvaCustomer',
      box: [856, 1760, 1258, 1790],
      signatureType: 'customer',
      label: 'Firma cliente',
    },
  ],
  dateFormat: {
    format: 'DD/MM/YYYY',
    field: [231, 1948, 721, 1978],
  },
  requiredData: ['dniFront', 'dniBack', 'electricityBill'],
};

/**
 * Spain Poder de Representación
 * Template: poder-representacio.png
 */
export const SPAIN_PODER_SPEC: DocumentSpec = {
  id: 'spainPoder',
  label: 'Poder de Representación (Espanya)',
  templatePath: '/poder-representacio.png',
  pageSize: { width: 1410, height: 2100 },
  fields: {
    personaInteressada: {
      nom: [515, 286, 985, 322],
      nif: [1038, 286, 1328, 322],
      adreca: [240, 332, 985, 370],
      codiPostal: [1160, 332, 1328, 370],
      municipi: [240, 380, 1328, 418],
    },
    representantLegal: {
      nom: [515, 512, 985, 548],
      nif: [1038, 512, 1328, 548],
      adreca: [240, 558, 985, 596],
      codiPostal: [1160, 558, 1328, 596],
      municipi: [240, 604, 1328, 642],
    },
    footer: {
      lloc: [145, 1704, 690, 1742],
      data: [848, 1704, 1135, 1742],
    },
  },
  signatureBoxes: [
    {
      id: 'spainPoderCustomer',
      box: [70, 1804, 820, 1930],
      signatureType: 'poderRepresentacio',
      label: 'Poder de Representación',
    },
  ],
  dateFormat: {
    format: 'DD/MM/YYYY',
    field: [848, 1704, 1135, 1742],
  },
  requiredData: ['dniFront', 'dniBack', 'electricityBill', 'representation'],
};

// ============================================================================
// Document Registry
// ============================================================================

/** All document specifications */
export const DOCUMENT_SPECS: Record<DocumentTypeId, DocumentSpec> = {
  catalunaIva: CATALUNA_IVA_SPEC,
  catalunaGeneralitat: CATALUNA_GENERALITAT_SPEC,
  catalunaRepresentacio: CATALUNA_REPRESENTACIO_SPEC,
  spainIva: SPAIN_IVA_SPEC,
  spainPoder: SPAIN_PODER_SPEC,
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get document specification by ID
 */
export function getDocumentSpec(id: DocumentTypeId): DocumentSpec | null {
  return DOCUMENT_SPECS[id] || null;
}

/**
 * Get all document specifications for a given location
 */
export function getDocumentsForLocation(location: LocationRegion): DocumentSpec[] {
  switch (location) {
    case 'cataluna':
      return [
        CATALUNA_IVA_SPEC,
        CATALUNA_GENERALITAT_SPEC,
        CATALUNA_REPRESENTACIO_SPEC,
      ];
    case 'madrid':
    case 'valencia':
      return [SPAIN_IVA_SPEC, SPAIN_PODER_SPEC];
    default:
      return [];
  }
}

/**
 * Get required document IDs for a location
 */
export function getRequiredDocumentIds(location: LocationRegion): DocumentTypeId[] {
  return getDocumentsForLocation(location).map(spec => spec.id);
}

/**
 * Check if a document type is available for a location
 */
export function isDocumentAvailableForLocation(
  documentId: DocumentTypeId,
  location: LocationRegion
): boolean {
  return getRequiredDocumentIds(location).includes(documentId);
}

/**
 * Get current date in Catalan format (DD/MM/YYYY)
 */
export function getCurrentDateCatalan(): string {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  return `${day}/${month}/${year}`;
}
