import { useCallback, useState } from 'react';
import { ArrowRight, ArrowLeft, CheckCircle, AlertTriangle, RotateCcw, Loader2, Camera, Plus, X, Zap } from 'lucide-react';
import type {
  IBIData,
  ElectricityBillData,
  DNIData,
  UploadedPhoto,
  AIExtraction,
  DocSlot,
  FormErrors,
  DocumentSlotKey,
  DocumentProcessingState,
} from '@/types';
import { validatePhoto, createUploadedPhoto, fileToPreview, fileToBase64 } from '@/lib/photoValidation';
import { extractDocument } from '@/services/api';

interface Props {
  dni: DNIData;
  ibi: IBIData;
  electricityBill: ElectricityBillData;
  errors: FormErrors;
  documentProcessing: Record<DocumentSlotKey, DocumentProcessingState>;
  electricityProcessing: DocumentProcessingState[];
  hasBlockingDocumentProcessing: boolean;
  customerPhone?: string;
  onDNIFrontPhotoChange: (photo: UploadedPhoto | null) => void;
  onDNIFrontExtractionChange: (extraction: AIExtraction | null) => void;
  onDNIBackPhotoChange: (photo: UploadedPhoto | null) => void;
  onDNIBackExtractionChange: (extraction: AIExtraction | null) => void;
  onIBIPhotoChange: (photo: UploadedPhoto | null) => void;
  onIBIExtractionChange: (extraction: AIExtraction | null) => void;
  onAddElectricityPage: (photo: UploadedPhoto, extraction: AIExtraction) => void;
  onRemoveElectricityPage: (index: number) => void;
  onElectricityPageProcessingChange: (index: number, state: DocumentProcessingState) => void;
  onDocumentProcessingChange: (slot: DocumentSlotKey, state: DocumentProcessingState) => void;
  onBack: () => void;
  onContinue: () => void;
}

interface DocCardProps {
  title: string;
  hint: string;
  data: DocSlot;
  slotKey: DocumentSlotKey;
  processing: DocumentProcessingState;
  onPhotoChange: (p: UploadedPhoto | null) => void;
  onExtractionChange: (e: AIExtraction | null) => void;
  onProcessingChange: (slot: DocumentSlotKey, state: DocumentProcessingState) => void;
}

const FIELDS: Record<DocumentSlotKey, Array<{ key: string; label: string }>> = {
  dniFront: [
    { key: 'fullName', label: 'Nombre' },
    { key: 'dniNumber', label: 'DNI / NIE' },
    { key: 'dateOfBirth', label: 'Nacimiento' },
    { key: 'expiryDate', label: 'Válido hasta' },
    { key: 'sex', label: 'Sexo' },
    { key: 'nationality', label: 'Nacionalidad' },
  ],
  dniBack: [
    { key: 'address', label: 'Domicilio' },
    { key: 'municipality', label: 'Municipio' },
    { key: 'province', label: 'Provincia' },
    { key: 'placeOfBirth', label: 'Lugar nacimiento' },
  ],
  ibi: [
    { key: 'referenciaCatastral', label: 'Ref. Catastral' },
    { key: 'titular', label: 'Titular' },
    { key: 'titularNif', label: 'NIF titular' },
    { key: 'direccion', label: 'Dirección' },
    { key: 'codigoPostal', label: 'Código postal' },
    { key: 'municipio', label: 'Municipio' },
    { key: 'provincia', label: 'Provincia' },
    { key: 'ejercicio', label: 'Ejercicio' },
    { key: 'importe', label: 'Importe' },
  ],
};

