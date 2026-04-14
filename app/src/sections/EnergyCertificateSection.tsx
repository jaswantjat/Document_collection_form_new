import { useEffect, useMemo, useState, useCallback } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle, Loader2, X } from 'lucide-react';
import { createRenderedEnergyCertificateAsset, renderEnergyCertificateOverlay } from '@/lib/energyCertificateDocument';
import type { EnergyCertificateData, FormData, ProjectData } from '@/types';
import {
  validateEcStep as validateStep,
  isEnergyCertificateReadyToComplete,
  EC_DATA_STEPS as DATA_STEPS,
} from '@/lib/energyCertificateValidation';

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
  { key: 'housing', title: 'Vivienda', description: 'La referencia catastral es opcional. Los demás datos son obligatorios.' },
  { key: 'thermal', title: 'Instalación', description: 'Añade la información disponible del equipo y climatización.' },
  { key: 'additional', title: 'Equipamiento', description: 'Producto vendido e instalación fotovoltaica, si aplica.' },
  { key: 'final', title: 'Confirmación', description: 'Revisa el certificado energético antes de guardarlo.' },
];

const HEIGHT_OPTIONS = [
  { value: '<2.7m', label: 'Menos de 2,7m' },
  { value: '2.7-3.2m', label: 'Entre 2,7m y 3,2m' },
  { value: '>3.2m', label: 'Más de 3,2m' },
] as const;

