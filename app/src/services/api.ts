import type {
  AIExtraction,
  ProjectData,
  FormData as AppFormData,
  AdditionalBankDocumentType,
  UploadedPhoto,
  StoredDocumentFile,
} from '@/types';
import { withAdditionalBankDocumentAssetKeys } from '@/lib/additionalBankDocuments';
import { getPropertyPhotoGroups, type PropertyPhotoFormData } from '@/lib/propertyPhotoGroups';

const API_BASE = '/api';

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends Array<infer U>
    ? Array<DeepPartial<U>>
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};

type DashboardProjectRecord = ProjectData & {
  summary?: Record<string, unknown>;
  submissionCount?: number;
};

interface ExtractDocumentResponse {
  success: boolean;
  side?: 'front' | 'back';
  extraction?: AIExtraction;
  needsManualReview?: boolean;
  isWrongDocument?: boolean;
  isUnreadable?: boolean;
  reason?: 'unreadable' | 'wrong-document' | 'wrong-side' | 'temporary-error';
  message?: string;
}

interface ApiResponseShape {
  success?: boolean;
  message?: string;
  error?: string;
}

interface UploadAssetDescriptor {
  fieldName: string;
  fingerprint: string;
  append: (fd: globalThis.FormData) => boolean;
}

const assetFingerprintCache = new Map<string, Map<string, string>>();

function dataUrlToBlob(dataUrl: string): Blob | null {
  if (!dataUrl || !dataUrl.startsWith('data:')) return null;
  const arr = dataUrl.split(',');
  const mimeMatch = arr[0].match(/:(.*?);/);
  if (!mimeMatch) return null;
  const mime = mimeMatch[1];
  try {
    const bstr = atob(arr[1]);
    const u8arr = new Uint8Array(bstr.length);
    for (let i = 0; i < bstr.length; i++) u8arr[i] = bstr.charCodeAt(i);
    return new Blob([u8arr], { type: mime });
  } catch {
    return null;
  }
}

function appendPhoto(fd: globalThis.FormData, fieldName: string, photo: UploadedPhoto | null | undefined): boolean {
  if (!photo?.preview) return false;
  const blob = dataUrlToBlob(photo.preview);
  if (!blob) return false;
  const ext = photo.preview.includes('image/png') ? '.png' : '.jpg';
  fd.append(fieldName, blob, `${fieldName}${ext}`);
  return true;
}

function appendDataUrl(fd: globalThis.FormData, fieldName: string, dataUrl: string | null | undefined): boolean {
  if (!dataUrl) return false;
  const blob = dataUrlToBlob(dataUrl);
  if (!blob) return false;
  const ext = dataUrl.startsWith('data:image/png') ? '.png' : dataUrl.startsWith('data:application/pdf') ? '.pdf' : '.jpg';
  fd.append(fieldName, blob, `${fieldName}${ext}`);
  return true;
}

function appendStoredDocument(fd: globalThis.FormData, fieldName: string, file: StoredDocumentFile): boolean {
  if (!file?.dataUrl) return false;
  const blob = dataUrlToBlob(file.dataUrl);
  if (!blob) return false;
  const ext = file.mimeType === 'application/pdf' ? '.pdf' : file.mimeType === 'image/png' ? '.png' : '.jpg';
  fd.append(fieldName, blob, file.filename || `${fieldName}${ext}`);
  return true;
}

function dataUrlFingerprint(dataUrl: string): string {
  return `${dataUrl.length}:${dataUrl.slice(0, 48)}:${dataUrl.slice(-48)}`;
}

function pushPhotoDescriptor(
  descriptors: UploadAssetDescriptor[],
  fieldName: string,
  photo: UploadedPhoto | null | undefined
): void {
  if (!photo?.preview) return;
  descriptors.push({
    fieldName,
    fingerprint: `photo:${photo.id}:${photo.timestamp}:${photo.sizeBytes}:${dataUrlFingerprint(photo.preview)}`,
    append: (fd) => appendPhoto(fd, fieldName, photo),
  });
}

