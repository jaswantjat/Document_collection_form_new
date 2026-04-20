import { useCallback } from 'react';
import { AlertTriangle, Camera, CheckCircle, Loader2, RotateCcw } from 'lucide-react';
import type {
  AIExtraction,
  DocumentProcessingState,
  DocumentSlotKey,
  IBIData,
  StoredDocumentFile,
  UploadedPhoto,
} from '@/types';
import { createDocumentIssue } from '@/lib/documentIssues';
import {
  createUploadedPhoto,
  expandUploadFiles,
  preparePhotoAssets,
  validatePhoto,
} from '@/lib/photoValidation';
import { extractDocument, extractDocumentBatch } from '@/services/api';
import {
  BlurWarningCard,
  PersistentIssueNotice,
} from './shared';
import { IBI_FIELDS } from './utils';

interface IBIDocCardProps {
  title: string;
  hint: string;
  data: IBIData;
  slotKey: DocumentSlotKey;
  processing: DocumentProcessingState;
  onDocumentChange: (
    pages: UploadedPhoto[],
    extraction: AIExtraction | null,
    originalPdfs: StoredDocumentFile[]
  ) => void;
  onIssueChange: (issue: IBIData['issue']) => void;
  onProcessingChange: (slot: DocumentSlotKey, state: DocumentProcessingState) => void;
}

