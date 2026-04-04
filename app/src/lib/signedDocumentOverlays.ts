import type { FormData, RenderedDocumentAsset, RenderedDocumentKey } from '@/types';

const BLUE = '#1e3a8a';
const FONT_FAMILY = 'Helvetica, Arial, sans-serif';
export const SIGNED_DOCUMENT_TEMPLATE_VERSION = '2026-04-04.1';

export type SignedDocumentKind =
  | 'cataluna-iva'
  | 'cataluna-generalitat'
  | 'cataluna-representacio'
  | 'spain-iva'
  | 'spain-poder';

type Box = readonly [number, number, number, number];

const REPRESENTACIO_PAGE_SIZE = { width: 1241, height: 1754 };
const REPRESENTACIO_FIELDS = {
  personaNom: [395, 252, 812, 284],
  personaNif: [902, 252, 1095, 284],
  personaAdreca: [190, 291, 812, 323],
  personaCodiPostal: [979, 291, 1095, 323],
  personaMunicipi: [202, 333, 812, 365],
  empresaNom: [370, 449, 812, 481],
  empresaNif: [902, 449, 1095, 481],
  empresaAdreca: [190, 484, 812, 516],
  empresaCodiPostal: [979, 484, 1095, 516],
  empresaMunicipi: [202, 527, 812, 559],
  lloc: [130, 1459, 560, 1496],
  data: [760, 1459, 1100, 1496],
  signaturaPersonaInteressada: [76, 1552, 575, 1685],
} as const;

const GENERALITAT_PAGE_SIZE = { width: 1357, height: 1920 };
const GENERALITAT_FIELDS = {
  nom: [146, 262, 977, 290],
  dni: [982, 262, 1295, 290],
  checkboxTitular: [147, 327, 172, 353],
  checkboxRepresentant: [459, 327, 484, 353],
  signatura: [147, 1390, 1295, 1498],
} as const;

const IVA_ES_PAGE_SIZE = { width: 1448, height: 2048 };
const IVA_ES_FIELDS = {
  sr_sra: [320, 306, 1252, 308],
  dni: [406, 369, 1195, 371],
  domicilio: [398, 429, 1195, 431],
  codigo_postal: [350, 492, 571, 494],
  localidad: [694, 492, 1237, 494],
  provincia: [315, 554, 571, 556],
  firma_aprobacion: [860, 1650, 1265, 1760],
  fecha_lugar_en: [232, 1937, 722, 1939],
  fecha_dia_el: [782, 1937, 846, 1939],
  fecha_mes: [931, 1937, 1110, 1939],
  fecha_anio_sufijo: [1256, 1937, 1306, 1939],
} as const;

const PODER_ES_PAGE_SIZE = { width: 1448, height: 2048 };
const PODER_ES_FIELDS = {
  persona_interesada_nombre_razon_social: { x: 420, y: 296, stopX: 950 },
  persona_interesada_nif: { x: 1031, y: 296, stopX: 1170 },
  persona_interesada_direccion: { x: 233, y: 342, stopX: 950 },
  persona_interesada_codigo_postal: { x: 1154, y: 343, stopX: 1245 },
  persona_interesada_municipio: { x: 233, y: 393, stopX: 950 },
  persona_juridica_representante_legal_nombre_razon_social: { x: 420, y: 522, stopX: 950 },
  persona_juridica_representante_legal_nif: { x: 1031, y: 522, stopX: 1170 },
  persona_juridica_representante_legal_direccion: { x: 233, y: 568, stopX: 950 },
  persona_juridica_representante_legal_codigo_postal: { x: 1154, y: 569, stopX: 1245 },
  persona_juridica_representante_legal_municipio: { x: 233, y: 620, stopX: 950 },
  lugar: { x: 139, y: 1719, stopX: 310 },
  fecha: { x: 842, y: 1722, stopX: 1145 },
  firma_persona_interesada_safe_box: [100, 1855, 620, 1975] as Box,
} as const;

function getSourceFormData(source: any): FormData {
  return source?.formData ?? source ?? {};
}

function getLocation(source: any) {
  const formData = getSourceFormData(source);
  return formData?.location ?? formData?.representation?.location ?? null;
}

