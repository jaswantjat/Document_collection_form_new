import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle, Loader2 } from 'lucide-react';
import { SignaturePad } from '@/components/SignaturePad';
import thermalCalentadorImage from '@/assets/energy-certificate/thermal-calentador.png';
import thermalCalderaImage from '@/assets/energy-certificate/thermal-caldera.png';
import thermalAerotermiaImage from '@/assets/energy-certificate/thermal-aerotermia.png';
import thermalTermoElectricoImage from '@/assets/energy-certificate/thermal-termo-electrico.png';
import { createRenderedEnergyCertificateAsset, renderEnergyCertificateOverlay } from '@/lib/energyCertificateDocument';
import type { EnergyCertificateData, FormData, ProjectData } from '@/types';

interface Props {
  project: ProjectData;
  formData: FormData;
  data: EnergyCertificateData;
  onChange: (data: EnergyCertificateData) => void;
  onBack: () => void;
  onContinue: () => void;
}

type StepKey = 'housing' | 'thermal' | 'additional' | 'final';

const STEPS: Array<{ key: StepKey; title: string; description: string }> = [
  { key: 'housing', title: 'Características de la Vivienda', description: 'Datos básicos del inmueble y de sus huecos.' },
  { key: 'thermal', title: 'Características de la Instalación Térmica', description: 'Tipo de equipo, combustible y climatización.' },
  { key: 'additional', title: 'Equipamiento e información adicional', description: 'Producto vendido e instalación fotovoltaica.' },
  { key: 'final', title: 'Resumen y firma', description: 'Revisa el certificado energético y firma para guardarlo.' },
];

const HEIGHT_OPTIONS = [
  { value: '<2.7m', label: 'Menos de 2,7m' },
  { value: '2.7-3.2m', label: 'Entre 2,7m y 3,2m' },
  { value: '>3.2m', label: 'Más de 3,2m' },
] as const;

const THERMAL_INSTALLATION_OPTIONS = [
  { value: 'termo-electrico', label: 'Termo Eléctrico (Sólo ACS)', image: thermalTermoElectricoImage },
  { value: 'calentador', label: 'Calentador (Sólo ACS)', image: thermalCalentadorImage },
  { value: 'caldera', label: 'Caldera (ACS y calefacción)', image: thermalCalderaImage },
  { value: 'aerotermia', label: 'Aerotermia', image: thermalAerotermiaImage },
] as const;

const FUEL_OPTIONS = [
  { value: 'gas', label: 'Gas' },
  { value: 'gasoil', label: 'Gasoil' },
  { value: 'electricidad', label: 'Electricidad' },
  { value: 'aerotermia', label: 'Aerotermia' },
] as const;

const HEATING_OPTIONS = [
  { value: 'radiadores-agua', label: 'Radiadores de Agua' },
  { value: 'radiadores-electricos', label: 'Radiadores eléctricos' },
  { value: 'suelo-radiante', label: 'Suelo Radiante' },
] as const;

const RADIATOR_MATERIAL_OPTIONS = [
  { value: 'hierro-fundido', label: 'Hierro fundido' },
  { value: 'aluminio', label: 'Aluminio' },
] as const;

const SOLD_PRODUCT_OPTIONS = [
  { value: 'solo-paneles', label: 'Solo Paneles Solares' },
  { value: 'solo-aerotermia', label: 'Solo Aerotermia' },
  { value: 'paneles-y-aerotermia', label: 'Paneles Solares y Aerotermia' },
  { value: 'ampliacion', label: 'Ampliación' },
  { value: 'ampliacion-y-aerotermia', label: 'Ampliación y Aerotermia' },
] as const;

const FRAME_OPTIONS = [
  { value: 'madera', label: 'Madera' },
  { value: 'aluminio', label: 'Aluminio' },
  { value: 'pvc', label: 'PVC' },
] as const;

const GLASS_OPTIONS = [
  { value: 'simple', label: 'Simple' },
  { value: 'doble', label: 'Doble vidrio' },
] as const;

const AIR_TYPE_OPTIONS = [
  { value: 'frio-calor', label: 'Frío y Calor' },
  { value: 'frio', label: 'Frío' },
] as const;

function isFilled(value: string | null | undefined) {
  return typeof value === 'string' ? value.trim() !== '' : value != null;
}

