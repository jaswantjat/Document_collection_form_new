import type { PhotoValidationResult, StoredDocumentFile, UploadedPhoto } from '@/types';
import { pdfToImageFiles } from '@/lib/pdfToImages';

const MAX_SIZE_BYTES = 20 * 1024 * 1024; // 20MB
// Laplacian variance threshold — below this = blurry and rejected.
// Raised to 150 to better match government portal quality requirements.
// Most sharp phone photos score 400+; blurry ones score below 100.
const BLUR_THRESHOLD = 150;

export async function validatePhoto(file: File, options?: { skipBlurCheck?: boolean }): Promise<PhotoValidationResult> {
  if (file.size > MAX_SIZE_BYTES) {
    return {
      valid: false,
      reason: 'too-large',
      error: `El archivo es demasiado grande (${(file.size / 1024 / 1024).toFixed(1)} MB). Máximo 20 MB.`,
      sizeBytes: file.size,
    };
  }

  if (!file.type.startsWith('image/')) {
    // PDFs pass through without blur check
    return { valid: true, sizeBytes: file.size };
  }

  try {
    const { width, height } = await getImageDimensions(file);

    // Minimum resolution check
    if (width < 600 || height < 400) {
      return {
        valid: false,
        reason: 'too-small',
        error: 'La imagen es demasiado pequeña. Acércate más al documento o usa una cámara de mayor resolución.',
        sizeBytes: file.size, width, height,
      };
    }

    // Blur check — hard reject (skip for PDF-converted images which are always sharp)
    if (!options?.skipBlurCheck) {
      const blurScore = await measureBlur(file);
      if (blurScore < BLUR_THRESHOLD) {
        return {
          valid: false,
          reason: 'blurry',
          blurScore,
          error: 'La imagen está desenfocada.',
          sizeBytes: file.size, width, height,
        };
      }
      return { valid: true, width, height, sizeBytes: file.size, blurScore };
    }

    return { valid: true, width, height, sizeBytes: file.size };
  } catch {
    return { valid: true, sizeBytes: file.size };
  }
}

export interface ExpandedUploadFile {
  file: File;
  skipBlurCheck: boolean;
}

export interface ExpandedUploadError {
  file: File;
  message: string;
}

export async function expandUploadFiles(files: File[]): Promise<{
  files: ExpandedUploadFile[];
  originalPdfs: StoredDocumentFile[];
  errors: ExpandedUploadError[];
}> {
  const expandedFiles: ExpandedUploadFile[] = [];
  const originalPdfs: StoredDocumentFile[] = [];
  const errors: ExpandedUploadError[] = [];

  for (const file of files) {
    if (file.type !== 'application/pdf') {
      expandedFiles.push({ file, skipBlurCheck: false });
      continue;
    }

    try {
      const pages = await pdfToImageFiles(file);
      if (pages.length === 0) {
        errors.push({
          file,
          message: `El PDF "${file.name}" no contenía páginas utilizables.`,
        });
        continue;
      }

      originalPdfs.push(await createStoredDocumentFile(file));

      expandedFiles.push(
        ...pages.map((page) => ({
          file: page,
          skipBlurCheck: true,
        }))
      );
    } catch (error) {
      const message = error instanceof Error && error.message
        ? error.message
        : `No se pudo leer el PDF "${file.name}".`;
      errors.push({ file, message });
    }
  }

  return { files: expandedFiles, originalPdfs, errors };
}

function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve({ width: img.naturalWidth, height: img.naturalHeight }); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load image')); };
    img.src = url;
  });
}

// Returns the Laplacian variance — higher = sharper image
async function measureBlur(file: File): Promise<number> {
  try {
    const bitmap = await createImageBitmap(file);
    // Sample at reasonable size (larger sample = more reliable)
    const W = Math.min(bitmap.width, 800);
    const H = Math.min(bitmap.height, 600);
    const canvas = new OffscreenCanvas(W, H);
    const ctx = canvas.getContext('2d');
    if (!ctx) return 9999; // can't check — allow

    ctx.drawImage(bitmap, 0, 0, W, H);
    const { data } = ctx.getImageData(0, 0, W, H);

    // Convert to grayscale
    const gray = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) {
      const p = i * 4;
      gray[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
    }

    // Laplacian kernel: variance measures edge sharpness
    let sum = 0;
    let sumSq = 0;
    let n = 0;
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const v =
          -gray[(y - 1) * W + x] +
          -gray[y * W + (x - 1)] +
          4 * gray[y * W + x] +
          -gray[y * W + (x + 1)] +
          -gray[(y + 1) * W + x];
        sum += v;
        sumSq += v * v;
        n++;
      }
    }
    const mean = sum / n;
    return sumSq / n - mean * mean; // variance
  } catch {
    return 9999; // on error, allow
  }
}

