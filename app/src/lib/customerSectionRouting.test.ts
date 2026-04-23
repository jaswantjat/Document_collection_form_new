import { describe, expect, it } from 'vitest';

import { getInitialCustomerSection } from './customerSectionRouting';
import type { ProjectData } from '@/types';

function makeProject(overrides: Partial<ProjectData> = {}): ProjectData {
  const project: ProjectData = {
    code: 'ELT20250005',
    customerName: 'Test Customer',
    phone: '+34600000000',
    email: 'test@example.com',
    productType: 'solar',
    assessor: 'Test Assessor',
    assessorId: 'ASR001',
    formData: {
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
        pages: [{ photo: { id: 'bill', preview: 'bill', timestamp: 1, sizeBytes: 1 }, extraction: null }],
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
        status: 'in-progress',
        currentStepIndex: 1,
        housing: {
          cadastralReference: '',
          habitableAreaM2: '95',
          floorCount: '2',
          averageFloorHeight: '2.7-3.2m',
          bedroomCount: '3',
          doorsByOrientation: { north: '1', east: '0', south: '1', west: '0' },
          windowsByOrientation: { north: '2', east: '1', south: '2', west: '1' },
          windowFrameMaterial: 'pvc',
          doorMaterial: 'Madera',
          windowGlassType: 'doble',
          hasShutters: false,
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
    },
    lastActivity: null,
    createdAt: '2026-04-23T10:00:00Z',
  };

  return {
    ...project,
    ...overrides,
    formData: overrides.formData ?? project.formData,
  };
}

describe('customerSectionRouting', () => {
  it('returns review instead of restoring the saved energy certificate section', () => {
    expect(getInitialCustomerSection(makeProject(), 'energy-certificate')).toBe('review');
  });

  it('keeps early sections restorable before the review hub exists', () => {
    const project = makeProject({
      formData: {
        ...makeProject().formData!,
        location: undefined,
        representation: {
          ...makeProject().formData!.representation,
          location: null,
          holderTypeConfirmed: false,
        },
      },
    });

    expect(getInitialCustomerSection(project, 'property-docs')).toBe('property-docs');
  });
});
