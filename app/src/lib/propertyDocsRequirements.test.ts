import { describe, expect, it } from 'vitest';

import { hasRequiredPropertyDocs, isElectricityBillRequired } from './propertyDocsRequirements';
import type { FormData } from '@/types';

function makeFormData(overrides: Partial<FormData> = {}): FormData {
  return {
    dni: {
      front: { photo: { id: 'dni-front', preview: 'front', timestamp: 1, sizeBytes: 1 }, extraction: null },
      back: { photo: { id: 'dni-back', preview: 'back', timestamp: 1, sizeBytes: 1 }, extraction: null },
      originalPdfs: [],
      issue: null,
    },
    ibi: {
      photo: { id: 'ibi', preview: 'ibi', timestamp: 1, sizeBytes: 1 },
      pages: [],
      originalPdfs: [],
      extraction: null,
      issue: null,
    },
    electricityBill: {
      pages: [],
      originalPdfs: [],
      issue: null,
    },
    contract: { originalPdfs: [], extraction: null, issue: null },
    additionalBankDocuments: [],
    location: 'other',
    representation: {
      location: 'other',
      isCompany: false,
      holderTypeConfirmed: true,
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
        floorCount: '0',
        averageFloorHeight: null,
        bedroomCount: '0',
        doorsByOrientation: { north: '0', east: '0', south: '0', west: '0' },
        windowsByOrientation: { north: '0', east: '0', south: '0', west: '0' },
        windowFrameMaterial: null,
        doorMaterial: '',
        windowGlassType: null,
        hasShutters: null,
        shutterWindowCount: '0',
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
    signatures: { customerSignature: null, repSignature: null },
    ...overrides,
  };
}

describe('propertyDocsRequirements', () => {
  it('treats electricity as optional for pure aerothermal projects', () => {
    expect(isElectricityBillRequired('aerothermal')).toBe(false);
    expect(hasRequiredPropertyDocs(makeFormData(), 'aerothermal')).toBe(true);
  });

  it('keeps electricity required for solar-aerothermal projects', () => {
    expect(isElectricityBillRequired('solar-aerothermal')).toBe(true);
    expect(hasRequiredPropertyDocs(makeFormData(), 'solar-aerothermal')).toBe(false);
  });
});