function createInProgressState(data: EnergyCertificateData): EnergyCertificateData {
  return {
    ...data,
    status: 'in-progress',
    skippedAt: null,
    completedAt: null,
    renderedDocument: null,
  };
}

function validateStep(step: StepKey, data: EnergyCertificateData): Record<string, string> {
  const errors: Record<string, string> = {};

  if (step === 'housing' || step === 'final') {
    if (!isFilled(data.housing.cadastralReference)) errors.housingCadastralReference = 'La referencia catastral es obligatoria.';
    if (!isFilled(data.housing.habitableAreaM2)) errors.housingHabitableAreaM2 = 'Indica la superficie habitable.';
    if (!isFilled(data.housing.floorCount)) errors.housingFloorCount = 'Indica el número de plantas.';
    if (!data.housing.averageFloorHeight) errors.housingAverageFloorHeight = 'Selecciona la altura libre media.';
    if (!isFilled(data.housing.bedroomCount)) errors.housingBedroomCount = 'Indica el número de dormitorios.';
    if (!data.housing.windowFrameMaterial) errors.housingWindowFrameMaterial = 'Selecciona el material de los marcos.';
    if (!isFilled(data.housing.doorMaterial)) errors.housingDoorMaterial = 'Indica el material de las puertas.';
    if (!data.housing.windowGlassType) errors.housingWindowGlassType = 'Selecciona el tipo de vidrio.';
    const allDoorCountsFilled = Object.values(data.housing.doorsByOrientation).every(isFilled);
    const allWindowCountsFilled = Object.values(data.housing.windowsByOrientation).every(isFilled);
    if (!allDoorCountsFilled || !allWindowCountsFilled) {
      errors.housingOpenings = 'Completa el número de puertas y ventanas en todas las orientaciones.';
    }
    if (data.housing.hasShutters == null) errors.housingHasShutters = 'Indica si las ventanas tienen persiana.';
    if (data.housing.hasShutters && !isFilled(data.housing.shutterWindowCount)) {
      errors.housingShutterWindowCount = 'Indica el número de ventanas con persianas.';
    }
  }

  if (step === 'thermal' || step === 'final') {
    if (!data.thermal.thermalInstallationType) errors.thermalInstallationType = 'Selecciona el tipo de instalación térmica.';
    if (!data.thermal.boilerFuelType) errors.thermalBoilerFuelType = 'Selecciona el combustible del equipo.';
    if (!isFilled(data.thermal.equipmentDetails)) errors.thermalEquipmentDetails = 'Indica marca y año del equipo.';
    if (data.thermal.hasAirConditioning == null) errors.thermalHasAirConditioning = 'Indica si tiene aire acondicionado.';
    if (data.thermal.hasAirConditioning && !data.thermal.airConditioningType) {
      errors.thermalAirConditioningType = 'Selecciona el tipo de aire acondicionado.';
    }
    if (data.thermal.hasAirConditioning && !isFilled(data.thermal.airConditioningDetails)) {
      errors.thermalAirConditioningDetails = 'Indica marca y año del aire acondicionado.';
    }
    if (!data.thermal.heatingEmitterType) errors.thermalHeatingEmitterType = 'Selecciona el tipo de calefacción.';
    if (data.thermal.heatingEmitterType !== 'suelo-radiante' && !data.thermal.radiatorMaterial) {
      errors.thermalRadiatorMaterial = 'Selecciona el material de radiadores.';
    }
  }

  if (step === 'additional' || step === 'final') {
    if (!data.additional.soldProduct) errors.additionalSoldProduct = 'Selecciona el producto vendido.';
    if (data.additional.isExistingCustomer == null) errors.additionalIsExistingCustomer = 'Indica si es cliente de Eltex.';
    if (data.additional.hasSolarPanels == null) errors.additionalHasSolarPanels = 'Indica si cuenta con placas solares.';
    if (data.additional.hasSolarPanels && !isFilled(data.additional.solarPanelDetails)) {
      errors.additionalSolarPanelDetails = 'Indica número de placas, potencia y fecha.';
    }
  }

  if (step === 'final' && !data.customerSignature) {
    errors.customerSignature = 'La firma del cliente es obligatoria para completar el certificado.';
  }

  return errors;
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  error,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  type?: 'text' | 'number';
}) {
  return (
    <label className="space-y-1.5 block">
      <span className="text-sm font-semibold text-gray-800">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={`form-input ${error ? 'error' : ''}`}
      />
      {error && <p className="text-sm text-red-500">{error}</p>}
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
}) {
  return (
    <label className="space-y-1.5 block">
      <span className="text-sm font-semibold text-gray-800">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={3}
        className={`form-input min-h-[96px] ${error ? 'error' : ''}`}
      />
      {error && <p className="text-sm text-red-500">{error}</p>}
    </label>
  );
}