function getSnapshot(source: any) {
  const fd = getSourceFormData(source);
  const contract = fd?.contract?.extraction?.extractedData || {};
  const dniFront = fd?.dni?.front?.extraction?.extractedData || {};
  const dniBack = fd?.dni?.back?.extraction?.extractedData || {};
  const ibi = fd?.ibi?.extraction?.extractedData || {};
  const representation = fd?.representation || {};
  const ebRaw = fd?.electricityBill;
  const ebPages: any[] = ebRaw?.pages?.length
    ? ebRaw.pages
    : [ebRaw?.front, ebRaw?.back].filter(Boolean);
  const ebData = ebPages.map((p: any) => p?.extraction?.extractedData || {});
  const eb0 = ebData[0] || {};
  const eb1 = ebData[1] || {};

  return {
    location: getLocation(source),
    representation,
    // Contract is first priority; other documents fill in gaps if contract is absent
    fullName: contract.fullName || dniFront.fullName || eb0.titular || eb1.titular || ibi.titular || '',
    dniNumber: contract.nif || dniFront.dniNumber || eb0.nifTitular || eb1.nifTitular || ibi.titularNif || '',
    address: contract.address || dniBack.address || eb0.direccionSuministro || eb1.direccionSuministro || ibi.direccion || '',
    municipality: contract.municipality || dniBack.municipality || eb0.municipio || eb1.municipio || ibi.municipio || '',
    province: contract.province || eb0.provincia || eb1.provincia || '',
    postalCode: contract.postalCode || eb0.codigoPostal || eb1.codigoPostal || ibi.codigoPostal || representation.postalCode || '',
  };
}

export function renderedDocumentKeyForKind(kind: SignedDocumentKind): RenderedDocumentKey {
  if (kind === 'cataluna-iva') return 'catalunaIva';
  if (kind === 'cataluna-generalitat') return 'catalunaGeneralitat';
  if (kind === 'cataluna-representacio') return 'catalunaRepresentacio';
  if (kind === 'spain-iva') return 'spainIva';
  return 'spainPoder';
}

export function getStoredRenderedDocument(source: any, kind: SignedDocumentKind): RenderedDocumentAsset | null {
  const formData = getSourceFormData(source);
  const key = renderedDocumentKeyForKind(kind);
  return formData?.representation?.renderedDocuments?.[key] || null;
}

export function setStoredRenderedDocument(
  source: FormData,
  kind: SignedDocumentKind,
  asset: RenderedDocumentAsset | null
): FormData {
  const key = renderedDocumentKeyForKind(kind);
  const nextRenderedDocuments = { ...(source.representation?.renderedDocuments || {}) };

  if (asset) nextRenderedDocuments[key] = asset;
  else delete nextRenderedDocuments[key];

  return {
    ...source,
    representation: {
      ...source.representation,
      renderedDocuments: nextRenderedDocuments,
    },
  };
}

export async function createRenderedDocumentAsset(source: any, kind: SignedDocumentKind): Promise<RenderedDocumentAsset> {
  const imageDataUrl = await renderSignedDocumentOverlay(source, kind);
  return {
    imageDataUrl,
    generatedAt: new Date().toISOString(),
    templateVersion: SIGNED_DOCUMENT_TEMPLATE_VERSION,
  };
}

/**
 * Stamp renderedDocuments metadata for all present signed documents WITHOUT
 * rendering any canvas.
 *
 * Use this on the submit path: the submit flow calls `stripRenderedImages` right
 * after, which discards `imageDataUrl` anyway — the server only needs
 * `{ generatedAt, templateVersion }`.  Skipping the full-res canvas render saves
 * 500–1500 ms of main-thread blocking on every submit.
 *
 * The admin dashboard regenerates documents on demand via `renderSignedDocumentOverlay`
 * (it always falls through because `imageDataUrl` is null after the server round-trip).
 */