function pushDataUrlDescriptor(
  descriptors: UploadAssetDescriptor[],
  fieldName: string,
  dataUrl: string | null | undefined,
  versionHint: string
): void {
  if (!dataUrl) return;
  descriptors.push({
    fieldName,
    fingerprint: `${versionHint}:${dataUrlFingerprint(dataUrl)}`,
    append: (fd) => appendDataUrl(fd, fieldName, dataUrl),
  });
}

function pushStoredDocumentDescriptors(
  descriptors: UploadAssetDescriptor[],
  fieldPrefix: string,
  files: StoredDocumentFile[] | null | undefined
): void {
  if (!Array.isArray(files)) return;
  files.forEach((file, i) => {
    if (!file) return;
    const fieldName = `${fieldPrefix}_${i}`;
    const dataFingerprint = file?.dataUrl ? dataUrlFingerprint(file.dataUrl) : 'asset-only';
    descriptors.push({
      fieldName,
      fingerprint: `file:${file?.id}:${file?.filename}:${file?.mimeType}:${file?.sizeBytes}:${file?.timestamp}:${dataFingerprint}`,
      append: (fd) => appendStoredDocument(fd, fieldName, file),
    });
  });
}

function buildAssetUploadDescriptors(formData: AppFormData): UploadAssetDescriptor[] {
  const descriptors: UploadAssetDescriptor[] = [];

  pushPhotoDescriptor(descriptors, 'dniFront', formData.dni?.front?.photo);
  pushPhotoDescriptor(descriptors, 'dniBack', formData.dni?.back?.photo);

  const ibiPages = formData.ibi?.pages?.length
    ? formData.ibi.pages
    : formData.ibi?.photo
      ? [formData.ibi.photo]
      : [];
  ibiPages.forEach((page, i) => pushPhotoDescriptor(descriptors, `ibi_${i}`, page as UploadedPhoto));

  (formData.electricityBill?.pages ?? []).forEach((page, i) => {
    pushPhotoDescriptor(descriptors, `electricity_${i}`, page?.photo);
  });

  getPropertyPhotoGroups(formData as AppFormData & PropertyPhotoFormData).forEach((group) => {
    group.photos.forEach((photo, i) => {
      pushPhotoDescriptor(descriptors, `${group.key}_${i}`, photo);
    });
  });

  if (formData.energyCertificate?.renderedDocument?.imageDataUrl) {
    const rendered = formData.energyCertificate.renderedDocument;
    pushDataUrlDescriptor(
      descriptors,
      'energyCert',
      rendered.imageDataUrl,
      `energy:${rendered.generatedAt}:${rendered.templateVersion}`
    );
  }

  pushStoredDocumentDescriptors(descriptors, 'dniOriginal', formData.dni?.originalPdfs);
  pushStoredDocumentDescriptors(descriptors, 'ibiOriginal', formData.ibi?.originalPdfs);
  pushStoredDocumentDescriptors(descriptors, 'electricityOriginal', formData.electricityBill?.originalPdfs);

  withAdditionalBankDocumentAssetKeys(formData.additionalBankDocuments).forEach((entry) => {
    entry.files.forEach((file) => {
      if (!file.assetKey) return;
      descriptors.push({
        fieldName: file.assetKey,
        fingerprint: `bank:${entry.id}:${entry.type}:${entry.customLabel ?? ''}:${file.id}:${file.filename}:${file.mimeType}:${file.sizeBytes}:${file.timestamp}:${file.dataUrl ? dataUrlFingerprint(file.dataUrl) : 'asset-only'}`,
        append: (fd) => appendStoredDocument(fd, file.assetKey!, file),
      });
    });
  });

  return descriptors;
}

function sameAssetKeySet(existing: Iterable<string>, next: Iterable<string>): boolean {
  const currentKeys = [...existing].sort();
  const nextKeys = [...next].sort();
  if (currentKeys.length !== nextKeys.length) return false;
  return currentKeys.every((key, index) => key === nextKeys[index]);
}

