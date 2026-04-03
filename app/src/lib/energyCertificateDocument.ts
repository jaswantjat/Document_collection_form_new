import type { AIExtraction, FormData, ProjectData, RenderedDocumentAsset } from '@/types';

export const ENERGY_CERTIFICATE_TEMPLATE_VERSION = '2026-04-01.3';

// ─── Canvas constants ─────────────────────────────────────────────────────────
// Logical drawing space: A4 at 300 DPI. Canvas output at 150 DPI via SCALE.
// All coordinates use the 300 DPI space; ctx.scale(SCALE) handles the output.
const SCALE = 0.5;
const W = 2480;
const H = 3508;
const M = 100;    // page margin
const TW = W - M * 2; // table width = 2280

const LC = 960;   // label column width
const VC = TW - LC; // value column width = 1320
const RH = 78;    // standard row height
const BORDER = '#c8cfe0';
const BLUE = '#3B46FF';
const LABEL_BG = '#f5f7ff';
const WHITE = '#ffffff';
const DARK = '#111827';
const MED = '#374151';
const FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';

// ─── Type helpers ─────────────────────────────────────────────────────────────
type EnergyCertificateSourceProject = Partial<Pick<ProjectData, 'customerName' | 'phone' | 'email' | 'assessor'>>;
type EnergyCertificateRenderSource =
  | FormData
  | (EnergyCertificateSourceProject & {
      formData?: FormData | null;
      project?: EnergyCertificateSourceProject | null;
    });

function isFormData(s: EnergyCertificateRenderSource | null | undefined): s is FormData {
  return !!s && typeof s === 'object' && 'dni' in s && 'representation' in s;
}
function getSourceFormData(s: EnergyCertificateRenderSource | null | undefined): FormData {
  return (isFormData(s) ? s : s?.formData ?? {}) as FormData;
}
function getSourceProject(s: EnergyCertificateRenderSource | null | undefined): EnergyCertificateSourceProject {
  if (!s || isFormData(s)) return {};
  return s.project ?? s;
}
function getExtractionData(
  extraction?: { extractedData?: AIExtraction['extractedData'] | null } | null
): AIExtraction['extractedData'] {
  return extraction?.extractedData ?? {};
}

// ─── Label helpers ────────────────────────────────────────────────────────────
function boolLabel(v: boolean | null | undefined) {
  if (v === true) return 'SI';
  if (v === false) return 'NO';
  return '';
}
function soldProductLabel(v: FormData['energyCertificate']['additional']['soldProduct']) {
  const MAP: Record<string, string> = {
    'solo-paneles': 'Solo Paneles Solares',
    'solo-aerotermia': 'Solo Aerotermia',
    'paneles-y-aerotermia': 'Paneles Solares y Aerotermia',
    'ampliacion': 'Ampliación',
    'ampliacion-y-aerotermia': 'Ampliación y Aerotermia',
  };
  return (v && MAP[v]) || '';
}
function heightLabel(v: FormData['energyCertificate']['housing']['averageFloorHeight']) {
  if (v === '<2.7m') return 'Menos de 2,7m';
  if (v === '2.7-3.2m') return 'Entre 2,7m y 3,2m';
  if (v === '>3.2m') return 'Más de 3,2m';
  return '';
}
function thermalTypeLabel(v: FormData['energyCertificate']['thermal']['thermalInstallationType']) {
  const MAP: Record<string, string> = {
    'termo-electrico': 'Termo Eléctrico (Sólo ACS)',
    'calentador': 'Calentador (Sólo ACS)',
    'caldera': 'Caldera (ACS y calefacción)',
    'aerotermia': 'Aerotermia',
  };
  return (v && MAP[v]) || '';
}
function fuelLabel(v: FormData['energyCertificate']['thermal']['boilerFuelType']) {
  const MAP: Record<string, string> = { gas: 'Gas', gasoil: 'Gasoil', electricidad: 'Electricidad', aerotermia: 'Aerotermia' };
  return (v && MAP[v]) || '';
}
function heatingTypeLabel(v: FormData['energyCertificate']['thermal']['heatingEmitterType']) {
  const MAP: Record<string, string> = {
    'radiadores-agua': 'Radiadores de Agua',
    'radiadores-electricos': 'Radiadores eléctricos',
    'suelo-radiante': 'Suelo Radiante',
  };
  return (v && MAP[v]) || '';
}
function radiatorMaterialLabel(v: FormData['energyCertificate']['thermal']['radiatorMaterial']) {
  if (v === 'hierro-fundido') return 'Hierro fundido';
  if (v === 'aluminio') return 'Aluminio';
  if (v === 'no-aplica') return 'No aplica';
  return '';
}
function airTypeLabel(v: FormData['energyCertificate']['thermal']['airConditioningType']) {
  if (v === 'frio-calor') return 'Frío y Calor';
  if (v === 'frio') return 'Frío';
  return '';
}
function windowFrameMaterialLabel(v: FormData['energyCertificate']['housing']['windowFrameMaterial']) {
  if (v === 'madera') return 'Madera';
  if (v === 'aluminio') return 'Aluminio';
  if (v === 'pvc') return 'PVC';
  return v || '';
}
function windowGlassTypeLabel(v: FormData['energyCertificate']['housing']['windowGlassType']) {
  if (v === 'simple') return 'Simple';
  if (v === 'doble') return 'Doble vidrio';
  return v || '';
}