function SegmentedOptions({
  label,
  options,
  value,
  onChange,
  error,
  columns = 2,
}: {
  label: string;
  options: Array<{ value: string; label: string }>;
  value: string | null;
  onChange: (value: string) => void;
  error?: string;
  columns?: 2 | 3;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-gray-800">{label}</p>
      <div className={`grid gap-2 ${columns === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {options.map((option) => {
          const active = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={`px-3 py-3 rounded-xl border-2 text-sm font-semibold transition-all ${
                active ? 'border-eltex-blue bg-eltex-blue text-white' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  );
}

function YesNoField({
  label,
  value,
  onChange,
  error,
}: {
  label: string;
  value: boolean | null;
  onChange: (value: boolean) => void;
  error?: string;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-gray-800">{label}</p>
      <div className="grid grid-cols-2 gap-2">
        {[
          { value: true, label: 'Sí' },
          { value: false, label: 'No' },
        ].map((option) => {
          const active = value === option.value;
          return (
            <button
              key={String(option.value)}
              type="button"
              onClick={() => onChange(option.value)}
              className={`px-3 py-3 rounded-xl border-2 text-sm font-semibold transition-all ${
                active ? 'border-eltex-blue bg-eltex-blue text-white' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  );
}

export function EnergyCertificateSection({
  project,
  formData,
  data,
  onChange,
  onBack,
  onContinue,
}: Props) {
  const [stepIndex, setStepIndex] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [renderingPreview, setRenderingPreview] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(data.renderedDocument?.imageDataUrl || null);
  const [completing, setCompleting] = useState(false);

  const currentStep = STEPS[stepIndex];
  const previewSource = useMemo(
    () => ({ ...project, formData: { ...formData, energyCertificate: data } }),
    [data, formData, project]
  );

  useEffect(() => {
    if (stepIndex !== 3) return;

    let cancelled = false;
    setRenderingPreview(true);
    renderEnergyCertificateOverlay(previewSource)
      .then((imageDataUrl) => {
        if (!cancelled) setPreviewUrl(imageDataUrl);
      })
      .catch((error) => {
        console.error('Energy certificate preview render failed:', error);
        if (!cancelled) setPreviewUrl(null);
      })
      .finally(() => {
        if (!cancelled) setRenderingPreview(false);
      });

    return () => {
      cancelled = true;
    };
  }, [previewSource, stepIndex]);

  const mutate = (updater: (prev: EnergyCertificateData) => EnergyCertificateData) => {
    const next = updater(data);
    onChange(createInProgressState(next));
  };

  const updateOrientationValue = (
    kind: 'doorsByOrientation' | 'windowsByOrientation',
    direction: 'north' | 'east' | 'south' | 'west',
    value: string
  ) => {
    mutate((prev) => ({
      ...prev,
      housing: {
        ...prev.housing,
        [kind]: {
          ...prev.housing[kind],
          [direction]: value,
        },
      },
    }));
  };

  const goNext = () => {
    const nextErrors = validateStep(currentStep.key, data);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setStepIndex((prev) => Math.min(prev + 1, STEPS.length - 1));
  };

  const goBack = () => {
    if (stepIndex === 0) {
      onBack();
      return;
    }
    setStepIndex((prev) => Math.max(prev - 1, 0));
  };

  const skipSurvey = () => {
    onChange({
      ...data,
      status: 'skipped',
      skippedAt: new Date().toISOString(),
      completedAt: null,
      renderedDocument: null,
      customerSignature: null,
    });
    onContinue();
  };

  const completeSurvey = async () => {
    const nextErrors = validateStep('final', data);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      if (Object.keys(nextErrors).some((key) => key.startsWith('housing'))) setStepIndex(0);
      else if (Object.keys(nextErrors).some((key) => key.startsWith('thermal'))) setStepIndex(1);
      else if (Object.keys(nextErrors).some((key) => key.startsWith('additional'))) setStepIndex(2);
      else setStepIndex(3);
      return;
    }

    setCompleting(true);
    try {
      const completedDraft: EnergyCertificateData = {
        ...data,
        status: 'completed',
        skippedAt: null,
        completedAt: new Date().toISOString(),
      };
      const renderedDocument = await createRenderedEnergyCertificateAsset({
        ...project,
        formData: {
          ...formData,
          energyCertificate: completedDraft,
        },
      });

      onChange({
        ...completedDraft,
        renderedDocument,
      });
      onContinue();
    } catch (error) {
      console.error('Energy certificate completion failed:', error);
      setErrors({ finalRender: 'No se pudo generar el certificado energético. Inténtalo de nuevo.' });
    } finally {
      setCompleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white p-5 pb-10">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Certificado energético</h1>
            <p className="text-sm text-gray-500 mt-1">{currentStep.description}</p>
          </div>
          <button
            type="button"
            onClick={skipSurvey}
            className="text-sm font-semibold text-gray-500 hover:text-gray-700 transition-colors"
          >
            Saltar ahora
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {STEPS.map((step, index) => {
            const active = index === stepIndex;
            const done = index < stepIndex;
            return (
              <div
                key={step.key}
                className={`rounded-xl border px-3 py-3 text-sm ${
                  active ? 'border-eltex-blue bg-eltex-blue-light/40' : done ? 'border-emerald-200 bg-emerald-50' : 'border-gray-200 bg-white'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                    active ? 'bg-eltex-blue text-white' : done ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {done ? <CheckCircle className="w-3.5 h-3.5" /> : index + 1}
                  </span>
                  <span className="font-semibold text-gray-700">{step.title}</span>
                </div>
              </div>
            );
          })}
        </div>

        {errors.finalRender && (
          <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {errors.finalRender}
          </div>
        )}

        {currentStep.key === 'housing' && (
          <div className="space-y-6">
            <div className="grid md:grid-cols-2 gap-4">
              <Field
                label="Referencia Catastral de la Vivienda"
                value={data.housing.cadastralReference}
                onChange={(value) => mutate((prev) => ({ ...prev, housing: { ...prev.housing, cadastralReference: value } }))}
                placeholder="Número de referencia catastral"
                error={errors.housingCadastralReference}
              />
              <Field
                label="Tamaño de la Vivienda (m²)"
                value={data.housing.habitableAreaM2}
                onChange={(value) => mutate((prev) => ({ ...prev, housing: { ...prev.housing, habitableAreaM2: value } }))}
                placeholder="120"
                error={errors.housingHabitableAreaM2}
                type="number"
              />
              <Field
                label="Número de Plantas"
                value={data.housing.floorCount}
                onChange={(value) => mutate((prev) => ({ ...prev, housing: { ...prev.housing, floorCount: value } }))}
                placeholder="2"
                error={errors.housingFloorCount}
                type="number"
              />
              <Field
                label="Número de dormitorios"
                value={data.housing.bedroomCount}
                onChange={(value) => mutate((prev) => ({ ...prev, housing: { ...prev.housing, bedroomCount: value } }))}
                placeholder="3"
                error={errors.housingBedroomCount}
                type="number"
              />
            </div>

            <SegmentedOptions
              label="¿Cuál es la altura promedio de la planta?"
              options={HEIGHT_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
              value={data.housing.averageFloorHeight}
              onChange={(value) => mutate((prev) => ({ ...prev, housing: { ...prev.housing, averageFloorHeight: value as EnergyCertificateData['housing']['averageFloorHeight'] } }))}
              error={errors.housingAverageFloorHeight}
              columns={3}
            />

            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <p className="text-sm font-semibold text-gray-800">Nº PUERTAS Exterior</p>
                <div className="grid grid-cols-2 gap-3">
                  {(['north', 'east', 'south', 'west'] as const).map((direction) => (
                    <Field
                      key={`door-${direction}`}
                      label={direction === 'north' ? 'Norte' : direction === 'east' ? 'Este' : direction === 'south' ? 'Sur' : 'Oeste'}
                      value={data.housing.doorsByOrientation[direction]}
                      onChange={(value) => updateOrientationValue('doorsByOrientation', direction, value)}
                      placeholder="0"
                      type="number"
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-sm font-semibold text-gray-800">Nº VENTANAS Exterior</p>
                <div className="grid grid-cols-2 gap-3">
                  {(['north', 'east', 'south', 'west'] as const).map((direction) => (
                    <Field
                      key={`window-${direction}`}
                      label={direction === 'north' ? 'Norte' : direction === 'east' ? 'Este' : direction === 'south' ? 'Sur' : 'Oeste'}
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

            <div className="grid md:grid-cols-2 gap-4">
              <SegmentedOptions
                label="Material de los marcos de las ventanas"
                options={FRAME_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
                value={data.housing.windowFrameMaterial}
                onChange={(value) => mutate((prev) => ({ ...prev, housing: { ...prev.housing, windowFrameMaterial: value as EnergyCertificateData['housing']['windowFrameMaterial'] } }))}
                error={errors.housingWindowFrameMaterial}
                columns={3}
              />
              <Field
                label="Material de las puertas"
                value={data.housing.doorMaterial}
                onChange={(value) => mutate((prev) => ({ ...prev, housing: { ...prev.housing, doorMaterial: value } }))}
                placeholder="Madera"
                error={errors.housingDoorMaterial}
              />
            </div>

            <SegmentedOptions
              label="Tipo de vidrio de las ventanas"
              options={GLASS_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
              value={data.housing.windowGlassType}
              onChange={(value) => mutate((prev) => ({ ...prev, housing: { ...prev.housing, windowGlassType: value as EnergyCertificateData['housing']['windowGlassType'] } }))}
              error={errors.housingWindowGlassType}
            />

            <div className="grid md:grid-cols-2 gap-4">
              <YesNoField
                label="¿Las ventanas tienen persiana?"
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
              <Field
                label="Número de ventanas con persianas"
                value={data.housing.shutterWindowCount}
                onChange={(value) => mutate((prev) => ({ ...prev, housing: { ...prev.housing, shutterWindowCount: value } }))}
                placeholder="0"
                error={errors.housingShutterWindowCount}
                type="number"
              />
            </div>
          </div>
        )}

        {currentStep.key === 'thermal' && (
          <div className="space-y-6">
            <div className="space-y-2">
              <p className="text-sm font-semibold text-gray-800">Tipo de instalación térmica</p>
              <div className="grid md:grid-cols-4 gap-3">
                {THERMAL_INSTALLATION_OPTIONS.map((option) => {
                  const active = data.thermal.thermalInstallationType === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => mutate((prev) => ({ ...prev, thermal: { ...prev.thermal, thermalInstallationType: option.value as EnergyCertificateData['thermal']['thermalInstallationType'] } }))}
                      className={`rounded-2xl border-2 overflow-hidden transition-all text-left ${
                        active ? 'border-eltex-blue shadow-md' : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="aspect-[4/5] bg-gray-50">
                        <img src={option.image} alt={option.label} className="w-full h-full object-cover" />
                      </div>
                      <div className={`px-3 py-3 text-sm font-semibold ${active ? 'bg-eltex-blue text-white' : 'bg-white text-gray-700'}`}>
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
              onChange={(value) => mutate((prev) => ({ ...prev, thermal: { ...prev.thermal, boilerFuelType: value as EnergyCertificateData['thermal']['boilerFuelType'] } }))}
              error={errors.thermalBoilerFuelType}
            />

            <Field
              label="Detalles del equipo (Marca y Año de instalación)"
              value={data.thermal.equipmentDetails}
              onChange={(value) => mutate((prev) => ({ ...prev, thermal: { ...prev.thermal, equipmentDetails: value } }))}
              placeholder="Marca y año de la instalación"
              error={errors.thermalEquipmentDetails}
            />

            <div className="grid md:grid-cols-2 gap-4">
              <YesNoField
                label="¿Tienes Aire Acondicionado?"
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
              <Field
                label="Detalles del aire (marca y año)"
                value={data.thermal.airConditioningDetails}
                onChange={(value) => mutate((prev) => ({ ...prev, thermal: { ...prev.thermal, airConditioningDetails: value } }))}
                placeholder="Marca y año"
                error={errors.thermalAirConditioningDetails}
              />
            </div>

            <SegmentedOptions
              label="¿Tipo de Bomba?"
              options={AIR_TYPE_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
              value={data.thermal.airConditioningType}
              onChange={(value) => mutate((prev) => ({ ...prev, thermal: { ...prev.thermal, airConditioningType: value as EnergyCertificateData['thermal']['airConditioningType'] } }))}
              error={errors.thermalAirConditioningType}
            />

            <div className="grid md:grid-cols-2 gap-4">
              <SegmentedOptions
                label="Tipo de Calefacción o Radiadores"
                options={HEATING_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
                value={data.thermal.heatingEmitterType}
                onChange={(value) => mutate((prev) => ({
                  ...prev,
                  thermal: {
                    ...prev.thermal,
                    heatingEmitterType: value as EnergyCertificateData['thermal']['heatingEmitterType'],
                    radiatorMaterial: value === 'suelo-radiante' ? 'no-aplica' : prev.thermal.radiatorMaterial,
                  },
                }))}
                error={errors.thermalHeatingEmitterType}
              />
              <SegmentedOptions
                label="Material Radiadores"
                options={RADIATOR_MATERIAL_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
                value={data.thermal.heatingEmitterType === 'suelo-radiante' ? 'no-aplica' : data.thermal.radiatorMaterial}
                onChange={(value) => mutate((prev) => ({ ...prev, thermal: { ...prev.thermal, radiatorMaterial: value as EnergyCertificateData['thermal']['radiatorMaterial'] } }))}
                error={errors.thermalRadiatorMaterial}
              />
            </div>
          </div>
        )}

        {currentStep.key === 'additional' && (
          <div className="space-y-6">
            <SegmentedOptions
              label="¿Qué producto/s se está vendiendo?"
              options={SOLD_PRODUCT_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
              value={data.additional.soldProduct}
              onChange={(value) => mutate((prev) => ({ ...prev, additional: { ...prev.additional, soldProduct: value as EnergyCertificateData['additional']['soldProduct'] } }))}
              error={errors.additionalSoldProduct}
              columns={3}
            />

            <div className="grid md:grid-cols-2 gap-4">
              <YesNoField
                label="¿Eres Cliente de Eltex?"
                value={data.additional.isExistingCustomer}
                onChange={(value) => mutate((prev) => ({ ...prev, additional: { ...prev.additional, isExistingCustomer: value } }))}
                error={errors.additionalIsExistingCustomer}
              />
              <YesNoField
                label="¿Cuenta con placas solares?"
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

            <TextAreaField
              label="Detalles de la Instalación Fotovoltaica (Número de placas, Potencia y Fecha de instalación)"
              value={data.additional.solarPanelDetails}
              onChange={(value) => mutate((prev) => ({ ...prev, additional: { ...prev.additional, solarPanelDetails: value } }))}
              placeholder="Número de placas, potencia y fecha de instalación"
              error={errors.additionalSolarPanelDetails}
            />
          </div>
        )}

        {currentStep.key === 'final' && (
          <div className="space-y-5">
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-eltex-blue shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-gray-900">Resumen final del certificado energético</p>
                  <p className="text-sm text-gray-500 mt-1">
                    Este documento se guardará en el expediente y será visible en el dashboard como PDF firmado.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-3">
              {renderingPreview ? (
                <div className="flex items-center justify-center gap-3 py-20 text-sm text-gray-500">
                  <Loader2 className="w-5 h-5 animate-spin text-eltex-blue" />
                  Generando vista previa del certificado...
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

            <div className="space-y-2">
              <p className="text-sm font-semibold text-gray-800">Firma del cliente</p>
              <SignaturePad
                existingSignature={data.customerSignature}
                onSignature={(signature) => mutate((prev) => ({ ...prev, customerSignature: signature }))}
                error={errors.customerSignature}
              />
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 pt-2">
          <button
            type="button"
            onClick={goBack}
            className="btn-secondary inline-flex items-center gap-2 px-5"
          >
            <ArrowLeft className="w-4 h-4" />
            {stepIndex === 0 ? 'Volver' : 'Anterior'}
          </button>

          <div className="flex items-center gap-3">
            {currentStep.key !== 'final' ? (
              <button
                type="button"
                onClick={goNext}
                className="btn-primary inline-flex items-center gap-2 px-6"
              >
                Siguiente
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void completeSurvey()}
                disabled={completing || renderingPreview}
                className="btn-primary inline-flex items-center gap-2 px-6 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {completing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                Completar certificado
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
