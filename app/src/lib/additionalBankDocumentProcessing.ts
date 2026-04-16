import { createStoredDocumentFile } from '@/lib/photoValidation';
import type { AIExtraction, AdditionalBankDocumentEntry, AdditionalBankDocumentType } from '@/types';

type AdditionalBankDocumentFieldKey =
  | 'holderName'
  | 'documentNumber'
  | 'issuerName'
  | 'referenceOrIban'
  | 'period'
  | 'amount'
  | 'summary';

interface SummaryFieldConfig {
  key: AdditionalBankDocumentFieldKey;
  label: string;
}

const SUMMARY_FIELDS: Record<AdditionalBankDocumentType, SummaryFieldConfig[]> = {
  'bank-ownership-certificate': [
    { key: 'holderName', label: 'Titular' },
    { key: 'issuerName', label: 'Banco' },
    { key: 'referenceOrIban', label: 'IBAN / referencia' },
    { key: 'period', label: 'Fecha' },
  ],
  payroll: [
    { key: 'holderName', label: 'Titular' },
    { key: 'issuerName', label: 'Empresa' },
    { key: 'period', label: 'Periodo' },
    { key: 'amount', label: 'Importe neto' },
  ],
  'bank-statements': [
    { key: 'holderName', label: 'Titular' },
    { key: 'issuerName', label: 'Banco' },
    { key: 'referenceOrIban', label: 'IBAN / cuenta' },
    { key: 'period', label: 'Periodo' },
  ],
  'employment-contract': [
    { key: 'holderName', label: 'Titular' },
    { key: 'issuerName', label: 'Empresa' },
    { key: 'documentNumber', label: 'NIF / referencia' },
    { key: 'period', label: 'Inicio / periodo' },
  ],
  'tax-return': [
    { key: 'holderName', label: 'Titular' },
    { key: 'documentNumber', label: 'NIF / modelo' },
    { key: 'period', label: 'Ejercicio' },
    { key: 'amount', label: 'Resultado' },
  ],
  other: [
    { key: 'issuerName', label: 'Emisor' },
    { key: 'documentNumber', label: 'Referencia' },
    { key: 'period', label: 'Periodo' },
    { key: 'summary', label: 'Resumen' },
  ],
};

function getExtractionField(extraction: AIExtraction | null | undefined, key: AdditionalBankDocumentFieldKey): string | null {
  const value = extraction?.extractedData?.[key];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export async function buildValidatedAdditionalBankDocumentEntry(
  files: File[],
  type: AdditionalBankDocumentType,
  customLabel: string,
  entryId: string,
): Promise<AdditionalBankDocumentEntry> {
  // Keep the exported name stable for existing callers, but store additional
  // documents as-is so uploads stay fast and never depend on AI extraction.
  const storedFiles = await Promise.all(files.map((file) => createStoredDocumentFile(file)));

  return {
    id: entryId,
    type,
    customLabel: type === 'other' && customLabel.trim() ? customLabel.trim() : undefined,
    files: storedFiles,
    extraction: null,
    issue: null,
  };
}

export function getAdditionalBankDocumentSummaryRows(entry: AdditionalBankDocumentEntry): Array<{ label: string; value: string }> {
  const configuredRows = SUMMARY_FIELDS[entry.type]
    .map(({ key, label }) => {
      const value = getExtractionField(entry.extraction, key);
      return value ? { label, value } : null;
    })
    .filter((row): row is { label: string; value: string } => Boolean(row));

  if (configuredRows.length > 0) return configuredRows;

  const summary = getExtractionField(entry.extraction, 'summary');
  return summary ? [{ label: 'Resumen', value: summary }] : [];
}
