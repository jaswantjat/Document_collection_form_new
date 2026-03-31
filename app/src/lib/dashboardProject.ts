/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  getSignedDocumentDefinitions,
  type SignedDocumentKind,
} from '@/lib/signedDocumentOverlays';
import { isEnergyCertificateReadyToComplete } from '@/lib/energyCertificateValidation';

export type DashboardDocumentKey = string;

export interface DashboardDocumentItem {
  key: DashboardDocumentKey;
  label: string;
  shortLabel: string;
  present: boolean;
  dataUrl: string | null;
  mimeType: string | null;
  needsManualReview: boolean;
  extractedData: Record<string, any> | null;
}

export interface DashboardSignedPdfItem {
  key: SignedDocumentKind;
  label: string;
  filename: string;
  present: boolean;
}

export interface DashboardAssetItem {
  key: string;
  label: string;
  dataUrl: string;
  mimeType: string | null;
}

export interface DashboardAssetGroup {
  key: string;
  label: string;
  items: DashboardAssetItem[];
}

export interface DashboardWarning {
  key: string;
  message: string;
}

export interface DashboardEnergyCertificateSummary {
  status: 'pending' | 'skipped' | 'completed';
  label: string;
  completedAt: string | null;
  asset: DashboardAssetItem | null;
  needsRegeneration: boolean;
}

export interface DashboardProjectSummary {
  location: string | null;
  lastUpdated: string | null;
  address: string | null;
  customerDisplayName: string;
  documents: DashboardDocumentItem[];
  electricityPages: DashboardDocumentItem[];
  signedDocuments: DashboardSignedPdfItem[];
  energyCertificate: DashboardEnergyCertificateSummary;
  finalSignatures: DashboardAssetItem[];
  photoGroups: DashboardAssetGroup[];
  downloadGroups: DashboardAssetGroup[];
  warnings: DashboardWarning[];
  counts: {
    documentsPresent: number;
    documentsTotal: number;
    manualReview: number;
    signedFormsPresent: number;
    signedFormsTotal: number;
    pdfsAvailable: number;
    pdfsTotal: number;
    finalSignaturesPresent: number;
    finalSignaturesTotal: number;
    documentsRemaining: number;
  };
}

function getMimeType(dataUrl: string | null | undefined) {
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return null;
  return dataUrl.slice(5, dataUrl.indexOf(';')) || null;
}

function getLocation(project: any) {
  return project?.summary?.location
    ?? project?.formData?.location
    ?? project?.formData?.representation?.location
    ?? null;
}

function getElectricityPages(formData: any): any[] {
  const bill = formData?.electricityBill;
  if (!bill) return [];
  if (Array.isArray(bill.pages)) return bill.pages;
  // Legacy front/back migration
  const pages: any[] = [];
  if (bill.front?.photo) pages.push(bill.front);
  if (bill.back?.photo) pages.push(bill.back);
  return pages;
}

function getIbiPages(formData: any): any[] {
  if (Array.isArray(formData?.ibi?.pages) && formData.ibi.pages.length > 0) {
    return formData.ibi.pages;
  }
  return formData?.ibi?.photo ? [formData.ibi.photo] : [];
}

function mergeElectricityData(pages: any[]): Record<string, any> {
  const merged: Record<string, any> = {};
  for (const page of pages) {
    const data = page?.extraction?.extractedData || {};
    for (const [key, value] of Object.entries(data)) {
      if (value && !merged[key]) merged[key] = value;
    }
  }
  return merged;
}

function getSnapshot(project: any) {
  const formData = project?.formData || {};
  const dniFront = formData?.dni?.front?.extraction?.extractedData || {};
  const dniBack = formData?.dni?.back?.extraction?.extractedData || {};
  const ibi = formData?.ibi?.extraction?.extractedData || {};
  const ebPages = getElectricityPages(formData);
  const eb = mergeElectricityData(ebPages);
  const representation = formData?.representation || {};

  return {
    location: getLocation(project),
    fullName:
      dniFront.fullName
      || eb.titular
      || ibi.titular
      || project?.customerName
      || '',
    address:
      eb.direccionSuministro
      || dniBack.address
      || ibi.direccion
      || '',
    municipality:
      eb.municipio
      || dniBack.municipality
      || ibi.municipio
      || '',
    // Province: electricity bill only (IBI and DNI excluded — matches backend behaviour)
    province:
      eb.provincia
      || '',
    postalCode:
      eb.codigoPostal
      || ibi.codigoPostal
      || representation.postalCode
      || '',
  };
}

