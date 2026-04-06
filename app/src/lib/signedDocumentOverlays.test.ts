import { describe, expect, it } from 'vitest';
import type { FormData } from '@/types';
import {
  SIGNED_DOCUMENT_TEMPLATE_VERSION,
  getSignedDocumentDefinitions,
  getStoredRenderedDocument,
  stampRenderedDocumentMetadata,
} from './signedDocumentOverlays';

function createBaseFormData(): FormData {
  return {
    dni: {
      front: { photo: null, extraction: null },
      back: { photo: null, extraction: null },
      originalPdfs: [],
    },
    ibi: {
      photo: null,
      pages: [],
      originalPdfs: [],
      extraction: null,
    },
    electricityBill: {
      pages: [],
      originalPdfs: [],
    },
    contract: {
      originalPdfs: [],
      extraction: null,
    },
    representation: {
      location: null,
      isCompany: false,
      companyName: '',
      companyNIF: '',
      companyAddress: '',
      companyMunicipality: '',
      companyPostalCode: '',
      postalCode: '',
      ivaPropertyAddress: '',
      ivaCertificateSignature: null,
      representacioSignature: null,
      generalitatRole: 'titular',
      generalitatSignature: null,
      poderRepresentacioSignature: null,
      ivaCertificateEsSignature: null,
      renderedDocuments: {},
    },
    energyCertificate: {
      status: 'not-started',
      housing: {
        cadastralReference: '',
        habitableAreaM2: '',
        floorCount: '',
        averageFloorHeight: null,
        bedroomCount: '',
        doorsByOrientation: { north: '', east: '', south: '', west: '' },
        windowsByOrientation: { north: '', east: '', south: '', west: '' },
        windowFrameMaterial: null,
        doorMaterial: '',
        windowGlassType: null,
        hasShutters: null,
        shutterWindowCount: '',
      },
      thermal: {
        thermalInstallationType: null,
        boilerFuelType: null,
        equipmentDetails: '',
        hasAirConditioning: null,
        airConditioningType: null,
        airConditioningDetails: '',
        heatingEmitterType: null,
        radiatorMaterial: null,
      },
      additional: {
        soldProduct: null,
        isExistingCustomer: null,
        hasSolarPanels: null,
        solarPanelDetails: '',
      },
      customerSignature: null,
      renderedDocument: null,
      completedAt: null,
      skippedAt: null,
    },
    signatures: {
      customerSignature: null,
      repSignature: null,
    },
  };
}

describe('signedDocumentOverlays', () => {
  it('maps Catalonia signatures to the expected document filenames', () => {
    const formData = createBaseFormData();
    formData.location = 'cataluna';
    formData.representation.ivaCertificateSignature = 'sig-1';
    formData.representation.generalitatSignature = 'sig-2';
    formData.representation.representacioSignature = 'sig-3';

    const definitions = getSignedDocumentDefinitions({ code: 'ABC123', formData });

    expect(definitions).toEqual([
      {
        key: 'cataluna-iva',
        label: 'IVA 10% Cataluña',
        present: true,
        filename: 'ABC123_iva-cat.pdf',
      },
      {
        key: 'cataluna-generalitat',
        label: 'Declaració Generalitat',
        present: true,
        filename: 'ABC123_generalitat.pdf',
      },
      {
        key: 'cataluna-representacio',
        label: 'Autorització de representació',
        present: true,
        filename: 'ABC123_autoritzacio-representacio.pdf',
      },
    ]);
  });

  it('stamps metadata only for documents that are actually present', () => {
    const formData = createBaseFormData();
    formData.location = 'madrid';
    formData.representation.ivaCertificateEsSignature = 'sig-1';

    const stamped = stampRenderedDocumentMetadata(formData);

    expect(stamped.representation.renderedDocuments?.spainIva).toEqual({
      imageDataUrl: '',
      generatedAt: expect.any(String),
      templateVersion: SIGNED_DOCUMENT_TEMPLATE_VERSION,
    });
    expect(stamped.representation.renderedDocuments?.spainPoder).toBeUndefined();
  });

  it('reads stored rendered documents from either raw form data or a project envelope', () => {
    const formData = createBaseFormData();
    formData.representation.renderedDocuments = {
      catalunaIva: {
        imageDataUrl: 'data:image/jpeg;base64,abc',
        generatedAt: '2026-04-06T08:00:00.000Z',
        templateVersion: SIGNED_DOCUMENT_TEMPLATE_VERSION,
      },
    };

    expect(getStoredRenderedDocument(formData, 'cataluna-iva')).toEqual(
      formData.representation.renderedDocuments.catalunaIva
    );
    expect(getStoredRenderedDocument({ code: 'XYZ999', formData }, 'cataluna-iva')).toEqual(
      formData.representation.renderedDocuments.catalunaIva
    );
  });
});
