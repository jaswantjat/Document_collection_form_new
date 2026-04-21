import { describe, expect, it } from 'vitest';
import type { EnergyCertificateData } from '@/types';
import {
  getCustomerEnergyFlowStatus,
  hasEnergyCertificateDecision,
} from './energyCertificateFlow';

function makeValidEnergyCertificate(
  overrides: Partial<EnergyCertificateData> = {}
): EnergyCertificateData {
  return {
    status: 'completed',
    housing: {
      cadastralReference: '',
      habitableAreaM2: '120',
      floorCount: '2',
      averageFloorHeight: '2.7-3.2m',
      bedroomCount: '3',
      doorsByOrientation: { north: '1', east: '1', south: '1', west: '1' },
      windowsByOrientation: { north: '2', east: '2', south: '2', west: '2' },
      windowFrameMaterial: 'pvc',
      doorMaterial: 'Madera',
      windowGlassType: 'doble',
      hasShutters: false,
      shutterWindowCount: '0',
    },
    thermal: {
      thermalInstallationType: 'caldera',
      boilerFuelType: 'gas',
      equipmentDetails: 'Saunier Duval 2021',
      hasAirConditioning: false,
      airConditioningType: null,
      airConditioningDetails: '',
      heatingEmitterType: 'radiadores-agua',
      radiatorMaterial: 'aluminio',
      tipoFase: 'monofasica',
      tipoFaseConfirmed: true,
      cups: 'ES1234567890123456AB',
    },
    additional: {
      soldProduct: 'solo-paneles',
      isExistingCustomer: false,
      hasSolarPanels: false,
      solarPanelDetails: '',
    },
    customerSignature: null,
    renderedDocument: null,
    completedAt: '2026-04-14T10:30:00.000Z',
    skippedAt: null,
    ...overrides,
  };
}

describe('energyCertificateFlow', () => {
  it('treats skipped energy as a completed decision for routing', () => {
    const energy = makeValidEnergyCertificate({
      status: 'skipped',
      completedAt: null,
      skippedAt: '2026-04-14T10:30:00.000Z',
    });

    expect(getCustomerEnergyFlowStatus(energy)).toBe('skipped');
    expect(hasEnergyCertificateDecision(energy)).toBe(true);
  });

  it('keeps valid completed energy as completed', () => {
    const energy = makeValidEnergyCertificate();

    expect(getCustomerEnergyFlowStatus(energy)).toBe('completed');
    expect(hasEnergyCertificateDecision(energy)).toBe(true);
  });

  it('keeps completed energy as completed when heatingEmitterType is omitted', () => {
    const energy = makeValidEnergyCertificate({
      thermal: {
        ...makeValidEnergyCertificate().thermal,
        heatingEmitterType: null,
        radiatorMaterial: null,
      },
    });

    expect(getCustomerEnergyFlowStatus(energy)).toBe('completed');
    expect(hasEnergyCertificateDecision(energy)).toBe(true);
  });

  it('downgrades invalid completed energy to pending', () => {
    const energy = makeValidEnergyCertificate({
      housing: {
        ...makeValidEnergyCertificate().housing,
        habitableAreaM2: '',
      },
    });

    expect(getCustomerEnergyFlowStatus(energy)).toBe('pending');
    expect(hasEnergyCertificateDecision(energy)).toBe(false);
  });

  it('treats not-started energy as pending', () => {
    const energy = makeValidEnergyCertificate({
      status: 'not-started',
      completedAt: null,
    });

    expect(getCustomerEnergyFlowStatus(energy)).toBe('pending');
    expect(hasEnergyCertificateDecision(energy)).toBe(false);
  });
});
