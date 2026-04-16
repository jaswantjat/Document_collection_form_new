import { buildValidatedAdditionalBankDocumentEntry } from '@/lib/additionalBankDocumentProcessing';
import {
  createAdditionalBankDocumentId,
  normalizeAdditionalBankDocuments,
  withAdditionalBankDocumentAssetKeys,
} from '@/lib/additionalBankDocuments';
import type { FormData as AppFormData } from '@/types';

export async function buildDashboardAdditionalBankDocumentPatch(
  existingDocuments: unknown,
  files: File[],
): Promise<Pick<AppFormData, 'additionalBankDocuments'>> {
  const nextEntries = await Promise.all(
    files.map((file) => buildValidatedAdditionalBankDocumentEntry(
      [file],
      'other',
      '',
      createAdditionalBankDocumentId(),
    )),
  );

  return {
    additionalBankDocuments: withAdditionalBankDocumentAssetKeys([
      ...normalizeAdditionalBankDocuments(existingDocuments),
      ...nextEntries,
    ]),
  };
}