function buildDisplayAddress(project: any) {
  const summaryAddress = project?.summary?.displayAddress || project?.summary?.address;
  if (summaryAddress) return summaryAddress;

  const snapshot = getSnapshot(project);
  const pieces: string[] = [];
  if (snapshot.address) pieces.push(snapshot.address);

  const locality = [snapshot.postalCode, snapshot.municipality].filter(Boolean).join(' ');
  if (locality && !pieces.some((piece) => piece.includes(locality))) {
    pieces.push(locality);
  }

  if (
    snapshot.province
    && !pieces.some((piece) => piece.toLowerCase().includes(String(snapshot.province).toLowerCase()))
  ) {
    pieces.push(snapshot.province);
  }

  return pieces.join(', ') || null;
}

function toAssetItem(key: string, label: string, dataUrl: string | null | undefined): DashboardAssetItem | null {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  return {
    key,
    label,
    dataUrl,
    mimeType: getMimeType(dataUrl),
  };
}

export function getDashboardDocuments(project: any): DashboardDocumentItem[] {
  const formData = project?.formData || {};
  const ibiPages = getIbiPages(formData);
  const primaryIbiPage = ibiPages[0] || null;

  const staticDocs: DashboardDocumentItem[] = [
    {
      key: 'dniFront',
      label: 'DNI frontal',
      shortLabel: 'DNI front',
      present: Boolean(formData?.dni?.front?.photo?.preview),
      dataUrl: formData?.dni?.front?.photo?.preview || null,
      mimeType: getMimeType(formData?.dni?.front?.photo?.preview),
      needsManualReview: Boolean(formData?.dni?.front?.extraction?.needsManualReview),
      extractedData: formData?.dni?.front?.extraction?.extractedData || null,
    },
    {
      key: 'dniBack',
      label: 'DNI trasera',
      shortLabel: 'DNI back',
      present: Boolean(formData?.dni?.back?.photo?.preview),
      dataUrl: formData?.dni?.back?.photo?.preview || null,
      mimeType: getMimeType(formData?.dni?.back?.photo?.preview),
      needsManualReview: Boolean(formData?.dni?.back?.extraction?.needsManualReview),
      extractedData: formData?.dni?.back?.extraction?.extractedData || null,
    },
    {
      key: 'ibi',
      label: 'IBI / Escritura',
      shortLabel: 'IBI',
      present: ibiPages.length > 0,
      dataUrl: primaryIbiPage?.preview || null,
      mimeType: getMimeType(primaryIbiPage?.preview),
      needsManualReview: Boolean(formData?.ibi?.extraction?.needsManualReview),
      extractedData: formData?.ibi?.extraction?.extractedData || null,
    },
  ];

  return staticDocs;
}

export function getDashboardElectricityPages(project: any): DashboardDocumentItem[] {
  const formData = project?.formData || {};
  const pages = getElectricityPages(formData);

  if (pages.length === 0) {
    return [{
      key: 'electricity_0',
      label: 'Factura de luz',
      shortLabel: 'Luz',
      present: false,
      dataUrl: null,
      mimeType: null,
      needsManualReview: false,
      extractedData: null,
    }];
  }

  return pages.map((page: any, i: number) => ({
    key: `electricity_${i}`,
    label: `Factura luz — pág. ${i + 1}`,
    shortLabel: `Luz ${i + 1}`,
    present: Boolean(page?.photo?.preview),
    dataUrl: page?.photo?.preview || null,
    mimeType: getMimeType(page?.photo?.preview),
    needsManualReview: Boolean(page?.extraction?.needsManualReview),
    extractedData: page?.extraction?.extractedData || null,
  }));
}

export function getDashboardSignedPdfItems(project: any): DashboardSignedPdfItem[] {
  return getSignedDocumentDefinitions(project).map((item) => ({
    key: item.key,
    label: item.label,
    filename: item.filename,
    present: Boolean(item.present),
  }));
}

