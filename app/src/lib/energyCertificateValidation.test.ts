import { describe, it, expect } from 'vitest';
import {
  isEnergyCertificateReadyToComplete,
  validateEcStep,
} from './energyCertificateValidation';
import type { EnergyCertificateData } from '@/types';

describe('Energy Certificate Validation - New Rules', () => {
  // Helper function to create base data
  function createBaseData(): EnergyCertificateData {
    return {
      status: 'in-progress',
      housing: {
        cadastralReference: '',
        habitableAreaM2: '100',
        floorCount: '2',
        averageFloorHeight: '2.7-3.2m',
        bedroomCount: '3',
        doorsByOrientation: { north: '1', east: '1', south: '1', west: '1' },
        windowsByOrientation: { north: '2', east: '2', south: '2', west: '2' },
        windowFrameMaterial: 'pvc',
        doorMaterial: 'Madera',
        windowGlassType: 'doble',
        hasShutters: false,
        shutterWindowCount: '',
      },
      thermal: {
        thermalInstallationType: 'caldera',
        boilerFuelType: 'gas',
        equipmentDetails: 'Samsung 2020',
        hasAirConditioning: false,
        airConditioningType: null,
        airConditioningDetails: '',
        heatingEmitterType: 'radiadores-agua',
        radiatorMaterial: 'aluminio',
        tipoFase: 'monofasica',
        tipoFaseConfirmed: true,
      },
      additional: {
        soldProduct: 'solo-paneles',
        isExistingCustomer: true,
        hasSolarPanels: false,
        solarPanelDetails: '',
      },
      customerSignature: null,
      renderedDocument: null,
      completedAt: null,
      skippedAt: null,
    };
  }

  describe('HOUSING Step', () => {
    it('Scenario 1: doorMaterial = "" should produce housingDoorMaterial error', () => {
      const data = createBaseData();
      data.housing.doorMaterial = '';
      const errors = validateEcStep('housing', data);
      expect(errors).toHaveProperty('housingDoorMaterial');
      expect(errors.housingDoorMaterial).toBe('Introduce el material de las puertas');
    });

    it('Scenario 2: doorMaterial = "Madera" should NOT produce housingDoorMaterial error', () => {
      const data = createBaseData();
      data.housing.doorMaterial = 'Madera';
      const errors = validateEcStep('housing', data);
      expect(errors).not.toHaveProperty('housingDoorMaterial');
    });

    it('accepts zero values for count-style housing fields', () => {
      const data = createBaseData();
      data.housing.floorCount = '0';
      data.housing.bedroomCount = '0';
      data.housing.doorsByOrientation = {
        north: '0',
        east: '0',
        south: '0',
        west: '0',
      };
      data.housing.windowsByOrientation = {
        north: '0',
        east: '0',
        south: '0',
        west: '0',
      };
      data.housing.hasShutters = true;
      data.housing.shutterWindowCount = '0';

      const errors = validateEcStep('housing', data);

      expect(errors).not.toHaveProperty('housingFloorCount');
      expect(errors).not.toHaveProperty('housingBedroomCount');
      expect(errors).not.toHaveProperty('housingOpenings');
      expect(errors).not.toHaveProperty('housingShutterWindowCount');
    });
  });

  describe('THERMAL Step', () => {
    it('Scenario 3: equipmentDetails = "" should produce thermalEquipmentDetails error', () => {
      const data = createBaseData();
      data.thermal.equipmentDetails = '';
      const errors = validateEcStep('thermal', data);
      expect(errors).toHaveProperty('thermalEquipmentDetails');
      expect(errors.thermalEquipmentDetails).toBe('Introduce la marca y año de instalación del equipo');
    });

    it('Scenario 4: equipmentDetails = "Samsung 2020" should NOT produce thermalEquipmentDetails error', () => {
      const data = createBaseData();
      data.thermal.equipmentDetails = 'Samsung 2020';
      const errors = validateEcStep('thermal', data);
      expect(errors).not.toHaveProperty('thermalEquipmentDetails');
    });

    it('Scenario 5: hasAirConditioning = true, airConditioningDetails = "" should produce thermalAirConditioningDetails error', () => {
      const data = createBaseData();
      data.thermal.hasAirConditioning = true;
      data.thermal.airConditioningType = 'frio-calor';
      data.thermal.airConditioningDetails = '';
      const errors = validateEcStep('thermal', data);
      expect(errors).toHaveProperty('thermalAirConditioningDetails');
      expect(errors.thermalAirConditioningDetails).toBe('Introduce la marca y año del aire acondicionado');
    });

    it('Scenario 6: hasAirConditioning = true, airConditioningDetails = "LG 2021" should NOT produce thermalAirConditioningDetails error', () => {
      const data = createBaseData();
      data.thermal.hasAirConditioning = true;
      data.thermal.airConditioningType = 'frio-calor';
      data.thermal.airConditioningDetails = 'LG 2021';
      const errors = validateEcStep('thermal', data);
      expect(errors).not.toHaveProperty('thermalAirConditioningDetails');
    });

    it('Scenario 7: hasAirConditioning = false, airConditioningDetails = "" should NOT produce thermalAirConditioningDetails error', () => {
      const data = createBaseData();
      data.thermal.hasAirConditioning = false;
      data.thermal.airConditioningDetails = '';
      const errors = validateEcStep('thermal', data);
      expect(errors).not.toHaveProperty('thermalAirConditioningDetails');
    });

    it('Scenario 7b: heatingEmitterType = null should NOT produce thermalHeatingEmitterType error', () => {
      const data = createBaseData();
      data.thermal.heatingEmitterType = null;
      data.thermal.radiatorMaterial = null;
      const errors = validateEcStep('thermal', data);
      expect(errors).not.toHaveProperty('thermalHeatingEmitterType');
    });
  });

  describe('ADDITIONAL Step', () => {
    it('Scenario 8: hasSolarPanels = true, solarPanelDetails = "" should produce additionalSolarPanelDetails error', () => {
      const data = createBaseData();
      data.additional.hasSolarPanels = true;
      data.additional.solarPanelDetails = '';
      const errors = validateEcStep('additional', data);
      expect(errors).toHaveProperty('additionalSolarPanelDetails');
      expect(errors.additionalSolarPanelDetails).toBe('Introduce los detalles de la instalación fotovoltaica');
    });

    it('Scenario 9: hasSolarPanels = true, solarPanelDetails = "10 placas, 5kW" should NOT produce additionalSolarPanelDetails error', () => {
      const data = createBaseData();
      data.additional.hasSolarPanels = true;
      data.additional.solarPanelDetails = '10 placas, 5kW';
      const errors = validateEcStep('additional', data);
      expect(errors).not.toHaveProperty('additionalSolarPanelDetails');
    });

    it('Scenario 10: hasSolarPanels = false, solarPanelDetails = "" should NOT produce additionalSolarPanelDetails error', () => {
      const data = createBaseData();
      data.additional.hasSolarPanels = false;
      data.additional.solarPanelDetails = '';
      const errors = validateEcStep('additional', data);
      expect(errors).not.toHaveProperty('additionalSolarPanelDetails');
    });
  });

  describe('Conditional Field Visibility — UI Logic Mirror', () => {
    // UNIT-COND-01: hasShutters=false → no error on shutterWindowCount (even if empty)
    it('UNIT-COND-01: hasShutters=false → no error on shutterWindowCount (even if empty)', () => {
      const data = createBaseData();
      data.housing.hasShutters = false;
      data.housing.shutterWindowCount = '';
      const errors = validateEcStep('housing', data);
      expect(errors).not.toHaveProperty('housingShutterWindowCount');
    });

    // UNIT-COND-02: hasShutters=true + shutterWindowCount='' → error housingShutterWindowCount
    it('UNIT-COND-02: hasShutters=true + shutterWindowCount="" → error housingShutterWindowCount', () => {
      const data = createBaseData();
      data.housing.hasShutters = true;
      data.housing.shutterWindowCount = '';
      const errors = validateEcStep('housing', data);
      expect(errors).toHaveProperty('housingShutterWindowCount');
      expect(errors.housingShutterWindowCount).toBe('Introduce el número de ventanas con persiana');
    });

    // UNIT-COND-03: hasAirConditioning=false → no error on airConditioningDetails or airConditioningType
    it('UNIT-COND-03: hasAirConditioning=false → no error on airConditioningDetails or airConditioningType', () => {
      const data = createBaseData();
      data.thermal.hasAirConditioning = false;
      data.thermal.airConditioningDetails = '';
      data.thermal.airConditioningType = null;
      const errors = validateEcStep('thermal', data);
      expect(errors).not.toHaveProperty('thermalAirConditioningDetails');
      expect(errors).not.toHaveProperty('thermalAirConditioningType');
    });

    // UNIT-COND-04: hasAirConditioning=true + empty fields → errors on both
    it('UNIT-COND-04: hasAirConditioning=true + empty fields → errors on both', () => {
      const data = createBaseData();
      data.thermal.hasAirConditioning = true;
      data.thermal.airConditioningDetails = '';
      data.thermal.airConditioningType = null;
      const errors = validateEcStep('thermal', data);
      expect(errors).toHaveProperty('thermalAirConditioningDetails');
      expect(errors).toHaveProperty('thermalAirConditioningType');
    });

    // UNIT-COND-05: hasSolarPanels=false → no error on solarPanelDetails
    it('UNIT-COND-05: hasSolarPanels=false → no error on solarPanelDetails', () => {
      const data = createBaseData();
      data.additional.hasSolarPanels = false;
      data.additional.solarPanelDetails = '';
      const errors = validateEcStep('additional', data);
      expect(errors).not.toHaveProperty('additionalSolarPanelDetails');
    });

    // UNIT-COND-06: hasSolarPanels=true + empty → error additionalSolarPanelDetails
    it('UNIT-COND-06: hasSolarPanels=true + empty → error additionalSolarPanelDetails', () => {
      const data = createBaseData();
      data.additional.hasSolarPanels = true;
      data.additional.solarPanelDetails = '';
      const errors = validateEcStep('additional', data);
      expect(errors).toHaveProperty('additionalSolarPanelDetails');
      expect(errors.additionalSolarPanelDetails).toBe('Introduce los detalles de la instalación fotovoltaica');
    });

    it('UNIT-COND-07: omitting heatingEmitterType still keeps a full EC ready to complete', () => {
      const data = createBaseData();
      data.thermal.heatingEmitterType = null;
      data.thermal.radiatorMaterial = null;

      expect(isEnergyCertificateReadyToComplete(data)).toBe(true);
    });
  });
});
