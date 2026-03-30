import type { AIExtraction, FormData, ProjectData, RenderedDocumentAsset } from '@/types';
import energyCertificateSummaryTemplate from '@/assets/energy-certificate/energy-certificate-summary.jpg';

export const ENERGY_CERTIFICATE_TEMPLATE_VERSION = '2026-03-30.1';

const TEMPLATE_SRC = energyCertificateSummaryTemplate;
const PAGE_SIZE = { width: 2481, height: 3509 };
const TEXT_COLOR = '#1f2937';
const FONT_FAMILY = 'Helvetica, Arial, sans-serif';

type Box = readonly [number, number, number, number];

type EnergyCertificateSourceProject = Partial<Pick<ProjectData, 'customerName' | 'phone' | 'email' | 'assessor'>>;
type EnergyCertificateRenderSource =
  | FormData
  | (EnergyCertificateSourceProject & {
      formData?: FormData | null;
      project?: EnergyCertificateSourceProject | null;
    });

function isFormData(source: EnergyCertificateRenderSource | null | undefined): source is FormData {
  return !!source && typeof source === 'object' && 'dni' in source && 'representation' in source;
}

function getSourceFormData(source: EnergyCertificateRenderSource | null | undefined): FormData {
  return (isFormData(source) ? source : source?.formData ?? {}) as FormData;
}

function getSourceProject(source: EnergyCertificateRenderSource | null | undefined): EnergyCertificateSourceProject {
  if (!source || isFormData(source)) return {};
  return source.project ?? source;
}

function getExtractionData(
  extraction?: { extractedData?: AIExtraction['extractedData'] | null } | null
): AIExtraction['extractedData'] {
  return extraction?.extractedData ?? {};
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function scaledX(x: number, actualWidth: number) {
  return (x / PAGE_SIZE.width) * actualWidth;
}

function scaledY(y: number, actualHeight: number) {
  return (y / PAGE_SIZE.height) * actualHeight;
}

function setFont(ctx: CanvasRenderingContext2D, sizePx: number, weight = 600) {
  ctx.font = `${weight} ${sizePx}px ${FONT_FAMILY}`;
  ctx.fillStyle = TEXT_COLOR;
}

function drawTextFit(
  ctx: CanvasRenderingContext2D,
  text: string,
  box: Box,
  actualWidth: number,
  actualHeight: number,
  baseFontSize: number,
  align: CanvasTextAlign = 'left'
) {
  if (!text) return;

  const x1 = scaledX(box[0], actualWidth);
  const y1 = scaledY(box[1], actualHeight);
  const x2 = scaledX(box[2], actualWidth);
  const y2 = scaledY(box[3], actualHeight);
  const maxWidth = Math.max(x2 - x1 - 8, 32);
  const fontFloor = Math.max(baseFontSize * 0.72, 24);
  let fontSize = baseFontSize;

  setFont(ctx, fontSize);
  while (ctx.measureText(text).width > maxWidth && fontSize > fontFloor) {
    fontSize -= 1;
    setFont(ctx, fontSize);
  }

  ctx.textBaseline = 'middle';
  ctx.textAlign = align;
  const drawX = align === 'center' ? (x1 + x2) / 2 : x1 + 4;
  const drawY = (y1 + y2) / 2;
  ctx.fillText(text, drawX, drawY, maxWidth);
}

function drawMatrixValue(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  actualWidth: number,
  actualHeight: number,
  fontSize: number
) {
  if (!text) return;
  setFont(ctx, fontSize);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, scaledX(x, actualWidth), scaledY(y, actualHeight));
}

async function drawSignature(
  ctx: CanvasRenderingContext2D,
  dataUrl: string | null | undefined,
  box: Box
) {
  if (!dataUrl) return;
  const image = await loadImage(dataUrl);
  const x = scaledX(box[0], ctx.canvas.width);
  const y = scaledY(box[1], ctx.canvas.height);
  const width = scaledX(box[2] - box[0], ctx.canvas.width);
  const height = scaledY(box[3] - box[1], ctx.canvas.height);
  ctx.drawImage(image, x, y, width, height);
}

async function renderTemplate(draw: (ctx: CanvasRenderingContext2D) => Promise<void> | void) {
  const template = await loadImage(TEMPLATE_SRC);
  const canvas = document.createElement('canvas');
  canvas.width = template.naturalWidth;
  canvas.height = template.naturalHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context unavailable');

  ctx.drawImage(template, 0, 0, canvas.width, canvas.height);
  await draw(ctx);
  return canvas.toDataURL('image/jpeg', 0.92);
}