const ELECTRICITY_FIELDS = [
  { key: 'titular', label: 'Titular' },
  { key: 'nifTitular', label: 'NIF titular' },
  { key: 'cups', label: 'CUPS' },
  { key: 'potenciaContratada', label: 'Potencia (kW)' },
  { key: 'tipoFase', label: 'Instalación' },
  { key: 'tarifaAcceso', label: 'Tarifa' },
  { key: 'direccionSuministro', label: 'Dirección' },
  { key: 'municipio', label: 'Municipio' },
  { key: 'provincia', label: 'Provincia' },
  { key: 'codigoPostal', label: 'C. Postal' },
  { key: 'fechaFactura', label: 'Fecha factura' },
  { key: 'periodoFacturacion', label: 'Periodo' },
  { key: 'importe', label: 'Importe' },
];

function uploadTarget(hint: string, onFile: (file: File) => void) {
  return (
    <label className="flex flex-col items-center justify-center gap-2 py-6 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer hover:border-eltex-blue hover:bg-blue-50/30 transition-colors">
      <input
        type="file"
        accept="image/jpeg,image/png"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFile(file);
          event.target.value = '';
        }}
      />
      <Camera className="w-7 h-7 text-gray-300" />
      <span className="text-sm font-medium text-gray-500">Toca para añadir foto</span>
      <span className="text-xs text-gray-400 text-center px-4">{hint}</span>
    </label>
  );
}

function processFromPicker(onFile: (file: File) => void) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/jpeg,image/png';
  input.onchange = () => {
    const file = input.files?.[0];
    if (file) onFile(file);
  };
  input.click();
}

