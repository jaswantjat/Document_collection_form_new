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
    // cadastralReference is intentionally optional — all other housing fields are required
    const _area = h.habitableAreaM2 !== null && h.habitableAreaM2 !== undefined ? String(h.habitableAreaM2).trim() : '';
    if (!_area) errs.housingHabitableAreaM2 = 'Introduce los m² habitables';
    const _floors = h.floorCount !== null && h.floorCount !== undefined ? String(h.floorCount).trim() : '';
    if (!_floors) errs.housingFloorCount = 'Introduce el número de plantas';
    const _bedrooms = h.bedroomCount !== null && h.bedroomCount !== undefined ? String(h.bedroomCount).trim() : '';
    if (!_bedrooms) errs.housingBedroomCount = 'Introduce el número de dormitorios';
    if (!h.averageFloorHeight) errs.housingAverageFloorHeight = 'Selecciona la altura promedio de planta';

    // All four orientations for doors and windows must be filled in
    const doors = h.doorsByOrientation ?? { north: '', east: '', south: '', west: '' };
    const windows = h.windowsByOrientation ?? { north: '', east: '', south: '', west: '' };
    const directions = ['north', 'east', 'south', 'west'] as const;
    const missingDoors = directions.some((d) => String(doors[d] ?? '').trim() === '');
    const missingWindows = directions.some((d) => String(windows[d] ?? '').trim() === '');
    if (missingDoors || missingWindows) {
      errs.housingOpenings = 'Introduce el número de puertas y ventanas en cada orientación';
    }

    if (!h.windowFrameMaterial) errs.housingWindowFrameMaterial = 'Selecciona el material de los marcos';
    if (!String(h.doorMaterial ?? '').trim()) errs.housingDoorMaterial = 'Introduce el material de las puertas';
    if (!h.windowGlassType) errs.housingWindowGlassType = 'Selecciona el tipo de vidrio';
    if (h.hasShutters === null || h.hasShutters === undefined) errs.housingHasShutters = 'Indica si hay ventanas con persiana';

    // When the user confirmed there are shuttered windows, the count is required
    if (h.hasShutters === true) {
      const _shutterCount = String(h.shutterWindowCount ?? '').trim();
      if (!_shutterCount) errs.housingShutterWindowCount = 'Introduce el número de ventanas con persiana';
    }
  }

  if (stepKey === 'thermal') {
    const t = data.thermal ?? ({} as EnergyCertificateData['thermal']);
    if (!t.thermalInstallationType) errs.thermalInstallationType = 'Selecciona el tipo de instalación térmica';
    if (!t.boilerFuelType) errs.thermalBoilerFuelType = 'Selecciona el tipo de combustión';
    if (!String(t.equipmentDetails ?? '').trim()) errs.thermalEquipmentDetails = 'Introduce la marca y año de instalación del equipo';
    if (t.hasAirConditioning === null || t.hasAirConditioning === undefined) errs.thermalHasAirConditioning = 'Indica si hay aire acondicionado';
    if (t.hasAirConditioning === true && !t.airConditioningType) {
      errs.thermalAirConditioningType = 'Selecciona el tipo de bomba';
    }
    if (t.hasAirConditioning === true && !String(t.airConditioningDetails ?? '').trim()) {
      errs.thermalAirConditioningDetails = 'Introduce la marca y año del aire acondicionado';
    }
    if ((t.heatingEmitterType === 'radiadores-agua' || t.heatingEmitterType === 'radiadores-electricos') && !t.radiatorMaterial) {
      errs.thermalRadiatorMaterial = 'Selecciona el material de los radiadores';
    }
    if (!t.tipoFase) errs.thermalTipoFase = 'Selecciona el tipo de fase';
    if (t.tipoFase && t.tipoFaseConfirmed === false) {
      errs.thermalTipoFase = 'Por favor, confirma el tipo de fase extraído de la factura';
    }
  }

  if (stepKey === 'additional') {
    const a = data.additional ?? ({} as EnergyCertificateData['additional']);
    if (!a.soldProduct) errs.additionalSoldProduct = 'Selecciona el producto vendido';
    if (a.isExistingCustomer === null || a.isExistingCustomer === undefined) errs.additionalIsExistingCustomer = 'Indica si es cliente de Eltex';
    if (a.hasSolarPanels === null || a.hasSolarPanels === undefined) errs.additionalHasSolarPanels = 'Indica si tiene placas solares';
    if (a.hasSolarPanels === true && !String(a.solarPanelDetails ?? '').trim()) {
      errs.additionalSolarPanelDetails = 'Introduce los detalles de la instalación fotovoltaica';
    }
  }

  return errs;
}

export function isEnergyCertificateReadyToComplete(data: EnergyCertificateData): boolean {
  return EC_DATA_STEPS.every((key) => Object.keys(validateEcStep(key, data)).length === 0);
}
