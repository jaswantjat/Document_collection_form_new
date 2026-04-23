import { describe, expect, it } from 'vitest';

import { normalizeFormData } from './useFormState';

describe('normalizeFormData', () => {
  it('defaults count-style energy certificate fields to zero', () => {
    const normalized = normalizeFormData(null);

    expect(normalized.energyCertificate.housing.floorCount).toBe('0');
    expect(normalized.energyCertificate.housing.bedroomCount).toBe('0');
    expect(normalized.energyCertificate.housing.doorsByOrientation).toEqual({
      north: '0',
      east: '0',
      south: '0',
      west: '0',
    });
    expect(normalized.energyCertificate.housing.windowsByOrientation).toEqual({
      north: '0',
      east: '0',
      south: '0',
      west: '0',
    });
    expect(normalized.energyCertificate.housing.shutterWindowCount).toBe('0');
  });

  it('upgrades legacy empty count-style fields to zero on load', () => {
    const normalized = normalizeFormData({
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
    } as never);

    expect(normalized.energyCertificate.housing.floorCount).toBe('0');
    expect(normalized.energyCertificate.housing.bedroomCount).toBe('0');
    expect(normalized.energyCertificate.housing.shutterWindowCount).toBe('0');
    expect(normalized.energyCertificate.housing.doorsByOrientation.east).toBe('0');
    expect(normalized.energyCertificate.housing.windowsByOrientation.west).toBe('0');
  });
});
