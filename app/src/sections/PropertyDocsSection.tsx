import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, ArrowLeft, CheckCircle, AlertTriangle, RotateCcw, Loader2, Camera, Plus, X, Zap, CreditCard, FileText } from 'lucide-react';
import { pdfToImageFiles } from '@/lib/pdfToImages';
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

const IBI_FIELDS = [
  { key: 'referenciaCatastral', label: 'Ref. Catastral' },
  { key: 'titular', label: 'Titular' },
  { key: 'titularNif', label: 'NIF titular' },
  { key: 'direccion', label: 'Dirección' },
  { key: 'codigoPostal', label: 'Código postal' },
  { key: 'municipio', label: 'Municipio' },
  { key: 'provincia', label: 'Provincia' },
  { key: 'ejercicio', label: 'Ejercicio' },
  { key: 'importe', label: 'Importe' },
];

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

interface PendingItem {
  id: string;
  preview: string | null;
  status: 'validating' | 'extracting' | 'failed';
  error?: string;
}

function genId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ── IBI DocCard ────────────────────────────────────────────────────────────────
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
      const res = await extractDocument(base64, slotKey as 'ibi');

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

      {!accepted && !isBusy && (
        <label className="flex flex-col items-center justify-center gap-2 py-6 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer hover:border-eltex-blue hover:bg-blue-50/30 transition-colors">
          <input type="file" accept="image/jpeg,image/png" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) process(f); e.target.value = ''; }} />
          <Camera className="w-7 h-7 text-gray-300" />
          <span className="text-sm font-medium text-gray-500">Toca para añadir foto</span>
          <span className="text-xs text-gray-400 text-center px-4">{hint}</span>
        </label>
      )}

      {isBusy && (
        <div className="space-y-3">
          {processing.pendingPreview && <img src={processing.pendingPreview} alt={`${title} en proceso`} className="w-full h-28 object-cover rounded-xl opacity-80" />}
          <div className="flex items-center gap-3 py-1">
            <Loader2 className="w-5 h-5 text-eltex-blue animate-spin shrink-0" />
            <p className="text-sm text-gray-500">{processing.status === 'validating' ? 'Verificando calidad...' : 'Extrayendo datos...'}</p>
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
          {data.photo?.preview && <img src={data.photo.preview} alt={title} className="w-full h-28 object-cover rounded-xl opacity-80" />}
          <div className="space-y-1.5">
            {IBI_FIELDS.map(({ key, label }) => {
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
            <label className="flex-1 flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 bg-gray-100 hover:bg-gray-200 rounded-lg px-3 py-2 transition-colors justify-center cursor-pointer">
              <input type="file" accept="image/jpeg,image/png" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) process(f); e.target.value = ''; }} />
              <Camera className="w-3.5 h-3.5" /> Sustituir foto
            </label>
            <button type="button" onClick={reset} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 bg-gray-100 hover:bg-gray-200 rounded-lg px-3 py-2 transition-colors justify-center">
              <RotateCcw className="w-3.5 h-3.5" /> Quitar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── DNI Combined Card ──────────────────────────────────────────────────────────
interface DNICardProps {
  front: DocSlot;
  back: DocSlot;
  onFrontPhotoChange: (p: UploadedPhoto | null) => void;
  onFrontExtractionChange: (e: AIExtraction | null) => void;
  onBackPhotoChange: (p: UploadedPhoto | null) => void;
  onBackExtractionChange: (e: AIExtraction | null) => void;
  onBusyChange: (busy: boolean) => void;
}

function DNICard({ front, back, onFrontPhotoChange, onFrontExtractionChange, onBackPhotoChange, onBackExtractionChange, onBusyChange }: DNICardProps) {
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);

  const hasFront = !!front.photo;
  const hasBack = !!back.photo;
  const hasAny = hasFront || hasBack;
  const isBusy = pendingItems.some(p => p.status !== 'failed');

  useEffect(() => { onBusyChange(isBusy); }, [isBusy, onBusyChange]);

  const processFiles = useCallback(async (files: File[]) => {
    const newItems: PendingItem[] = files.map(() => ({ id: genId(), preview: null, status: 'validating' }));
    setPendingItems(prev => [...prev, ...newItems]);

    await Promise.all(files.map(async (file, i) => {
      const id = newItems[i].id;

      const check = await validatePhoto(file);
      if (!check.valid) {
        setPendingItems(prev => prev.map(p => p.id === id ? { ...p, status: 'failed' as const, error: check.error || 'Imagen no válida.' } : p));
        return;
      }

      const preview = await fileToPreview(file);
      setPendingItems(prev => prev.map(p => p.id === id ? { ...p, preview, status: 'extracting' } : p));

      try {
        const base64 = await fileToBase64(file);
        const res = await extractDocument(base64, 'dniAuto');

        if (!res.success || !res.extraction) {
          setPendingItems(prev => prev.map(p => p.id === id ? { ...p, status: 'failed' as const, error: res.message || 'No se pudo procesar el DNI.' } : p));
          return;
        }

        const photo = createUploadedPhoto(file, preview, check.width, check.height);
        const extraction: AIExtraction = {
          ...res.extraction,
          needsManualReview: res.needsManualReview ?? false,
          confirmedByUser: true,
        };

        if (res.side === 'back') {
          onBackPhotoChange(photo);
          onBackExtractionChange(extraction);
        } else {
          onFrontPhotoChange(photo);
          onFrontExtractionChange(extraction);
        }

        setPendingItems(prev => prev.filter(p => p.id !== id));
      } catch {
        setPendingItems(prev => prev.map(p => p.id === id ? { ...p, status: 'failed' as const, error: 'Error de conexión. Inténtalo de nuevo.' } : p));
      }
    }));
  }, [onFrontPhotoChange, onFrontExtractionChange, onBackPhotoChange, onBackExtractionChange]);

  const dismissError = (id: string) => {
    setPendingItems(prev => prev.filter(p => p.id !== id));
  };

  return (
    <div className={`rounded-2xl border-2 transition-colors ${hasAny ? 'border-green-200 bg-green-50/30' : 'border-gray-100 bg-white'} p-5 space-y-4`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-gray-400" />
          <p className={`font-semibold ${hasAny ? 'text-gray-500' : 'text-gray-900'}`}>DNI / NIE</p>
        </div>
        {hasFront && hasBack && <CheckCircle className="w-5 h-5 text-green-500" />}
        {hasAny && !(hasFront && hasBack) && (
          <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full font-medium">
            {hasFront ? 'Falta la trasera' : 'Falta la frontal'}
          </span>
        )}
      </div>

      <p className="text-xs text-gray-500">
        Sube las fotos de tu DNI — el sistema detecta automáticamente la cara frontal y trasera.
      </p>

      {/* Front + Back slots */}
      {hasAny && (
        <div className="grid grid-cols-2 gap-3">
          {/* Front */}
          <div className={`rounded-xl border overflow-hidden ${hasFront ? 'border-green-200 bg-white' : 'border-dashed border-gray-200 bg-gray-50/60'}`}>
            {hasFront && front.photo?.preview ? (
              <>
                <div className="relative">
                  <img src={front.photo.preview} alt="DNI frontal" className="w-full h-24 object-cover" />
                  <button
                    type="button"
                    onClick={() => { onFrontPhotoChange(null); onFrontExtractionChange(null); }}
                    className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                  <span className="absolute bottom-1.5 left-1.5 bg-black/50 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md">FRONTAL</span>
                </div>
                <div className="px-2 py-1.5 space-y-0.5">
                  {['fullName', 'dniNumber'].map(k => {
                    const v = front.extraction?.extractedData?.[k];
                    if (!v) return null;
                    return <p key={k} className="text-[10px] text-gray-700 font-medium truncate">{String(v)}</p>;
                  })}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center p-3 min-h-[96px]">
                <p className="text-[10px] text-gray-400 text-center">Cara frontal</p>
                <p className="text-[9px] text-gray-300 text-center mt-1">Foto + número DNI</p>
              </div>
            )}
          </div>

          {/* Back */}
          <div className={`rounded-xl border overflow-hidden ${hasBack ? 'border-green-200 bg-white' : 'border-dashed border-gray-200 bg-gray-50/60'}`}>
            {hasBack && back.photo?.preview ? (
              <>
                <div className="relative">
                  <img src={back.photo.preview} alt="DNI trasera" className="w-full h-24 object-cover" />
                  <button
                    type="button"
                    onClick={() => { onBackPhotoChange(null); onBackExtractionChange(null); }}
                    className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                  <span className="absolute bottom-1.5 left-1.5 bg-black/50 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md">TRASERA</span>
                </div>
                <div className="px-2 py-1.5 space-y-0.5">
                  {['address', 'municipality'].map(k => {
                    const v = back.extraction?.extractedData?.[k];
                    if (!v) return null;
                    return <p key={k} className="text-[10px] text-gray-700 font-medium truncate">{String(v)}</p>;
                  })}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center p-3 min-h-[96px]">
                <p className="text-[10px] text-gray-400 text-center">Cara trasera</p>
                <p className="text-[9px] text-gray-300 text-center mt-1">Dirección domicilio</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Pending items */}
      {pendingItems.map(item => (
        <div key={item.id} className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-3 space-y-2">
          {item.preview && <img src={item.preview} alt="Procesando" className="w-full h-16 object-cover rounded-lg opacity-70" />}
          {item.status === 'failed' ? (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-2">
              <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-xs text-red-700 flex-1">{item.error}</p>
              <button type="button" onClick={() => dismissError(item.id)} className="text-red-400 hover:text-red-600 shrink-0">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 text-eltex-blue animate-spin" />
              <p className="text-xs text-gray-500">{item.status === 'validating' ? 'Verificando calidad...' : 'Detectando cara y extrayendo datos...'}</p>
            </div>
          )}
        </div>
      ))}

      {/* Upload button */}
      {!isBusy && (
        <label className={`flex items-center justify-center gap-2 py-4 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
          hasAny ? 'border-gray-200 hover:border-eltex-blue hover:bg-blue-50/20 text-gray-400 hover:text-eltex-blue' : 'border-gray-200 hover:border-eltex-blue hover:bg-blue-50/30 text-gray-500'
        }`}>
          <input
            type="file"
            accept="image/jpeg,image/png"
            multiple
            className="hidden"
            onChange={e => {
              const files = Array.from(e.target.files || []);
              e.target.value = '';
              if (files.length) processFiles(files);
            }}
          />
          <Plus className="w-5 h-5" />
          <span className="text-sm font-medium">{hasAny ? 'Añadir más fotos del DNI' : 'Añadir fotos del DNI'}</span>
        </label>
      )}
    </div>
  );
}

// ── Electricity Card (parallel processing) ────────────────────────────────────
interface ElectricityCardProps {
  pages: ElectricityBillData['pages'];
  onAddPage: (photo: UploadedPhoto, extraction: AIExtraction) => void;
  onRemovePage: (index: number) => void;
  onBusyChange: (busy: boolean) => void;
}

function ElectricityCard({ pages, onAddPage, onRemovePage, onBusyChange }: ElectricityCardProps) {
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);
  const [pdfExpanding, setPdfExpanding] = useState(false);

  const isBusy = pdfExpanding || pendingItems.some(p => p.status !== 'failed');
  const hasPages = pages.length > 0;

  useEffect(() => { onBusyChange(isBusy); }, [isBusy, onBusyChange]);

  const processFiles = useCallback(async (files: File[]) => {
    const newItems: PendingItem[] = files.map(() => ({ id: genId(), preview: null, status: 'validating' }));
    setPendingItems(prev => [...prev, ...newItems]);

    await Promise.all(files.map(async (file, i) => {
      const id = newItems[i].id;

      const check = await validatePhoto(file);
      if (!check.valid) {
        setPendingItems(prev => prev.map(p => p.id === id ? { ...p, status: 'failed' as const, error: check.error || 'Imagen no válida.' } : p));
        return;
      }

      const preview = await fileToPreview(file);
      setPendingItems(prev => prev.map(p => p.id === id ? { ...p, preview, status: 'extracting' } : p));

      try {
        const base64 = await fileToBase64(file);
        const res = await extractDocument(base64, 'electricity');

        if (!res.success || !res.extraction) {
          setPendingItems(prev => prev.map(p => p.id === id ? { ...p, status: 'failed' as const, error: res.message || 'No se pudo procesar la factura.' } : p));
          return;
        }

        const photo = createUploadedPhoto(file, preview, check.width, check.height);
        const extraction: AIExtraction = {
          ...res.extraction,
          needsManualReview: res.needsManualReview ?? false,
          confirmedByUser: true,
        };
        onAddPage(photo, extraction);
        setPendingItems(prev => prev.filter(p => p.id !== id));
      } catch {
        setPendingItems(prev => prev.map(p => p.id === id ? { ...p, status: 'failed' as const, error: 'Error de conexión. Inténtalo de nuevo.' } : p));
      }
    }));
  }, [onAddPage]);

  const dismissError = (id: string) => {
    setPendingItems(prev => prev.filter(p => p.id !== id));
  };

  const handleFileSelect = useCallback(async (selectedFiles: File[]) => {
    const pdfs = selectedFiles.filter(f => f.type === 'application/pdf');
    const images = selectedFiles.filter(f => f.type !== 'application/pdf');
    const allImages: File[] = [...images];

    if (pdfs.length > 0) {
      setPdfExpanding(true);
      try {
        for (const pdf of pdfs) {
          const converted = await pdfToImageFiles(pdf);
          allImages.push(...converted);
        }
      } catch {
        // silently continue with images collected so far
      } finally {
        setPdfExpanding(false);
      }
    }

    if (allImages.length > 0) {
      await processFiles(allImages);
    }
  }, [processFiles]);

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
        Sube las páginas de tu factura de luz como imágenes o en PDF — puedes seleccionar varios archivos a la vez.
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
                    <img src={page.photo.preview} alt={`Página ${index + 1}`} className="w-full h-24 object-cover" />
                    <button
                      type="button"
                      onClick={() => onRemovePage(index)}
                      className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                    <span className="absolute bottom-1.5 left-1.5 bg-black/50 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md">Pág. {index + 1}</span>
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
                    {keyFields.length > 4 && <p className="text-[10px] text-gray-400">+{keyFields.length - 4} más</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pending items (parallel) */}
      {pendingItems.map(item => (
        <div key={item.id} className="rounded-xl border border-dashed border-eltex-blue/30 bg-white p-3 space-y-2">
          {item.preview && <img src={item.preview} alt="Procesando" className="w-full h-20 object-cover rounded-lg opacity-70" />}
          {item.status === 'failed' ? (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-2">
              <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-xs text-red-700 flex-1">{item.error}</p>
              <button type="button" onClick={() => dismissError(item.id)} className="text-red-400 hover:text-red-600 shrink-0">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <Loader2 className="w-5 h-5 text-eltex-blue animate-spin shrink-0" />
              <p className="text-sm text-gray-500">
                {item.status === 'validating' ? 'Verificando calidad...' : 'Extrayendo datos...'}
              </p>
            </div>
          )}
        </div>
      ))}

      {/* PDF expanding indicator */}
      {pdfExpanding && (
        <div className="flex items-center gap-3 py-3 px-4 bg-blue-50 border border-eltex-blue/20 rounded-xl">
          <FileText className="w-5 h-5 text-eltex-blue shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-eltex-blue">Convirtiendo PDF en páginas...</p>
            <p className="text-xs text-blue-400">Esto puede tardar unos segundos</p>
          </div>
          <Loader2 className="w-4 h-4 text-eltex-blue animate-spin shrink-0" />
        </div>
      )}

      {/* Add images/PDF button */}
      {!isBusy && (
        <label className={`flex items-center justify-center gap-2 py-4 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
          hasPages
            ? 'border-eltex-blue/40 hover:border-eltex-blue hover:bg-blue-50/40 text-eltex-blue'
            : 'border-gray-200 hover:border-eltex-blue hover:bg-blue-50/30 text-gray-500'
        }`}>
          <input
            type="file"
            accept="image/jpeg,image/png,application/pdf"
            multiple
            className="hidden"
            onChange={e => {
              const files = Array.from(e.target.files || []);
              e.target.value = '';
              if (files.length) handleFileSelect(files);
            }}
          />
          <Plus className="w-5 h-5" />
          <span className="text-sm font-medium">{hasPages ? 'Añadir más páginas o PDF' : 'Añadir imágenes o PDF'}</span>
        </label>
      )}
    </div>
  );
}

// ── Main Section ───────────────────────────────────────────────────────────────
export function PropertyDocsSection({
  dni,
  ibi,
  electricityBill,
  errors,
  documentProcessing,
  hasBlockingDocumentProcessing,
  onDNIFrontPhotoChange,
  onDNIFrontExtractionChange,
  onDNIBackPhotoChange,
  onDNIBackExtractionChange,
  onIBIPhotoChange,
  onIBIExtractionChange,
  onAddElectricityPage,
  onRemoveElectricityPage,
  onDocumentProcessingChange,
  onBack,
  onContinue,
}: Props) {
  const [dniIsBusy, setDniIsBusy] = useState(false);
  const [electricityIsBusy, setElectricityIsBusy] = useState(false);

  const isAnyBusy = hasBlockingDocumentProcessing || dniIsBusy || electricityIsBusy;

  return (
    <div className="min-h-screen bg-white p-5 pb-28">
      <div className="max-w-sm mx-auto space-y-5">
        <div className="pt-2 pb-2">
          <h1 className="text-2xl font-bold text-gray-900">Documentos</h1>
          <p className="text-gray-400 text-sm mt-1">
            Sube cada documento con buena luz. Solo se guarda cuando la verificación y la extracción terminan correctamente.
          </p>
        </div>

        <DNICard
          front={dni.front}
          back={dni.back}
          onFrontPhotoChange={onDNIFrontPhotoChange}
          onFrontExtractionChange={onDNIFrontExtractionChange}
          onBackPhotoChange={onDNIBackPhotoChange}
          onBackExtractionChange={onDNIBackExtractionChange}
          onBusyChange={setDniIsBusy}
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
          onAddPage={onAddElectricityPage}
          onRemovePage={onRemoveElectricityPage}
          onBusyChange={setElectricityIsBusy}
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
            disabled={isAnyBusy}
            className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Continuar <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
