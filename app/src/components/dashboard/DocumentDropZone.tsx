import { useRef, useState } from 'react';
import { AlertTriangle, CheckCircle, Loader2, Upload } from 'lucide-react';
import type { DashboardProjectRecord } from '@/services/api';
import {
  uploadAdminDocument,
  type AdminDocType,
  type AdminUploadProgress,
} from '@/lib/dashboardDocumentUpload';

type Status = 'idle' | 'busy' | 'done' | 'error';

const ACCEPT_BY_TYPE: Record<AdminDocType, string> = {
  'dni-front': 'image/jpeg,image/png,application/pdf',
  'dni-back': 'image/jpeg,image/png,application/pdf',
  ibi: 'image/jpeg,image/png,application/pdf',
  'electricity-bill': 'image/jpeg,image/png,application/pdf',
  'additional-bank-document': 'image/jpeg,image/png,application/pdf',
};

const ALLOWS_MULTIPLE: Record<AdminDocType, boolean> = {
  'dni-front': false,
  'dni-back': false,
  ibi: true,
  'electricity-bill': true,
  'additional-bank-document': true,
};

export function DocumentDropZone({
  docType,
  label,
  description,
  project,
  token,
  onUploaded,
  compact = false,
}: {
  docType: AdminDocType;
  label: string;
  description?: string;
  project: DashboardProjectRecord | null;
  token: string;
  onUploaded: () => Promise<void> | void;
  compact?: boolean;
}) {
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  const reset = () => {
    setStatus('idle');
    setMessage('');
    if (fileRef.current) {
      fileRef.current.value = '';
    }
  };

  const handleFiles = async (files: File[]) => {
    if (files.length === 0) {
      return;
    }

    if (!project) {
      setStatus('error');
      setMessage('No se pudo cargar el expediente.');
      return;
    }

    if (!ALLOWS_MULTIPLE[docType] && files.length > 1) {
      setStatus('error');
      setMessage('Solo se admite un archivo para este documento.');
      return;
    }

    setStatus('busy');
    setMessage('Preparando archivo...');

    const result = await uploadAdminDocument({
      docType,
      files,
      project,
      token,
      onProgress: (progress: AdminUploadProgress) => {
        setMessage(progress.message);
      },
    });

    if (!result.ok) {
      setStatus('error');
      setMessage(result.message);
      return;
    }

    setStatus('done');
    setMessage(result.message);
    try {
      await onUploaded();
    } catch (err) {
      console.error('Refresh after upload failed:', err);
    }
  };

  const onDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (status === 'busy') return;
    dragCounter.current += 1;
    if (event.dataTransfer.types?.includes('Files')) {
      setIsDragging(true);
    }
  };

  const onDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragCounter.current = Math.max(0, dragCounter.current - 1);
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  };

  const onDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (status === 'busy') return;
    event.dataTransfer.dropEffect = 'copy';
  };

  const onDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragCounter.current = 0;
    setIsDragging(false);
    if (status === 'busy') return;

    const files = Array.from(event.dataTransfer.files || []);
    if (files.length === 0) return;
    void handleFiles(files);
  };

  const isBusy = status === 'busy';
  const baseClass = compact ? 'p-4' : 'p-6';
  const borderClass = isDragging
    ? 'border-eltex-blue bg-blue-50'
    : 'border-gray-200 bg-white hover:border-eltex-blue hover:bg-blue-50/40';

  return (
    <div
      className="space-y-2"
      data-testid={`document-dropzone-${docType}`}
      data-doc-type={docType}
    >
      <div
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
        className={`relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed text-center transition-colors ${baseClass} ${borderClass} ${
          isBusy ? 'pointer-events-none opacity-70' : ''
        }`}
      >
        <Upload className="h-5 w-5 text-gray-400" />
        <div className="space-y-0.5">
          <p className="text-sm font-semibold text-gray-700">{label}</p>
          {description ? (
            <p className="text-xs text-gray-500">{description}</p>
          ) : (
            <p className="text-xs text-gray-500">
              Arrastra y suelta un archivo aquí o haz clic para seleccionarlo.
            </p>
          )}
        </div>
        <label className="mt-1 inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-50">
          <Upload className="h-3 w-3" />
          Seleccionar archivo{ALLOWS_MULTIPLE[docType] ? 's' : ''}
          <input
            ref={fileRef}
            data-testid={`document-dropzone-input-${docType}`}
            type="file"
            accept={ACCEPT_BY_TYPE[docType]}
            multiple={ALLOWS_MULTIPLE[docType]}
            className="hidden"
            disabled={isBusy}
            onChange={(event) => {
              const files = Array.from(event.target.files || []);
              event.target.value = '';
              if (files.length > 0) {
                void handleFiles(files);
              }
            }}
          />
        </label>
      </div>

      {status === 'busy' ? (
        <div className="flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-eltex-blue" />
          <span className="text-xs text-blue-800">{message}</span>
        </div>
      ) : null}

      {status === 'done' ? (
        <div className="flex items-start justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
          <div className="flex items-start gap-2">
            <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            <span className="text-xs text-emerald-800">{message}</span>
          </div>
          <button
            type="button"
            onClick={reset}
            className="text-xs font-semibold text-emerald-700 underline-offset-2 hover:underline"
          >
            Subir otro
          </button>
        </div>
      ) : null}

      {status === 'error' ? (
        <div className="flex items-start justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
            <span className="text-xs text-red-800">{message}</span>
          </div>
          <button
            type="button"
            onClick={reset}
            className="text-xs font-semibold text-red-700 underline-offset-2 hover:underline"
          >
            Reintentar
          </button>
        </div>
      ) : null}
    </div>
  );
}