const THERMAL_INSTALLATION_OPTIONS = [
  { value: 'termo-electrico', label: 'Termo Eléctrico (Sólo ACS)', image: 'https://uploads.onecompiler.io/4454edy2w/4454ed8yh/value_image%20(1).png' },
  { value: 'calentador', label: 'Calentador (Sólo ACS)', image: 'https://uploads.onecompiler.io/4454edy2w/4454ed8yh/value_image%20(2).png' },
  { value: 'caldera', label: 'Caldera (ACS y calefacción)', image: 'https://uploads.onecompiler.io/4454edy2w/4454ed8yh/value_image%20(3).png' },
  { value: 'aerotermia', label: 'Aerotermia', image: 'https://uploads.onecompiler.io/4454edy2w/4454ed8yh/value_image.png' },
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

// Sold product multi-select helpers
// The underlying soldProduct string is derived from independent checkbox selections
type SoldProductString = 'solo-paneles' | 'solo-aerotermia' | 'paneles-y-aerotermia' | 'ampliacion' | 'ampliacion-y-aerotermia';

function parseSoldProduct(soldProduct: SoldProductString | null) {
  return {
    hasSolar: soldProduct === 'solo-paneles' || soldProduct === 'paneles-y-aerotermia',
    hasAerothermal: soldProduct === 'solo-aerotermia' || soldProduct === 'paneles-y-aerotermia' || soldProduct === 'ampliacion-y-aerotermia',
    isAmpliacion: soldProduct === 'ampliacion' || soldProduct === 'ampliacion-y-aerotermia',
  };
}

function deriveSoldProduct(hasSolar: boolean, hasAerothermal: boolean, isAmpliacion: boolean): SoldProductString | null {
  if (isAmpliacion) {
    return hasAerothermal ? 'ampliacion-y-aerotermia' : 'ampliacion';
  }
  if (hasSolar && hasAerothermal) return 'paneles-y-aerotermia';
  if (hasSolar) return 'solo-paneles';
  if (hasAerothermal) return 'solo-aerotermia';
  return null;
}

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

function keepOnlyRenderError(errors: Record<string, string>): Record<string, string> {
  return errors.finalRender ? { finalRender: errors.finalRender } : {};
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
        inputMode={type === 'number' ? 'numeric' : 'text'}
        min={type === 'number' ? 0 : undefined}
        className={`form-input ${error ? 'error' : ''}`}
      />
      {error && <p data-ec-field-error className="text-sm text-red-500">{error}</p>}
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
      {error && <p data-ec-field-error className="text-sm text-red-500">{error}</p>}
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
      <div className={`grid gap-2 ${columns === 3 ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2'}`}>
        {options.map((option) => {
          const active = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={`px-3 py-3.5 rounded-xl border-2 text-sm font-semibold transition-all active:scale-[0.97] ${
                active ? 'border-eltex-blue bg-eltex-blue text-white' : 'border-gray-200 bg-white text-gray-600'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {error && <p data-ec-field-error className="text-sm text-red-500">{error}</p>}
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
              className={`px-3 py-3.5 rounded-xl border-2 text-sm font-semibold transition-all active:scale-[0.97] ${
                active ? 'border-eltex-blue bg-eltex-blue text-white' : 'border-gray-200 bg-white text-gray-600'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {error && <p data-ec-field-error className="text-sm text-red-500">{error}</p>}
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
  const [stepIndex, setStepIndex] = useState(data.currentStepIndex ?? 0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [renderingPreview, setRenderingPreview] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(data.renderedDocument?.imageDataUrl || null);
  const [completing, setCompleting] = useState(false);

  const scrollToFirstError = useCallback(() => {
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>('[data-ec-field-error]');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  }, []);

  // Persist the current sub-step so a page reload resumes at the right wizard step.
  const navigateToStep = useCallback((newIndex: number, currentData: EnergyCertificateData) => {
    setStepIndex(newIndex);
    onChange({ ...currentData, currentStepIndex: newIndex });
  }, [onChange]);

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

  useEffect(() => {
    const ibiExtraction = formData.ibi.extraction;
    const ibiCatastral =
      ibiExtraction?.manualCorrections?.referenciaCatastral ??
      (ibiExtraction?.extractedData?.referenciaCatastral as string | null | undefined);

    const ebExtraction = formData.electricityBill.pages?.[0]?.extraction;
    const ebCups = ebExtraction?.extractedData?.cups as string | undefined;
    const ebTipoFase = ebExtraction?.extractedData?.tipoFase as EnergyCertificateData['thermal']['tipoFase'] | undefined;

    const defaultProduct =
      project.productType === 'solar' ? 'solo-paneles'
      : project.productType === 'aerothermal' ? 'solo-aerotermia'
      : project.productType === 'solar-aerothermal' ? 'paneles-y-aerotermia'
      : null;

    const needsCatastral = !!(ibiCatastral && !data.housing.cadastralReference);
    const needsSoldProduct = !!(defaultProduct && !data.additional.soldProduct);
    const needsCups = !!(ebCups && !data.thermal.cups);
    const needsTipoFase = !!(ebTipoFase && !data.thermal.tipoFase);

    if (!needsCatastral && !needsSoldProduct && !needsCups && !needsTipoFase) return;

    onChange({
      ...data,
      status: data.status === 'not-started' ? 'in-progress' : data.status,
      housing: needsCatastral ? { ...data.housing, cadastralReference: ibiCatastral! } : data.housing,
      additional: needsSoldProduct ? { ...data.additional, soldProduct: defaultProduct } : data.additional,
      thermal: {
        ...data.thermal,
        cups: needsCups ? ebCups : data.thermal.cups,
        tipoFase: needsTipoFase ? ebTipoFase : data.thermal.tipoFase,
        tipoFaseConfirmed: needsTipoFase ? false : data.thermal.tipoFaseConfirmed,
      },
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    formData.ibi.extraction?.manualCorrections?.referenciaCatastral,
    formData.ibi.extraction?.extractedData?.referenciaCatastral,
    formData.electricityBill.pages?.[0]?.extraction?.extractedData?.cups,
    formData.electricityBill.pages?.[0]?.extraction?.extractedData?.tipoFase,
    project.productType,
  ]);

  const mutate = (updater: (prev: EnergyCertificateData) => EnergyCertificateData) => {
    const next = updater(data);
    onChange(createInProgressState(next));
  };

  const updateOrientationValue = (
    kind: 'doorsByOrientation' | 'windowsByOrientation',
    direction: 'north' | 'east' | 'south' | 'west',
    value: string
  ) => {
    const clamped = value === '' ? '' : String(Math.max(0, parseInt(value, 10) || 0));
    mutate((prev) => ({
      ...prev,
      housing: {
        ...prev.housing,
        [kind]: {
          ...prev.housing[kind],
          [direction]: clamped,
        },
      },
    }));
  };

  const goNext = () => {
    const stepErrors = validateStep(currentStep.key, data);
    if (Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors);
      scrollToFirstError();
      return;
    }
    setErrors((prev) => keepOnlyRenderError(prev));
    navigateToStep(Math.min(stepIndex + 1, STEPS.length - 1), data);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const goBack = () => {
    if (stepIndex === 0) {
      onBack();
      return;
    }
    navigateToStep(Math.max(stepIndex - 1, 0), data);
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
    // Guard: all data steps must pass validation before status can become 'completed'.
    // This is a defense-in-depth check — per-step validation in goNext() also runs,
    // but this ensures no code path can bypass the requirement.
    if (!isEnergyCertificateReadyToComplete(data)) {
      const firstFailingIndex = DATA_STEPS.findIndex(
        (key) => Object.keys(validateStep(key, data)).length > 0
      );
      if (firstFailingIndex >= 0) {
        navigateToStep(firstFailingIndex, data);
        setErrors(validateStep(DATA_STEPS[firstFailingIndex], data));
        scrollToFirstError();
      }
      return;
    }

    setErrors((prev) => keepOnlyRenderError(prev));
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
    <div className="min-h-screen bg-white flex flex-col">
      <div className="flex-1 px-4 pt-5 pb-28 sm:px-5 sm:pb-10">
        <div className="max-w-2xl mx-auto space-y-5">

          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">Certificado energético</h1>
              <p className="text-sm text-gray-500 mt-0.5">{currentStep.description}</p>
            </div>
            <button
              type="button"
              data-testid="skip-energy-certificate-btn"
              onClick={skipSurvey}
              className="shrink-0 flex items-center gap-1.5 text-sm font-semibold text-gray-400 hover:text-gray-600 transition-colors px-2 py-1 rounded-lg"
            >
              <X className="w-4 h-4" />
              <span className="hidden sm:inline">Saltar</span>
            </button>
          </div>

          <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-eltex-blue">
            Este paso es opcional. Si no lo tienes ahora, puedes saltarlo y enviar el resto.
          </div>

          <div className="relative">
            <div className="flex items-center justify-between">
              {STEPS.map((step, index) => {
                const active = index === stepIndex;
                const done = index < stepIndex;
                return (
                  <div key={step.key} className="flex-1 flex flex-col items-center gap-1.5">
                    <div className="relative flex items-center justify-center w-full">
                      {index > 0 && (
                        <div className={`absolute right-1/2 top-1/2 -translate-y-1/2 h-0.5 w-full ${done || active ? 'bg-eltex-blue' : 'bg-gray-200'}`} />
                      )}
                      <div className={`relative z-10 flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold transition-all ${
                        active ? 'bg-eltex-blue text-white ring-4 ring-eltex-blue/20 scale-110' :
                        done ? 'bg-emerald-500 text-white' :
                        'bg-gray-100 text-gray-400'
                      }`}>
                        {done ? <CheckCircle className="w-4 h-4" /> : index + 1}
                      </div>
                    </div>
                    <span className={`text-xs font-semibold text-center leading-tight ${active ? 'text-eltex-blue' : done ? 'text-emerald-600' : 'text-gray-400'}`}>
                      {step.title}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {errors.finalRender && (
            <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {errors.finalRender}
            </div>
          )}

          {currentStep.key === 'housing' && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Field
                    label="Referencia Catastral de la Vivienda"
                    value={data.housing.cadastralReference}
                    onChange={(value) => mutate((prev) => ({ ...prev, housing: { ...prev.housing, cadastralReference: value } }))}
                    placeholder="Número de referencia catastral"
                    error={errors.housingCadastralReference}
                  />
                </div>
                <Field
                  label="Tamaño (m²)"
                  value={data.housing.habitableAreaM2}
                  onChange={(value) => mutate((prev) => ({ ...prev, housing: { ...prev.housing, habitableAreaM2: value } }))}
                  placeholder="120"
                  error={errors.housingHabitableAreaM2}
                  type="number"
                />
                <Field
                  label="Nº Plantas"
                  value={data.housing.floorCount}
                  onChange={(value) => mutate((prev) => ({ ...prev, housing: { ...prev.housing, floorCount: value } }))}
                  placeholder="2"
                  error={errors.housingFloorCount}
                  type="number"
                />
                <div className="col-span-2 sm:col-span-1">
                  <Field
                    label="Nº Dormitorios"
                    value={data.housing.bedroomCount}
                    onChange={(value) => mutate((prev) => ({ ...prev, housing: { ...prev.housing, bedroomCount: value } }))}
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
                onChange={(value) => mutate((prev) => ({ ...prev, housing: { ...prev.housing, averageFloorHeight: value as EnergyCertificateData['housing']['averageFloorHeight'] } }))}
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
                        label={direction === 'north' ? 'Norte' : direction === 'east' ? 'Este' : direction === 'south' ? 'Sur' : 'Oeste'}
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

              <SegmentedOptions
                label="Tipo de vidrio de las ventanas"
                options={GLASS_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
                value={data.housing.windowGlassType}
                onChange={(value) => mutate((prev) => ({ ...prev, housing: { ...prev.housing, windowGlassType: value as EnergyCertificateData['housing']['windowGlassType'] } }))}
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
                    mutate((prev) => ({ ...prev, housing: { ...prev.housing, shutterWindowCount: clamped } }));
                  }}
                  placeholder="0"
                  error={errors.housingShutterWindowCount}
                  type="number"
                />
              )}
            </div>
          )}

          {currentStep.key === 'thermal' && (
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
                        onClick={() => mutate((prev) => ({ ...prev, thermal: { ...prev.thermal, thermalInstallationType: option.value as EnergyCertificateData['thermal']['thermalInstallationType'] } }))}
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
                    onChange={(value) => mutate((prev) => ({ ...prev, thermal: { ...prev.thermal, airConditioningDetails: value } }))}
                    placeholder="Marca y año"
                    error={errors.thermalAirConditioningDetails}
                  />
                  <SegmentedOptions
                    label="¿Tipo de Bomba?"
                    options={AIR_TYPE_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
                    value={data.thermal.airConditioningType}
                    onChange={(value) => mutate((prev) => ({ ...prev, thermal: { ...prev.thermal, airConditioningType: value as EnergyCertificateData['thermal']['airConditioningType'] } }))}
                    error={errors.thermalAirConditioningType}
                  />
                </>
              )}

              <SegmentedOptions
                label="Tipo de Calefacción"
                options={HEATING_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
                value={data.thermal.heatingEmitterType}
                onChange={(value) => {
                  const val = value as EnergyCertificateData['thermal']['heatingEmitterType'];
                  mutate((prev) => ({
                    ...prev,
                    thermal: {
                      ...prev.thermal,
                      heatingEmitterType: val,
                      radiatorMaterial: (val === 'radiadores-agua' || val === 'radiadores-electricos')
                        ? (prev.thermal.radiatorMaterial === 'no-aplica' ? null : prev.thermal.radiatorMaterial)
                        : 'no-aplica',
                    },
                  }));
                }}
                error={errors.thermalHeatingEmitterType}
                columns={3}
              />
              {(data.thermal.heatingEmitterType === 'radiadores-agua' || data.thermal.heatingEmitterType === 'radiadores-electricos') && (
                <SegmentedOptions
                  label="Material Radiadores"
                  options={RADIATOR_MATERIAL_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
                  value={data.thermal.radiatorMaterial === 'no-aplica' ? null : data.thermal.radiatorMaterial}
                  onChange={(value) => mutate((prev) => ({ ...prev, thermal: { ...prev.thermal, radiatorMaterial: value as EnergyCertificateData['thermal']['radiatorMaterial'] } }))}
                  error={errors.thermalRadiatorMaterial}
                  columns={3}
                />
              )}

              <Field
                label="Código CUPS (de la factura)"
                value={data.thermal.cups || ''}
                onChange={(value) => mutate((prev) => ({ ...prev, thermal: { ...prev.thermal, cups: value.toUpperCase() } }))}
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
                      tipoFaseConfirmed: true, // Manually selecting always confirms
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
                        onClick={() => mutate((prev) => ({ ...prev, thermal: { ...prev.thermal, tipoFaseConfirmed: true } }))}
                        className="mt-1.5 px-3 py-1 bg-amber-200 hover:bg-amber-300 text-amber-900 text-[10px] font-bold rounded-lg transition-colors"
                      >
                        Confirmar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {currentStep.key === 'additional' && (
            <div className="space-y-5">
              {/* Sold product multi-select */}
              {(() => {
                const sp = parseSoldProduct(data.additional.soldProduct as SoldProductString | null);
                const toggle = (field: 'hasSolar' | 'hasAerothermal' | 'isAmpliacion') => {
                  const next = { ...sp, [field]: !sp[field] };
                  if (field === 'isAmpliacion' && next.isAmpliacion) next.hasSolar = false;
                  if (field === 'hasSolar' && next.hasSolar) next.isAmpliacion = false;
                  mutate((prev) => ({
                    ...prev,
                    additional: { ...prev.additional, soldProduct: deriveSoldProduct(next.hasSolar, next.hasAerothermal, next.isAmpliacion) },
                  }));
                };
                const options: { field: 'hasSolar' | 'hasAerothermal' | 'isAmpliacion'; label: string; sublabel: string }[] = [
                  { field: 'hasSolar', label: 'Paneles Solares', sublabel: 'Instalación fotovoltaica' },
                  { field: 'hasAerothermal', label: 'Aerotermia', sublabel: 'Bomba de calor' },
                  { field: 'isAmpliacion', label: 'Ampliación', sublabel: 'Ampliación existente' },
                ];
                return (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-gray-800">¿Qué producto/s se está vendiendo? <span className="text-red-500">*</span></p>
                    <p className="text-xs text-gray-400">Puedes seleccionar más de uno.</p>
                    <div className="space-y-2">
                      {options.map(({ field, label, sublabel }) => {
                        const checked = sp[field];
                        return (
                          <button
                            key={field}
                            type="button"
                            onClick={() => toggle(field)}
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
                    {errors.additionalSoldProduct && <p data-ec-field-error className="text-sm text-red-500">{errors.additionalSoldProduct}</p>}
                  </div>
                );
              })()}

              <div className="grid grid-cols-2 gap-3">
                <YesNoField
                  label="¿Cliente de Eltex?"
                  value={data.additional.isExistingCustomer}
                  onChange={(value) => mutate((prev) => ({ ...prev, additional: { ...prev.additional, isExistingCustomer: value } }))}
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
                  onChange={(value) => mutate((prev) => ({ ...prev, additional: { ...prev.additional, solarPanelDetails: value } }))}
                  placeholder="Número de placas, potencia y fecha de instalación"
                  error={errors.additionalSolarPanelDetails}
                />
              )}
            </div>
          )}

          {currentStep.key === 'final' && (
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
          )}
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-20 bg-white border-t border-gray-100 px-4 py-3 safe-area-bottom sm:static sm:border-0 sm:bg-transparent sm:px-5 sm:py-4">
        <div className="max-w-2xl mx-auto flex gap-3">
          <button
            type="button"
            data-testid="energy-cert-back-btn"
            onClick={goBack}
            className="shrink-0 inline-flex items-center justify-center gap-2 px-4 py-3.5 bg-white border border-gray-200 text-gray-700 font-semibold rounded-xl transition-all hover:bg-gray-50 active:scale-[0.97]"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">{stepIndex === 0 ? 'Volver' : 'Anterior'}</span>
          </button>

          <div className="flex-1">
            {currentStep.key !== 'final' ? (
              <button
                type="button"
                data-testid="energy-cert-next-btn"
                onClick={goNext}
                className="btn-primary inline-flex w-full items-center justify-center gap-2 px-6 py-3.5"
              >
                Siguiente
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                data-testid="energy-cert-confirm-btn"
                onClick={() => void completeSurvey()}
                disabled={completing || renderingPreview}
                className="btn-primary inline-flex w-full items-center justify-center gap-2 px-6 py-3.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {completing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                Confirmar certificado
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
