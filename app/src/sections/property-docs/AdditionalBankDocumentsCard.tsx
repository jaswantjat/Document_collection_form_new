import { useCallback, useState } from 'react';
import { Building2, Plus } from 'lucide-react';

import {
  ADDITIONAL_BANK_DOCUMENT_OPTIONS,
  createAdditionalBankDocumentId,
  normalizeAdditionalBankDocuments,
} from '@/lib/additionalBankDocuments';
import { buildValidatedAdditionalBankDocumentEntry } from '@/lib/additionalBankDocumentProcessing';
import { AdditionalBankDocumentEntryCard } from '@/sections/property-docs/AdditionalBankDocumentEntryCard';
import type {
  AdditionalBankDocumentEntry,
  AdditionalBankDocumentType,
} from '@/types';

interface Props {
  documents: AdditionalBankDocumentEntry[];
  onAddDocuments: (entries: AdditionalBankDocumentEntry[]) => void;
  onRemoveDocument: (entryId: string) => void;
  onReplaceDocument: (entryId: string, replacement: AdditionalBankDocumentEntry) => void;
}

const ACCEPTED_UPLOAD_TYPES = 'image/jpeg,image/png,application/pdf';

function formatFileSize(sizeBytes: number): string {
  if (sizeBytes >= 1024 * 1024) return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
  if (sizeBytes >= 1024) return `${Math.round(sizeBytes / 1024)} KB`;
  return `${sizeBytes} B`;
}

export function AdditionalBankDocumentsCard({
  documents,
  onAddDocuments,
  onRemoveDocument,
  onReplaceDocument,
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
      const entry = await buildValidatedAdditionalBankDocumentEntry(
        files,
        documentType,
        customLabel,
        createAdditionalBankDocumentId(),
      );
      onAddDocuments([entry]);
      if (documentType === 'other') setCustomLabel('');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'No se pudieron validar los archivos.');
    } finally {
      setBusyKey(null);
    }
  }, [customLabel, documentType, onAddDocuments]);

  const handleReplace = useCallback(async (entry: AdditionalBankDocumentEntry, files: File[]) => {
    if (files.length === 0) return;

    setBusyKey(entry.id);
    setError('');
    try {
      const replacement = await buildValidatedAdditionalBankDocumentEntry(
        files,
        entry.type,
        entry.customLabel || '',
        entry.id,
      );
      onReplaceDocument(entry.id, replacement);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'No se pudieron validar los archivos.');
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
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-gray-200 bg-white">
          <Building2 className="h-5 w-5 text-gray-500" />
        </div>
        <div className="space-y-1">
          <p className="font-semibold text-gray-900">Documentos bancarios adicionales</p>
          <p className="text-xs text-gray-500">
            Opcional. Los validamos automáticamente y, si algo no cuadra, te lo indicamos antes de enviarlo.
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
              {ADDITIONAL_BANK_DOCUMENT_OPTIONS.map((option) => (
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

        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 bg-white px-4 py-4 text-sm font-medium text-gray-600 transition-colors hover:border-eltex-blue hover:text-eltex-blue">
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
          <Plus className="h-4 w-4" />
          {busyKey === 'new' ? 'Validando...' : 'Añadir archivos'}
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
            <AdditionalBankDocumentEntryCard
              key={entry.id}
              accept={ACCEPTED_UPLOAD_TYPES}
              busy={busyKey === entry.id}
              entry={entry}
              formatFileSize={formatFileSize}
              onRemove={() => onRemoveDocument(entry.id)}
              onReplace={(files) => handleReplace(entry, files)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
