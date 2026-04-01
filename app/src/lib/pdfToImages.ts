type ApiImage = { name: string; data: string; mimeType: string };

// Module-level cache so pdfjs only initializes once per browser session.
// The first upload pays the dynamic-import cost (~500ms); all subsequent
// uploads skip it entirely.
let pdfjsCache: Promise<typeof import('pdfjs-dist')> | null = null;

function getPdfjs(): Promise<typeof import('pdfjs-dist')> {
  if (!pdfjsCache) {
    pdfjsCache = import('pdfjs-dist').then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url,
      ).toString();
      return pdfjs;
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
  try {
    return await convertViaBackend(file);
  } catch {
    return await convertInBrowser(file);
  }
}