export function stampRenderedDocumentMetadata(source: FormData): FormData {
  const definitions = getSignedDocumentDefinitions({ formData: source, code: 'project' }).filter(item => item.present);
  if (definitions.length === 0) return source;
  const now = new Date().toISOString();
  let nextFormData = source;
  for (const item of definitions) {
    nextFormData = setStoredRenderedDocument(nextFormData, item.key, {
      imageDataUrl: '',
      generatedAt: now,
      templateVersion: SIGNED_DOCUMENT_TEMPLATE_VERSION,
    });
  }
  return nextFormData;
}

export async function ensureRenderedDocuments(source: FormData): Promise<FormData> {
  const definitions = getSignedDocumentDefinitions({ formData: source, code: 'project' }).filter((item) => item.present);

  // Identify which documents need rendering (missing or outdated template version)
  const toRender = definitions.filter((item) => {
    const stored = getStoredRenderedDocument(source, item.key);
    return !stored || stored.templateVersion !== SIGNED_DOCUMENT_TEMPLATE_VERSION;
  });

  if (toRender.length === 0) return source;

  // Render all missing/outdated documents in parallel
  const rendered = await Promise.all(
    toRender.map(async (item) => ({
      key: item.key,
      asset: await createRenderedDocumentAsset(source, item.key),
    }))
  );

  let nextFormData = source;
  for (const { key, asset } of rendered) {
    nextFormData = setStoredRenderedDocument(nextFormData, key, asset);
  }

  return nextFormData;
}

// Module-level cache: store the Promise so concurrent calls share the same decode.
// This eliminates re-parsing the same PNG/JPG every time renderTemplate is called.
const _imageCache = new Map<string, Promise<HTMLImageElement>>();

function loadImage(src: string): Promise<HTMLImageElement> {
  if (!_imageCache.has(src)) {
    _imageCache.set(
      src,
      new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
        img.src = src;
      })
    );
  }
  return _imageCache.get(src)!;
}

/** Full-resolution template src — used for final stored artifacts (admin download). */
function templateSrcForKind(kind: SignedDocumentKind): string | null {
  if (kind === 'cataluna-iva') return '/certificat-iva-10-cat.png';
  if (kind === 'cataluna-generalitat') return '/generalitat-declaration.png';
  if (kind === 'cataluna-representacio') return '/autoritzacio-representacio.jpg';
  if (kind === 'spain-iva') return '/certificat-iva-10-es.png';
  if (kind === 'spain-poder') return '/poder-representacio.png';
  return null;
}

/**
 * 25%-scale WebP thumbnail — used for the live carousel preview.
 *
 * These are 11–29 KB each (vs 148–943 KB for the originals), so they arrive
 * in <0.5 s on a bad 3G connection where the originals would take 8+ seconds.
 * The canvas dimensions are identical to rendering the full image at scale=0.25,
 * so all text/signature overlays align perfectly.
 */
function thumbnailSrcForKind(kind: SignedDocumentKind): string | null {
  if (kind === 'cataluna-iva') return '/thumbs/certificat-iva-10-cat.webp';
  if (kind === 'cataluna-generalitat') return '/thumbs/generalitat-declaration.webp';
  if (kind === 'cataluna-representacio') return '/thumbs/autoritzacio-representacio.webp';
  if (kind === 'spain-iva') return '/thumbs/certificat-iva-10-es.webp';
  if (kind === 'spain-poder') return '/thumbs/poder-representacio.webp';
  return null;
}

/**
 * 50%-scale WebP — used for the fullscreen read modal.
 *
 * These are 39–84 KB each (vs 148–943 KB for the originals).
 * Sharp enough to read comfortably, downloads ~5–12× faster than the full image.
 */
function modalSrcForKind(kind: SignedDocumentKind): string | null {
  if (kind === 'cataluna-iva') return '/thumbs/certificat-iva-10-cat-modal.webp';
  if (kind === 'cataluna-generalitat') return '/thumbs/generalitat-declaration-modal.webp';
  if (kind === 'cataluna-representacio') return '/thumbs/autoritzacio-representacio-modal.webp';
  if (kind === 'spain-iva') return '/thumbs/certificat-iva-10-es-modal.webp';
  if (kind === 'spain-poder') return '/thumbs/poder-representacio-modal.webp';
  return null;
}