function boolLabel(value: boolean | null | undefined) {
  if (value === true) return 'SI';
  if (value === false) return 'NO';
  return '';
}

function soldProductLabel(value: FormData['energyCertificate']['additional']['soldProduct']) {
  if (value === 'solo-paneles') return 'Solo Paneles Solares';
  if (value === 'solo-aerotermia') return 'Solo Aerotermia';
  if (value === 'paneles-y-aerotermia') return 'Paneles Solares y Aerotermia';
  if (value === 'ampliacion') return 'Ampliación';
  if (value === 'ampliacion-y-aerotermia') return 'Ampliación y Aerotermia';
  return '';
}

function heightLabel(value: FormData['energyCertificate']['housing']['averageFloorHeight']) {
  if (value === '<2.7m') return 'Menos de 2,7m';
  if (value === '2.7-3.2m') return 'Entre 2,7m y 3,2m';
  if (value === '>3.2m') return 'Más de 3,2m';
  return '';
}

function thermalTypeLabel(value: FormData['energyCertificate']['thermal']['thermalInstallationType']) {
  if (value === 'termo-electrico') return 'Termo Eléctrico (Sólo ACS)';
  if (value === 'calentador') return 'Calentador (Sólo ACS)';
  if (value === 'caldera') return 'Caldera (ACS y calefacción)';
  if (value === 'aerotermia') return 'Aerotermia';
  return '';
}

function fuelLabel(value: FormData['energyCertificate']['thermal']['boilerFuelType']) {
  if (value === 'gas') return 'Gas';
  if (value === 'gasoil') return 'Gasoil';
  if (value === 'electricidad') return 'Electricidad';
  if (value === 'aerotermia') return 'Aerotermia';
  return '';
}

function heatingTypeLabel(value: FormData['energyCertificate']['thermal']['heatingEmitterType']) {
  if (value === 'radiadores-agua') return 'Radiadores de Agua';
  if (value === 'radiadores-electricos') return 'Radiadores eléctricos';
  if (value === 'suelo-radiante') return 'Suelo Radiante';
  return '';
}

function radiatorMaterialLabel(value: FormData['energyCertificate']['thermal']['radiatorMaterial']) {
  if (value === 'hierro-fundido') return 'Hierro fundido';
  if (value === 'aluminio') return 'Aluminio';
  if (value === 'no-aplica') return 'No aplica';
  return '';
}

function airTypeLabel(value: FormData['energyCertificate']['thermal']['airConditioningType']) {
  if (value === 'frio-calor') return 'Frío y Calor';
  if (value === 'frio') return 'Frío';
  return '';
}

function snapshotFromSource(source: EnergyCertificateRenderSource | null | undefined) {
  const formData = getSourceFormData(source);
  const dniFront = getExtractionData(formData?.dni?.front?.extraction);
  const dniBack = getExtractionData(formData?.dni?.back?.extraction);
  const ibi = getExtractionData(formData?.ibi?.extraction);
  const ebPages = formData?.electricityBill?.pages || [];
  const ebData = ebPages.map((page) => getExtractionData(page?.extraction));
  const eb0 = ebData[0] || {};
  const project = getSourceProject(source);

  return {
    formData,
    customerName: dniFront.fullName || eb0.titular || ibi.titular || project?.customerName || '',
    address: eb0.direccionSuministro || dniBack.address || ibi.direccion || '',
    phone: project?.phone || '',
    email: project?.email || '',
    dniNumber: dniFront.dniNumber || eb0.nifTitular || ibi.titularNif || '',
    assessor: project?.assessor || '',
    today: new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Madrid' })).toLocaleString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }),
  };
}