// ─── Canvas drawing primitives ────────────────────────────────────────────────
function setFont(ctx: CanvasRenderingContext2D, size: number, weight: number | string = 400, color = DARK) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.fillStyle = color;
}

function loadImg(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function drawRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  r: number,
  fill?: string,
  strokeColor?: string,
  strokeWidth = 2
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (strokeColor) { ctx.strokeStyle = strokeColor; ctx.lineWidth = strokeWidth; ctx.stroke(); }
}

function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxW: number,
  size: number,
  weight: number | string = 400,
  color = DARK,
  align: CanvasTextAlign = 'left'
) {
  if (!text) return;
  setFont(ctx, size, weight, color);
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  // Auto-shrink if too wide
  let fs = size;
  while (ctx.measureText(text).width > maxW && fs > size * 0.65) {
    fs -= 1;
    setFont(ctx, fs, weight, color);
  }
  ctx.fillText(text, x, y, maxW);
}

// Draw one table row (bordered, label-bg on left, white on right)
function drawRow(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  label: string, value: string,
  h = RH,
  labelW = LC,
  valueW = VC,
  isHeader = false
) {
  const labelBg = isHeader ? BLUE : LABEL_BG;
  const labelColor = isHeader ? WHITE : MED;

  // Label cell
  ctx.fillStyle = labelBg;
  ctx.fillRect(x, y, labelW, h);

  // Value cell
  ctx.fillStyle = WHITE;
  ctx.fillRect(x + labelW, y, valueW, h);

  // Borders
  ctx.strokeStyle = BORDER;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x, y, labelW, h);
  ctx.strokeRect(x + labelW, y, valueW, h);

  // Label text
  const labelFontSize = 38;
  const valueFontSize = 40;
  const labelWeight = isHeader ? 700 : 500;
  drawText(ctx, label, x + 18, y + h / 2, labelW - 30, labelFontSize, labelWeight, labelColor);
  drawText(ctx, value, x + labelW + 18, y + h / 2, valueW - 30, valueFontSize, 600, DARK);
}