/**
 * Warm the image cache for a set of document kinds.
 *
 * Loading order matters on slow connections:
 *   Priority 1 — 50%-scale modal WebPs (39–84 KB) — used for both the carousel preview
 *                and the fullscreen read modal on all DPR levels.  Land fast and render
 *                quickly (toDataURL on 620×878 ≈ 30–50 ms vs 300–500 ms for full-res).
 *   Priority 2 — full-resolution originals (148–943 KB) — used only for the final stored
 *                artifact downloaded by the admin.  Preloaded in the background so it is
 *                already decoded by the time renderSignedDocumentOverlay is called.
 */
export function preloadDocumentTemplates(kinds: SignedDocumentKind[]): void {
  // Priority 1 — 50%-scale modal WebPs (carousel preview + read modal)
  for (const kind of kinds) {
    const src = modalSrcForKind(kind);
    if (src) void loadImage(src);
  }
  // Priority 2 — full-resolution originals (final stored artifact only)
  for (const kind of kinds) {
    const src = templateSrcForKind(kind);
    if (src) void loadImage(src);
  }
}

function scaledX(x: number, referenceWidth: number, actualWidth: number) {
  return (x / referenceWidth) * actualWidth;
}

function scaledY(y: number, referenceHeight: number, actualHeight: number) {
  return (y / referenceHeight) * actualHeight;
}

function setFont(ctx: CanvasRenderingContext2D, sizePx: number, weight = 600) {
  ctx.font = `${weight} ${sizePx}px ${FONT_FAMILY}`;
  ctx.fillStyle = BLUE;
}

function drawBoxText(ctx: CanvasRenderingContext2D, text: string, pageSize: { width: number; height: number }, box: Box, sizePct: number, align: CanvasTextAlign = 'left') {
  if (!text) return;
  const x = scaledX(box[0], pageSize.width, ctx.canvas.width);
  const y = scaledY(box[1], pageSize.height, ctx.canvas.height);
  setFont(ctx, ctx.canvas.width * (sizePct / 100));
  ctx.textBaseline = 'top';
  ctx.textAlign = align;
  const drawX = align === 'center' ? x + scaledX(box[2] - box[0], pageSize.width, ctx.canvas.width) / 2 : x;
  ctx.fillText(String(text), drawX, y);
}

function drawPercentText(
  ctx: CanvasRenderingContext2D,
  text: string,
  leftPct: number,
  topPct: number,
  fontSizePx: number
) {
  if (!text) return;
  setFont(ctx, fontSizePx);
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillText(String(text), (leftPct / 100) * ctx.canvas.width, (topPct / 100) * ctx.canvas.height);
}

function drawLineText(ctx: CanvasRenderingContext2D, text: string, pageSize: { width: number; height: number }, box: Box, sizePct: number) {
  if (!text) return;
  const x = scaledX(box[0], pageSize.width, ctx.canvas.width);
  const y = scaledY(box[1], pageSize.height, ctx.canvas.height);
  setFont(ctx, ctx.canvas.width * (sizePct / 100));
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillText(String(text), x, y);
}

function drawAnchoredText(
  ctx: CanvasRenderingContext2D,
  text: string,
  pageSize: { width: number; height: number },
  field: { x: number; y: number; stopX: number },
  sizePct: number,
  insetXPx = 0,
  insetYPx = 0
) {
  if (!text) return;
  const x = scaledX(field.x + insetXPx, pageSize.width, ctx.canvas.width);
  const y = scaledY(field.y + insetYPx, pageSize.height, ctx.canvas.height);
  setFont(ctx, ctx.canvas.width * (sizePct / 100));
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillText(String(text), x, y);
}

async function drawSignature(
  ctx: CanvasRenderingContext2D,
  dataUrl: string | null | undefined,
  pageSize: { width: number; height: number },
  box: Box
) {
  if (!dataUrl) return;
  const img = await loadImage(dataUrl);
  const x = scaledX(box[0], pageSize.width, ctx.canvas.width);
  const y = scaledY(box[1], pageSize.height, ctx.canvas.height);
  const width = scaledX(box[2] - box[0], pageSize.width, ctx.canvas.width);
  const height = scaledY(box[3] - box[1], pageSize.height, ctx.canvas.height);
  ctx.drawImage(img, x, y, width, height);
}

