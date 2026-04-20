import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle, CreditCard, Loader2, Plus, X } from 'lucide-react';
import type {
  AIExtraction,
  DNIData,
  DocSlot,
  StoredDocumentFile,
  UploadedPhoto,
} from '@/types';
import { createDocumentIssue } from '@/lib/documentIssues';
import {
  getIdentityDocumentPendingLabel,
  isDNIBackRequired,
  isIdentityDocumentComplete,
  shouldStoreAsAdditionalIdentityDocument,
} from '@/lib/identityDocument';
import {
  createUploadedPhoto,
  expandUploadFiles,
  preparePhotoAssets,
  splitDocumentImageIfNeeded,
  validatePhoto,
} from '@/lib/photoValidation';
import {
  BlurWarningCard,
  PersistentIssueNotice,
} from './shared';
import {
  buildStoredDocumentFromPreparedItem,
  extractPreparedDniFiles,
  genId,
  getStoredIdentityFilesMessage,
  type PendingItem,
  type PreparedDniItem,
} from './utils';

interface DNICardProps {
  front: DocSlot;
  back: DocSlot;
  originalPdfs: StoredDocumentFile[];
  issue: DNIData['issue'];
  onFrontPhotoChange: (photo: UploadedPhoto | null) => void;
  onFrontExtractionChange: (extraction: AIExtraction | null) => void;
  onBackPhotoChange: (photo: UploadedPhoto | null) => void;
  onBackExtractionChange: (extraction: AIExtraction | null) => void;
  onIssueChange: (issue: DNIData['issue']) => void;
  onOriginalPdfsMerge: (pdfs: StoredDocumentFile[]) => void;
  onBusyChange: (busy: boolean) => void;
}