async function readJsonResponse<T>(res: Response): Promise<T> {
  try {
    return await res.json() as T;
  } catch {
    throw new Error('Respuesta inválida del servidor.');
  }
}

async function readJsonOrThrow<T extends ApiResponseShape>(res: Response, fallbackMessage: string): Promise<T> {
  const body = await readJsonResponse<T>(res);
  if (!res.ok || body.success === false) {
    throw new Error(body.message || body.error || fallbackMessage);
  }
  return body;
}

export async function preUploadAssets(
  code: string,
  formData: AppFormData
): Promise<{ success: boolean; savedKeys?: string[] }> {
  const descriptors = buildAssetUploadDescriptors(formData);
  const activeKeys = descriptors.map((descriptor) => descriptor.fieldName);
  const nextFingerprintMap = new Map(descriptors.map((descriptor) => [descriptor.fieldName, descriptor.fingerprint]));
  const previousFingerprintMap = assetFingerprintCache.get(code);
  const changedDescriptors = descriptors.filter((descriptor) => previousFingerprintMap?.get(descriptor.fieldName) !== descriptor.fingerprint);
  const activeKeysChanged = !sameAssetKeySet(previousFingerprintMap?.keys() ?? [], activeKeys);

  if (changedDescriptors.length === 0 && !activeKeysChanged) {
    return { success: true, savedKeys: activeKeys };
  }

  if (descriptors.length === 0 && !previousFingerprintMap) {
    return { success: true, savedKeys: [] };
  }

  const fd = new globalThis.FormData();
  fd.append('activeKeys', JSON.stringify(activeKeys));
  changedDescriptors.forEach((descriptor) => {
    descriptor.append(fd);
  });

  const res = await fetch(`${API_BASE}/project/${encodeURIComponent(code)}/upload-assets`, {
    method: 'POST',
    headers: {},
    body: fd,
    signal: AbortSignal.timeout(30000),
  });
  const body = await readJsonOrThrow<{ success: boolean; savedKeys?: string[] }>(
    res,
    'No se pudieron subir los archivos.'
  );

  if (nextFingerprintMap.size === 0) assetFingerprintCache.delete(code);
  else assetFingerprintCache.set(code, nextFingerprintMap);

  return body;
}

function projectHeaders(): HeadersInit {
  return { 'Content-Type': 'application/json' };
}

export async function fetchProject(
  code: string,
  options?: { signal?: AbortSignal }
): Promise<{ success: boolean; project?: ProjectData; error?: string }> {
  const res = await fetch(`${API_BASE}/project/${encodeURIComponent(code)}`, {
    headers: {},
    signal: options?.signal,
  });
  return readJsonResponse(res);
}

export async function lookupByPhone(
  phone: string
): Promise<{ success: boolean; project?: ProjectData; error?: string; message?: string }> {
  const res = await fetch(`${API_BASE}/lookup/phone/${encodeURIComponent(phone)}`);
  return readJsonResponse(res);
}

