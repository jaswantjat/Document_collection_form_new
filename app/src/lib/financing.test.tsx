import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReviewSection } from '@/sections/ReviewSection';
import type { FormData, ProjectData } from '@/types';
import { normalizeFinancingUrl, resolveFinancingCta } from './financing';

function makeProject(): ProjectData {
  return {
    code: 'ELT0008',
    customerName: 'Ada Lovelace',
    customerLanguage: 'es',
    phone: '+34600000000',
    email: 'ada@example.com',
    productType: 'solar',
    assessor: 'Grace Hopper',
    assessorId: 'advisor-1',
    formData: null,
    lastActivity: null,
    createdAt: '2026-04-14T00:00:00.000Z',
  };
}

function makeFormData(): FormData {
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
    location: 'madrid',
    representation: {
      location: 'madrid',
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
      signatureDeferred: false,
      renderedDocuments: {},
    },
    energyCertificate: {
      status: 'skipped',
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
        tipoFase: null,
        tipoFaseConfirmed: false,
        cups: '',
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
      skippedAt: '2026-04-14T09:00:00.000Z',
      currentStepIndex: 0,
    },
    signatures: {
      customerSignature: null,
      repSignature: null,
    },
    browserLanguage: 'es-ES',
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('normalizeFinancingUrl', () => {
  it('returns null when the URL is missing or blank', () => {
    expect(normalizeFinancingUrl(undefined)).toBeNull();
    expect(normalizeFinancingUrl(null)).toBeNull();
    expect(normalizeFinancingUrl('   ')).toBeNull();
  });

  it('accepts only absolute http/https URLs', () => {
    expect(normalizeFinancingUrl('https://finance.example.com/offer')).toBe(
      'https://finance.example.com/offer'
    );
    expect(normalizeFinancingUrl('ftp://finance.example.com/offer')).toBeNull();
    expect(normalizeFinancingUrl('/relative/path')).toBeNull();
  });
});

describe('resolveFinancingCta', () => {
  const context = {
    project: makeProject(),
    formData: makeFormData(),
  };

  it('returns null when the financing URL is not configured', () => {
    expect(resolveFinancingCta(context, { genericUrl: null })).toBeNull();
    expect(resolveFinancingCta(context, { genericUrl: ' ' })).toBeNull();
  });

  it('returns a CTA when the financing URL is configured', () => {
    expect(
      resolveFinancingCta(context, { genericUrl: 'https://finance.example.com/offer' })
    ).toMatchObject({
      href: 'https://finance.example.com/offer',
      routeKind: 'generic-config',
      actionLabel: 'Ver opciones de financiación',
    });
  });
});

describe('ReviewSection financing CTA', () => {
  const baseProps = {
    project: makeProject(),
    formData: makeFormData(),
    source: 'customer' as const,
    canSubmit: true,
    hasBlockingDocumentProcessing: false,
    onEdit: () => undefined,
    onSuccess: () => undefined,
  };

  it('shows the CTA and opens it in a new tab when configured', () => {
    vi.stubEnv('VITE_FINANCING_URL', 'https://finance.example.com/offer');

    const markup = renderToStaticMarkup(<ReviewSection {...baseProps} />);

    expect(markup).toContain('Ver opciones de financiación');
    expect(markup).toContain('href="https://finance.example.com/offer"');
    expect(markup).toContain('target="_blank"');
    expect(markup).toContain('rel="noreferrer noopener"');
  });

  it('hides the CTA when the financing URL is missing', () => {
    vi.stubEnv('VITE_FINANCING_URL', '');

    const markup = renderToStaticMarkup(<ReviewSection {...baseProps} />);

    expect(markup).not.toContain('financing-cta-card');
    expect(markup).not.toContain('Ver opciones de financiación');
  });
});