async function drawPercentSignature(
  ctx: CanvasRenderingContext2D,
  dataUrl: string | null | undefined,
  leftPct: number,
  topPct: number,
  widthPct: number,
  heightPct: number
) {
  if (!dataUrl) return;
  const img = await loadImage(dataUrl);
  const x = (leftPct / 100) * ctx.canvas.width;
  const y = (topPct / 100) * ctx.canvas.height;
  const width = (widthPct / 100) * ctx.canvas.width;
  const height = (heightPct / 100) * ctx.canvas.height;
  ctx.drawImage(img, x, y, width, height);
}

/**
 * Render a document template onto a canvas and return a JPEG data URL.
 *
 * @param scale - Multiplied against the template's natural dimensions to set canvas size.
 *                1.0 = canvas is the same size as the template (default for all render paths).
 *                All coordinate math in drawXxx() uses ctx.canvas.width/height at runtime,
 *                so scaling is transparent — do NOT change coordinate values.
 */
async function renderTemplate(
  templateSrc: string,
  draw: (ctx: CanvasRenderingContext2D) => Promise<void> | void,
  scale = 1.0
) {
  const template = await loadImage(templateSrc);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(template.naturalWidth * scale);
  canvas.height = Math.round(template.naturalHeight * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context unavailable');

  ctx.drawImage(template, 0, 0, canvas.width, canvas.height);
  await draw(ctx);
  // Preview uses lower quality (faster toDataURL); final uses 0.92 for archival quality.
  const quality = scale < 1.0 ? 0.80 : 0.92;
  return canvas.toDataURL('image/jpeg', quality);
}

function getCurrentCatalanDate() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Madrid' }));
  const months = ['gener', 'febrer', 'marc', 'abril', 'maig', 'juny', 'juliol', 'agost', 'setembre', 'octubre', 'novembre', 'desembre'];
  return {
    full: `${now.getDate()} de ${months[now.getMonth()]} de ${now.getFullYear()}`,
    day: String(now.getDate()),
    month: months[now.getMonth()],
    yearShort: String(now.getFullYear()).slice(-2),
  };
}

function getCurrentSpanishDate() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Madrid' }));
  const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  return {
    full: `${now.getDate()} de ${months[now.getMonth()]} de ${now.getFullYear()}`,
    day: String(now.getDate()),
    month: months[now.getMonth()],
    yearShort: String(now.getFullYear()).slice(-2),
  };
}

export function getSignedDocumentDefinitions(project: any) {
  const snapshot = getSnapshot(project);
  const representation = snapshot.representation;

  if (snapshot.location === 'cataluna') {
    return [
      { key: 'cataluna-iva' as const, label: 'IVA 10% Cataluña', present: !!representation.ivaCertificateSignature, filename: `${project.code}_iva-cat.pdf` },
      { key: 'cataluna-generalitat' as const, label: 'Declaració Generalitat', present: !!representation.generalitatSignature, filename: `${project.code}_generalitat.pdf` },
      { key: 'cataluna-representacio' as const, label: 'Autorització de representació', present: !!representation.representacioSignature, filename: `${project.code}_autoritzacio-representacio.pdf` },
    ];
  }

  if (snapshot.location === 'madrid' || snapshot.location === 'valencia') {
    return [
      { key: 'spain-iva' as const, label: 'IVA 10% España', present: !!representation.ivaCertificateEsSignature, filename: `${project.code}_iva-es.pdf` },
      { key: 'spain-poder' as const, label: 'Poder de representación', present: !!representation.poderRepresentacioSignature, filename: `${project.code}_poder-representacion.pdf` },
    ];
  }

  return [];
}

/**
 * Render a signed document overlay and return a JPEG data URL.
 *
 * @param scale      Canvas scale factor applied to the template's natural dimensions (default 1.0).
 * @param getSrc     Optional resolver for the template image source. When provided it overrides
 *                   the default full-resolution PNG/JPG.
 *                   - Pass `modalSrcForKind` for the carousel preview (620×877 WebPs,
 *                     39–84 KB, fast encode — scale stays at 1.0).
 *                   - Leave undefined for full-resolution rendering (final artifact).
 */
