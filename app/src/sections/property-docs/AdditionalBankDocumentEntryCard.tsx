import { AlertTriangle, CheckCircle, FileText, RefreshCcw, Trash2 } from 'lucide-react';

import { getAdditionalBankDocumentLabel } from '@/lib/additionalBankDocuments';
import type { AdditionalBankDocumentEntry } from '@/types';

interface Props {
  accept: string;
  busy: boolean;
  entry: AdditionalBankDocumentEntry;
  formatFileSize: (sizeBytes: number) => string;
  onRemove: () => void;
  onReplace: (files: File[]) => void;
}

function StatusBadge({ entry }: { entry: AdditionalBankDocumentEntry }) {
  if (entry.issue?.code === 'manual-review') {
    return (
      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
        Revisar
      </span>
    );
  }
  if (!entry.extraction) return null;

  return (
    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
      Validado
    </span>
  );
}

function IssueNotice({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
      <p className="text-sm text-amber-800">{message}</p>
    </div>
  );
}

export function AdditionalBankDocumentEntryCard({
  accept,
  busy,
  entry,
  formatFileSize,
  onRemove,
  onReplace,
}: Props) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-gray-900">{getAdditionalBankDocumentLabel(entry)}</p>
            <StatusBadge entry={entry} />
          </div>
          <p className="text-xs text-gray-500">
            {entry.files.length} archivo{entry.files.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <label className="inline-flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-600 hover:bg-gray-200 cursor-pointer transition-colors">
            <input
              type="file"
              accept={accept}
              multiple
              className="hidden"
              onChange={(event) => {
                const files = Array.from(event.target.files || []);
                event.target.value = '';
                void onReplace(files);
              }}
            />
            <RefreshCcw className="h-3.5 w-3.5" />
            {busy ? 'Validando...' : 'Sustituir'}
          </label>
          <button
            type="button"
            onClick={onRemove}
            className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 hover:bg-red-100 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Quitar
          </button>
        </div>
      </div>

      {entry.issue?.message && <IssueNotice message={entry.issue.message} />}

      <div className="space-y-2">
        {entry.files.map((file) => (
          <div
            key={file.id}
            className="flex items-center gap-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2"
          >
            <FileText className="h-4 w-4 shrink-0 text-gray-400" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-gray-700">{file.filename || 'Archivo sin nombre'}</p>
              <p className="text-xs text-gray-500">
                {file.mimeType === 'application/pdf' ? 'PDF' : 'Imagen'} · {formatFileSize(file.sizeBytes)}
              </p>
            </div>
            {entry.extraction && <CheckCircle className="h-4 w-4 shrink-0 text-emerald-500" />}
          </div>
        ))}
      </div>
    </div>
  );
}
