import type { EnergyCertificateData } from '@/types';

type StepKey = 'housing' | 'thermal' | 'additional' | 'final';

// Data-collection steps that must all pass before status can become 'completed'.
// This is the single authoritative "provision" — update here to add/remove required-field rules.
export const EC_DATA_STEPS: StepKey[] = ['housing', 'thermal', 'additional'];

export function validateEcStep(stepKey: StepKey, data: EnergyCertificateData): Record<string, string> {
  const errs: Record<string, string> = {};

  if (stepKey === 'housing') {
    if (!data.housing.averageFloorHeight) errs.housingAverageFloorHeight = 'Selecciona la altura promedio de planta';
    if (!data.housing.windowFrameMaterial) errs.housingWindowFrameMaterial = 'Selecciona el material de los marcos';
    if (!data.housing.windowGlassType) errs.housingWindowGlassType = 'Selecciona el tipo de vidrio';
    if (data.housing.hasShutters === null) errs.housingHasShutters = 'Indica si hay ventanas con persiana';
  }

  if (stepKey === 'thermal') {
    if (!data.thermal.thermalInstallationType) errs.thermalInstallationType = 'Selecciona el tipo de instalación térmica';
    if (!data.thermal.boilerFuelType) errs.thermalBoilerFuelType = 'Selecciona el tipo de combustión';
    if (data.thermal.hasAirConditioning === null) errs.thermalHasAirConditioning = 'Indica si hay aire acondicionado';
    if (data.thermal.hasAirConditioning === true && !data.thermal.airConditioningType) {
      errs.thermalAirConditioningType = 'Selecciona el tipo de bomba';
    }
    if (!data.thermal.heatingEmitterType) errs.thermalHeatingEmitterType = 'Selecciona el tipo de calefacción';
    if (data.thermal.heatingEmitterType && data.thermal.heatingEmitterType !== 'suelo-radiante' && !data.thermal.radiatorMaterial) {
      errs.thermalRadiatorMaterial = 'Selecciona el material de los radiadores';
    }
  }

  if (stepKey === 'additional') {
    if (!data.additional.soldProduct) errs.additionalSoldProduct = 'Selecciona el producto vendido';
    if (data.additional.isExistingCustomer === null) errs.additionalIsExistingCustomer = 'Indica si es cliente de Eltex';
    if (data.additional.hasSolarPanels === null) errs.additionalHasSolarPanels = 'Indica si tiene placas solares';
  }

  return errs;
}

export function isEnergyCertificateReadyToComplete(data: EnergyCertificateData): boolean {
  return EC_DATA_STEPS.every((key) => Object.keys(validateEcStep(key, data)).length === 0);
}
