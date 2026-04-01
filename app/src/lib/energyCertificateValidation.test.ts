import { describe, it, expect } from 'vitest';
import { validateEcStep } from './energyCertificateValidation';
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
});