const FIELD_BOXES = {
  customerName: [1245, 329, 2100, 395] as Box,
  isExistingCustomer: [1245, 408, 2100, 474] as Box,
  address: [1245, 488, 2100, 554] as Box,
  phone: [1245, 566, 2100, 632] as Box,
  email: [1245, 647, 2100, 713] as Box,
  dniNumber: [1245, 726, 2100, 792] as Box,
  assessor: [1245, 805, 2100, 872] as Box,
  formDate: [1245, 885, 2100, 951] as Box,
  soldProduct: [1245, 964, 2100, 1030] as Box,
  cadastralReference: [1245, 1364, 2100, 1430] as Box,
  habitableAreaM2: [1245, 1443, 2100, 1508] as Box,
  floorCount: [1245, 1522, 2100, 1588] as Box,
  averageFloorHeight: [1245, 1601, 2100, 1668] as Box,
  bedroomCount: [1245, 1680, 2100, 1747] as Box,
  windowFrameMaterial: [1245, 2047, 2100, 2114] as Box,
  doorMaterial: [1245, 2126, 2100, 2194] as Box,
  windowGlassType: [1245, 2207, 2100, 2272] as Box,
  hasShutters: [1245, 2286, 2100, 2351] as Box,
  shutterWindowCount: [1245, 2364, 2100, 2432] as Box,
  thermalInstallationType: [1245, 2445, 2100, 2510] as Box,
  boilerFuelType: [1245, 2524, 2100, 2589] as Box,
  equipmentDetails: [1245, 2603, 2100, 2670] as Box,
  heatingEmitterType: [1245, 2682, 2100, 2748] as Box,
  radiatorMaterial: [1245, 2762, 2100, 2827] as Box,
  hasAirConditioning: [1245, 2841, 2100, 2908] as Box,
  airConditioningDetails: [1245, 2921, 2100, 2988] as Box,
  hasSolarPanels: [1245, 3000, 2100, 3067] as Box,
  solarPanelDetails: [1245, 3079, 2100, 3146] as Box,
  signature: [1045, 3215, 1900, 3415] as Box,
} as const;

const MATRIX_CELLS = {
  windowsNorth: [1465, 1908],
  windowsSouth: [1560, 1908],
  windowsEast: [1658, 1908],
  windowsWest: [1754, 1908],
  doorsNorth: [1848, 1908],
  doorsSouth: [1944, 1908],
  doorsEast: [2038, 1908],
  doorsWest: [2106, 1908],
} as const;