function DocCard({ title, hint, data, slotKey, processing, onPhotoChange, onExtractionChange, onProcessingChange }: DocCardProps) {
  const process = useCallback(async (file: File) => {
    const hadAcceptedDocument = !!data.photo;
    onProcessingChange(slotKey, { status: 'validating', pendingPreview: null });

    const check = await validatePhoto(file);
    if (!check.valid) {
      onProcessingChange(slotKey, {
        status: hadAcceptedDocument ? 'accepted' : 'rejected',
        errorCode: 'validation',
        errorMessage: check.error || 'Imagen no válida.',
        pendingPreview: null,
      });
      return;
    }

    const preview = await fileToPreview(file);
    onProcessingChange(slotKey, {
      status: 'extracting',
      errorCode: undefined,
      errorMessage: undefined,
      pendingPreview: preview,
    });

    try {
      const base64 = await fileToBase64(file);
      const res = await extractDocument(base64, slotKey);

      if (!res.success || !res.extraction) {
        onProcessingChange(slotKey, {
          status: hadAcceptedDocument ? 'accepted' : 'rejected',
          errorCode: res.reason || (res.isUnreadable ? 'unreadable' : res.isWrongDocument ? 'wrong-document' : 'temporary-error'),
          errorMessage: res.message || 'No se pudo procesar el documento.',
          pendingPreview: hadAcceptedDocument ? null : preview,
        });
        return;
      }

      onPhotoChange(createUploadedPhoto(file, preview, check.width, check.height));
      onExtractionChange({
        ...res.extraction,
        needsManualReview: res.needsManualReview ?? res.extraction.needsManualReview ?? false,
        confirmedByUser: true,
      });
      onProcessingChange(slotKey, { status: 'accepted', pendingPreview: null });
    } catch (err) {
      console.error('extractDocument error:', err);
      onProcessingChange(slotKey, {
        status: hadAcceptedDocument ? 'accepted' : 'rejected',
        errorCode: 'temporary-error',
        errorMessage: 'Error de conexión. Comprueba tu conexión a internet y vuelve a intentarlo.',
        pendingPreview: hadAcceptedDocument ? null : preview,
      });
    }
  }, [data.photo, onExtractionChange, onPhotoChange, onProcessingChange, slotKey]);

  const reset = useCallback(() => {
    onPhotoChange(null);
    onExtractionChange(null);
    onProcessingChange(slotKey, { status: 'idle', pendingPreview: null });
  }, [onExtractionChange, onPhotoChange, onProcessingChange, slotKey]);

  const fields = FIELDS[slotKey];
  const extractedData = data.extraction?.extractedData || {};
  const accepted = !!data.photo;
  const isBusy = processing.status === 'validating' || processing.status === 'extracting';
  const showError = !!processing.errorMessage && (!isBusy || accepted);

  return (
    <div className={`rounded-2xl border-2 transition-colors ${accepted ? 'border-green-200 bg-green-50/30' : 'border-gray-100 bg-white'} p-5 space-y-4`}>
      <div className="flex items-center justify-between">
        <p className={`font-semibold ${accepted ? 'text-gray-500' : 'text-gray-900'}`}>{title}</p>
        {accepted && <CheckCircle className="w-5 h-5 text-green-500" />}
      </div>

      {!accepted && !isBusy && uploadTarget(hint, process)}

      {isBusy && (
        <div className="space-y-3">
          {processing.pendingPreview && (
            <img src={processing.pendingPreview} alt={`${title} en proceso`} className="w-full h-28 object-cover rounded-xl opacity-80" />
          )}
          <div className="flex items-center gap-3 py-1">
            <Loader2 className="w-5 h-5 text-eltex-blue animate-spin shrink-0" />
            <p className="text-sm text-gray-500">
              {processing.status === 'validating' ? 'Verificando calidad...' : 'Extrayendo datos...'}
            </p>
          </div>
        </div>
      )}

      {showError && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3">
          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{processing.errorMessage}</p>
        </div>
      )}

      {accepted && (
        <div className="space-y-3">
          {data.photo?.preview && (
            <img src={data.photo.preview} alt={title} className="w-full h-28 object-cover rounded-xl opacity-80" />
          )}
          <div className="space-y-1.5">
            {fields.map(({ key, label }) => {
              const value = data.extraction?.manualCorrections?.[key] ?? extractedData[key];
              if (!value) return null;

              return (
                <div key={key} className="flex gap-2 text-sm">
                  <span className="text-gray-400 shrink-0 w-28">{label}</span>
                  <span className="font-medium text-gray-700">{String(value)}</span>
                </div>
              );
            })}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => processFromPicker(process)}
              className="flex-1 flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 bg-gray-100 hover:bg-gray-200 rounded-lg px-3 py-2 transition-colors justify-center"
            >
              <Camera className="w-3.5 h-3.5" /> Sustituir foto
            </button>
            <button
              type="button"
              onClick={reset}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 bg-gray-100 hover:bg-gray-200 rounded-lg px-3 py-2 transition-colors justify-center"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Quitar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface ElectricityCardProps {
  pages: ElectricityBillData['pages'];
  processing: DocumentProcessingState[];
  onAddPage: (photo: UploadedPhoto, extraction: AIExtraction) => void;
  onRemovePage: (index: number) => void;
  onPageProcessingChange: (index: number, state: DocumentProcessingState) => void;
}

function ElectricityCard({ pages, processing, onAddPage, onRemovePage, onPageProcessingChange }: ElectricityCardProps) {
  const [pendingState, setPendingState] = useState<DocumentProcessingState>({ status: 'idle', pendingPreview: null });
  const [pendingError, setPendingError] = useState<string | null>(null);

  const processNewPage = useCallback(async (file: File) => {
    setPendingError(null);
    setPendingState({ status: 'validating', pendingPreview: null });

    const check = await validatePhoto(file);
    if (!check.valid) {
      setPendingState({ status: 'rejected', errorCode: 'validation', errorMessage: check.error || 'Imagen no válida.', pendingPreview: null });
      setPendingError(check.error || 'Imagen no válida.');
      return;
    }

    const preview = await fileToPreview(file);
    setPendingState({ status: 'extracting', pendingPreview: preview });

    try {
      const base64 = await fileToBase64(file);
      const res = await extractDocument(base64, 'electricity');

      if (!res.success || !res.extraction) {
        const msg = res.message || 'No se pudo procesar el documento.';
        setPendingState({ status: 'rejected', errorCode: 'temporary-error', errorMessage: msg, pendingPreview: preview });
        setPendingError(msg);
        return;
      }

      const photo = createUploadedPhoto(file, preview, check.width, check.height);
      const extraction: AIExtraction = {
        ...res.extraction,
        needsManualReview: res.needsManualReview ?? res.extraction.needsManualReview ?? false,
        confirmedByUser: true,
      };
      onAddPage(photo, extraction);
      setPendingState({ status: 'idle', pendingPreview: null });
      setPendingError(null);
    } catch (err) {
      console.error('extractDocument error:', err);
      const msg = 'Error de conexión. Comprueba tu conexión a internet y vuelve a intentarlo.';
      setPendingState({ status: 'rejected', errorCode: 'temporary-error', errorMessage: msg, pendingPreview: preview });
      setPendingError(msg);
    }
  }, [onAddPage]);

  const isBusy = pendingState.status === 'validating' || pendingState.status === 'extracting';
  const hasPages = pages.length > 0;

  return (
    <div className="rounded-2xl border-2 border-eltex-blue/20 bg-blue-50/20 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Zap className="w-5 h-5 text-eltex-blue" />
        <p className="font-semibold text-gray-900">Factura de luz</p>
        {hasPages && (
          <span className="ml-auto bg-green-100 text-green-700 text-xs font-bold px-2 py-0.5 rounded-full">
            {pages.length} {pages.length === 1 ? 'imagen' : 'imágenes'}
          </span>
        )}
      </div>

      <p className="text-xs text-gray-500">
        Sube todas las páginas de tu factura de luz — puedes añadir tantas imágenes como necesites.
      </p>

      {/* Uploaded pages grid */}
      {hasPages && (
        <div className="grid grid-cols-2 gap-3">
          {pages.map((page, index) => {
            const pageData = page.extraction?.extractedData || {};
            const keyFields = ELECTRICITY_FIELDS.filter(f => pageData[f.key]);
            return (
              <div key={index} className="rounded-xl border border-green-200 bg-white overflow-hidden">
                {page.photo?.preview && (
                  <div className="relative">
                    <img
                      src={page.photo.preview}
                      alt={`Página ${index + 1}`}
                      className="w-full h-24 object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => onRemovePage(index)}
                      className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center transition-colors"
                      title="Quitar imagen"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                    <span className="absolute bottom-1.5 left-1.5 bg-black/50 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md">
                      Pág. {index + 1}
                    </span>
                  </div>
                )}
                {keyFields.length > 0 && (
                  <div className="px-2 py-2 space-y-0.5">
                    {keyFields.slice(0, 4).map(({ key, label }) => (
                      <div key={key} className="flex gap-1 text-[10px]">
                        <span className="text-gray-400 shrink-0">{label}:</span>
                        <span className="font-medium text-gray-700 truncate">{String(pageData[key])}</span>
                      </div>
                    ))}
                    {keyFields.length > 4 && (
                      <p className="text-[10px] text-gray-400">+{keyFields.length - 4} más</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pending upload state */}
      {isBusy && (
        <div className="rounded-xl border border-dashed border-eltex-blue/30 bg-white p-4 space-y-3">
          {pendingState.pendingPreview && (
            <img src={pendingState.pendingPreview} alt="Procesando" className="w-full h-24 object-cover rounded-lg opacity-70" />
          )}
          <div className="flex items-center gap-3">
            <Loader2 className="w-5 h-5 text-eltex-blue animate-spin shrink-0" />
            <p className="text-sm text-gray-500">
              {pendingState.status === 'validating' ? 'Verificando calidad...' : 'Extrayendo datos...'}
            </p>
          </div>
        </div>
      )}

      {/* Error state */}
      {pendingError && !isBusy && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3">
          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{pendingError}</p>
        </div>
      )}

      {/* Add page button */}
      {!isBusy && (
        <label className={`flex items-center justify-center gap-2 py-4 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
          hasPages
            ? 'border-eltex-blue/40 hover:border-eltex-blue hover:bg-blue-50/40 text-eltex-blue'
            : 'border-gray-200 hover:border-eltex-blue hover:bg-blue-50/30 text-gray-500'
        }`}>
          <input
            type="file"
            accept="image/jpeg,image/png"
            multiple
            className="hidden"
            onChange={async (event) => {
              const files = Array.from(event.target.files || []);
              event.target.value = '';
              for (const file of files) {
                await processNewPage(file);
              }
            }}
          />
          <Plus className="w-5 h-5" />
          <span className="text-sm font-medium">
            {hasPages ? 'Añadir más páginas' : 'Añadir imágenes'}
          </span>
        </label>
      )}
    </div>
  );
}

export function PropertyDocsSection({
  dni,
  ibi,
  electricityBill,
  errors,
  documentProcessing,
  electricityProcessing,
  hasBlockingDocumentProcessing,
  onDNIFrontPhotoChange,
  onDNIFrontExtractionChange,
  onDNIBackPhotoChange,
  onDNIBackExtractionChange,
  onIBIPhotoChange,
  onIBIExtractionChange,
  onAddElectricityPage,
  onRemoveElectricityPage,
  onElectricityPageProcessingChange,
  onDocumentProcessingChange,
  onBack,
  onContinue,
}: Props) {
  return (
    <div className="min-h-screen bg-white p-5 pb-28">
      <div className="max-w-sm mx-auto space-y-5">
        <div className="pt-2 pb-2">
          <h1 className="text-2xl font-bold text-gray-900">Documentos</h1>
          <p className="text-gray-400 text-sm mt-1">
            Sube cada documento con buena luz. Solo se guarda cuando la verificación y la extracción terminan correctamente.
          </p>
        </div>

        <DocCard
          title="DNI — cara frontal"
          hint="La cara con tu foto y número de DNI. Texto perfectamente legible."
          data={dni.front}
          slotKey="dniFront"
          processing={documentProcessing.dniFront}
          onPhotoChange={onDNIFrontPhotoChange}
          onExtractionChange={onDNIFrontExtractionChange}
          onProcessingChange={onDocumentProcessingChange}
        />
        <DocCard
          title="DNI — cara trasera"
          hint="La cara con tu dirección de domicilio."
          data={dni.back}
          slotKey="dniBack"
          processing={documentProcessing.dniBack}
          onPhotoChange={onDNIBackPhotoChange}
          onExtractionChange={onDNIBackExtractionChange}
          onProcessingChange={onDocumentProcessingChange}
        />
        <DocCard
          title="IBI o escritura"
          hint="Recibo del Impuesto de Bienes Inmuebles. La Referencia Catastral debe ser legible."
          data={{ photo: ibi.photo, extraction: ibi.extraction }}
          slotKey="ibi"
          processing={documentProcessing.ibi}
          onPhotoChange={onIBIPhotoChange}
          onExtractionChange={onIBIExtractionChange}
          onProcessingChange={onDocumentProcessingChange}
        />

        <ElectricityCard
          pages={electricityBill.pages}
          processing={electricityProcessing}
          onAddPage={onAddElectricityPage}
          onRemovePage={onRemoveElectricityPage}
          onPageProcessingChange={onElectricityPageProcessingChange}
        />

        <p className="text-xs text-gray-400 text-center pt-1">
          Puedes continuar sin tenerlos todos, pero no mientras haya una verificación o extracción en curso.
        </p>

        {errors['propertyDocs.blocking'] && (
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-700">{errors['propertyDocs.blocking']}</p>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onBack} className="btn-secondary flex items-center gap-1.5 px-5">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onContinue}
            disabled={hasBlockingDocumentProcessing}
            className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Continuar <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
