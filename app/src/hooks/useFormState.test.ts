import { describe, expect, it } from 'vitest';

import { normalizeFormData } from '@/hooks/useFormState';

describe('normalizeFormData', () => {
  it('starts EC count-style fields at zero in fresh state', () => {
    const normalized = normalizeFormData();

    expect(normalized.energyCertificate.housing.habitableAreaM2).toBe('');
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

  it('upgrades legacy blank EC count fields to zero without touching real values', () => {
    const normalized = normalizeFormData({
      energyCertificate: {
        status: 'in-progress',
        housing: {
          cadastralReference: '',
          habitableAreaM2: '',
          floorCount: '',
          averageFloorHeight: null,
          bedroomCount: '2',
          doorsByOrientation: { north: '', east: '1', south: '', west: '' },
          windowsByOrientation: { north: '', east: '', south: '3', west: '' },
          windowFrameMaterial: null,
          doorMaterial: '',
          windowGlassType: null,
          hasShutters: true,
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
    } as Parameters<typeof normalizeFormData>[0]);

    expect(normalized.energyCertificate.housing.floorCount).toBe('0');
    expect(normalized.energyCertificate.housing.bedroomCount).toBe('2');
    expect(normalized.energyCertificate.housing.doorsByOrientation).toEqual({
      north: '0',
      east: '1',
      south: '0',
      west: '0',
    });
    expect(normalized.energyCertificate.housing.windowsByOrientation).toEqual({
      north: '0',
      east: '0',
      south: '3',
      west: '0',
    });
    expect(normalized.energyCertificate.housing.shutterWindowCount).toBe('0');
  });
});
