import { createDocumentIssue } from '@/lib/documentIssues';
import {
  createStoredDocumentFile,
  expandUploadFiles,
  preparePhotoAssets,
  validatePhoto,
} from '@/lib/photoValidation';
import { extractDocument, extractDocumentBatch } from '@/services/api';
import type {
  AIExtraction,
  AdditionalBankDocumentEntry,
  AdditionalBankDocumentType,
  DocumentIssue,
} from '@/types';

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

interface PreparedValidationPage {
  base64: string;
}

class HardValidationError extends Error {}

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

async function prepareValidationPages(files: File[]): Promise<PreparedValidationPage[]> {
  const { files: expandedFiles, errors } = await expandUploadFiles(files);
  if (errors.length > 0) throw new Error(errors[0].message);
  if (expandedFiles.length === 0) throw new Error('No se encontró ninguna imagen utilizable.');

  const pages: PreparedValidationPage[] = [];
  for (const { file, skipBlurCheck } of expandedFiles) {
    const check = await validatePhoto(file, { skipBlurCheck });
    if (!check.valid) throw new Error(check.error || 'Archivo no válido.');
    const { aiBase64 } = await preparePhotoAssets(file);
    pages.push({ base64: aiBase64 });
  }
  return pages;
}

async function extractValidationResult(
  pages: PreparedValidationPage[],
  type: AdditionalBankDocumentType,
): Promise<{ extraction: AIExtraction | null; issue: DocumentIssue | null }> {
  try {
    const response = pages.length > 1
      ? await extractDocumentBatch(pages.map((page) => page.base64), type)
      : await extractDocument(pages[0].base64, type);

    if (!response.success || !response.extraction) {
      const reason = response.reason === 'wrong-document'
        || response.reason === 'unreadable'
        || response.reason === 'wrong-side'
        ? response.reason
        : response.isWrongDocument
          ? 'wrong-document'
          : response.isUnreadable
            ? 'unreadable'
            : 'temporary-error';
      if (reason !== 'temporary-error') {
        throw new HardValidationError(response.message || 'El archivo no pudo validarse automáticamente.');
      }
      return {
        extraction: null,
        issue: createDocumentIssue(
          'temporary-error',
          response.message || 'Hemos guardado el documento, pero la lectura automática no pudo completarse.'
        ),
      };
    }

    const extraction: AIExtraction = {
      ...response.extraction,
      needsManualReview: response.needsManualReview ?? response.extraction.needsManualReview ?? false,
      confirmedByUser: true,
    };

    return {
      extraction,
      issue: extraction.needsManualReview
        ? createDocumentIssue('manual-review', 'Hemos guardado el documento, pero conviene revisarlo antes de tramitarlo.')
        : null,
    };
  } catch (error) {
    if (error instanceof HardValidationError) throw error;
    return {
      extraction: null,
      issue: createDocumentIssue(
        'temporary-error',
        'Hemos guardado el documento, pero la lectura automática falló por conexión.'
      ),
    };
  }
}

export async function buildValidatedAdditionalBankDocumentEntry(
  files: File[],
  type: AdditionalBankDocumentType,
  customLabel: string,
  entryId: string,
): Promise<AdditionalBankDocumentEntry> {
  const pages = await prepareValidationPages(files);
  const storedFiles = await Promise.all(files.map((file) => createStoredDocumentFile(file)));

  let extraction: AIExtraction | null = null;
  let issue: DocumentIssue | null = null;
  try {
    const validated = await extractValidationResult(pages, type);
    extraction = validated.extraction;
    issue = validated.issue;
  } catch (error) {
    if (error instanceof Error) throw error;
  }

  return {
    id: entryId,
    type,
    customLabel: type === 'other' && customLabel.trim() ? customLabel.trim() : undefined,
    files: storedFiles,
    extraction,
    issue,
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