// Draw the windows/doors orientation matrix (3-row section)
function drawMatrixSection(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  labelW: number,
  totalW: number,
  windows: Record<string, string>,
  doors: Record<string, string>
) {
  const valueW = totalW - labelW;
  const colCount = 8; // 4 windows + 4 doors
  const colW = valueW / colCount;

  const rowA = 50;  // header: "Ventanas" | "Puertas"
  const rowB = 52;  // col headers: N | S | E | O
  const rowC = 78;  // values

  const dirs = ['N', 'S', 'E', 'O'] as const;
  const dirKeys = { N: 'north', S: 'south', E: 'east', O: 'west' } as const;

  // ── Row A: group headers ────────────────────────────────────────────────────
  // Label cell (spans 3 rows via background)
  ctx.fillStyle = LABEL_BG;
  ctx.fillRect(x, y, labelW, rowA + rowB + rowC);
  ctx.strokeStyle = BORDER;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x, y, labelW, rowA + rowB + rowC);

  // "Ventanas" header cell (spans 4 cols)
  ctx.fillStyle = '#eef0fb';
  ctx.fillRect(x + labelW, y, colW * 4, rowA);
  ctx.strokeRect(x + labelW, y, colW * 4, rowA);
  drawText(ctx, 'Ventanas', x + labelW + colW * 2, y + rowA / 2, colW * 4 - 20, 34, 700, MED, 'center');

  // "Puertas" header cell (spans 4 cols)
  ctx.fillStyle = '#eef0fb';
  ctx.fillRect(x + labelW + colW * 4, y, colW * 4, rowA);
  ctx.strokeRect(x + labelW + colW * 4, y, colW * 4, rowA);
  drawText(ctx, 'Puertas', x + labelW + colW * 6, y + rowA / 2, colW * 4 - 20, 34, 700, MED, 'center');

  // ── Row B: column direction headers ────────────────────────────────────────
  const yB = y + rowA;
  for (let i = 0; i < 8; i++) {
    const cx = x + labelW + i * colW;
    ctx.fillStyle = '#eef0fb';
    ctx.fillRect(cx, yB, colW, rowB);
    ctx.strokeStyle = BORDER;
    ctx.strokeRect(cx, yB, colW, rowB);
    const dir = dirs[i % 4];
    drawText(ctx, dir, cx + colW / 2, yB + rowB / 2, colW - 6, 34, 700, MED, 'center');
  }

  // ── Label text ─────────────────────────────────────────────────────────────
  drawText(ctx, 'Nº puertas y ventanas', x + 18, y + (rowA + rowB + rowC) / 2, labelW - 30, 36, 500, MED);

  // ── Row C: values ──────────────────────────────────────────────────────────
  const yC = y + rowA + rowB;
  for (let i = 0; i < 8; i++) {
    const cx = x + labelW + i * colW;
    ctx.fillStyle = WHITE;
    ctx.fillRect(cx, yC, colW, rowC);
    ctx.strokeStyle = BORDER;
    ctx.strokeRect(cx, yC, colW, rowC);
    const isWindow = i < 4;
    const key = dirKeys[dirs[i % 4]];
    const val = isWindow ? (windows[key] || '') : (doors[key] || '');
    drawText(ctx, val, cx + colW / 2, yC + rowC / 2, colW - 10, 40, 600, DARK, 'center');
  }

  return rowA + rowB + rowC;
}

// ─── Build snapshot from source ───────────────────────────────────────────────
function snapshotFromSource(source: EnergyCertificateRenderSource | null | undefined) {
  const formData = getSourceFormData(source);
  const dniFront = getExtractionData(formData?.dni?.front?.extraction);
  const dniBack = getExtractionData(formData?.dni?.back?.extraction);
  const ibi = getExtractionData(formData?.ibi?.extraction);
  const ebPages = formData?.electricityBill?.pages || [];
  const eb0 = getExtractionData(ebPages[0]?.extraction);
  const project = getSourceProject(source);

  return {
    formData,
    customerName: String(dniFront.fullName || eb0.titular || ibi.titular || project?.customerName || ''),
    address: String(eb0.direccionSuministro || dniBack.address || ibi.direccion || ''),
    phone: String(project?.phone || ''),
    email: String(project?.email || ''),
    dniNumber: String(dniFront.dniNumber || eb0.nifTitular || ibi.titularNif || ''),
    assessor: String(project?.assessor || ''),
    today: new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Madrid' })).toLocaleString('es-ES', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }),
  };
}