export function getDashboardEnergyCertificateSummary(project: any): DashboardEnergyCertificateSummary {
  const summary = project?.summary?.energyCertificate;
  const ecData = project?.formData?.energyCertificate;

  if (summary) {
    const rawStatus =
      summary.status === 'completed'
        ? 'completed'
        : summary.status === 'skipped'
          ? 'skipped'
          : 'pending';

    const rendered = ecData?.renderedDocument?.imageDataUrl || null;

    // Guard: downgrade 'completed' → 'pending' only when there is NO rendered document
    // AND field validation also fails. A stored renderedDocument is proof the EC was
    // valid at the time of completion — trust it and never downgrade those records.
    const status: 'completed' | 'skipped' | 'pending' =
      rawStatus === 'completed' && !rendered && ecData && !isEnergyCertificateReadyToComplete(ecData)
        ? 'pending'
        : rawStatus;

    return {
      status,
      label: status === 'completed' ? 'Completado' : status === 'skipped' ? 'Saltado por cliente' : 'Pendiente',
      completedAt: summary.completedAt ?? null,
      asset: status === 'completed' && rendered
        ? toAssetItem('energy-certificate', 'Certificado energético', rendered)
        : null,
      needsRegeneration: status === 'completed' && !rendered,
    };
  }

  const energy = ecData;

  // Fallback path (no project.summary): trust rendered document as proof of valid completion;
  // otherwise re-validate fields before trusting 'completed'.
  if (energy?.status === 'completed') {
    const rendered = energy?.renderedDocument?.imageDataUrl || null;
    if (rendered || isEnergyCertificateReadyToComplete(energy)) {
      return {
        status: 'completed',
        label: 'Completado',
        completedAt: energy.completedAt ?? null,
        asset: rendered ? toAssetItem('energy-certificate', 'Certificado energético', rendered) : null,
        needsRegeneration: !rendered,
      };
    }
  }

  if (energy?.status === 'skipped') {
    return {
      status: 'skipped',
      label: 'Saltado por cliente',
      completedAt: null,
      asset: null,
      needsRegeneration: false,
    };
  }

  if (energy?.status === 'in-progress') {
    return {
      status: 'pending',
      label: 'Pendiente',
      completedAt: null,
      asset: null,
      needsRegeneration: false,
    };
  }

  return {
    status: 'pending',
    label: 'Pendiente',
    completedAt: null,
    asset: null,
    needsRegeneration: false,
  };
}

export function getDashboardFinalSignatureAssets(project: any): DashboardAssetItem[] {
  const formData = project?.formData || {};
  return [
    toAssetItem('customerSignature', 'Firma cliente', formData?.signatures?.customerSignature),
    toAssetItem('repSignature', 'Firma comercial', formData?.signatures?.repSignature),
  ].filter(Boolean) as DashboardAssetItem[];
}

export function getDashboardPhotoGroups(project: any): DashboardAssetGroup[] {
  const formData = project?.formData || {};
  const groups = [
    {
      key: 'electricalPanel',
      label: 'Cuadro eléctrico',
      photos: formData?.electricalPanel?.photos || [],
    },
    {
      key: 'roof',
      label: 'Tejado',
      photos: formData?.roof?.photos || [],
    },
    {
      key: 'installationSpace',
      label: 'Espacio de instalación',
      photos: formData?.installationSpace?.photos || [],
    },
    {
      key: 'radiators',
      label: 'Radiadores',
      photos: formData?.radiators?.photos || [],
    },
  ];

  return groups
    .map((group) => ({
      key: group.key,
      label: group.label,
      items: group.photos
        .map((photo: any, index: number) => toAssetItem(
          `${group.key}-${index}`,
          `${group.label} ${index + 1}`,
          photo?.preview,
        ))
        .filter(Boolean) as DashboardAssetItem[],
    }))
    .filter((group) => group.items.length > 0);
}

export function getDashboardDownloadGroups(project: any): DashboardAssetGroup[] {
  const formData = project?.formData || {};
  const primaryDocuments = getDashboardDocuments(project)
    .filter((item) => item.present && item.dataUrl && item.key !== 'ibi')
    .map((item) => ({
      key: item.key,
      label: item.label,
      dataUrl: item.dataUrl as string,
      mimeType: item.mimeType,
    }));

  const ibiItems = getIbiPages(formData)
    .filter((page: any) => page?.preview)
    .map((page: any, index: number) => ({
      key: `ibi-${index}`,
      label: `IBI / Escritura${index === 0 ? '' : ` ${index + 1}`}`,
      dataUrl: page.preview as string,
      mimeType: getMimeType(page.preview),
    }));

  const electricityItems = getDashboardElectricityPages(project)
    .filter((item) => item.present && item.dataUrl)
    .map((item) => ({
      key: item.key,
      label: item.label,
      dataUrl: item.dataUrl as string,
      mimeType: item.mimeType,
    }));

  const photoGroups = getDashboardPhotoGroups(project);
  const finalSignatures = getDashboardFinalSignatureAssets(project);

  return [
    { key: 'documents', label: 'Documentos', items: [...primaryDocuments, ...ibiItems, ...electricityItems] },
    { key: 'photos', label: 'Fotos del inmueble', items: photoGroups.flatMap((group) => group.items) },
    { key: 'final-signatures', label: 'Firmas finales', items: finalSignatures },
  ].filter((group) => group.items.length > 0);
}

