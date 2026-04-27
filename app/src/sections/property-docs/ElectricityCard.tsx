import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, FileText, Loader2, Plus, X, Zap } from 'lucide-react';
import type {
  AIExtraction,
  ElectricityBillData,
  StoredDocumentFile,
  UploadedPhoto,
} from '@/types';
import { createDocumentIssue, getExtractionFailureIssueCode } from '@/lib/documentIssues';
import { pdfToImageFiles } from '@/lib/pdfToImages';
import {
  createStoredDocumentFile,
  createUploadedPhoto,
  preparePhotoAssets,
  validatePhoto,
} from '@/lib/photoValidation';
import { extractDocumentBatch } from '@/services/api';
import {
  BlurWarningCard,
  PersistentIssueNotice,
} from './shared';
import {
  ELECTRICITY_FIELDS,
  genId,
  type PendingItem,
} from './utils';

interface ElectricityCardProps {
  pages: ElectricityBillData['pages'];
  originalPdfs: StoredDocumentFile[];
  issue: ElectricityBillData['issue'];
  onAddPages: (
    photos: UploadedPhoto[],
    extraction: AIExtraction | null,
    originalPdfs: StoredDocumentFile[]
  ) => void;
  onRemovePage: (index: number) => void;
  onIssueChange: (issue: ElectricityBillData['issue']) => void;
  onBusyChange: (busy: boolean) => void;
}

