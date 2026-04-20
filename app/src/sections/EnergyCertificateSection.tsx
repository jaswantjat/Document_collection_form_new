import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle, Loader2, X } from 'lucide-react';
import { createRenderedEnergyCertificateAsset, renderEnergyCertificateOverlay } from '@/lib/energyCertificateDocument';
import type { EnergyCertificateData, FormData, ProjectData } from '@/types';
import {
  validateEcStep as validateStep,
  isEnergyCertificateReadyToComplete,
  EC_DATA_STEPS as DATA_STEPS,
} from '@/lib/energyCertificateValidation';
import {
  AdditionalStepPanel,
  FinalStepPanel,
  HousingStepPanel,
  ThermalStepPanel,
} from '@/sections/energy-certificate/StepPanels';

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
  {
    key: 'housing',
    title: 'Vivienda',
    description: 'La referencia catastral es opcional. Los demás datos son obligatorios.',
  },
  {
    key: 'thermal',
    title: 'Instalación',
    description: 'Añade la información disponible del equipo y climatización.',
  },
  {
    key: 'additional',
    title: 'Equipamiento',
    description: 'Producto vendido e instalación fotovoltaica, si aplica.',
  },
  {
    key: 'final',
    title: 'Confirmación',
    description: 'Revisa el certificado energético antes de guardarlo.',
  },
];

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

function getDefaultSoldProduct(
  productType: ProjectData['productType']
): EnergyCertificateData['additional']['soldProduct'] {
  if (productType === 'solar') return 'solo-paneles';
  if (productType === 'aerothermal') return 'solo-aerotermia';
  if (productType === 'solar-aerothermal') return 'paneles-y-aerotermia';
  return null;
}

function buildAutofillState(
  data: EnergyCertificateData,
  formData: FormData,
  productType: ProjectData['productType']
) {
  const ibiManualCadastral = formData.ibi.extraction?.manualCorrections?.referenciaCatastral;
  const ibiExtractedCadastral =
    formData.ibi.extraction?.extractedData?.referenciaCatastral as string | null | undefined;
  const firstElectricityExtraction = formData.electricityBill.pages?.[0]?.extraction;
  const firstElectricityCups = firstElectricityExtraction?.extractedData?.cups as string | undefined;
  const firstElectricityTipoFase =
    firstElectricityExtraction?.extractedData?.tipoFase as EnergyCertificateData['thermal']['tipoFase'] | undefined;
  const ibiCatastral = ibiManualCadastral ?? ibiExtractedCadastral;
  const defaultProduct = getDefaultSoldProduct(productType);

  const needsCatastral = !!(ibiCatastral && !data.housing.cadastralReference);
  const needsSoldProduct = !!(defaultProduct && !data.additional.soldProduct);
  const needsCups = !!(firstElectricityCups && !data.thermal.cups);
  const needsTipoFase = !!(firstElectricityTipoFase && !data.thermal.tipoFase);

  if (!needsCatastral && !needsSoldProduct && !needsCups && !needsTipoFase) {
    return null;
  }

  return {
    ...data,
    status: data.status === 'not-started' ? 'in-progress' : data.status,
    housing: needsCatastral
      ? { ...data.housing, cadastralReference: ibiCatastral! }
      : data.housing,
    additional: needsSoldProduct
      ? { ...data.additional, soldProduct: defaultProduct }
      : data.additional,
    thermal: {
      ...data.thermal,
      cups: needsCups ? firstElectricityCups : data.thermal.cups,
      tipoFase: needsTipoFase ? firstElectricityTipoFase : data.thermal.tipoFase,
      tipoFaseConfirmed: needsTipoFase ? false : data.thermal.tipoFaseConfirmed,
    },
  };
}

function StepProgress({
  stepIndex,
}: {
  stepIndex: number;
}) {
  return (
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
                  active ? 'bg-eltex-blue text-white ring-4 ring-eltex-blue/20 scale-110'
                  : done ? 'bg-emerald-500 text-white'
                  : 'bg-gray-100 text-gray-400'
                }`}>
                  {done ? <CheckCircle className="w-4 h-4" /> : index + 1}
                </div>
              </div>
              <span className={`text-xs font-semibold text-center leading-tight ${
                active ? 'text-eltex-blue'
                : done ? 'text-emerald-600'
                : 'text-gray-400'
              }`}>
                {step.title}
              </span>
            </div>
          );
        })}
      </div>
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

  const currentStep = STEPS[stepIndex];
  const previewSource = useMemo(
    () => ({ ...project, formData: { ...formData, energyCertificate: data } }),
    [data, formData, project]
  );

  const scrollToFirstError = useCallback(() => {
    requestAnimationFrame(() => {
      const element = document.querySelector<HTMLElement>('[data-ec-field-error]');
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  }, []);

  const navigateToStep = useCallback((newIndex: number, currentData: EnergyCertificateData) => {
    setStepIndex(newIndex);
    onChange({ ...currentData, currentStepIndex: newIndex });
  }, [onChange]);

  const mutate = useCallback((updater: (prev: EnergyCertificateData) => EnergyCertificateData) => {
    const next = updater(data);
    onChange(createInProgressState(next));
  }, [data, onChange]);

  const updateOrientationValue = useCallback((
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
  }, [mutate]);

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
    const autofillState = buildAutofillState(data, formData, project.productType);
    if (autofillState) {
      onChange(autofillState);
    }
  }, [data, formData, onChange, project.productType]);

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

      onChange({ ...completedDraft, renderedDocument });
      onContinue();
    } catch (error) {
      console.error('Energy certificate completion failed:', error);
      setErrors({
        finalRender: 'No se pudo generar el certificado energético. Inténtalo de nuevo.',
      });
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

          <StepProgress stepIndex={stepIndex} />

          {errors.finalRender && (
            <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {errors.finalRender}
            </div>
          )}

          {currentStep.key === 'housing' && (
            <HousingStepPanel
              data={data}
              errors={errors}
              mutate={mutate}
              updateOrientationValue={updateOrientationValue}
            />
          )}
          {currentStep.key === 'thermal' && (
            <ThermalStepPanel data={data} errors={errors} mutate={mutate} />
          )}
          {currentStep.key === 'additional' && (
            <AdditionalStepPanel data={data} errors={errors} mutate={mutate} />
          )}
          {currentStep.key === 'final' && (
            <FinalStepPanel previewUrl={previewUrl} renderingPreview={renderingPreview} />
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