function normalizeNamePart(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z]/g, '');
}

function computeDashboardWarnings(project: any): DashboardWarning[] {
  const warnings: DashboardWarning[] = [];
  const formData = project?.formData;
  if (!formData) return warnings;

  const dniName: string | null = formData?.dni?.front?.extraction?.extractedData?.fullName ?? null;
  const ebPages: any[] = getElectricityPages(formData);
  const ebTitular: string | null = ebPages[0]?.extraction?.extractedData?.titular ?? null;

  if (dniName && ebTitular) {
    const dniWords = dniName.split(/\s+/).filter((w: string) => w.length > 2).map(normalizeNamePart);
    const ebWords = ebTitular.split(/\s+/).filter((w: string) => w.length > 2).map(normalizeNamePart);
    const hasCommonWord = dniWords.some((w: string) => ebWords.includes(w));
    if (!hasCommonWord) {
      warnings.push({
        key: 'titular-mismatch',
        message: `El nombre del DNI («${dniName}») no coincide con el titular de la factura de luz («${ebTitular}»). Comprueba que el documento pertenezca al mismo titular.`,
      });
    }
  }

  return warnings;
}

function buildCounts(
  project: any,
  documents: DashboardDocumentItem[],
  electricityPages: DashboardDocumentItem[],
  signedDocuments: DashboardSignedPdfItem[],
  finalSignatures: DashboardAssetItem[]
) {
  const allDocs = [...documents, ...electricityPages];
  const summaryCounts = project?.summary?.counts;

  const documentsPresent = allDocs.filter((item) => item.present).length;
  const documentsTotal = allDocs.length;
  const manualReview = allDocs.filter((item) => item.needsManualReview).length;
  const pdfsAvailable = signedDocuments.filter((item) => item.present).length;
  const pdfsTotal = signedDocuments.length;

  if (summaryCounts) {
    return {
      ...summaryCounts,
      documentsPresent,
      documentsTotal,
      manualReview,
      documentsRemaining: documentsTotal - documentsPresent,
    };
  }

  return {
    documentsPresent,
    documentsTotal,
    manualReview,
    documentsRemaining: documentsTotal - documentsPresent,
    signedFormsPresent: signedDocuments.filter((item) => item.present).length,
    signedFormsTotal: signedDocuments.length,
    pdfsAvailable,
    pdfsTotal,
    finalSignaturesPresent: finalSignatures.length,
    finalSignaturesTotal: 2,
  };
}

export function getDashboardProjectSummary(project: any): DashboardProjectSummary {
  const documents = getDashboardDocuments(project);
  const electricityPages = getDashboardElectricityPages(project);
  const signedDocuments = getDashboardSignedPdfItems(project);
  const energyCertificate = getDashboardEnergyCertificateSummary(project);
  const finalSignatures = getDashboardFinalSignatureAssets(project);
  const photoGroups = getDashboardPhotoGroups(project);
  const downloadGroups = getDashboardDownloadGroups(project);
  const snapshot = getSnapshot(project);
  const counts = buildCounts(project, documents, electricityPages, signedDocuments, finalSignatures);
  const warnings = computeDashboardWarnings(project);

  return {
    location: getLocation(project),
    lastUpdated:
      project?.summary?.lastUpdated
      ?? project?.lastActivity
      ?? project?.latestSubmission?.timestamp
      ?? project?.createdAt
      ?? null,
    address: buildDisplayAddress(project),
    customerDisplayName: snapshot.fullName || project?.customerName || '—',
    documents,
    electricityPages,
    signedDocuments,
    energyCertificate,
    finalSignatures,
    photoGroups,
    downloadGroups,
    warnings,
    counts,
  };
}
