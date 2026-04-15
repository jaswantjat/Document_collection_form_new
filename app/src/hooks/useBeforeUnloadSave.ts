import { useEffect, useRef } from 'react';

const API_BASE = '/api';
const KEEPALIVE_LIMIT_BYTES = 60 * 1024; // 64KB browser limit, use 60KB to be safe

function buildSavePayload(
  projectCode: string,
  formData: unknown,
  source?: 'customer' | 'assessor',
  token?: string
): { url: string; body: string } | null {
  // Strip the same binary/large fields as the regular auto-save so the payload
  // stays small enough to fit within the 60 KB keepalive limit.
  const cleanData = JSON.parse(JSON.stringify(formData, (_key, value) => {
    if (value instanceof File) return undefined;
    if (_key === 'preview') return undefined;      // UploadedPhoto base64 preview
    if (_key === 'dataUrl') return undefined;      // StoredDocumentFile PDF binary
    if (_key === 'imageDataUrl') return undefined; // RenderedDocumentAsset image
    return value;
  }));

  const body = JSON.stringify({ formData: cleanData, source });

  // Skip if payload exceeds keepalive limit — localStorage backup will handle recovery.
  // Never send a partially stripped payload that could corrupt photo data on the server.
  if (new Blob([body]).size > KEEPALIVE_LIMIT_BYTES) {
    return null;
  }

  return {
    url: `${API_BASE}/project/${encodeURIComponent(projectCode)}/save${token ? `?token=${encodeURIComponent(token)}` : ''}`,
    body,
  };
}

export function useBeforeUnloadSave(
  projectCode: string | null,
  formData: unknown,
  source?: 'customer' | 'assessor',
  token?: string
): void {
  const formDataRef = useRef(formData);

  useEffect(() => {
    formDataRef.current = formData;
  }, [formData]);

  useEffect(() => {
    if (!projectCode) return;

    const handleBeforeUnload = () => {
      const payload = buildSavePayload(projectCode, formDataRef.current, source, token);
      if (!payload) return; // Too large — localStorage backup covers this case

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['x-project-token'] = token;

      try {
        fetch(payload.url, {
          method: 'POST',
          headers,
          body: payload.body,
          keepalive: true,
        });
      } catch {
        // Best effort — can't do much at unload time
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [projectCode, token]);
}
