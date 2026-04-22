type ApiImage = { name: string; data: string; mimeType: string };

// Module-level cache so pdfjs only initializes once per browser session.
// The first upload pays the dynamic-import cost (~500ms); all subsequent
// uploads skip it entirely.
let pdfjsCache: Promise<typeof import('pdfjs-dist')> | null = null;

function isPdfChunkImportError(error: Pick<Error, 'message' | 'name'>): boolean {
  const message = error.message.toLowerCase();
  return (
    message.includes('failed to fetch dynamically imported module')
    || message.includes('importing a module script failed')
    || message.includes('failed to load module script')
    || message.includes('load failed for the module')
    || message.includes('loading chunk')
    || message.includes('error loading')
    || message === 'load failed'
    || error.name === 'ChunkLoadError'
  );
}

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

function isLikelyNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes('failed to fetch')
    || message.includes('networkerror')
    || message.includes('network request failed')
    || message.includes('load failed')
  );
}

function normalizePdfConversionError(
  error: unknown,
  context?: { backendError?: unknown }
): Error {
  const fallbackMessage = 'No se pudo leer el PDF. Comprueba que no esté protegido con contraseña y vuelve a intentarlo.';
  const candidate = error instanceof Error ? error : new Error(String(error ?? fallbackMessage));
  const offlineLikeFailure = isOffline() || isLikelyNetworkError(context?.backendError);

  if (offlineLikeFailure && isPdfChunkImportError(candidate)) {
    return new Error('No se pudo convertir el PDF sin conexión. Vuelve a conectarte o sube fotos del documento.');
  }

  if (isPdfChunkImportError(candidate)) {
    return new Error('No se pudo cargar el lector de PDF. Recarga la página e inténtalo de nuevo.');
  }

  if (
    candidate.message.startsWith('No se pudo ')
    || candidate.message.startsWith('Error al convertir')
  ) {
    return candidate;
  }

  return new Error(fallbackMessage);
}

function getPdfjs(): Promise<typeof import('pdfjs-dist')> {
  if (!pdfjsCache) {
    pdfjsCache = import('pdfjs-dist')
      .then((pdfjs) => {
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url,
        ).toString();
        return pdfjs;
      })
      .catch((error) => {
        pdfjsCache = null;
        throw error;
      });
  }
  return pdfjsCache;
}

/**
 * Call this as early as possible (e.g. on component mount) to pre-load the
 * pdfjs-dist module in the background before the user picks a file.
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export function preWarmPdfjs(): void {
  getPdfjs().catch(() => {});
}

async function convertViaBackend(file: File): Promise<File[]> {
  const formData = new FormData();
  formData.append('file', file, file.name);

  const res = await fetch('/api/pdf-to-images', {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    let message = 'Error al convertir el PDF.';
    try {
      const json = await res.json();
      if (json.message) message = json.message;
    } catch {
      // ignore parse error
    }
    throw new Error(message);
  }

  const json = await res.json();
  if (!json.success || !Array.isArray(json.images)) {
    throw new Error(json.message || 'El servicio de conversión no devolvió imágenes.');
  }

  return json.images.map((img: ApiImage) => {
    const byteString = atob(img.data);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    const blob = new Blob([ab], { type: img.mimeType });
    return new File([blob], img.name, { type: img.mimeType });
  });
}

async function blobFromCanvas(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('No se pudo renderizar una página del PDF.'));
        return;
      }
      resolve(blob);
    }, 'image/png', 0.95);
  });
}

async function convertInBrowser(file: File): Promise<File[]> {
  const pdfjs = await getPdfjs();

  const bytes = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjs.getDocument({ data: bytes });
  const pdf = await loadingTask.promise;
  const pages: File[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    // scale: 2 → enough resolution for AI vision without going to 4× pixel count
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No se pudo inicializar el render de PDF.');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);

    await page.render({ canvasContext: context, canvas, viewport }).promise;
    const blob = await blobFromCanvas(canvas);
    pages.push(new File([blob], `${file.name.replace(/\.pdf$/i, '')}-page-${pageNumber}.png`, { type: 'image/png' }));
  }

  return pages;
}

export async function pdfToImageFiles(file: File): Promise<File[]> {
  if (isOffline()) {
    try {
      return await convertInBrowser(file);
    } catch (error) {
      throw normalizePdfConversionError(error);
    }
  }

  try {
    return await convertViaBackend(file);
  } catch (backendError) {
    try {
      return await convertInBrowser(file);
    } catch (browserError) {
      console.error('PDF conversion fallback failed:', browserError, 'backend error:', backendError);
      throw normalizePdfConversionError(browserError, { backendError });
    }
  }
}

export const __pdfToImagesTestUtils = {
  isPdfChunkImportError,
  normalizePdfConversionError,
};
