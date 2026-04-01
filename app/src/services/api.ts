import type { ProjectData } from '@/types';

const API_BASE = '/api';

function projectHeaders(token?: string | null): HeadersInit {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['x-project-token'] = token;
  return headers;
}

export async function fetchProject(
  code: string,
  token?: string | null,
  options?: { signal?: AbortSignal }
): Promise<{ success: boolean; project?: ProjectData; error?: string }> {
  const res = await fetch(`${API_BASE}/project/${encodeURIComponent(code)}`, {
    headers: token ? { 'x-project-token': token } : {},
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

export async function fetchDashboard(token: string): Promise<{ success: boolean; projects?: any[]; error?: string }> {
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
  formData: any,
  token?: string | null
): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/project/${encodeURIComponent(code)}/save`, {
    method: 'POST',
    headers: projectHeaders(token),
    body: JSON.stringify({ formData }),
  });
  return res.json();
}

export async function submitForm(
  code: string,
  formData: any,
  source: string,
  token?: string | null
): Promise<{ success: boolean; submissionId?: string; message?: string }> {
  const res = await fetch(`${API_BASE}/project/${encodeURIComponent(code)}/submit`, {
    method: 'POST',
    headers: projectHeaders(token),
    body: JSON.stringify({ formData, source }),
    signal: AbortSignal.timeout(60000),
  });
  return res.json();
}

export async function extractDocument(
  imageBase64: string | string[],
  documentType: 'ibi' | 'electricity' | 'dniFront' | 'dniBack' | 'dniAuto' | 'contract'
): Promise<{
  success: boolean;
  side?: 'front' | 'back';
  extraction?: any;
  needsManualReview?: boolean;
  isWrongDocument?: boolean;
  isUnreadable?: boolean;
  reason?: 'unreadable' | 'wrong-document' | 'wrong-side' | 'temporary-error';
  message?: string;
}> {
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
  documentType: 'electricity' | 'ibi'
): Promise<{
  success: boolean;
  extraction?: any;
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

export async function adminUpdateFormData(
  code: string,
  formDataPatch: any,
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
