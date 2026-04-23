import { describe, expect, it } from 'vitest';

import { getInitialCustomerSection } from '@/lib/customerSectionRouting';
import type { ProjectData } from '@/types';

function makeProject(overrides: Partial<ProjectData> = {}): ProjectData {
  return {
    code: 'ELTTEST001',
    customerName: 'Test User',
    phone: '+34600000000',
    email: 'test@example.com',
    productType: 'solar',
    assessor: 'Test Assessor',
    assessorId: 'ASR001',
    formData: {
      dni: {
        front: { photo: null, extraction: null },
        back: { photo: null, extraction: null },
        originalPdfs: [],
        issue: null,
      },
      ibi: {
        photo: null,
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
      location: undefined,
      representation: {
        location: null,
        isCompany: false,
        holderTypeConfirmed: false,
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
      signatures: { customerSignature: null, repSignature: null },
      energyCertificate: {
        status: 'not-started',
        housing: {
          cadastralReference: '',
          habitableAreaM2: '',
          floorCount: '0',
          averageFloorHeight: null,
          bedroomCount: '0',
          doorsByOrientation: { north: '0', east: '0', south: '0', west: '0' },
          windowsByOrientation: {
            north: '0',
            east: '0',
            south: '0',
            west: '0',
          },
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
      browserLanguage: 'es-ES',
    },
    lastActivity: null,
    createdAt: '2026-04-23T10:00:00.000Z',
    ...overrides,
  };
}

describe('customerSectionRouting', () => {
  it('lands on review after reload when a location already exists', () => {
    const project = makeProject({
      formData: {
        ...makeProject().formData!,
        location: 'other',
        representation: {
          ...makeProject().formData!.representation,
          location: 'other',
          holderTypeConfirmed: true,
        },
      },
    });

    expect(
      getInitialCustomerSection(project, project.code, 'energy-certificate')
    ).toBe('review');
  });

  it('keeps fresh opens in representation when there is no reload state yet', () => {
    const project = makeProject({
      formData: {
        ...makeProject().formData!,
        location: 'cataluna',
        representation: {
          ...makeProject().formData!.representation,
          location: 'cataluna',
          holderTypeConfirmed: true,
        },
      },
    });

    expect(getInitialCustomerSection(project, project.code, null)).toBe('representation');
  });

  it('does not route to review before the customer has selected a location', () => {
    const project = makeProject({
      formData: {
        ...makeProject().formData!,
        dni: {
          front: { photo: { preview: 'front' } as never, extraction: null },
          back: { photo: { preview: 'back' } as never, extraction: null },
          originalPdfs: [],
          issue: null,
        },
        ibi: {
          photo: { preview: 'ibi' } as never,
          pages: [],
          originalPdfs: [],
          extraction: null,
          issue: null,
        },
      },
      productType: 'aerothermal',
    });

    expect(getInitialCustomerSection(project, project.code, 'property-docs')).toBe(
      'property-docs'
    );
  });
});
