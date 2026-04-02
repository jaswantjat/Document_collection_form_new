import { useEffect, useRef } from 'react';

const API_BASE = '/api';
const KEEPALIVE_LIMIT_BYTES = 60 * 1024; // 64KB browser limit, use 60KB to be safe

function buildSavePayload(
  projectCode: string,
  formData: unknown,
  projectToken?: string | null
): { url: string; body: string; token?: string } | null {
  const cleanData = JSON.parse(JSON.stringify(formData, (_key, value) => {
    if (value instanceof File) return undefined;
    return value;
  }));

  if (cleanData?.representation?.renderedDocuments) {
    for (const asset of Object.values(cleanData.representation.renderedDocuments as Record<string, { imageDataUrl?: string }>)) {
      if (asset && typeof asset === 'object' && 'imageDataUrl' in asset) {
        delete asset.imageDataUrl;
      }
    }
  }

  const body = JSON.stringify({ formData: cleanData });

  // Skip if payload exceeds keepalive limit — localStorage backup will handle recovery.
  // Never send a partially stripped payload that could corrupt photo data on the server.
  if (new Blob([body]).size > KEEPALIVE_LIMIT_BYTES) {
    return null;
  }

  return {
    url: `${API_BASE}/project/${encodeURIComponent(projectCode)}/save`,
    body,
    token: projectToken ?? undefined,
  };
}

export function useBeforeUnloadSave(
  projectCode: string | null,
  formData: unknown,
  projectToken?: string | null
): void {
  const formDataRef = useRef(formData);
  const projectTokenRef = useRef(projectToken);

  useEffect(() => {
    formDataRef.current = formData;
  }, [formData]);

  useEffect(() => {
    projectTokenRef.current = projectToken;
  }, [projectToken]);

  useEffect(() => {
    if (!projectCode) return;

    const handleBeforeUnload = () => {
      const payload = buildSavePayload(projectCode, formDataRef.current, projectTokenRef.current);
      if (!payload) return; // Too large — localStorage backup covers this case

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (payload.token) headers['x-project-token'] = payload.token;

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
  }, [projectCode]);
}