async function renderSignedDocumentOverlayAtScale(
  project: any,
  kind: SignedDocumentKind,
  scale: number,
  getSrc?: (kind: SignedDocumentKind) => string | null
) {
  const snapshot = getSnapshot(project);
  const representation = snapshot.representation;

  if (kind === 'cataluna-iva') {
    const date = getCurrentCatalanDate();
    const src = getSrc?.('cataluna-iva') ?? '/certificat-iva-10-cat.png';
    return renderTemplate(src, async (ctx) => {
      drawPercentText(ctx, snapshot.fullName, 20.5, 15.1, ctx.canvas.width * 0.0175);
      drawPercentText(ctx, snapshot.dniNumber, 27.2, 18.0, ctx.canvas.width * 0.0175);
      drawPercentText(ctx, snapshot.address, 22.3, 21.1, ctx.canvas.width * 0.016);
      drawPercentText(ctx, snapshot.postalCode || '—', 23.0, 24.1, ctx.canvas.width * 0.0175);
      drawPercentText(ctx, snapshot.municipality, 47.6, 24.1, ctx.canvas.width * 0.0175);
      drawPercentText(ctx, snapshot.province, 20.8, 27.1, ctx.canvas.width * 0.0175);
      drawPercentText(ctx, snapshot.municipality, 18.0, 92.6, ctx.canvas.width * 0.0175);
      drawPercentText(ctx, date.day, 54.0, 92.6, ctx.canvas.width * 0.0155);
      drawPercentText(ctx, date.month, 62.0, 92.6, ctx.canvas.width * 0.0155);
      drawPercentText(ctx, date.yearShort, 85.0, 92.6, ctx.canvas.width * 0.0155);
      await drawPercentSignature(ctx, representation.ivaCertificateSignature, 65.2, 76.5, 24, 7.5);
    }, scale);
  }

  if (kind === 'cataluna-generalitat') {
    const src = getSrc?.('cataluna-generalitat') ?? '/generalitat-declaration.png';
    return renderTemplate(src, async (ctx) => {
      drawBoxText(ctx, snapshot.fullName, GENERALITAT_PAGE_SIZE, GENERALITAT_FIELDS.nom, 1.7);
      drawBoxText(ctx, snapshot.dniNumber, GENERALITAT_PAGE_SIZE, GENERALITAT_FIELDS.dni, 1.7);
      drawBoxText(ctx, representation.isCompany ? '' : 'X', GENERALITAT_PAGE_SIZE, GENERALITAT_FIELDS.checkboxTitular, 1.7, 'center');
      drawBoxText(ctx, representation.isCompany ? 'X' : '', GENERALITAT_PAGE_SIZE, GENERALITAT_FIELDS.checkboxRepresentant, 1.7, 'center');
      await drawSignature(ctx, representation.generalitatSignature, GENERALITAT_PAGE_SIZE, GENERALITAT_FIELDS.signatura);
    }, scale);
  }

  if (kind === 'cataluna-representacio') {
    const date = getCurrentCatalanDate();
    const src = getSrc?.('cataluna-representacio') ?? '/autoritzacio-representacio.jpg';
    return renderTemplate(src, async (ctx) => {
      drawBoxText(ctx, snapshot.fullName, REPRESENTACIO_PAGE_SIZE, REPRESENTACIO_FIELDS.personaNom, 1.7);
      drawBoxText(ctx, snapshot.dniNumber, REPRESENTACIO_PAGE_SIZE, REPRESENTACIO_FIELDS.personaNif, 1.7);
      drawBoxText(ctx, snapshot.address, REPRESENTACIO_PAGE_SIZE, REPRESENTACIO_FIELDS.personaAdreca, 1.7);
      drawBoxText(ctx, snapshot.postalCode || '—', REPRESENTACIO_PAGE_SIZE, REPRESENTACIO_FIELDS.personaCodiPostal, 1.7);
      drawBoxText(ctx, snapshot.municipality, REPRESENTACIO_PAGE_SIZE, REPRESENTACIO_FIELDS.personaMunicipi, 1.7);
      if (representation.isCompany) {
        drawBoxText(ctx, representation.companyName, REPRESENTACIO_PAGE_SIZE, REPRESENTACIO_FIELDS.empresaNom, 1.7);
        drawBoxText(ctx, representation.companyNIF, REPRESENTACIO_PAGE_SIZE, REPRESENTACIO_FIELDS.empresaNif, 1.7);
        drawBoxText(ctx, representation.companyAddress, REPRESENTACIO_PAGE_SIZE, REPRESENTACIO_FIELDS.empresaAdreca, 1.7);
        drawBoxText(ctx, representation.companyPostalCode || '—', REPRESENTACIO_PAGE_SIZE, REPRESENTACIO_FIELDS.empresaCodiPostal, 1.7);
        drawBoxText(ctx, representation.companyMunicipality, REPRESENTACIO_PAGE_SIZE, REPRESENTACIO_FIELDS.empresaMunicipi, 1.7);
      }
      drawBoxText(ctx, snapshot.municipality, REPRESENTACIO_PAGE_SIZE, REPRESENTACIO_FIELDS.lloc, 1.7);
      drawBoxText(ctx, date.full, REPRESENTACIO_PAGE_SIZE, REPRESENTACIO_FIELDS.data, 1.7);
      await drawSignature(ctx, representation.representacioSignature, REPRESENTACIO_PAGE_SIZE, REPRESENTACIO_FIELDS.signaturaPersonaInteressada);
    }, scale);
  }

  if (kind === 'spain-iva') {
    const date = getCurrentSpanishDate();
    const src = getSrc?.('spain-iva') ?? '/certificat-iva-10-es.png';
    return renderTemplate(src, async (ctx) => {
      drawLineText(ctx, snapshot.fullName, IVA_ES_PAGE_SIZE, IVA_ES_FIELDS.sr_sra, 1.6);
      drawLineText(ctx, snapshot.dniNumber, IVA_ES_PAGE_SIZE, IVA_ES_FIELDS.dni, 1.6);
      drawLineText(ctx, snapshot.address, IVA_ES_PAGE_SIZE, IVA_ES_FIELDS.domicilio, 1.6);
      drawLineText(ctx, snapshot.postalCode || '—', IVA_ES_PAGE_SIZE, IVA_ES_FIELDS.codigo_postal, 1.6);
      drawLineText(ctx, snapshot.municipality, IVA_ES_PAGE_SIZE, IVA_ES_FIELDS.localidad, 1.6);
      drawLineText(ctx, snapshot.province, IVA_ES_PAGE_SIZE, IVA_ES_FIELDS.provincia, 1.6);
      drawLineText(ctx, snapshot.municipality, IVA_ES_PAGE_SIZE, IVA_ES_FIELDS.fecha_lugar_en, 1.45);
      drawLineText(ctx, date.day, IVA_ES_PAGE_SIZE, IVA_ES_FIELDS.fecha_dia_el, 1.45);
      drawLineText(ctx, date.month, IVA_ES_PAGE_SIZE, IVA_ES_FIELDS.fecha_mes, 1.45);
      drawLineText(ctx, date.yearShort, IVA_ES_PAGE_SIZE, IVA_ES_FIELDS.fecha_anio_sufijo, 1.45);
      await drawSignature(ctx, representation.ivaCertificateEsSignature, IVA_ES_PAGE_SIZE, IVA_ES_FIELDS.firma_aprobacion);
    }, scale);
  }

  const poderSrc = getSrc?.('spain-poder') ?? '/poder-representacio.png';
  return renderTemplate(poderSrc, async (ctx) => {
    const date = getCurrentSpanishDate();
    drawAnchoredText(ctx, snapshot.fullName, PODER_ES_PAGE_SIZE, PODER_ES_FIELDS.persona_interesada_nombre_razon_social, 1.36, 18, 2);
    drawAnchoredText(ctx, snapshot.dniNumber, PODER_ES_PAGE_SIZE, PODER_ES_FIELDS.persona_interesada_nif, 1.32, 14, 2);
    drawAnchoredText(ctx, snapshot.address, PODER_ES_PAGE_SIZE, PODER_ES_FIELDS.persona_interesada_direccion, 1.36, 18, 2);
    drawAnchoredText(ctx, snapshot.postalCode || '—', PODER_ES_PAGE_SIZE, PODER_ES_FIELDS.persona_interesada_codigo_postal, 1.32, 14, 2);
    drawAnchoredText(ctx, snapshot.municipality, PODER_ES_PAGE_SIZE, PODER_ES_FIELDS.persona_interesada_municipio, 1.36, 18, 2);
    if (representation.isCompany) {
      drawAnchoredText(ctx, representation.companyName, PODER_ES_PAGE_SIZE, PODER_ES_FIELDS.persona_juridica_representante_legal_nombre_razon_social, 1.36, 18, 2);
      drawAnchoredText(ctx, representation.companyNIF, PODER_ES_PAGE_SIZE, PODER_ES_FIELDS.persona_juridica_representante_legal_nif, 1.32, 14, 2);
      drawAnchoredText(ctx, representation.companyAddress || snapshot.address, PODER_ES_PAGE_SIZE, PODER_ES_FIELDS.persona_juridica_representante_legal_direccion, 1.36, 18, 2);
      drawAnchoredText(ctx, representation.companyPostalCode || '—', PODER_ES_PAGE_SIZE, PODER_ES_FIELDS.persona_juridica_representante_legal_codigo_postal, 1.32, 14, 2);
      drawAnchoredText(ctx, representation.companyMunicipality || snapshot.municipality, PODER_ES_PAGE_SIZE, PODER_ES_FIELDS.persona_juridica_representante_legal_municipio, 1.36, 18, 2);
    }
    drawAnchoredText(ctx, snapshot.municipality, PODER_ES_PAGE_SIZE, PODER_ES_FIELDS.lugar, 1.18, 18, 2);
    drawAnchoredText(ctx, date.full, PODER_ES_PAGE_SIZE, PODER_ES_FIELDS.fecha, 1.18, 20, 2);
    await drawSignature(ctx, representation.poderRepresentacioSignature, PODER_ES_PAGE_SIZE, PODER_ES_FIELDS.firma_persona_interesada_safe_box);
  }, scale);
}

