import { AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';
import type { EnergyCertificateData } from '@/types';
import { Field, SegmentedOptions, TextAreaField, YesNoField } from './Fields';
import {
  AIR_TYPE_OPTIONS,
  deriveSoldProduct,
  FRAME_OPTIONS,
  FUEL_OPTIONS,
  GLASS_OPTIONS,
  HEATING_OPTIONS,
  HEIGHT_OPTIONS,
  parseSoldProduct,
  RADIATOR_MATERIAL_OPTIONS,
  THERMAL_INSTALLATION_OPTIONS,
  type SoldProductString,
} from './options';

type Errors = Record<string, string>;
type Mutate = (updater: (prev: EnergyCertificateData) => EnergyCertificateData) => void;

interface HousingStepPanelProps {
  data: EnergyCertificateData;
  errors: Errors;
  mutate: Mutate;
  updateOrientationValue: (
    kind: 'doorsByOrientation' | 'windowsByOrientation',
    direction: 'north' | 'east' | 'south' | 'west',
    value: string
  ) => void;
}

function DirectionFieldLabel(direction: 'north' | 'east' | 'south' | 'west') {
  if (direction === 'north') return 'Norte';
  if (direction === 'east') return 'Este';
  if (direction === 'south') return 'Sur';
  return 'Oeste';
}

export function HousingStepPanel({
  data,
  errors,
  mutate,
  updateOrientationValue,
}: HousingStepPanelProps) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Field
            label="Referencia Catastral de la Vivienda"
            value={data.housing.cadastralReference}
            onChange={(value) => mutate((prev) => ({
              ...prev,
              housing: { ...prev.housing, cadastralReference: value },
            }))}
            placeholder="Número de referencia catastral"
            error={errors.housingCadastralReference}
          />
        </div>
        <Field
          label="Tamaño (m²)"
          value={data.housing.habitableAreaM2}
          onChange={(value) => mutate((prev) => ({
            ...prev,
            housing: { ...prev.housing, habitableAreaM2: value },
          }))}
          placeholder="120"
          error={errors.housingHabitableAreaM2}
          type="number"
        />
        <Field
          label="Nº Plantas"
          value={data.housing.floorCount}
          onChange={(value) => mutate((prev) => ({
            ...prev,
            housing: { ...prev.housing, floorCount: value },
          }))}
          placeholder="2"
          error={errors.housingFloorCount}
          type="number"
        />
        <div className="col-span-2 sm:col-span-1">
          <Field
            label="Nº Dormitorios"
            value={data.housing.bedroomCount}
            onChange={(value) => mutate((prev) => ({
              ...prev,
              housing: { ...prev.housing, bedroomCount: value },
            }))}
            placeholder="3"
            error={errors.housingBedroomCount}
            type="number"
          />
        </div>
      </div>

      <SegmentedOptions
        label="Altura promedio de planta"
        options={HEIGHT_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
        value={data.housing.averageFloorHeight}
        onChange={(value) => mutate((prev) => ({
          ...prev,
          housing: {
            ...prev.housing,
            averageFloorHeight: value as EnergyCertificateData['housing']['averageFloorHeight'],
          },
        }))}
        error={errors.housingAverageFloorHeight}
        columns={3}
      />

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <p className="text-sm font-semibold text-gray-800">Nº PUERTAS Exterior</p>
          <div className="grid grid-cols-2 gap-2">
            {(['north', 'east', 'south', 'west'] as const).map((direction) => (
              <Field
                key={`door-${direction}`}
                label={DirectionFieldLabel(direction)}
                value={data.housing.doorsByOrientation[direction]}
                onChange={(value) => updateOrientationValue('doorsByOrientation', direction, value)}
                placeholder="0"
                type="number"
              />
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold text-gray-800">Nº VENTANAS Exterior</p>
          <div className="grid grid-cols-2 gap-2">
            {(['north', 'east', 'south', 'west'] as const).map((direction) => (
              <Field
                key={`window-${direction}`}
                label={DirectionFieldLabel(direction)}
                value={data.housing.windowsByOrientation[direction]}
                onChange={(value) => updateOrientationValue('windowsByOrientation', direction, value)}
                placeholder="0"
                type="number"
              />
            ))}
          </div>
        </div>
      </div>
      {errors.housingOpenings && <p className="text-sm text-red-500">{errors.housingOpenings}</p>}

      <SegmentedOptions
        label="Material de los marcos de las ventanas"
        options={FRAME_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
        value={data.housing.windowFrameMaterial}
        onChange={(value) => mutate((prev) => ({
          ...prev,
          housing: {
            ...prev.housing,
            windowFrameMaterial: value as EnergyCertificateData['housing']['windowFrameMaterial'],
          },
        }))}
        error={errors.housingWindowFrameMaterial}
        columns={3}
      />

      <Field
        label="Material de las puertas"
        value={data.housing.doorMaterial}
        onChange={(value) => mutate((prev) => ({
          ...prev,
          housing: { ...prev.housing, doorMaterial: value },
        }))}
        placeholder="Madera"
        error={errors.housingDoorMaterial}
      />

      <SegmentedOptions
        label="Tipo de vidrio de las ventanas"
        options={GLASS_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
        value={data.housing.windowGlassType}
        onChange={(value) => mutate((prev) => ({
          ...prev,
          housing: {
            ...prev.housing,
            windowGlassType: value as EnergyCertificateData['housing']['windowGlassType'],
          },
        }))}
        error={errors.housingWindowGlassType}
      />

      <YesNoField
        label="¿Ventanas con persiana?"
        value={data.housing.hasShutters}
        onChange={(value) => mutate((prev) => ({
          ...prev,
          housing: {
            ...prev.housing,
            hasShutters: value,
            shutterWindowCount: value ? prev.housing.shutterWindowCount : '0',
          },
        }))}
        error={errors.housingHasShutters}
      />
      {data.housing.hasShutters === true && (
        <Field
          label="Nº ventanas con persianas"
          value={data.housing.shutterWindowCount}
          onChange={(value) => {
            const clamped = value === '' ? '' : String(Math.max(0, parseInt(value, 10) || 0));
            mutate((prev) => ({
              ...prev,
              housing: { ...prev.housing, shutterWindowCount: clamped },
            }));
          }}
          placeholder="0"
          error={errors.housingShutterWindowCount}
          type="number"
        />
      )}
    </div>
  );
}

interface ThermalStepPanelProps {
  data: EnergyCertificateData;
  errors: Errors;
  mutate: Mutate;
}

export function ThermalStepPanel({ data, errors, mutate }: ThermalStepPanelProps) {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="text-sm font-semibold text-gray-800">Tipo de instalación térmica</p>
        <div className="grid grid-cols-2 gap-3">
          {THERMAL_INSTALLATION_OPTIONS.map((option) => {
            const active = data.thermal.thermalInstallationType === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => mutate((prev) => ({
                  ...prev,
                  thermal: {
                    ...prev.thermal,
                    thermalInstallationType: option.value as EnergyCertificateData['thermal']['thermalInstallationType'],
                  },
                }))}
                className={`rounded-2xl border-2 overflow-hidden transition-all active:scale-[0.97] text-left ${
                  active ? 'border-eltex-blue shadow-md shadow-eltex-blue/20' : 'border-gray-200'
                }`}
              >
                <div className="aspect-square bg-gray-50">
                  <img src={option.image} alt={option.label} className="w-full h-full object-contain p-2" />
                </div>
                <div className={`px-2.5 py-2.5 text-xs font-semibold leading-tight ${active ? 'bg-eltex-blue text-white' : 'bg-white text-gray-700'}`}>
                  {option.label}
                </div>
              </button>
            );
          })}
        </div>
        {errors.thermalInstallationType && <p className="text-sm text-red-500">{errors.thermalInstallationType}</p>}
      </div>

      <SegmentedOptions
        label="Tipo de combustión del equipo"
        options={FUEL_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
        value={data.thermal.boilerFuelType}
        onChange={(value) => mutate((prev) => ({
          ...prev,
          thermal: {
            ...prev.thermal,
            boilerFuelType: value as EnergyCertificateData['thermal']['boilerFuelType'],
          },
        }))}
        error={errors.thermalBoilerFuelType}
      />

      <Field
        label="Detalles del equipo (Marca y Año de instalación)"
        value={data.thermal.equipmentDetails}
        onChange={(value) => mutate((prev) => ({
          ...prev,
          thermal: { ...prev.thermal, equipmentDetails: value },
        }))}
        placeholder="Marca y año de la instalación"
        error={errors.thermalEquipmentDetails}
      />

      <YesNoField
        label="¿Aire Acondicionado?"
        value={data.thermal.hasAirConditioning}
        onChange={(value) => mutate((prev) => ({
          ...prev,
          thermal: {
            ...prev.thermal,
            hasAirConditioning: value,
            airConditioningType: value ? prev.thermal.airConditioningType : null,
            airConditioningDetails: value ? prev.thermal.airConditioningDetails : '',
          },
        }))}
        error={errors.thermalHasAirConditioning}
      />
      {data.thermal.hasAirConditioning === true && (
        <>
          <Field
            label="Detalles (marca y año)"
            value={data.thermal.airConditioningDetails}
            onChange={(value) => mutate((prev) => ({
              ...prev,
              thermal: { ...prev.thermal, airConditioningDetails: value },
            }))}
            placeholder="Marca y año"
            error={errors.thermalAirConditioningDetails}
          />
          <SegmentedOptions
            label="¿Tipo de Bomba?"
            options={AIR_TYPE_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
            value={data.thermal.airConditioningType}
            onChange={(value) => mutate((prev) => ({
              ...prev,
              thermal: {
                ...prev.thermal,
                airConditioningType: value as EnergyCertificateData['thermal']['airConditioningType'],
              },
            }))}
            error={errors.thermalAirConditioningType}
          />
        </>
      )}

      <SegmentedOptions
        label="Tipo de Calefacción"
        options={HEATING_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
        value={data.thermal.heatingEmitterType}
        onChange={(value) => {
          const heatingEmitterType = value as EnergyCertificateData['thermal']['heatingEmitterType'];
          mutate((prev) => ({
            ...prev,
            thermal: {
              ...prev.thermal,
              heatingEmitterType,
              radiatorMaterial:
                heatingEmitterType === 'radiadores-agua' || heatingEmitterType === 'radiadores-electricos'
                  ? prev.thermal.radiatorMaterial === 'no-aplica'
                    ? null
                    : prev.thermal.radiatorMaterial
                  : 'no-aplica',
            },
          }));
        }}
        error={errors.thermalHeatingEmitterType}
        columns={3}
      />

      {(data.thermal.heatingEmitterType === 'radiadores-agua'
        || data.thermal.heatingEmitterType === 'radiadores-electricos') && (
        <SegmentedOptions
          label="Material Radiadores"
          options={RADIATOR_MATERIAL_OPTIONS.map((option) => ({
            value: option.value,
            label: option.label,
          }))}
          value={data.thermal.radiatorMaterial === 'no-aplica' ? null : data.thermal.radiatorMaterial}
          onChange={(value) => mutate((prev) => ({
            ...prev,
            thermal: {
              ...prev.thermal,
              radiatorMaterial: value as EnergyCertificateData['thermal']['radiatorMaterial'],
            },
          }))}
          error={errors.thermalRadiatorMaterial}
          columns={3}
        />
      )}

      <Field
        label="Código CUPS (de la factura)"
        value={data.thermal.cups || ''}
        onChange={(value) => mutate((prev) => ({
          ...prev,
          thermal: { ...prev.thermal, cups: value.toUpperCase() },
        }))}
        placeholder="ES0000..."
        error={errors.thermalCups}
      />

      <div className="space-y-3">
        <SegmentedOptions
          label="Tipo de Fase"
          options={[
            { value: 'monofasica', label: 'Monofásica' },
            { value: 'trifasica', label: 'Trifásica' },
          ]}
          value={data.thermal.tipoFase || null}
          onChange={(value) => mutate((prev) => ({
            ...prev,
            thermal: {
              ...prev.thermal,
              tipoFase: value as 'monofasica' | 'trifasica',
              tipoFaseConfirmed: true,
            },
          }))}
          error={errors.thermalTipoFase}
        />

        {data.thermal.tipoFase && data.thermal.tipoFaseConfirmed === false && (
          <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl animate-pulse">
            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-xs font-semibold text-amber-800">Sugerencia de la IA</p>
              <p className="text-[11px] text-amber-700">Confirma si el tipo de fase es correcto.</p>
              <button
                type="button"
                onClick={() => mutate((prev) => ({
                  ...prev,
                  thermal: { ...prev.thermal, tipoFaseConfirmed: true },
                }))}
                className="mt-1.5 px-3 py-1 bg-amber-200 hover:bg-amber-300 text-amber-900 text-[10px] font-bold rounded-lg transition-colors"
              >
                Confirmar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface AdditionalStepPanelProps {
  data: EnergyCertificateData;
  errors: Errors;
  mutate: Mutate;
}

export function AdditionalStepPanel({ data, errors, mutate }: AdditionalStepPanelProps) {
  const soldProduct = parseSoldProduct(data.additional.soldProduct as SoldProductString | null);

  const toggle = (field: 'hasSolar' | 'hasAerothermal' | 'isAmpliacion') => {
    const next = { ...soldProduct, [field]: !soldProduct[field] };
    if (field === 'isAmpliacion' && next.isAmpliacion) next.hasSolar = false;
    if (field === 'hasSolar' && next.hasSolar) next.isAmpliacion = false;
    mutate((prev) => ({
      ...prev,
      additional: {
        ...prev.additional,
        soldProduct: deriveSoldProduct(next.hasSolar, next.hasAerothermal, next.isAmpliacion),
      },
    }));
  };

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="text-sm font-semibold text-gray-800">
          ¿Qué producto/s se está vendiendo? <span className="text-red-500">*</span>
        </p>
        <p className="text-xs text-gray-400">Puedes seleccionar más de uno.</p>
        <div className="space-y-2">
          {[
            { field: 'hasSolar', label: 'Paneles Solares', sublabel: 'Instalación fotovoltaica' },
            { field: 'hasAerothermal', label: 'Aerotermia', sublabel: 'Bomba de calor' },
            { field: 'isAmpliacion', label: 'Ampliación', sublabel: 'Ampliación existente' },
          ].map(({ field, label, sublabel }) => {
            const checked = soldProduct[field as keyof typeof soldProduct];
            return (
              <button
                key={field}
                type="button"
                onClick={() => toggle(field as 'hasSolar' | 'hasAerothermal' | 'isAmpliacion')}
                className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border-2 text-left transition-all active:scale-[0.98] ${
                  checked ? 'border-eltex-blue bg-blue-50' : 'border-gray-200 bg-white'
                }`}
              >
                <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 border-2 transition-colors ${
                  checked ? 'bg-eltex-blue border-eltex-blue' : 'bg-white border-gray-300'
                }`}>
                  {checked && <CheckCircle className="w-3.5 h-3.5 text-white" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold leading-tight ${checked ? 'text-eltex-blue' : 'text-gray-700'}`}>{label}</p>
                  <p className="text-xs text-gray-400 leading-tight mt-0.5">{sublabel}</p>
                </div>
              </button>
            );
          })}
        </div>
        {errors.additionalSoldProduct && (
          <p data-ec-field-error className="text-sm text-red-500">{errors.additionalSoldProduct}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <YesNoField
          label="¿Cliente de Eltex?"
          value={data.additional.isExistingCustomer}
          onChange={(value) => mutate((prev) => ({
            ...prev,
            additional: { ...prev.additional, isExistingCustomer: value },
          }))}
          error={errors.additionalIsExistingCustomer}
        />
        <YesNoField
          label="¿Placas solares?"
          value={data.additional.hasSolarPanels}
          onChange={(value) => mutate((prev) => ({
            ...prev,
            additional: {
              ...prev.additional,
              hasSolarPanels: value,
              solarPanelDetails: value ? prev.additional.solarPanelDetails : '',
            },
          }))}
          error={errors.additionalHasSolarPanels}
        />
      </div>

      {data.additional.hasSolarPanels === true && (
        <TextAreaField
          label="Detalles de la Instalación Fotovoltaica"
          value={data.additional.solarPanelDetails}
          onChange={(value) => mutate((prev) => ({
            ...prev,
            additional: { ...prev.additional, solarPanelDetails: value },
          }))}
          placeholder="Número de placas, potencia y fecha de instalación"
          error={errors.additionalSolarPanelDetails}
        />
      )}
    </div>
  );
}

interface FinalStepPanelProps {
  previewUrl: string | null;
  renderingPreview: boolean;
}

export function FinalStepPanel({ previewUrl, renderingPreview }: FinalStepPanelProps) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-200 bg-white p-3">
        {renderingPreview ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-sm text-gray-500">
            <Loader2 className="w-7 h-7 animate-spin text-eltex-blue" />
            Generando vista previa...
          </div>
        ) : previewUrl ? (
          <img
            src={previewUrl}
            alt="Vista previa del certificado energético"
            className="w-full rounded-xl border border-gray-100 shadow-sm"
          />
        ) : (
          <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            No se pudo generar la vista previa del certificado.
          </div>
        )}
      </div>
    </div>
  );
}
