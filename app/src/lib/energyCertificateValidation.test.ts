import { describe, it, expect } from 'vitest';
import { validateEcStep, isEnergyCertificateReadyToComplete } from './energyCertificateValidation';
import type { EnergyCertificateData } from '@/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const validHousing = (): EnergyCertificateData['housing'] => ({
  cadastralReference: '1234567AB1234A0001AB',
  constructionYear: '2000',
  habitableAreaM2: '90',
  floorCount: '2',
  averageFloorHeight: '2.5',
  windowFrameMaterial: 'aluminio',
  windowGlassType: 'doble',
  hasShutters: true,
  facadeOrientation: 'sur',
});

const validThermal = (): EnergyCertificateData['thermal'] => ({
  thermalInstallationType: 'centralizado',
  boilerFuelType: 'gas-natural',
  hasAirConditioning: false,
  airConditioningType: null,
  heatingEmitterType: 'radiador',
  radiatorMaterial: 'aluminio',
});

const validAdditional = (): EnergyCertificateData['additional'] => ({
  soldProduct: 'aerotermia',
  isExistingCustomer: false,
  hasSolarPanels: false,
});

const validData = (): EnergyCertificateData => ({
  housing: validHousing(),
  thermal: validThermal(),
  additional: validAdditional(),
});

// ─── Housing step ─────────────────────────────────────────────────────────────

describe('validateEcStep — housing', () => {
  it('returns no errors when all required fields are present', () => {
    const errs = validateEcStep('housing', validData());
    expect(errs).toEqual({});
  });

  it('errors when cadastralReference is missing', () => {
    const data = validData();
    data.housing.cadastralReference = '';
    const errs = validateEcStep('housing', data);
    expect(errs).toHaveProperty('housingCadastralReference');
  });

  it('errors when cadastralReference is only whitespace', () => {
    const data = validData();
    data.housing.cadastralReference = '   ';
    const errs = validateEcStep('housing', data);
    expect(errs).toHaveProperty('housingCadastralReference');
  });

  it('errors when averageFloorHeight is missing', () => {
    const data = validData();
    data.housing.averageFloorHeight = '';
    const errs = validateEcStep('housing', data);
    expect(errs).toHaveProperty('housingAverageFloorHeight');
  });

  it('errors when windowFrameMaterial is missing', () => {
    const data = validData();
    data.housing.windowFrameMaterial = '';
    const errs = validateEcStep('housing', data);
    expect(errs).toHaveProperty('housingWindowFrameMaterial');
  });

  it('errors when windowGlassType is missing', () => {
    const data = validData();
    data.housing.windowGlassType = '';
    const errs = validateEcStep('housing', data);
    expect(errs).toHaveProperty('housingWindowGlassType');
  });

  it('errors when hasShutters is null', () => {
    const data = validData();
    data.housing.hasShutters = null as unknown as boolean;
    const errs = validateEcStep('housing', data);
    expect(errs).toHaveProperty('housingHasShutters');
  });

  it('does NOT error when hasShutters is false (explicit answer)', () => {
    const data = validData();
    data.housing.hasShutters = false;
    const errs = validateEcStep('housing', data);
    expect(errs).not.toHaveProperty('housingHasShutters');
  });

  it('returns all 5 required-field errors when housing is empty', () => {
    const data: EnergyCertificateData = { housing: {} as EnergyCertificateData['housing'], thermal: validThermal(), additional: validAdditional() };
    const errs = validateEcStep('housing', data);
    expect(Object.keys(errs)).toHaveLength(5);
  });
});

// ─── Thermal step ─────────────────────────────────────────────────────────────

describe('validateEcStep — thermal', () => {
  it('returns no errors when all required fields are present (no AC)', () => {
    const errs = validateEcStep('thermal', validData());
    expect(errs).toEqual({});
  });

  it('errors when thermalInstallationType is missing', () => {
    const data = validData();
    data.thermal.thermalInstallationType = '';
    const errs = validateEcStep('thermal', data);
    expect(errs).toHaveProperty('thermalInstallationType');
  });

  it('errors when boilerFuelType is missing', () => {
    const data = validData();
    data.thermal.boilerFuelType = '';
    const errs = validateEcStep('thermal', data);
    expect(errs).toHaveProperty('thermalBoilerFuelType');
  });

  it('errors when hasAirConditioning is null', () => {
    const data = validData();
    data.thermal.hasAirConditioning = null as unknown as boolean;
    const errs = validateEcStep('thermal', data);
    expect(errs).toHaveProperty('thermalHasAirConditioning');
  });

  it('does NOT require airConditioningType when hasAirConditioning is false', () => {
    const data = validData();
    data.thermal.hasAirConditioning = false;
    data.thermal.airConditioningType = null;
    const errs = validateEcStep('thermal', data);
    expect(errs).not.toHaveProperty('thermalAirConditioningType');
  });

  it('errors when hasAirConditioning is true but airConditioningType is missing', () => {
    const data = validData();
    data.thermal.hasAirConditioning = true;
    data.thermal.airConditioningType = null;
    const errs = validateEcStep('thermal', data);
    expect(errs).toHaveProperty('thermalAirConditioningType');
  });

  it('does NOT error when hasAirConditioning true and airConditioningType is set', () => {
    const data = validData();
    data.thermal.hasAirConditioning = true;
    data.thermal.airConditioningType = 'bomba-calor';
    const errs = validateEcStep('thermal', data);
    expect(errs).not.toHaveProperty('thermalAirConditioningType');
  });

  it('errors when heatingEmitterType is missing', () => {
    const data = validData();
    data.thermal.heatingEmitterType = '';
    const errs = validateEcStep('thermal', data);
    expect(errs).toHaveProperty('thermalHeatingEmitterType');
  });

  it('errors when heatingEmitterType is radiador but radiatorMaterial is missing', () => {
    const data = validData();
    data.thermal.heatingEmitterType = 'radiador';
    data.thermal.radiatorMaterial = '';
    const errs = validateEcStep('thermal', data);
    expect(errs).toHaveProperty('thermalRadiatorMaterial');
  });

  it('does NOT require radiatorMaterial when heatingEmitterType is suelo-radiante', () => {
    const data = validData();
    data.thermal.heatingEmitterType = 'suelo-radiante';
    data.thermal.radiatorMaterial = '';
    const errs = validateEcStep('thermal', data);
    expect(errs).not.toHaveProperty('thermalRadiatorMaterial');
  });
});