export function IBIDocCard({
  title,
  hint,
  data,
  slotKey,
  processing,
  onDocumentChange,
  onIssueChange,
  onProcessingChange,
}: IBIDocCardProps) {
  const processFiles = useCallback(async (files: File[]) => {
    const hadAcceptedDocument = !!data.photo || data.pages.length > 0;
    let storedPages: UploadedPhoto[] = [];
    let nextOriginalPdfs = data.originalPdfs;
    onProcessingChange(slotKey, { status: 'validating', pendingPreview: null });

    try {
      const { files: expandedFiles, originalPdfs, errors } = await expandUploadFiles(files);
      nextOriginalPdfs = originalPdfs;
      if (errors.length > 0) {
        onProcessingChange(slotKey, {
          status: hadAcceptedDocument ? 'accepted' : 'rejected',
          errorCode: 'temporary-error',
          errorMessage: errors[0].message,
          pendingPreview: null,
        });
        return;
      }

      if (expandedFiles.length === 0) {
        onProcessingChange(slotKey, {
          status: hadAcceptedDocument ? 'accepted' : 'rejected',
          errorCode: 'validation',
          errorMessage: 'No se encontró ninguna imagen utilizable.',
          pendingPreview: null,
        });
        return;
      }

      const preparedPages: Array<{
        file: File;
        preview: string;
        base64: string;
        width?: number;
        height?: number;
      }> = [];
      for (const { file, skipBlurCheck } of expandedFiles) {
        const tempPreviewUrl = URL.createObjectURL(file);
        const check = await validatePhoto(file, { skipBlurCheck });
        if (!check.valid) {
          onProcessingChange(slotKey, {
            status: hadAcceptedDocument ? 'accepted' : 'rejected',
            errorCode: check.reason === 'blurry' ? 'blurry' : 'validation',
            errorMessage: check.error || 'Imagen no válida.',
            pendingPreview: check.reason === 'blurry' ? tempPreviewUrl : null,
          });
          return;
        }
        URL.revokeObjectURL(tempPreviewUrl);

        const { preview, aiBase64 } = await preparePhotoAssets(file);
        preparedPages.push({
          file,
          preview,
          base64: aiBase64,
          width: check.width,
          height: check.height,
        });
      }

      const firstPage = preparedPages[0];
      onProcessingChange(slotKey, {
        status: 'extracting',
        errorCode: undefined,
        errorMessage: undefined,
        pendingPreview: firstPage.preview,
      });

      const response = preparedPages.length > 1
        ? await extractDocumentBatch(preparedPages.map((page) => page.base64), 'ibi')
        : await extractDocument(firstPage.base64, slotKey as 'ibi');

      if (!response.success || !response.extraction) {
        const errorCode = response.reason === 'unreadable'
          || response.reason === 'wrong-document'
          || response.reason === 'wrong-side'
          || response.reason === 'temporary-error'
          ? response.reason
          : (response.isUnreadable ? 'unreadable' : response.isWrongDocument ? 'wrong-document' : 'temporary-error');
        storedPages = preparedPages.map((page) => createUploadedPhoto(
          page.file,
          page.preview,
          page.width,
          page.height
        ));
        onDocumentChange(storedPages, null, originalPdfs);
        onIssueChange(createDocumentIssue(
          errorCode,
          response.message || 'Hemos guardado el documento, pero la lectura automática no pudo completarse.'
        ));
        onProcessingChange(slotKey, {
          status: 'accepted',
          errorCode,
          errorMessage: response.message || 'No se pudo procesar el documento.',
          pendingPreview: null,
        });
        return;
      }

      storedPages = preparedPages.map((page) => createUploadedPhoto(
        page.file,
        page.preview,
        page.width,
        page.height
      ));
      onDocumentChange(storedPages, {
        ...response.extraction,
        needsManualReview: response.needsManualReview ?? response.extraction.needsManualReview ?? false,
        confirmedByUser: true,
      }, originalPdfs);
      onIssueChange(
        (response.needsManualReview ?? response.extraction.needsManualReview ?? false)
          ? createDocumentIssue('manual-review', 'Hemos guardado el documento, pero conviene revisarlo antes de tramitarlo.')
          : null
      );
      onProcessingChange(slotKey, { status: 'accepted', pendingPreview: null });
    } catch (error) {
      console.error('extractDocument error:', error);
      if (storedPages.length > 0) {
        onDocumentChange(storedPages, null, nextOriginalPdfs);
        onIssueChange(createDocumentIssue(
          'temporary-error',
          'Hemos guardado el documento, pero la lectura automática falló por conexión. Puedes continuar y revisarlo más tarde.'
        ));
      }
      onProcessingChange(slotKey, {
        status: storedPages.length > 0 || hadAcceptedDocument ? 'accepted' : 'rejected',
        errorCode: 'temporary-error',
        errorMessage: 'Error de conexión. Comprueba tu conexión a internet y vuelve a intentarlo.',
        pendingPreview: null,
      });
    }
  }, [data.originalPdfs, data.pages.length, data.photo, onDocumentChange, onIssueChange, onProcessingChange, slotKey]);

  const reset = useCallback(() => {
    onDocumentChange([], null, []);
    onIssueChange(null);
    onProcessingChange(slotKey, { status: 'idle', pendingPreview: null });
  }, [onDocumentChange, onIssueChange, onProcessingChange, slotKey]);

  const extractedData = data.extraction?.extractedData || {};
  const pageCount = data.pages.length;
  const accepted = pageCount > 0;
  const persistentIssue = data.issue ?? null;
  const isBusy = processing.status === 'validating' || processing.status === 'extracting';
  const showError = !!processing.errorMessage && !isBusy && !accepted;
  const showReplacementNote = !!processing.errorMessage && !isBusy && accepted && !persistentIssue?.message;

  return (
    <div className={`rounded-2xl border-2 transition-colors ${accepted ? 'border-green-200 bg-green-50/30' : 'border-gray-100 bg-white'} p-5 space-y-4`}>
      <div className="flex items-center justify-between">
        <p className={`font-semibold ${accepted ? 'text-gray-500' : 'text-gray-900'}`}>{title}</p>
        {accepted && (
          <div className="flex items-center gap-2">
            {pageCount > 1 && (
              <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-0.5 rounded-full">
                {pageCount} páginas
              </span>
            )}
            <CheckCircle className="w-5 h-5 text-green-500" />
          </div>
        )}
      </div>

      {!accepted && !isBusy && (
        <label className="flex flex-col items-center justify-center gap-2 py-6 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer hover:border-eltex-blue hover:bg-blue-50/30 transition-colors">
          <input
            type="file"
            data-testid={`${slotKey}-input`}
            accept="image/jpeg,image/png,application/pdf"
            multiple
            className="hidden"
            onChange={(event) => {
              const files = Array.from(event.target.files || []);
              event.target.value = '';
              if (files.length) void processFiles(files);
            }}
          />
          <Camera className="w-7 h-7 text-gray-300" />
          <span className="text-sm font-medium text-gray-500">Fotos o PDF</span>
          <span className="text-xs text-gray-400 text-center px-4">{hint}</span>
        </label>
      )}

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

      {showError && processing.errorCode === 'blurry' && (
        <BlurWarningCard
          preview={processing.pendingPreview ?? null}
          onRetry={() => {
            onDocumentChange([], null, []);
            onProcessingChange(slotKey, { status: 'idle', pendingPreview: null });
          }}
        />
      )}
      {showError && processing.errorCode !== 'blurry' && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3">
          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm text-red-700">{processing.errorMessage}</p>
            {processing.errorCode === 'unreadable' && (
              <p className="text-xs text-red-500">
                Consejo: asegúrate de que el texto esté bien enfocado y con buena iluminación.
              </p>
            )}
          </div>
        </div>
      )}

      {!isBusy && persistentIssue?.message && (
        <PersistentIssueNotice message={persistentIssue.message} tone={accepted ? 'amber' : 'red'} />
      )}

      {accepted && (
        <div className="space-y-3">
          {data.photo?.preview && (
            <img src={data.photo.preview} alt={title} className="w-full h-28 object-cover rounded-xl opacity-80" />
          )}
          {pageCount > 1 && (
            <p className="text-xs text-gray-500">
              Se han guardado {pageCount} páginas para este documento.
            </p>
          )}
          {data.originalPdfs.length > 0 && (
            <p className="text-xs text-gray-500">
              PDF original guardado: {data.originalPdfs.length} archivo{data.originalPdfs.length !== 1 ? 's' : ''}.
            </p>
          )}
          {showReplacementNote && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              {processing.errorCode === 'blurry' ? (
                <div className="space-y-1">
                  <p className="text-sm text-amber-800 font-medium">La imagen estaba desenfocada — se mantiene el anterior.</p>
                  <p className="text-xs text-amber-700">Mantén el móvil fijo, busca buena luz y sitúate a 20-30 cm del documento.</p>
                </div>
              ) : (
                <p className="text-sm text-amber-700">El documento se ha guardado, pero la lectura automática no pudo completarse. Puedes continuar o volver a intentarlo si quieres sustituirlo.</p>
              )}
            </div>
          )}
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
              <input
                type="file"
                accept="image/jpeg,image/png,application/pdf"
                multiple
                className="hidden"
                onChange={(event) => {
                  const files = Array.from(event.target.files || []);
                  event.target.value = '';
                  if (files.length) void processFiles(files);
                }}
              />
              <Camera className="w-3.5 h-3.5" /> Sustituir
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
