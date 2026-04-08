import type {
  AIExtraction,
  ProjectData,
  FormData as AppFormData,
  UploadedPhoto,
  StoredDocumentFile,
} from '@/types';

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

function appendStoredPdfs(fd: globalThis.FormData, fieldPrefix: string, pdfs: StoredDocumentFile[] | null | undefined): void {
  if (!Array.isArray(pdfs)) return;
  pdfs.forEach((pdf, i) => {
    if (!pdf?.dataUrl) return;
    const blob = dataUrlToBlob(pdf.dataUrl);
    if (!blob) return;
    const ext = pdf.mimeType === 'application/pdf' ? '.pdf' : '.jpg';
    fd.append(`${fieldPrefix}_${i}`, blob, pdf.filename || `${fieldPrefix}_${i}${ext}`);
  });
}

export async function preUploadAssets(
  code: string,
  formData: AppFormData
): Promise<{ success: boolean; savedKeys?: string[] }> {
  const fd = new globalThis.FormData();

  appendPhoto(fd, 'dniFront', formData.dni?.front?.photo);
  appendPhoto(fd, 'dniBack', formData.dni?.back?.photo);

  const ibiPages = formData.ibi?.pages?.length
    ? formData.ibi.pages
    : formData.ibi?.photo
      ? [formData.ibi.photo]
      : [];
  ibiPages.forEach((page, i) => {
    if (page) appendPhoto(fd, `ibi_${i}`, page as UploadedPhoto);
  });

  (formData.electricityBill?.pages ?? []).forEach((page, i) => {
    if (page?.photo) appendPhoto(fd, `electricity_${i}`, page.photo);
  });

  if (formData.energyCertificate?.renderedDocument?.imageDataUrl) {
    appendDataUrl(fd, 'energyCert', formData.energyCertificate.renderedDocument.imageDataUrl);
  }

  appendStoredPdfs(fd, 'dniOriginal', formData.dni?.originalPdfs);
  appendStoredPdfs(fd, 'ibiOriginal', formData.ibi?.originalPdfs);
  appendStoredPdfs(fd, 'electricityOriginal', formData.electricityBill?.originalPdfs);

  const hasAnyFile = Array.from(fd.entries()).length > 0;
  if (!hasAnyFile) return { success: true, savedKeys: [] };

  const res = await fetch(`${API_BASE}/project/${encodeURIComponent(code)}/upload-assets`, {
    method: 'POST',
    headers: {},
    body: fd,
    signal: AbortSignal.timeout(30000),
  });
  return res.json();
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
  return res.json();
}

export async function lookupByPhone(
  phone: string
): Promise<{ success: boolean; project?: ProjectData; error?: string; message?: string }> {
  const res = await fetch(`${API_BASE}/lookup/phone/${encodeURIComponent(phone)}`);
  return res.json();
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
  return res.json();
}

export async function dashboardLogin(password: string): Promise<{ success: boolean; token?: string; message?: string }> {
  const res = await fetch(`${API_BASE}/dashboard/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  return res.json();
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
  return res.json();
}

export async function fetchDashboardProject(
  code: string,
  token: string
): Promise<{ success: boolean; project?: ProjectData; error?: string; message?: string }> {
  const res = await fetch(`${API_BASE}/dashboard/project/${encodeURIComponent(code)}`, {
    headers: { 'x-dashboard-token': token },
  });
  return res.json();
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
  return res.json();
}

export async function submitForm(
  code: string,
  formData: AppFormData,
  source: string
): Promise<{ success: boolean; submissionId?: string; message?: string }> {
  const res = await fetch(`${API_BASE}/project/${encodeURIComponent(code)}/submit`, {
    method: 'POST',
    headers: projectHeaders(),
    body: JSON.stringify({ formData, source }),
    signal: AbortSignal.timeout(60000),
  });
  return res.json();
}

export async function extractDocument(
  imageBase64: string | string[],
  documentType: 'ibi' | 'electricity' | 'dniFront' | 'dniBack' | 'dniAuto' | 'contract'
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
  return res.json();
}

export async function extractDocumentBatch(
  imagesBase64: string[],
  documentType: 'electricity' | 'ibi' | 'contract'
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
  return res.json();
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
  return res.json();
}

export async function deleteProject(
  code: string,
  dashboardToken: string
): Promise<{ success: boolean; message?: string }> {
  const res = await fetch(`${API_BASE}/dashboard/project/${encodeURIComponent(code)}`, {
    method: 'DELETE',
    headers: { 'x-dashboard-token': dashboardToken },
  });
  return res.json();
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
  return res.json();
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