export function ElectricityCard({
  pages,
  originalPdfs,
  issue,
  onAddPages,
  onRemovePage,
  onIssueChange,
  onBusyChange,
}: ElectricityCardProps) {
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);
  const [pdfExpanding, setPdfExpanding] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const isBusy = pdfExpanding || pendingItems.some((item) => item.status !== 'failed');
  const hasPages = pages.length > 0;

  useEffect(() => {
    onBusyChange(isBusy);
  }, [isBusy, onBusyChange]);

  useEffect(() => {
    const processingIds = pendingItems
      .filter((item) => item.status === 'validating' || item.status === 'extracting')
      .map((item) => item.id);
    if (processingIds.length === 0) return;

    const timer = setTimeout(() => {
      setPendingItems((prev) => prev.map((item) =>
        processingIds.includes(item.id) && (item.status === 'validating' || item.status === 'extracting')
          ? { ...item, status: 'failed', error: 'Tiempo de espera agotado. Inténtalo de nuevo.' }
          : item
      ));
    }, 30_000);
    return () => clearTimeout(timer);
  }, [pendingItems]);

  const processFiles = useCallback(async (
    files: File[],
    uploadedOriginalPdfs: StoredDocumentFile[] = [],
    skipBlurCheck = false
  ) => {
    const newItems: PendingItem[] = files.map((file) => ({
      id: genId(),
      file,
      preview: null,
      status: 'validating',
    }));
    setPendingItems((prev) => [...prev, ...newItems]);

    type ValidFile = {
      file: File;
      id: string;
      preview: string;
      base64: string;
      width: number | undefined;
      height: number | undefined;
    };

    const validFileResults = await Promise.all(files.map(async (file, index) => {
      const id = newItems[index].id;
      try {
        const tempPreviewUrl = URL.createObjectURL(file);
        setPendingItems((prev) => prev.map((item) => item.id === id ? { ...item, preview: tempPreviewUrl } : item));

        const check = await validatePhoto(file, { skipBlurCheck });
        if (!check.valid) {
          setPendingItems((prev) => prev.map((item) => item.id === id ? {
            ...item,
            status: 'failed',
            error: check.error || 'Imagen no válida.',
            reason: check.reason === 'blurry' ? 'blurry' : 'other',
          } : item));
          return null;
        }

        const { preview, aiBase64 } = await preparePhotoAssets(file);
        URL.revokeObjectURL(tempPreviewUrl);
        setPendingItems((prev) => prev.map((item) => item.id === id ? { ...item, preview, status: 'extracting' } : item));
        return { file, id, preview, base64: aiBase64, width: check.width, height: check.height };
      } catch {
        setPendingItems((prev) => prev.map((item) => item.id === id ? {
          ...item,
          status: 'failed',
          error: 'Error al procesar el archivo.',
        } : item));
        return null;
      }
    }));

    const validFiles = validFileResults.filter((item): item is ValidFile => item !== null);
    if (validFiles.length === 0) return;

    try {
      const response = await extractDocumentBatch(validFiles.map((file) => file.base64), 'electricity');
      if (!response.success || !response.extraction) {
        const errorCode = getExtractionFailureIssueCode(response);
        const fallbackPhotos = validFiles.map(({ file, preview, width, height }) =>
          createUploadedPhoto(file, preview, width, height)
        );
        onAddPages(fallbackPhotos, null, uploadedOriginalPdfs);
        onIssueChange(createDocumentIssue(
          errorCode,
          response.message || 'Hemos guardado la factura, pero la lectura automática no pudo completarse. Puedes continuar y revisarla más tarde.'
        ));
        setPendingItems((prev) => prev.filter((item) => !validFiles.find((file) => file.id === item.id)));
        return;
      }

      const extraction: AIExtraction = {
        ...response.extraction,
        needsManualReview: response.needsManualReview ?? false,
        confirmedByUser: true,
      };

      const newPhotos: UploadedPhoto[] = [];
      const processedIds: string[] = [];
      validFiles.forEach(({ file, id, preview, width, height }) => {
        const photo = createUploadedPhoto(file, preview, width, height);
        const isDuplicate = pages.some((page) => page.photo?.preview === photo.preview);
        if (!isDuplicate) newPhotos.push(photo);
        processedIds.push(id);
      });

      if (newPhotos.length > 0 || uploadedOriginalPdfs.length > 0) {
        onAddPages(newPhotos, extraction, uploadedOriginalPdfs);
      }
      onIssueChange(
        (response.needsManualReview ?? false)
          ? createDocumentIssue('manual-review', 'Hemos guardado la factura, pero conviene revisarla antes de tramitarla.')
          : null
      );
      setPendingItems((prev) => prev.filter((item) => !processedIds.includes(item.id)));
    } catch {
      const fallbackPhotos = validFiles.map(({ file, preview, width, height }) =>
        createUploadedPhoto(file, preview, width, height)
      );
      onAddPages(fallbackPhotos, null, uploadedOriginalPdfs);
      onIssueChange(createDocumentIssue(
        'temporary-error',
        'Hemos guardado la factura, pero la lectura automática falló por conexión. Puedes continuar y revisarla más tarde.'
      ));
      setPendingItems((prev) => prev.filter((item) => !validFiles.find((file) => file.id === item.id)));
    }
  }, [onAddPages, onIssueChange, pages]);

  const dismissError = (id: string) => {
    setPendingItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleFileSelect = useCallback(async (selectedFiles: File[]) => {
    const pdfs = selectedFiles.filter((file) => file.type === 'application/pdf');
    const images = selectedFiles.filter((file) => file.type !== 'application/pdf');
    setPdfError(null);

    if (images.length > 0) {
      await processFiles(images, [], false);
    }

    if (pdfs.length === 0) return;

    setPdfExpanding(true);
    try {
      for (const pdf of pdfs) {
        const converted = await pdfToImageFiles(pdf);
        if (converted.length === 0) {
          setPdfError('El PDF no pudo convertirse. Prueba a exportarlo de nuevo o sube una imagen directamente.');
        } else {
          const storedPdf = await createStoredDocumentFile(pdf);
          await processFiles(converted, [storedPdf], true);
        }
      }
    } catch (error) {
      const message = error instanceof Error && error.message
        ? error.message
        : 'No se pudo leer el PDF. Comprueba que no esté protegido con contraseña y vuelve a intentarlo.';
      setPdfError(message);
    } finally {
      setPdfExpanding(false);
    }
  }, [processFiles]);

  return (
    <div className={`rounded-2xl border-2 transition-colors ${hasPages ? 'border-green-200 bg-green-50/30' : 'border-gray-100 bg-white'} p-5 space-y-4`}>
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

      {originalPdfs.length > 0 && (
        <p className="text-xs text-gray-500">
          PDF original guardado: {originalPdfs.length} archivo{originalPdfs.length !== 1 ? 's' : ''}.
        </p>
      )}

      {issue?.message && !isBusy && (
        <PersistentIssueNotice message={issue.message} tone={hasPages ? 'amber' : 'red'} />
      )}

      {hasPages && (
        <div className="grid grid-cols-2 gap-3">
          {pages.map((page, index) => {
            const pageData = page.extraction?.extractedData || {};
            const keyFields = ELECTRICITY_FIELDS.filter((field) => pageData[field.key]);
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

      {pendingItems.map((item) => (
        <div key={item.id}>
          {item.status === 'failed' && item.reason === 'blurry' ? (
            <div className="relative">
              <BlurWarningCard
                preview={item.preview}
                onRetry={() => dismissError(item.id)}
                onForce={() => { dismissError(item.id); void processFiles([item.file], [], true); }}
              />
              <button
                type="button"
                onClick={() => dismissError(item.id)}
                className="absolute top-2 right-2 text-amber-600 hover:text-amber-800 bg-white/70 rounded-full p-0.5"
                aria-label="Descartar"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : item.status === 'failed' ? (
            <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-3 space-y-2">
              {item.preview && <img src={item.preview} alt="Procesando" className="w-full h-20 object-cover rounded-lg opacity-70" />}
              <div className="space-y-2">
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-2">
                  <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700 flex-1">{item.error}</p>
                  <button type="button" onClick={() => dismissError(item.id)} className="text-red-400 hover:text-red-600 shrink-0">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => { dismissError(item.id); void processFiles([item.file]); }}
                  className="w-full text-xs text-eltex-blue hover:text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg py-1.5 transition-colors"
                >
                  Reintentar
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-3 space-y-2">
              {item.preview && <img src={item.preview} alt="Procesando" className="w-full h-20 object-cover rounded-lg opacity-70" />}
              <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 text-eltex-blue animate-spin shrink-0" />
                <p className="text-sm text-gray-500">
                  {item.status === 'validating' ? 'Verificando calidad...' : 'Extrayendo datos...'}
                </p>
              </div>
            </div>
          )}
        </div>
      ))}

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

      {pdfError && !pdfExpanding && (
        <div className="flex items-start gap-3 py-3 px-4 bg-red-50 border border-red-200 rounded-xl">
          <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-700">Error al procesar el PDF</p>
            <p className="text-xs text-red-500 mt-0.5">{pdfError}</p>
          </div>
          <button type="button" onClick={() => setPdfError(null)} className="shrink-0 text-red-400 hover:text-red-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {!isBusy && (
        <label className={`flex items-center justify-center gap-2 py-4 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
          hasPages
            ? 'border-eltex-blue/40 hover:border-eltex-blue hover:bg-blue-50/40 text-eltex-blue'
            : 'border-gray-200 hover:border-eltex-blue hover:bg-blue-50/30 text-gray-500'
        }`}>
          <input
            type="file"
            data-testid="electricity-input"
            accept="image/jpeg,image/png,application/pdf"
            multiple
            className="hidden"
            onChange={(event) => {
              const files = Array.from(event.target.files || []);
              event.target.value = '';
              if (files.length) void handleFileSelect(files);
            }}
          />
          <Plus className="w-5 h-5" />
          <span className="text-sm font-medium">{hasPages ? 'Añadir más páginas o PDF' : 'Añadir imágenes o PDF'}</span>
        </label>
      )}
    </div>
  );
}
