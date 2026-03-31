import type { EnergyCertificateData } from '@/types';

type StepKey = 'housing' | 'thermal' | 'additional' | 'final';

// Data-collection steps that must all pass before status can become 'completed'.
// This is the single authoritative "provision" — update here to add/remove required-field rules.
export const EC_DATA_STEPS: StepKey[] = ['housing', 'thermal', 'additional'];

export function validateEcStep(stepKey: StepKey, data: EnergyCertificateData): Record<string, string> {
  const errs: Record<string, string> = {};

  // Use safe defaults so this function can be called with raw/partial DB data
  // (e.g. from getDashboardEnergyCertificateSummary) without throwing on missing sub-objects.
  if (stepKey === 'housing') {
    const h = data.housing ?? ({} as EnergyCertificateData['housing']);
    const _area = h.habitableAreaM2 !== null && h.habitableAreaM2 !== undefined ? String(h.habitableAreaM2).trim() : '';
    if (!_area) errs.housingHabitableAreaM2 = 'Introduce los m² habitables';
    const _floors = h.floorCount !== null && h.floorCount !== undefined ? String(h.floorCount).trim() : '';
    if (!_floors) errs.housingFloorCount = 'Introduce el número de plantas';
    const _bedrooms = h.bedroomCount !== null && h.bedroomCount !== undefined ? String(h.bedroomCount).trim() : '';
    if (!_bedrooms) errs.housingBedroomCount = 'Introduce el número de dormitorios';
    if (!h.averageFloorHeight) errs.housingAverageFloorHeight = 'Selecciona la altura promedio de planta';
    if (!h.windowFrameMaterial) errs.housingWindowFrameMaterial = 'Selecciona el material de los marcos';
    if (!h.windowGlassType) errs.housingWindowGlassType = 'Selecciona el tipo de vidrio';
    if (h.hasShutters === null || h.hasShutters === undefined) errs.housingHasShutters = 'Indica si hay ventanas con persiana';
  }

  if (stepKey === 'thermal') {
    const t = data.thermal ?? ({} as EnergyCertificateData['thermal']);
    if (!t.thermalInstallationType) errs.thermalInstallationType = 'Selecciona el tipo de instalación térmica';
    if (!t.boilerFuelType) errs.thermalBoilerFuelType = 'Selecciona el tipo de combustión';
    if (t.hasAirConditioning === null || t.hasAirConditioning === undefined) errs.thermalHasAirConditioning = 'Indica si hay aire acondicionado';
    if (t.hasAirConditioning === true && !t.airConditioningType) {
      errs.thermalAirConditioningType = 'Selecciona el tipo de bomba';
    }
    if (!t.heatingEmitterType) errs.thermalHeatingEmitterType = 'Selecciona el tipo de calefacción';
    if (t.heatingEmitterType && t.heatingEmitterType !== 'suelo-radiante' && !t.radiatorMaterial) {
      errs.thermalRadiatorMaterial = 'Selecciona el material de los radiadores';
    }
  }

  if (stepKey === 'additional') {
    const a = data.additional ?? ({} as EnergyCertificateData['additional']);
    if (!a.soldProduct) errs.additionalSoldProduct = 'Selecciona el producto vendido';
    if (a.isExistingCustomer === null || a.isExistingCustomer === undefined) errs.additionalIsExistingCustomer = 'Indica si es cliente de Eltex';
    if (a.hasSolarPanels === null || a.hasSolarPanels === undefined) errs.additionalHasSolarPanels = 'Indica si tiene placas solares';
  }

  return errs;
}

export function isEnergyCertificateReadyToComplete(data: EnergyCertificateData): boolean {
  return EC_DATA_STEPS.every((key) => Object.keys(validateEcStep(key, data)).length === 0);
}