export async function createProject(data: {
  phone: string;
  customerName?: string;
  email?: string;
  productType?: string;
  assessor?: string;
  assessorId?: string;
}): Promise<{ success: boolean; project?: ProjectData; existing?: boolean; message?: string }> {
  const res = await fetch(`${API_BASE}/project/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return readJsonResponse(res);
}

export async function dashboardLogin(password: string): Promise<{ success: boolean; token?: string; message?: string }> {
  const res = await fetch(`${API_BASE}/dashboard/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  return readJsonResponse(res);
}

export async function dashboardLogout(token: string): Promise<void> {
  await fetch(`${API_BASE}/dashboard/logout`, {
    method: 'POST',
    headers: { 'x-dashboard-token': token },
  });
}

export async function fetchDashboard(token: string): Promise<{ success: boolean; projects?: DashboardProjectRecord[]; error?: string }> {
  const res = await fetch(`${API_BASE}/dashboard`, {
    headers: { 'x-dashboard-token': token },
  });
  return readJsonResponse(res);
}

export async function fetchDashboardProject(
  code: string,
  token: string
): Promise<{ success: boolean; project?: ProjectData; error?: string; message?: string }> {
  const res = await fetch(`${API_BASE}/dashboard/project/${encodeURIComponent(code)}`, {
    headers: { 'x-dashboard-token': token },
  });
  return readJsonResponse(res);
}

export async function saveProgress(
  code: string,
  formData: AppFormData,
  source?: 'customer' | 'assessor'
): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/project/${encodeURIComponent(code)}/save`, {
    method: 'POST',
    headers: projectHeaders(),
    body: JSON.stringify({ formData, source }),
    signal: AbortSignal.timeout(10000),
  });
  return readJsonOrThrow(res, 'No se pudo guardar el progreso.');
}

export async function submitForm(
  code: string,
  formData: AppFormData,
  source: string,
  attemptId: string
): Promise<{ success: boolean; submissionId?: string; message?: string }> {
  const res = await fetch(`${API_BASE}/project/${encodeURIComponent(code)}/submit`, {
    method: 'POST',
    headers: projectHeaders(),
    body: JSON.stringify({ formData, source, attemptId }),
    signal: AbortSignal.timeout(60000),
  });
  return readJsonOrThrow(res, 'No se pudo enviar la documentación.');
}

export async function extractDocument(
  imageBase64: string | string[],
  documentType: 'ibi' | 'electricity' | 'dniFront' | 'dniBack' | 'dniAuto' | 'contract' | AdditionalBankDocumentType
): Promise<ExtractDocumentResponse> {
  const body = Array.isArray(imageBase64)
    ? { imagesBase64: imageBase64, documentType }
    : { imageBase64, documentType };
  const res = await fetch(`${API_BASE}/extract`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90000),
  });
  return readJsonResponse(res);
}

export async function extractDocumentBatch(
  imagesBase64: string[],
  documentType: 'electricity' | 'ibi' | 'contract' | AdditionalBankDocumentType
): Promise<{
  success: boolean;
  extraction?: AIExtraction;
  needsManualReview?: boolean;
  isWrongDocument?: boolean;
  isUnreadable?: boolean;
  reason?: string;
  message?: string;
}> {
  const res = await fetch(`${API_BASE}/extract-batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imagesBase64, documentType }),
    signal: AbortSignal.timeout(90000),
  });
  return readJsonResponse(res);
}

export async function extractDniBatch(
  imagesBase64: string[]
): Promise<{
  success: boolean;
  results?: Array<{
    side?: 'front' | 'back' | null;
    extraction?: unknown;
    needsManualReview?: boolean;
    isWrongDocument?: boolean;
    isUnreadable?: boolean;
    reason?: 'unreadable' | 'wrong-document' | 'wrong-side' | 'temporary-error';
    message?: string;
  }>;
  message?: string;
}> {
  const res = await fetch(`${API_BASE}/extract-dni-batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imagesBase64 }),
    signal: AbortSignal.timeout(90000),
  });
  return readJsonResponse(res);
}

export async function deleteProject(
  code: string,
  dashboardToken: string
): Promise<{ success: boolean; message?: string }> {
  const res = await fetch(`${API_BASE}/dashboard/project/${encodeURIComponent(code)}`, {
    method: 'DELETE',
    headers: { 'x-dashboard-token': dashboardToken },
  });
  return readJsonResponse(res);
}

export async function adminUpdateFormData(
  code: string,
  formDataPatch: DeepPartial<AppFormData>,
  dashboardToken: string
): Promise<{ success: boolean; message?: string }> {
  const res = await fetch(`${API_BASE}/project/${encodeURIComponent(code)}/admin-formdata`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-dashboard-token': dashboardToken },
    body: JSON.stringify({ formDataPatch }),
  });
  return readJsonResponse(res);
}

export async function generateImagePDF(imageDataUrl: string, filename?: string): Promise<Blob> {
  const res = await fetch(`${API_BASE}/generate-image-pdf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageDataUrl, filename }),
  });
  if (!res.ok) throw new Error('Failed to generate PDF from image');
  return res.blob();
}