// ─── Additional step ──────────────────────────────────────────────────────────

describe('validateEcStep — additional', () => {
  it('returns no errors when all required fields are present', () => {
    const errs = validateEcStep('additional', validData());
    expect(errs).toEqual({});
  });

  it('errors when soldProduct is missing', () => {
    const data = validData();
    data.additional.soldProduct = '';
    const errs = validateEcStep('additional', data);
    expect(errs).toHaveProperty('additionalSoldProduct');
  });

  it('errors when isExistingCustomer is null', () => {
    const data = validData();
    data.additional.isExistingCustomer = null as unknown as boolean;
    const errs = validateEcStep('additional', data);
    expect(errs).toHaveProperty('additionalIsExistingCustomer');
  });

  it('does NOT error when isExistingCustomer is false (explicit no)', () => {
    const data = validData();
    data.additional.isExistingCustomer = false;
    const errs = validateEcStep('additional', data);
    expect(errs).not.toHaveProperty('additionalIsExistingCustomer');
  });

  it('errors when hasSolarPanels is null', () => {
    const data = validData();
    data.additional.hasSolarPanels = null as unknown as boolean;
    const errs = validateEcStep('additional', data);
    expect(errs).toHaveProperty('additionalHasSolarPanels');
  });

  it('does NOT error when hasSolarPanels is false (explicit no)', () => {
    const data = validData();
    data.additional.hasSolarPanels = false;
    const errs = validateEcStep('additional', data);
    expect(errs).not.toHaveProperty('additionalHasSolarPanels');
  });

  it('returns all 3 required-field errors when additional is empty', () => {
    const data: EnergyCertificateData = { housing: validHousing(), thermal: validThermal(), additional: {} as EnergyCertificateData['additional'] };
    const errs = validateEcStep('additional', data);
    expect(Object.keys(errs)).toHaveLength(3);
  });
});

// ─── isEnergyCertificateReadyToComplete ───────────────────────────────────────

describe('isEnergyCertificateReadyToComplete', () => {
  it('returns true when all steps are fully valid', () => {
    expect(isEnergyCertificateReadyToComplete(validData())).toBe(true);
  });

  it('returns false when cadastralReference is missing', () => {
    const data = validData();
    data.housing.cadastralReference = '';
    expect(isEnergyCertificateReadyToComplete(data)).toBe(false);
  });

  it('returns false when any housing field is missing', () => {
    const data = validData();
    data.housing.averageFloorHeight = '';
    expect(isEnergyCertificateReadyToComplete(data)).toBe(false);
  });

  it('returns false when hasAirConditioning=true but no type selected', () => {
    const data = validData();
    data.thermal.hasAirConditioning = true;
    data.thermal.airConditioningType = null;
    expect(isEnergyCertificateReadyToComplete(data)).toBe(false);
  });

  it('returns false when radiatorMaterial missing for non-suelo-radiante', () => {
    const data = validData();
    data.thermal.heatingEmitterType = 'radiador';
    data.thermal.radiatorMaterial = '';
    expect(isEnergyCertificateReadyToComplete(data)).toBe(false);
  });

  it('returns true when heatingEmitterType is suelo-radiante and radiatorMaterial is empty', () => {
    const data = validData();
    data.thermal.heatingEmitterType = 'suelo-radiante';
    data.thermal.radiatorMaterial = '';
    expect(isEnergyCertificateReadyToComplete(data)).toBe(true);
  });

  it('returns false when soldProduct is missing', () => {
    const data = validData();
    data.additional.soldProduct = '';
    expect(isEnergyCertificateReadyToComplete(data)).toBe(false);
  });

  it('returns false when entire data object is empty', () => {
    expect(isEnergyCertificateReadyToComplete({} as EnergyCertificateData)).toBe(false);
  });
});
