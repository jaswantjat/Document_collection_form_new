import type {
  AIExtraction,
  DNIData,
  ElectricityBillData,
  StoredDocumentFile,
} from '@/types';
import { normalizeSingleDniExtractionResponse, type DniBatchLikeResponse } from '@/lib/dniExtraction';
import { extractDniBatch, extractDocument } from '@/services/api';

export const IBI_FIELDS = [
  { key: 'referenciaCatastral', label: 'Ref. Catastral' },
  { key: 'titular', label: 'Titular' },
  { key: 'titularNif', label: 'NIF titular' },
  { key: 'direccion', label: 'Dirección' },
  { key: 'codigoPostal', label: 'Código postal' },
  { key: 'municipio', label: 'Municipio' },
  { key: 'provincia', label: 'Provincia' },
  { key: 'ejercicio', label: 'Ejercicio' },
  { key: 'importe', label: 'Importe' },
];

export const ELECTRICITY_FIELDS = [
  { key: 'titular', label: 'Titular' },
  { key: 'nifTitular', label: 'NIF titular' },
  { key: 'cups', label: 'CUPS' },
  { key: 'potenciaContratada', label: 'Potencia (kW)' },
  { key: 'tipoFase', label: 'Instalación' },
  { key: 'tarifaAcceso', label: 'Tarifa' },
  { key: 'direccionSuministro', label: 'Dirección' },
  { key: 'municipio', label: 'Municipio' },
  { key: 'provincia', label: 'Provincia' },
  { key: 'codigoPostal', label: 'C. Postal' },
  { key: 'fechaFactura', label: 'Fecha factura' },
  { key: 'periodoFacturacion', label: 'Periodo' },
  { key: 'importe', label: 'Importe' },
];

export interface PendingItem {
  id: string;
  file: File;
  preview: string | null;
  status: 'validating' | 'extracting' | 'failed';
  error?: string;
  reason?: 'blurry' | 'other';
}

export interface PreparedDniItem {
  id: string;
  file: File;
  preview: string;
  base64: string;
  width: number | undefined;
  height: number | undefined;
}

export function genId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function buildStoredDocumentFromPreparedItem(prepared: PreparedDniItem): StoredDocumentFile {
  const baseName = prepared.file.name.replace(/\.[^.]+$/, '') || 'documento-identidad';
  return {
    id: genId(),
    filename: `${baseName}.jpg`,
    mimeType: 'image/jpeg',
    dataUrl: prepared.preview,
    timestamp: Date.now(),
    sizeBytes: prepared.file.size,
  };
}

export function getStoredIdentityFilesMessage(files: StoredDocumentFile[]): string {
  const count = files.length;
  return `Archivos del documento guardados: ${count} archivo${count !== 1 ? 's' : ''}.`;
}

export async function extractPreparedDniFiles(
  preparedFiles: PreparedDniItem[]
): Promise<DniBatchLikeResponse> {
  if (preparedFiles.length !== 1) {
    const response = await extractDniBatch(preparedFiles.map((item) => item.base64));
    return {
      success: response.success,
      message: response.message,
      results: response.results?.map((result) => ({
        ...result,
        extraction: result.extraction as AIExtraction | undefined,
      })),
    };
  }

  const response = await extractDocument(preparedFiles[0].base64, 'dniAuto');
  return normalizeSingleDniExtractionResponse(response);
}

function normalizeNameChunk(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z]/g, '');
}

export function computeValidationWarnings(
  dni: DNIData,
  electricityBill: ElectricityBillData
): string[] {
  const warnings: string[] = [];
  const dniName: string | null = dni.front.extraction?.extractedData?.fullName ?? null;
  const electricityOwner: string | null =
    electricityBill.pages[0]?.extraction?.extractedData?.titular ?? null;

  if (!dniName || !electricityOwner) return warnings;

  const dniWords = dniName.split(/\s+/).filter((word) => word.length > 2).map(normalizeNameChunk);
  const electricityWords = electricityOwner
    .split(/\s+/)
    .filter((word) => word.length > 2)
    .map(normalizeNameChunk);
  const hasCommonWord = dniWords.some((word) => electricityWords.includes(word));

  if (!hasCommonWord) {
    warnings.push(
      `El nombre del DNI («${dniName}») no coincide con el titular de la factura de luz («${electricityOwner}»). Comprueba que el documento pertenezca al mismo titular.`
    );
  }

  return warnings;
}