export function createUploadedPhoto(file: File, preview: string, width?: number, height?: number): UploadedPhoto {
  return {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    file, preview,
    timestamp: Date.now(),
    sizeBytes: file.size,
    width, height,
  };
}

export async function createStoredDocumentFile(file: File): Promise<StoredDocumentFile> {
  return {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    filename: file.name,
    mimeType: file.type || 'application/octet-stream',
    dataUrl: await fileToBase64(file),
    timestamp: Date.now(),
    sizeBytes: file.size,
  };
}

export function mergeStoredDocumentFiles(
  existing: StoredDocumentFile[] | null | undefined,
  incoming: StoredDocumentFile[] | null | undefined
): StoredDocumentFile[] {
  const merged = [...(existing || []), ...(incoming || [])];
  const seen = new Set<string>();

  return merged.filter((file) => {
    const key = `${file.filename}:${file.sizeBytes}:${file.dataUrl}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function fileToPreview(file: File): Promise<string> {
  return fileToBase64(file);
}

/**
 * If the image is significantly wider than tall (both sides of a DNI scanned
 * side-by-side on one page), or significantly taller than wide (vertical scan),
 * split it into two halves.
 * Returns an array of 2 files when split, or the original
 * single-element array when no split is needed.
 *
 * NOTE: This function is ONLY called on PDF-derived images (skipBlurCheck=true)
 * so direct phone photos are never affected.
 *
 * Thresholds:
 * - Width > 1.6 × height: two cards landscape side-by-side (combined ratio ~3.17)
 * - Height > 1.4 × width: A4/portrait page with two cards stacked (A4 ratio = 1.414).
 *   A single DNI card in portrait has h/w ≈ 1.587 — this falls above the threshold,
 *   but that scenario (single portrait card in a PDF) is extremely rare in practice.
 *   The threshold deliberately catches A4 scans (1.414) as the primary use case.
 */
export async function splitDocumentImageIfNeeded(file: File, originalName?: string): Promise<File[]> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const { naturalWidth: w, naturalHeight: h } = img;

      const isWide = w > h * 1.6;
      const isTall = h > w * 1.4;

      if (!isWide && !isTall) {
        resolve([file]);
        return;
      }

      const canvas1 = document.createElement('canvas');
      const canvas2 = document.createElement('canvas');
      const baseName = (originalName ?? file.name).replace(/\.[^.]+$/, '');

      if (isWide) {
        const half = Math.floor(w / 2);
        canvas1.width = half;
        canvas1.height = h;
        canvas2.width = w - half;
        canvas2.height = h;

        const ctx1 = canvas1.getContext('2d');
        const ctx2 = canvas2.getContext('2d');
        if (!ctx1 || !ctx2) { resolve([file]); return; }

        ctx1.drawImage(img, 0, 0, half, h, 0, 0, half, h);
        ctx2.drawImage(img, half, 0, w - half, h, 0, 0, w - half, h);
      } else {
        // isTall
        const half = Math.floor(h / 2);
        canvas1.width = w;
        canvas1.height = half;
        canvas2.width = w;
        canvas2.height = h - half;

        const ctx1 = canvas1.getContext('2d');
        const ctx2 = canvas2.getContext('2d');
        if (!ctx1 || !ctx2) { resolve([file]); return; }

        ctx1.drawImage(img, 0, 0, w, half, 0, 0, w, half);
        ctx2.drawImage(img, 0, half, w, h - half, 0, 0, w, h - half);
      }

      let done = 0;
      const results: File[] = [null as unknown as File, null as unknown as File];

      const finish = () => {
        done += 1;
        if (done === 2) resolve(results);
      };

      canvas1.toBlob((blob) => {
        results[0] = blob
          ? new File([blob], `${baseName}-lado-1.png`, { type: 'image/png' })
          : file;
        finish();
      }, 'image/png');

      canvas2.toBlob((blob) => {
        results[1] = blob
          ? new File([blob], `${baseName}-lado-2.png`, { type: 'image/png' })
          : file;
        finish();
      }, 'image/png');
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve([file]);
    };
    img.src = url;
  });
}

// Compress and resize an image to max 1600px (longest side), JPEG quality 0.82
// This dramatically reduces payload size for large phone photos before sending to AI
export function compressImageForAI(dataUrl: string, maxPx = 1600, quality = 0.82): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { naturalWidth: w, naturalHeight: h } = img;
      if (w > maxPx || h > maxPx) {
        if (w > h) { h = Math.round((h / w) * maxPx); w = maxPx; }
        else { w = Math.round((w / h) * maxPx); h = maxPx; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(dataUrl); return; }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}
