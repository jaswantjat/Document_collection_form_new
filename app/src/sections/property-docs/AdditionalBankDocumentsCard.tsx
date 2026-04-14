import { useCallback, useState } from 'react';
import { Building2, FileText, Plus, RefreshCcw, Trash2 } from 'lucide-react';

import {
  getAdditionalBankDocumentLabel,
  normalizeAdditionalBankDocuments,
} from '@/lib/additionalBankDocuments';
import { createStoredDocumentFile } from '@/lib/photoValidation';
import type {
  AdditionalBankDocumentEntry,
  AdditionalBankDocumentType,
} from '@/types';

interface Props {
  documents: AdditionalBankDocumentEntry[];
  onAddDocuments: (entries: AdditionalBankDocumentEntry[]) => void;
  onReplaceDocument: (entryId: string, replacement: AdditionalBankDocumentEntry) => void;
  onRemoveDocument: (entryId: string) => void;
}

const ACCEPTED_UPLOAD_TYPES = 'image/jpeg,image/png,application/pdf';
const DOCUMENT_TYPE_OPTIONS: Array<{ value: AdditionalBankDocumentType; label: string }> = [
  { value: 'bank-ownership-certificate', label: 'Certificado de titularidad bancaria' },
  { value: 'payroll', label: 'Nómina' },
  { value: 'bank-statements', label: 'Extractos bancarios' },
  { value: 'employment-contract', label: 'Contrato laboral' },
  { value: 'tax-return', label: 'Declaración de la renta' },
  { value: 'other', label: 'Otro documento' },
];

function createEntryId(): string {
  return `bank-doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatFileSize(sizeBytes: number): string {
  if (sizeBytes >= 1024 * 1024) return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
  if (sizeBytes >= 1024) return `${Math.round(sizeBytes / 1024)} KB`;
  return `${sizeBytes} B`;
}

async function buildEntry(
  files: File[],
  type: AdditionalBankDocumentType,
  customLabel: string,
  entryId = createEntryId(),
): Promise<AdditionalBankDocumentEntry> {
  const storedFiles = await Promise.all(files.map((file) => createStoredDocumentFile(file)));

  return {
    id: entryId,
    type,
    customLabel: type === 'other' && customLabel.trim() ? customLabel.trim() : undefined,
    files: storedFiles,
  };
}

export function AdditionalBankDocumentsCard({
  documents,
  onAddDocuments,
  onReplaceDocument,
  onRemoveDocument,
}: Props) {
  const [documentType, setDocumentType] = useState<AdditionalBankDocumentType>('bank-ownership-certificate');
  const [customLabel, setCustomLabel] = useState('');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState('');

  const normalizedDocuments = normalizeAdditionalBankDocuments(documents);

  const handleAddFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return;

    setBusyKey('new');
    setError('');
    try {
      const entry = await buildEntry(files, documentType, customLabel);
      onAddDocuments([entry]);
      if (documentType === 'other') setCustomLabel('');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'No se pudieron preparar los archivos.');
    } finally {
      setBusyKey(null);
    }
  }, [customLabel, documentType, onAddDocuments]);

  const handleReplace = useCallback(async (entry: AdditionalBankDocumentEntry, files: File[]) => {
    if (files.length === 0) return;

    setBusyKey(entry.id);
    setError('');
    try {
      const replacement = await buildEntry(files, entry.type, entry.customLabel || '', entry.id);
      onReplaceDocument(entry.id, replacement);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'No se pudieron preparar los archivos.');
    } finally {
      setBusyKey(null);
    }
  }, [onReplaceDocument]);

  return (
    <div
      data-testid="additional-bank-documents-card"
      className="rounded-2xl border border-gray-200 bg-gray-50/60 p-5 space-y-4"
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-2xl bg-white border border-gray-200 flex items-center justify-center shrink-0">
          <Building2 className="w-5 h-5 text-gray-500" />
        </div>
        <div className="space-y-1">
          <p className="font-semibold text-gray-900">Documentos bancarios adicionales</p>
          <p className="text-xs text-gray-500">
            Opcional. Si tu asesor te los pidió, puedes adjuntarlos aquí sin bloquear el envío final.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <div className="space-y-3">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-gray-500">Tipo de documento</span>
            <select
              data-testid="additional-bank-doc-type"
              value={documentType}
              onChange={(event) => setDocumentType(event.target.value as AdditionalBankDocumentType)}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 outline-none transition-colors focus:border-eltex-blue"
            >
              {DOCUMENT_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          {documentType === 'other' && (
            <label className="block space-y-1">
              <span className="text-xs font-medium text-gray-500">Etiqueta opcional</span>
              <input
                data-testid="additional-bank-doc-other-label"
                value={customLabel}
                onChange={(event) => setCustomLabel(event.target.value)}
                placeholder="Ej. IRPF 2024"
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 outline-none transition-colors focus:border-eltex-blue"
              />
            </label>
          )}
        </div>

        <label className="flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 bg-white px-4 py-4 text-sm font-medium text-gray-600 transition-colors hover:border-eltex-blue hover:text-eltex-blue cursor-pointer">
          <input
            type="file"
            data-testid="additional-bank-documents-input"
            accept={ACCEPTED_UPLOAD_TYPES}
            multiple
            className="hidden"
            onChange={(event) => {
              const files = Array.from(event.target.files || []);
              event.target.value = '';
              void handleAddFiles(files);
            }}
          />
          <Plus className="w-4 h-4" />
          {busyKey === 'new' ? 'Preparando...' : 'Añadir archivos'}
        </label>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {normalizedDocuments.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-white px-4 py-4 text-sm text-gray-500">
          No has añadido documentos bancarios extra.
        </div>
      ) : (
        <div data-testid="additional-bank-documents-list" className="space-y-3">
          {normalizedDocuments.map((entry) => (
            <div key={entry.id} className="rounded-xl border border-gray-200 bg-white px-4 py-3 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{getAdditionalBankDocumentLabel(entry)}</p>
                  <p className="text-xs text-gray-500">
                    {entry.files.length} archivo{entry.files.length !== 1 ? 's' : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <label className="inline-flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-600 hover:bg-gray-200 cursor-pointer transition-colors">
                    <input
                      type="file"
                      accept={ACCEPTED_UPLOAD_TYPES}
                      multiple
                      className="hidden"
                      onChange={(event) => {
                        const files = Array.from(event.target.files || []);
                        event.target.value = '';
                        void handleReplace(entry, files);
                      }}
                    />
                    <RefreshCcw className="w-3.5 h-3.5" />
                    {busyKey === entry.id ? 'Preparando...' : 'Sustituir'}
                  </label>
                  <button
                    type="button"
                    onClick={() => onRemoveDocument(entry.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 hover:bg-red-100 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Quitar
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                {entry.files.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center gap-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2"
                  >
                    <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-700 truncate">{file.filename || 'Archivo sin nombre'}</p>
                      <p className="text-xs text-gray-500">
                        {file.mimeType === 'application/pdf' ? 'PDF' : 'Imagen'} · {formatFileSize(file.sizeBytes)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