export function DNICard({
  front,
  back,
  originalPdfs,
  issue,
  onFrontPhotoChange,
  onFrontExtractionChange,
  onBackPhotoChange,
  onBackExtractionChange,
  onIssueChange,
  onOriginalPdfsMerge,
  onBusyChange,
}: DNICardProps) {
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);
  const [isPreparing, setIsPreparing] = useState(false);

  const hasFront = !!front.photo;
  const hasBack = !!back.photo;
  const hasAny = hasFront || hasBack;
  const isComplete = isIdentityDocumentComplete({ front, back });
  const pendingLabel = getIdentityDocumentPendingLabel(front, back);
  const backRequired = isDNIBackRequired(front);
  const isBusy = isPreparing || pendingItems.some((item) => item.status !== 'failed');

  useEffect(() => {
    onBusyChange(isBusy);
  }, [isBusy, onBusyChange]);

  const commitWithoutExtraction = useCallback((
    preparedFiles: PreparedDniItem[],
    uploadedOriginalPdfs: StoredDocumentFile[],
    issueCode: 'temporary-error' | 'wrong-document' | 'unreadable' | 'wrong-side',
    issueMessage: string,
    options?: { assignedFront?: boolean; assignedBack?: boolean }
  ) => {
    let nextFrontAssigned = options?.assignedFront ?? !!front.photo;
    let nextBackAssigned = options?.assignedBack ?? !!back.photo;
    let savedAny = false;

    preparedFiles.forEach((prepared) => {
      const photo = createUploadedPhoto(prepared.file, prepared.preview, prepared.width, prepared.height);
      if (!nextFrontAssigned) {
        nextFrontAssigned = true;
        savedAny = true;
        onFrontPhotoChange(photo);
        onFrontExtractionChange(null);
        return;
      }
      if (!nextBackAssigned) {
        nextBackAssigned = true;
        savedAny = true;
        onBackPhotoChange(photo);
        onBackExtractionChange(null);
      }
    });

    if (savedAny) {
      if (uploadedOriginalPdfs.length > 0) onOriginalPdfsMerge(uploadedOriginalPdfs);
      onIssueChange(createDocumentIssue(issueCode, issueMessage));
    }

    setPendingItems((prev) => prev.filter((item) => !preparedFiles.some((prepared) => prepared.id === item.id)));
    return {
      savedAny,
      assignedFront: nextFrontAssigned,
      assignedBack: nextBackAssigned,
    };
  }, [
    back.photo,
    front.photo,
    onBackExtractionChange,
    onBackPhotoChange,
    onFrontExtractionChange,
    onFrontPhotoChange,
    onIssueChange,
    onOriginalPdfsMerge,
  ]);

  const processFiles = useCallback(async (files: File[], opts?: { forceSkipBlur?: boolean }) => {
    const forceSkipBlur = opts?.forceSkipBlur ?? false;
    setIsPreparing(true);
    const result = await expandUploadFiles(files).finally(() => setIsPreparing(false));
    const { files: expandedFiles, originalPdfs: uploadedOriginalPdfs, errors } = result;

    if (errors.length > 0) {
      setPendingItems((prev) => [
        ...prev,
        ...errors.map(({ file, message }) => ({
          id: genId(),
          file,
          preview: null,
          status: 'failed' as const,
          error: message,
        })),
      ]);
    }

    if (expandedFiles.length === 0) return;

    const splitFiles: { file: File; skipBlurCheck: boolean }[] = [];
    for (const entry of expandedFiles) {
      if (entry.skipBlurCheck) {
        const halves = await splitDocumentImageIfNeeded(entry.file, entry.file.name);
        halves.forEach((half) => splitFiles.push({ file: half, skipBlurCheck: true }));
      } else {
        splitFiles.push({ file: entry.file, skipBlurCheck: forceSkipBlur });
      }
    }

    const newItems: PendingItem[] = splitFiles.map(({ file }) => ({
      id: genId(),
      file,
      preview: null,
      status: 'validating',
    }));
    setPendingItems((prev) => [...prev, ...newItems]);

    let assignedFront = !!front.photo;
    let assignedBack = !!back.photo;
    let currentFront = front;
    let currentBack = back;

    const preparedFileResults = await Promise.all(splitFiles.map(async ({ file, skipBlurCheck }, index) => {
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

        return {
          id,
          file,
          preview,
          base64: aiBase64,
          width: check.width,
          height: check.height,
        };
      } catch {
        setPendingItems((prev) => prev.map((item) => item.id === id ? {
          ...item,
          status: 'failed',
          error: 'Error al procesar el archivo.',
        } : item));
        return null;
      }
    }));

    const preparedFiles = preparedFileResults.filter(
      (item): item is PreparedDniItem => item !== null
    );
    if (preparedFiles.length === 0) return;

    try {
      const response = await extractPreparedDniFiles(preparedFiles);
      let acceptedCount = 0;
      let fallbackCount = 0;
      let nextIssue: DNIData['issue'] = null;

      if (!response.success || !Array.isArray(response.results) || response.results.length !== preparedFiles.length) {
        commitWithoutExtraction(
          preparedFiles,
          uploadedOriginalPdfs,
          'temporary-error',
          response.message || 'Hemos guardado las imágenes, pero la lectura automática del DNI falló. Puedes continuar y revisarlo más tarde.'
        );
        return;
      }

      preparedFiles.forEach((prepared, index) => {
        const result = response.results?.[index];
        if (!result?.extraction) {
          const fallbackResult = commitWithoutExtraction(
            [prepared],
            [],
            'temporary-error',
            result?.message || 'Hemos guardado la imagen, pero la lectura automática del DNI no pudo completarse.',
            { assignedFront, assignedBack }
          );
          assignedFront = fallbackResult.assignedFront;
          assignedBack = fallbackResult.assignedBack;
          if (!fallbackResult.savedAny) {
            setPendingItems((prev) => prev.map((item) => item.id === prepared.id ? {
              ...item,
              status: 'failed',
              error: result?.message || 'No se pudo procesar el DNI.',
            } : item));
            return;
          }
          fallbackCount += 1;
          nextIssue = createDocumentIssue(
            'temporary-error',
            result?.message || 'Hemos guardado la imagen, pero la lectura automática del DNI no pudo completarse.'
          );
          return;
        }

        const photo = createUploadedPhoto(prepared.file, prepared.preview, prepared.width, prepared.height);
        const extracted = result.extraction as Omit<AIExtraction, 'needsManualReview' | 'confirmedByUser'>;
        const extraction: AIExtraction = {
          ...extracted,
          needsManualReview: result.needsManualReview ?? false,
          confirmedByUser: true,
        };

        if (result.side === 'back') {
          if (assignedBack) {
            setPendingItems((prev) => prev.map((item) => item.id === prepared.id ? {
              ...item,
              status: 'failed',
              error: 'El sistema detectó que esta imagen también corresponde a la página complementaria. Sube la página principal del DNI/NIE con los datos del titular.',
            } : item));
            return;
          }
          assignedBack = true;
          currentBack = { photo, extraction };
          onBackPhotoChange(photo);
          onBackExtractionChange(extraction);
          acceptedCount += 1;
        } else {
          if (assignedFront) {
            if (shouldStoreAsAdditionalIdentityDocument({ front: currentFront, back: currentBack }, result.side)) {
              onOriginalPdfsMerge([buildStoredDocumentFromPreparedItem(prepared)]);
              acceptedCount += 1;
            } else {
              setPendingItems((prev) => prev.map((item) => item.id === prepared.id ? {
                ...item,
                status: 'failed',
                error: 'El sistema detectó que esta imagen también corresponde a la página principal. Si tu documento tiene reverso útil, sube ahora la otra cara.',
              } : item));
              return;
            }
          } else {
            assignedFront = true;
            currentFront = { photo, extraction };
            onFrontPhotoChange(photo);
            onFrontExtractionChange(extraction);
            acceptedCount += 1;
          }
        }

        if ((result.needsManualReview ?? false) && !nextIssue) {
          nextIssue = createDocumentIssue(
            'manual-review',
            'Hemos guardado el DNI, pero conviene revisarlo antes de tramitarlo.'
          );
        }

        setPendingItems((prev) => prev.filter((item) => item.id !== prepared.id));
      });

      if ((acceptedCount > 0 || fallbackCount > 0) && uploadedOriginalPdfs.length > 0) {
        onOriginalPdfsMerge(uploadedOriginalPdfs);
      }
      if (acceptedCount > 0 || fallbackCount > 0) {
        onIssueChange(nextIssue);
      }
    } catch {
      commitWithoutExtraction(
        preparedFiles,
        uploadedOriginalPdfs,
        'temporary-error',
        'Hemos guardado las imágenes, pero la lectura automática del DNI falló por conexión. Puedes continuar y revisarlo más tarde.'
      );
    }
  }, [
    back,
    commitWithoutExtraction,
    front,
    onBackExtractionChange,
    onBackPhotoChange,
    onFrontExtractionChange,
    onFrontPhotoChange,
    onIssueChange,
    onOriginalPdfsMerge,
  ]);

  const dismissError = (id: string) => {
    setPendingItems((prev) => prev.filter((item) => item.id !== id));
  };

  return (
    <div className={`rounded-2xl border-2 transition-colors ${hasAny ? 'border-green-200 bg-green-50/30' : 'border-gray-100 bg-white'} p-5 space-y-4`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-gray-400" />
          <p className={`font-semibold ${hasAny ? 'text-gray-500' : 'text-gray-900'}`}>DNI / NIE</p>
        </div>
        {isComplete && <CheckCircle className="w-5 h-5 text-green-500" />}
        {hasAny && !isComplete && pendingLabel && (
          <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full font-medium">
            {pendingLabel}
          </span>
        )}
      </div>

      <p className="text-xs text-gray-500">
        Para DNI sube las dos caras. Para NIE certificado, NIE tarjeta o pasaporte, una foto es suficiente.
      </p>

      {originalPdfs.length > 0 && (
        <p className="text-xs text-gray-500">
          {getStoredIdentityFilesMessage(originalPdfs)}
        </p>
      )}

      {issue?.message && !isBusy && (
        <PersistentIssueNotice message={issue.message} tone={hasAny ? 'amber' : 'red'} />
      )}

      {hasAny && (
        <div className="grid grid-cols-2 gap-3">
          <div className={`rounded-xl border overflow-hidden ${hasFront ? 'border-green-200 bg-white' : 'border-dashed border-gray-200 bg-gray-50/60'}`}>
            {hasFront && front.photo?.preview ? (
              <>
                <div className="relative">
                  <img src={front.photo.preview} alt="DNI frontal" className="w-full h-24 object-cover" />
                  <button
                    type="button"
                    onClick={() => { onFrontPhotoChange(null); onFrontExtractionChange(null); onIssueChange(null); }}
                    className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                  <span className="absolute bottom-1.5 left-1.5 bg-black/50 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md">FRONTAL</span>
                </div>
                <div className="px-2 py-1.5 space-y-0.5">
                  {['fullName', 'dniNumber'].map((key) => {
                    const value = front.extraction?.extractedData?.[key];
                    if (!value) return null;
                    return <p key={key} className="text-[10px] text-gray-700 font-medium truncate">{String(value)}</p>;
                  })}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center p-3 min-h-[96px]">
                <p className="text-[10px] text-gray-400 text-center">Página principal</p>
                <p className="text-[9px] text-gray-300 text-center mt-1">Datos identificativos</p>
              </div>
            )}
          </div>

          <div className={`rounded-xl border overflow-hidden ${hasBack ? 'border-green-200 bg-white' : backRequired ? 'border-dashed border-amber-300 bg-amber-50/40' : 'border-dashed border-gray-200 bg-gray-50/60'}`}>
            {hasBack && back.photo?.preview ? (
              <>
                <div className="relative">
                  <img src={back.photo.preview} alt="DNI trasera" className="w-full h-24 object-cover" />
                  <button
                    type="button"
                    onClick={() => { onBackPhotoChange(null); onBackExtractionChange(null); onIssueChange(null); }}
                    className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                  <span className="absolute bottom-1.5 left-1.5 bg-black/50 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md">TRASERA</span>
                </div>
                <div className="px-2 py-1.5 space-y-0.5">
                  {['address', 'municipality'].map((key) => {
                    const value = back.extraction?.extractedData?.[key];
                    if (!value) return null;
                    return <p key={key} className="text-[10px] text-gray-700 font-medium truncate">{String(value)}</p>;
                  })}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center p-3 min-h-[96px]">
                <p className={`text-[10px] text-center ${backRequired ? 'text-amber-600' : 'text-gray-400'}`}>Reverso</p>
                <p className={`text-[9px] text-center mt-1 ${backRequired ? 'text-amber-500 font-medium' : 'text-gray-300'}`}>
                  {backRequired ? '(obligatorio)' : '(opcional)'}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {isPreparing && (
        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-3">
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 text-eltex-blue animate-spin" />
            <p className="text-xs text-gray-500">Leyendo archivo...</p>
          </div>
        </div>
      )}

      {pendingItems.map((item) => (
        <div key={item.id}>
          {item.status === 'failed' && item.reason === 'blurry' ? (
            <div className="relative">
              <BlurWarningCard
                preview={item.preview}
                onRetry={() => dismissError(item.id)}
                onForce={() => { dismissError(item.id); void processFiles([item.file], { forceSkipBlur: true }); }}
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
              {item.preview && <img src={item.preview} alt="Procesando" className="w-full h-16 object-cover rounded-lg opacity-70" />}
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
              {item.preview && <img src={item.preview} alt="Procesando" className="w-full h-16 object-cover rounded-lg opacity-70" />}
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 text-eltex-blue animate-spin" />
                <p className="text-xs text-gray-500">
                  {item.status === 'validating' ? 'Verificando calidad...' : 'Detectando cara y extrayendo datos...'}
                </p>
              </div>
            </div>
          )}
        </div>
      ))}

      {!isBusy && (
        <label className={`flex items-center justify-center gap-2 py-4 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
          hasAny ? 'border-gray-200 hover:border-eltex-blue hover:bg-blue-50/20 text-gray-400 hover:text-eltex-blue' : 'border-gray-200 hover:border-eltex-blue hover:bg-blue-50/30 text-gray-500'
        }`}>
          <input
            type="file"
            data-testid="dni-input"
            accept="image/jpeg,image/png,application/pdf"
            multiple
            className="hidden"
            onChange={(event) => {
              const files = Array.from(event.target.files || []);
              event.target.value = '';
              if (files.length) void processFiles(files);
            }}
          />
          <Plus className="w-5 h-5" />
          <span className="text-sm font-medium">
            {hasAny ? 'Añadir más fotos del documento' : 'Añadir fotos del documento'}
          </span>
        </label>
      )}
    </div>
  );
}