/**
 * Render a signed document at full resolution (1.0 scale).
 * Use this for final artifacts stored in formData and downloaded by the admin.
 */
export async function renderSignedDocumentOverlay(project: any, kind: SignedDocumentKind): Promise<string> {
  return renderSignedDocumentOverlayAtScale(project, kind, 1.0);
}

/**
 * Render a signed document preview for the carousel.
 *
 * Always uses the 50%-scale modal WebP (620×877 px) as the source regardless of
 * device DPR.  This gives:
 *   - 39–84 KB network cost (vs 148–943 KB for full-res)
 *   - ~30–50 ms toDataURL encode time (vs 300–500 ms for full-res on a 3× device)
 *   - Crisp output on 1× and 2× screens; 1.5× upscale on 3× — fine for a thumbnail
 *
 * The fullscreen read modal (renderSignedDocumentModalPreview) still uses full-res
 * for pixel-perfect quality when the user explicitly taps to open it.
 */
export async function renderSignedDocumentPreview(project: any, kind: SignedDocumentKind): Promise<string> {
  return renderSignedDocumentOverlayAtScale(project, kind, 1.0, modalSrcForKind);
}

/**
 * Render a signed document at full resolution (1.0 scale) for the fullscreen read modal.
 *
 * The fullscreen modal is opened explicitly by the user (tap "Toca para leer"), so the
 * 300–600 ms render time is acceptable and a spinner is shown while it loads.
 * Using the full-resolution PNG ensures text is pixel-perfect on retina screens
 * (2× and 3× DPI) regardless of how wide the modal CSS width stretches the image.
 *
 * The full-res PNG is already being preloaded in the background by preloadDocumentTemplates,
 * so on good connections the image is already decoded by the time the user taps.
 */
export async function renderSignedDocumentModalPreview(project: any, kind: SignedDocumentKind): Promise<string> {
  return renderSignedDocumentOverlayAtScale(project, kind, 1.0);
}