// ─── Main render function ─────────────────────────────────────────────────────
async function buildCertificateCanvas(
  source: EnergyCertificateRenderSource | null | undefined
): Promise<string> {
  const snap = snapshotFromSource(source);
  const energy = snap.formData.energyCertificate;
  const h = energy.housing;
  const t = energy.thermal;
  const a = energy.additional;

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(W * SCALE);
  canvas.height = Math.round(H * SCALE);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(SCALE, SCALE);

  // ── Page background ─────────────────────────────────────────────────────────
  ctx.fillStyle = WHITE;
  ctx.fillRect(0, 0, W, H);

  // ── Header ──────────────────────────────────────────────────────────────────
  const HDR_Y = 65;
  const HDR_H = 115;

  // Blue badge
  drawRoundRect(ctx, M, HDR_Y, 1540, HDR_H, 10, BLUE);
  setFont(ctx, 52, 800, WHITE);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('FORMULARIO CERTIFICADO ENERGÉTICO', M + 30, HDR_Y + HDR_H / 2);

  // Logo (try to load from local public folder)
  const logo = await loadImg('/eltex-logo.png');
  if (logo) {
    const logoH = 80;
    const logoW = Math.round((logo.naturalWidth / logo.naturalHeight) * logoH);
    const logoX = W - M - logoW;
    const logoY = HDR_Y + (HDR_H - logoH) / 2;
    ctx.drawImage(logo, logoX, logoY, logoW, logoH);
  } else {
    // Text fallback
    setFont(ctx, 72, 800, DARK);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText('eltex+', W - M, HDR_Y + HDR_H / 2);
  }

  // ── Table 1: Personal data ───────────────────────────────────────────────────
  const T1_Y = HDR_Y + HDR_H + 55;
  const rows1: Array<[string, string]> = [
    ['Nombre y apellido', snap.customerName],
    ['¿Es cliente?', boolLabel(a.isExistingCustomer)],
    ['Dirección', snap.address],
    ['Teléfono', snap.phone],
    ['Email', snap.email],
    ['DNI/NIE', snap.dniNumber],
    ['Asesor', snap.assessor],
    ['Fecha del formulario', snap.today],
    ['¿Qué producto se está vendiendo?', soldProductLabel(a.soldProduct)],
  ];

  let cy = T1_Y;
  for (const [label, value] of rows1) {
    drawRow(ctx, M, cy, label, value);
    cy += RH;
  }

  // ── Table 2: Property & energy data ──────────────────────────────────────────
  const T2_Y = cy + 65;
  cy = T2_Y;

  const rows2a: Array<[string, string]> = [
    ['Referencia catastral de la vivienda', h.cadastralReference],
    ['Superficie habitable útil de la vivienda', h.habitableAreaM2 ? `${h.habitableAreaM2} m²` : ''],
    ['Número de plantas de la vivienda', h.floorCount],
    ['Altura libre media de las plantas', heightLabel(h.averageFloorHeight)],
    ['Número de dormitorios', h.bedroomCount],
  ];

  for (const [label, value] of rows2a) {
    drawRow(ctx, M, cy, label, value);
    cy += RH;
  }

  // ── Windows / doors orientation matrix ──────────────────────────────────────
  const matrixH = drawMatrixSection(
    ctx, M, cy, LC, TW,
    h.windowsByOrientation as Record<string, string>,
    h.doorsByOrientation as Record<string, string>
  );
  cy += matrixH;

  // ── Remaining rows ──────────────────────────────────────────────────────────
  const airDetails = t.hasAirConditioning
    ? [airTypeLabel(t.airConditioningType), t.airConditioningDetails].filter(Boolean).join(' — ')
    : 'No aplica';

  const rows2b: Array<[string, string]> = [
    ['Material de los marcos de la ventana', h.windowFrameMaterial || ''],
    ['Material de las puertas', h.doorMaterial],
    ['Tipo de vidrio de las ventanas', h.windowGlassType || ''],
    ['¿Las ventanas tienen persiana?', boolLabel(h.hasShutters)],
    ['Número de ventanas con persianas', h.shutterWindowCount],
    ['Equipo de la instalación térmica', thermalTypeLabel(t.thermalInstallationType)],
    ['Combustible de la caldera', fuelLabel(t.boilerFuelType)],
    ['Detalles del equipo (marca y año)', t.equipmentDetails],
    ['Tipo de emisor de calefacción', heatingTypeLabel(t.heatingEmitterType)],
    ['Material de radiadores', radiatorMaterialLabel(t.radiatorMaterial)],
    ['¿Tiene aire acondicionado?', boolLabel(t.hasAirConditioning)],
    ['Detalles del aire (marca y año)', airDetails],
    ['¿Cuenta con placas solares?', boolLabel(a.hasSolarPanels)],
    ['Nº de paneles y potencia de cada uno', a.hasSolarPanels ? a.solarPanelDetails : 'No aplica'],
  ];

  for (const [label, value] of rows2b) {
    drawRow(ctx, M, cy, label, value);
    cy += RH;
  }

  // ── Footer line ───────────────────────────────────────────────────────────────
  cy += 60;
  ctx.strokeStyle = BORDER;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(M, cy);
  ctx.lineTo(W - M, cy);
  ctx.stroke();

  setFont(ctx, 28, 400, '#9ca3af');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`Expediente generado por Eltex · ${snap.today}`, W / 2, cy + 28);

  return canvas.toDataURL('image/jpeg', 0.82);
}

// ─── Public API (same signatures as before) ───────────────────────────────────
export async function renderEnergyCertificateOverlay(
  source: EnergyCertificateRenderSource | null | undefined
): Promise<string> {
  return buildCertificateCanvas(source);
}

export async function createRenderedEnergyCertificateAsset(
  source: EnergyCertificateRenderSource | null | undefined
): Promise<RenderedDocumentAsset> {
  const imageDataUrl = await buildCertificateCanvas(source);
  return {
    imageDataUrl,
    generatedAt: new Date().toISOString(),
    templateVersion: ENERGY_CERTIFICATE_TEMPLATE_VERSION,
  };
}