export async function renderEnergyCertificateOverlay(
  source: EnergyCertificateRenderSource | null | undefined
): Promise<string> {
  const snapshot = snapshotFromSource(source);
  const energy = snapshot.formData.energyCertificate;

  return renderTemplate(async (ctx) => {
    const width = ctx.canvas.width;
    const height = ctx.canvas.height;
    const baseFont = width * 0.014;
    const matrixFont = width * 0.0125;

    drawTextFit(ctx, snapshot.customerName, FIELD_BOXES.customerName, width, height, baseFont);
    drawTextFit(ctx, boolLabel(energy.additional.isExistingCustomer), FIELD_BOXES.isExistingCustomer, width, height, baseFont);
    drawTextFit(ctx, snapshot.address, FIELD_BOXES.address, width, height, baseFont);
    drawTextFit(ctx, snapshot.phone, FIELD_BOXES.phone, width, height, baseFont);
    drawTextFit(ctx, snapshot.email, FIELD_BOXES.email, width, height, baseFont);
    drawTextFit(ctx, snapshot.dniNumber, FIELD_BOXES.dniNumber, width, height, baseFont);
    drawTextFit(ctx, snapshot.assessor, FIELD_BOXES.assessor, width, height, baseFont);
    drawTextFit(ctx, snapshot.today, FIELD_BOXES.formDate, width, height, baseFont);
    drawTextFit(ctx, soldProductLabel(energy.additional.soldProduct), FIELD_BOXES.soldProduct, width, height, baseFont * 0.96);

    drawTextFit(ctx, energy.housing.cadastralReference, FIELD_BOXES.cadastralReference, width, height, baseFont * 0.95);
    drawTextFit(ctx, energy.housing.habitableAreaM2, FIELD_BOXES.habitableAreaM2, width, height, baseFont);
    drawTextFit(ctx, energy.housing.floorCount, FIELD_BOXES.floorCount, width, height, baseFont);
    drawTextFit(ctx, heightLabel(energy.housing.averageFloorHeight), FIELD_BOXES.averageFloorHeight, width, height, baseFont * 0.95);
    drawTextFit(ctx, energy.housing.bedroomCount, FIELD_BOXES.bedroomCount, width, height, baseFont);

    drawMatrixValue(ctx, energy.housing.windowsByOrientation.north, MATRIX_CELLS.windowsNorth[0], MATRIX_CELLS.windowsNorth[1], width, height, matrixFont);
    drawMatrixValue(ctx, energy.housing.windowsByOrientation.south, MATRIX_CELLS.windowsSouth[0], MATRIX_CELLS.windowsSouth[1], width, height, matrixFont);
    drawMatrixValue(ctx, energy.housing.windowsByOrientation.east, MATRIX_CELLS.windowsEast[0], MATRIX_CELLS.windowsEast[1], width, height, matrixFont);
    drawMatrixValue(ctx, energy.housing.windowsByOrientation.west, MATRIX_CELLS.windowsWest[0], MATRIX_CELLS.windowsWest[1], width, height, matrixFont);
    drawMatrixValue(ctx, energy.housing.doorsByOrientation.north, MATRIX_CELLS.doorsNorth[0], MATRIX_CELLS.doorsNorth[1], width, height, matrixFont);
    drawMatrixValue(ctx, energy.housing.doorsByOrientation.south, MATRIX_CELLS.doorsSouth[0], MATRIX_CELLS.doorsSouth[1], width, height, matrixFont);
    drawMatrixValue(ctx, energy.housing.doorsByOrientation.east, MATRIX_CELLS.doorsEast[0], MATRIX_CELLS.doorsEast[1], width, height, matrixFont);
    drawMatrixValue(ctx, energy.housing.doorsByOrientation.west, MATRIX_CELLS.doorsWest[0], MATRIX_CELLS.doorsWest[1], width, height, matrixFont);

    drawTextFit(ctx, energy.housing.windowFrameMaterial || '', FIELD_BOXES.windowFrameMaterial, width, height, baseFont);
    drawTextFit(ctx, energy.housing.doorMaterial, FIELD_BOXES.doorMaterial, width, height, baseFont);
    drawTextFit(ctx, energy.housing.windowGlassType || '', FIELD_BOXES.windowGlassType, width, height, baseFont);
    drawTextFit(ctx, boolLabel(energy.housing.hasShutters), FIELD_BOXES.hasShutters, width, height, baseFont);
    drawTextFit(ctx, energy.housing.shutterWindowCount, FIELD_BOXES.shutterWindowCount, width, height, baseFont);

    drawTextFit(ctx, thermalTypeLabel(energy.thermal.thermalInstallationType), FIELD_BOXES.thermalInstallationType, width, height, baseFont * 0.95);
    drawTextFit(ctx, fuelLabel(energy.thermal.boilerFuelType), FIELD_BOXES.boilerFuelType, width, height, baseFont);
    drawTextFit(ctx, energy.thermal.equipmentDetails, FIELD_BOXES.equipmentDetails, width, height, baseFont * 0.9);
    drawTextFit(ctx, heatingTypeLabel(energy.thermal.heatingEmitterType), FIELD_BOXES.heatingEmitterType, width, height, baseFont * 0.95);
    drawTextFit(ctx, radiatorMaterialLabel(energy.thermal.radiatorMaterial), FIELD_BOXES.radiatorMaterial, width, height, baseFont);
    drawTextFit(ctx, boolLabel(energy.thermal.hasAirConditioning), FIELD_BOXES.hasAirConditioning, width, height, baseFont);

    const airDetails = energy.thermal.hasAirConditioning
      ? [airTypeLabel(energy.thermal.airConditioningType), energy.thermal.airConditioningDetails].filter(Boolean).join(' — ')
      : 'No aplica';
    drawTextFit(ctx, airDetails, FIELD_BOXES.airConditioningDetails, width, height, baseFont * 0.88);

    drawTextFit(ctx, boolLabel(energy.additional.hasSolarPanels), FIELD_BOXES.hasSolarPanels, width, height, baseFont);
    drawTextFit(
      ctx,
      energy.additional.hasSolarPanels ? energy.additional.solarPanelDetails : 'No aplica',
      FIELD_BOXES.solarPanelDetails,
      width,
      height,
      baseFont * 0.88
    );

    if (energy.customerSignature) {
      await drawSignature(ctx, energy.customerSignature, FIELD_BOXES.signature);
    }
  });
}

export async function createRenderedEnergyCertificateAsset(
  source: EnergyCertificateRenderSource | null | undefined
): Promise<RenderedDocumentAsset> {
  const imageDataUrl = await renderEnergyCertificateOverlay(source);
  return {
    imageDataUrl,
    generatedAt: new Date().toISOString(),
    templateVersion: ENERGY_CERTIFICATE_TEMPLATE_VERSION,
  };
}
