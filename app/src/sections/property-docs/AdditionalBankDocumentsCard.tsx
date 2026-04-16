import { useCallback, useEffect, useState } from 'react';
import { Building2, Plus } from 'lucide-react';

import { createAdditionalBankDocumentId, normalizeAdditionalBankDocuments } from '@/lib/additionalBankDocuments';
import { buildValidatedAdditionalBankDocumentEntry } from '@/lib/additionalBankDocumentProcessing';
import { AdditionalBankDocumentEntryCard } from '@/sections/property-docs/AdditionalBankDocumentEntryCard';
import type { AdditionalBankDocumentEntry } from '@/types';

interface Props {
  documents: AdditionalBankDocumentEntry[];
  onAddDocuments: (entries: AdditionalBankDocumentEntry[]) => void;
  onRemoveDocument: (entryId: string) => void;
  onReplaceDocument: (entryId: string, replacement: AdditionalBankDocumentEntry) => void;
  onBusyChange?: (busy: boolean) => void;
}

const ACCEPTED_UPLOAD_TYPES = 'image/jpeg,image/png,application/pdf';

function formatFileSize(sizeBytes: number): string {
  if (sizeBytes >= 1024 * 1024) return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
  if (sizeBytes >= 1024) return `${Math.round(sizeBytes / 1024)} KB`;
  return `${sizeBytes} B`;
}

async function buildAdditionalBankEntriesFromFiles(
  files: File[],
  createId: (index: number) => string,
): Promise<{ entries: AdditionalBankDocumentEntry[]; messages: string[] }> {
  const settled = await Promise.allSettled(
    files.map((file, index) => buildValidatedAdditionalBankDocumentEntry([file], 'other', '', createId(index)))
  );

  const entries: AdditionalBankDocumentEntry[] = [];
  const messages: string[] = [];

  for (const item of settled) {
    if (item.status === 'fulfilled') {
      entries.push(item.value);
      continue;
    }

    messages.push(item.reason instanceof Error ? item.reason.message : 'No se pudo guardar el archivo.');
  }

  return { entries, messages };
}

export function AdditionalBankDocumentsCard({
  documents,
  onAddDocuments,
  onRemoveDocument,
  onReplaceDocument,
  onBusyChange,
}: Props) {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState('');

  const normalizedDocuments = normalizeAdditionalBankDocuments(documents);

  const isBusy = busyKey !== null;

  useEffect(() => {
    onBusyChange?.(isBusy);
  }, [isBusy, onBusyChange]);

  useEffect(() => () => onBusyChange?.(false), [onBusyChange]);

  const handleAddFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return;

    setBusyKey('new');
    setError('');
    try {
      const { entries, messages } = await buildAdditionalBankEntriesFromFiles(
        files,
        () => createAdditionalBankDocumentId(),
      );
      if (entries.length > 0) onAddDocuments(entries);
      if (messages.length > 0) setError(messages[0]);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'No se pudieron guardar los archivos.');
    } finally {
      setBusyKey(null);
    }
  }, [onAddDocuments]);

  const handleReplace = useCallback(async (entry: AdditionalBankDocumentEntry, files: File[]) => {
    if (files.length === 0) return;

    setBusyKey(entry.id);
    setError('');
    try {
      const { entries, messages } = await buildAdditionalBankEntriesFromFiles(
        files,
        (index) => (index === 0 ? entry.id : createAdditionalBankDocumentId()),
      );
      if (entries.length > 0) {
        onReplaceDocument(entry.id, entries[0]);
        if (entries.length > 1) onAddDocuments(entries.slice(1));
      }
      if (messages.length > 0) setError(messages[0]);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'No se pudieron guardar los archivos.');
    } finally {
      setBusyKey(null);
    }
  }, [onAddDocuments, onReplaceDocument]);

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
          <p className="font-semibold text-gray-900">Documento adicional</p>
          <p className="text-xs text-gray-500">
            Opcional. Sube uno o varios archivos aquí y guardaremos cada PDF o imagen tal cual.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <label className={`flex items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-4 text-sm font-medium transition-colors ${
          isBusy
            ? 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400'
            : 'cursor-pointer border-gray-300 bg-white text-gray-600 hover:border-eltex-blue hover:text-eltex-blue'
        }`}>
          <input
            type="file"
            data-testid="additional-bank-documents-input"
            accept={ACCEPTED_UPLOAD_TYPES}
            multiple
            className="hidden"
            disabled={isBusy}
            onChange={(event) => {
              const files = Array.from(event.target.files || []);
              event.target.value = '';
              void handleAddFiles(files);
            }}
          />
          <Plus className="h-4 w-4" />
          {busyKey === 'new' ? 'Guardando...' : 'Añadir archivos'}
        </label>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {normalizedDocuments.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-white px-4 py-4 text-sm text-gray-500">
          No has añadido documentos adicionales.
        </div>
      ) : (
        <div data-testid="additional-bank-documents-list" className="space-y-3">
          {normalizedDocuments.map((entry) => (
            <AdditionalBankDocumentEntryCard
              key={entry.id}
              accept={ACCEPTED_UPLOAD_TYPES}
              busy={isBusy && busyKey === entry.id}
              actionsDisabled={isBusy}
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
