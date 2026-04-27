/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  getSignedDocumentDefinitions,
  type SignedDocumentKind,
} from '@/lib/signedDocumentOverlays';
import { isEnergyCertificateReadyToComplete } from '@/lib/energyCertificateValidation';
import {
  getIdentityDocumentPendingLabel,
  isIdentityDocumentComplete,
} from '@/lib/identityDocument';
import {
  getAdditionalBankDocumentFileLabel,
  normalizeAdditionalBankDocuments,
} from '@/lib/additionalBankDocuments';
import { getPropertyPhotoGroups } from '@/lib/propertyPhotoGroups';

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
  status: 'complete' | 'deferred' | 'pending';
}

export interface DashboardAssetItem {
  key: string;
  label: string;
  dataUrl: string;
  mimeType: string | null;
  filename?: string | null;
  needsManualReview?: boolean;
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

export interface DashboardStatusItem {
  key: string;
  label: string;
  stateLabel: string;
  tone: 'success' | 'pending' | 'warning' | 'muted';
  downloadCount?: number;
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
  firstName: string | null;
  lastName: string | null;
  customerLanguage: string | null;
  isCompany: boolean;
  companyName: string | null;
  companyNIF: string | null;
  companyAddress: string | null;
  companyMunicipality: string | null;
  companyPostalCode: string | null;
  documents: DashboardDocumentItem[];
  electricityPages: DashboardDocumentItem[];
  signedDocuments: DashboardSignedPdfItem[];
  energyCertificate: DashboardEnergyCertificateSummary;
  finalSignatures: DashboardAssetItem[];
  additionalDocuments: DashboardAssetItem[];
  photoGroups: DashboardAssetGroup[];
  downloadGroups: DashboardAssetGroup[];
  statusItems: DashboardStatusItem[];
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

function getPathMimeType(assetPath: string | null | undefined) {
  if (!assetPath || typeof assetPath !== 'string') return null;
  const lower = assetPath.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  return 'image/jpeg';
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

function hasDownloadablePhoto(photo: any) {
  if (!photo) return false;
  if (typeof photo === 'string') return photo.startsWith('data:');
  return Boolean(photo.preview);
}

function hasStoredAssetWithPrefix(assetFiles: Record<string, string>, prefix: string) {
  return Object.keys(assetFiles).some((key) => key.startsWith(prefix));
}

function countStoredAssetPrefix(assetFiles: Record<string, string>, prefix: string) {
  return Object.keys(assetFiles).filter((key) => key.startsWith(prefix)).length;
}

function countStoredOriginals(formData: any, assetFiles: Record<string, string>, section: 'dni' | 'ibi' | 'electricityBill') {
  const prefixes = {
    dni: 'dniOriginal_',
    ibi: 'ibiOriginal_',
    electricityBill: 'electricityOriginal_',
  } as const;
  return Math.max(countStoredPdfs(formData, section), countStoredAssetPrefix(assetFiles, prefixes[section]));
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
    firstName: dniFront.firstName || null,
    lastName: dniFront.lastName || null,
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
  const assetFiles = project?.assetFiles || {};
  const ibiPages = getIbiPages(formData);
  const primaryIbiPage = ibiPages[0] || null;
  const ibiAssetKeys = Object.keys(assetFiles).filter((key) => key.startsWith('ibi_')).sort();
  const primaryIbiAsset = ibiAssetKeys[0] ? assetFiles[ibiAssetKeys[0]] : null;
  const hasDniOriginal = hasStoredAssetWithPrefix(assetFiles, 'dniOriginal_');
  const hasIbiOriginal = hasStoredAssetWithPrefix(assetFiles, 'ibiOriginal_');

  const staticDocs: DashboardDocumentItem[] = [
    {
      key: 'dniFront',
      label: 'DNI frontal',
      shortLabel: 'DNI frontal',
      present: Boolean(
        hasDownloadablePhoto(formData?.dni?.front?.photo)
        || assetFiles.dniFront
        || (hasDniOriginal && (formData?.dni?.front?.photo || formData?.dni?.front?.extraction))
      ),
      dataUrl: formData?.dni?.front?.photo?.preview || assetFiles.dniFront || null,
      mimeType: getMimeType(formData?.dni?.front?.photo?.preview) || getPathMimeType(assetFiles.dniFront),
      needsManualReview: Boolean(formData?.dni?.front?.extraction?.needsManualReview),
      extractedData: formData?.dni?.front?.extraction?.extractedData || null,
    },
    {
      key: 'dniBack',
      label: 'DNI trasera',
      shortLabel: 'DNI trasera',
      present: Boolean(
        hasDownloadablePhoto(formData?.dni?.back?.photo)
        || assetFiles.dniBack
        || (hasDniOriginal && (formData?.dni?.back?.photo || formData?.dni?.back?.extraction))
      ),
      dataUrl: formData?.dni?.back?.photo?.preview || assetFiles.dniBack || null,
      mimeType: getMimeType(formData?.dni?.back?.photo?.preview) || getPathMimeType(assetFiles.dniBack),
      needsManualReview: Boolean(formData?.dni?.back?.extraction?.needsManualReview),
      extractedData: formData?.dni?.back?.extraction?.extractedData || null,
    },
    {
      key: 'ibi',
      label: 'IBI / Escritura',
      shortLabel: 'IBI',
      present: ibiPages.some((page) => hasDownloadablePhoto(page)) || ibiAssetKeys.length > 0 || hasIbiOriginal,
      dataUrl: primaryIbiPage?.preview || primaryIbiAsset || null,
      mimeType: getMimeType(primaryIbiPage?.preview) || getPathMimeType(primaryIbiAsset),
      needsManualReview: Boolean(formData?.ibi?.extraction?.needsManualReview),
      extractedData: formData?.ibi?.extraction?.extractedData || null,
    },
  ];

  return staticDocs;
}

export function getDashboardElectricityPages(project: any): DashboardDocumentItem[] {
  const formData = project?.formData || {};
  const assetFiles = project?.assetFiles || {};
  const pages = getElectricityPages(formData);
  const electricityAssetKeys = Object.keys(assetFiles)
    .filter((key) => key.startsWith('electricity_'))
    .sort();
  const hasElectricityOriginal = hasStoredAssetWithPrefix(assetFiles, 'electricityOriginal_');

  if (pages.length === 0) {
    if (electricityAssetKeys.length > 0) {
      return electricityAssetKeys.map((key, index) => ({
        key,
        label: `Factura luz — pág. ${index + 1}`,
        shortLabel: `Luz ${index + 1}`,
        present: true,
        dataUrl: assetFiles[key],
        mimeType: getPathMimeType(assetFiles[key]),
        needsManualReview: false,
        extractedData: null,
      }));
    }

    if (hasElectricityOriginal) {
      return [{
        key: 'electricity_0',
        label: 'Factura de luz',
        shortLabel: 'Luz',
        present: true,
        dataUrl: null,
        mimeType: null,
        needsManualReview: false,
        extractedData: null,
      }];
    }

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
    present: Boolean(
      hasDownloadablePhoto(page?.photo)
      || assetFiles[`electricity_${i}`]
      || (hasElectricityOriginal && (page?.photo || page?.extraction))
    ),
    dataUrl: page?.photo?.preview || assetFiles[`electricity_${i}`] || null,
    mimeType: getMimeType(page?.photo?.preview) || getPathMimeType(assetFiles[`electricity_${i}`]),
    needsManualReview: Boolean(page?.extraction?.needsManualReview),
    extractedData: page?.extraction?.extractedData || null,
  }));
}

export function getDashboardSignedPdfItems(project: any): DashboardSignedPdfItem[] {
  const signatureDeferred = Boolean(project?.formData?.representation?.signatureDeferred);
  return getSignedDocumentDefinitions(project).map((item) => {
    const present = Boolean(item.present);
    return {
      key: item.key,
      label: item.label,
      filename: item.filename,
      present,
      status: present ? 'complete' : signatureDeferred ? 'deferred' : 'pending',
    };
  });
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

    // Guard: downgrade 'completed' → 'pending' whenever field validation fails,
    // regardless of whether a renderedDocument exists. An empty field means the
    // EC is incomplete and must show as pending.
    const status: 'completed' | 'skipped' | 'pending' =
      rawStatus === 'completed' && ecData && !isEnergyCertificateReadyToComplete(ecData)
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

  // Fallback path (no project.summary): always re-validate fields before trusting 'completed'.
  // A renderedDocument alone is not sufficient — any empty required field downgrades to pending.
  if (energy?.status === 'completed') {
    const rendered = energy?.renderedDocument?.imageDataUrl || null;
    if (isEnergyCertificateReadyToComplete(energy)) {
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

function resolveAdditionalBankDocumentSource(
  file: { dataUrl?: string; assetKey?: string },
  assetFiles: Record<string, string>,
) {
  if (typeof file?.dataUrl === 'string' && file.dataUrl) return file.dataUrl;
  if (typeof file?.assetKey === 'string' && file.assetKey && assetFiles[file.assetKey]) {
    return assetFiles[file.assetKey];
  }
  return null;
}

function resolveAdditionalBankDocumentMimeType(
  file: { mimeType?: string; assetKey?: string },
  source: string | null,
  assetFiles: Record<string, string>,
) {
  if (typeof file?.mimeType === 'string' && file.mimeType) return file.mimeType;
  if (typeof file?.assetKey === 'string' && file.assetKey && assetFiles[file.assetKey]) {
    return getPathMimeType(assetFiles[file.assetKey]);
  }
  return getMimeType(source);
}

export function getDashboardAdditionalBankDocumentAssets(project: any): DashboardAssetItem[] {
  const assetFiles = project?.assetFiles || {};
  const documents = normalizeAdditionalBankDocuments(project?.formData?.additionalBankDocuments);

  if (documents.length === 0 && Array.isArray(project?.summary?.additionalDocuments)) {
    return project.summary.additionalDocuments
      .filter((item: any) => item && typeof item === 'object')
      .map((item: any, index: number) => ({
        key: typeof item.key === 'string' ? item.key : `additional-document-${index}`,
        label: typeof item.label === 'string' && item.label.trim() ? item.label : 'Documento adicional',
        dataUrl: typeof item.dataUrl === 'string' ? item.dataUrl : '',
        mimeType: typeof item.mimeType === 'string' ? item.mimeType : null,
        filename: typeof item.filename === 'string' && item.filename.trim() ? item.filename.trim() : null,
        needsManualReview: Boolean(item.needsManualReview),
      }));
  }

  return documents.flatMap((entry) => entry.files.flatMap((file, index) => {
    const source = resolveAdditionalBankDocumentSource(file, assetFiles);
    if (!source) return [];
    const needsManualReview = Boolean(entry.issue?.code === 'manual-review' || entry.extraction?.needsManualReview);

    return [{
      key: file.id || `${entry.id}-${index}`,
      label: getAdditionalBankDocumentFileLabel(entry, index),
      dataUrl: source,
      mimeType: resolveAdditionalBankDocumentMimeType(file, source, assetFiles),
      filename: typeof file.filename === 'string' && file.filename.trim()
        ? file.filename.trim()
        : getAdditionalBankDocumentFileLabel(entry, index),
      needsManualReview,
    }];
  }));
}

function buildStatusItem(
  key: string,
  label: string,
  stateLabel: string,
  tone: DashboardStatusItem['tone'],
  downloadCount = 0,
): DashboardStatusItem {
  const item: DashboardStatusItem = { key, label, stateLabel, tone };
  if (downloadCount > 0) item.downloadCount = downloadCount;
  return item;
}

function normalizeSummaryStatusItem(value: unknown): DashboardStatusItem | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  const key = typeof item.key === 'string' && item.key.trim() ? item.key.trim() : null;
  const label = typeof item.label === 'string' && item.label.trim() ? item.label.trim() : null;
  const stateLabel = typeof item.stateLabel === 'string' && item.stateLabel.trim() ? item.stateLabel.trim() : null;
  const tone = item.tone;
  const downloadCount = typeof item.downloadCount === 'number' ? Math.max(0, item.downloadCount) : 0;

  if (!key || !label || !stateLabel) return null;
  if (tone !== 'success' && tone !== 'pending' && tone !== 'warning' && tone !== 'muted') return null;

  const statusItem: DashboardStatusItem = { key, label, stateLabel, tone };
  if (downloadCount > 0) statusItem.downloadCount = downloadCount;
  return statusItem;
}

function statusFromPresence(
  key: string,
  label: string,
  present: boolean,
  needsManualReview = false,
  pendingLabel = 'pendiente',
  downloadCount = 0,
): DashboardStatusItem {
  if (needsManualReview) return buildStatusItem(key, label, 'revisar', 'warning', downloadCount);
  if (present) return buildStatusItem(key, label, '✓', 'success', downloadCount);
  return buildStatusItem(key, label, pendingLabel, 'pending', downloadCount);
}

function formatFileCount(count: number) {
  return `${count} archivo${count === 1 ? '' : 's'}`;
}

function countStoredPdfs(formData: any, section: 'dni' | 'ibi' | 'electricityBill') {
  const files = formData?.[section]?.originalPdfs;
  return Array.isArray(files) ? files.length : 0;
}

export function getDashboardStatusItems(project: any): DashboardStatusItem[] {
  if (!project?.formData && Array.isArray(project?.summary?.statusItems)) {
    return project.summary.statusItems
      .map(normalizeSummaryStatusItem)
      .filter(Boolean) as DashboardStatusItem[];
  }

  const formData = project?.formData || {};
  const assetFiles = project?.assetFiles || {};
  const dniFront = formData?.dni?.front || {};
  const dniBack = formData?.dni?.back || {};
  const hasDniOriginal = hasStoredAssetWithPrefix(assetFiles, 'dniOriginal_');
  const dniFrontPresent = Boolean(
    hasDownloadablePhoto(dniFront?.photo)
    || assetFiles.dniFront
    || (hasDniOriginal && (dniFront?.photo || dniFront?.extraction))
  );
  const dniBackPresent = Boolean(
    hasDownloadablePhoto(dniBack?.photo)
    || assetFiles.dniBack
    || (hasDniOriginal && (dniBack?.photo || dniBack?.extraction))
  );
  const dniComplete = isIdentityDocumentComplete({ front: dniFront, back: dniBack })
    || (dniFrontPresent && dniBackPresent);
  const dniPendingLabel = getIdentityDocumentPendingLabel(dniFront, dniBack) || 'pendiente';
  const dniNeedsManualReview = Boolean(
    dniFront?.extraction?.needsManualReview
    || dniBack?.extraction?.needsManualReview,
  );

  const ibiPages = getIbiPages(formData);
  const electricityPages = getElectricityPages(formData);
  const signedDocuments = getDashboardSignedPdfItems(project);
  const additionalDocuments = getDashboardAdditionalBankDocumentAssets(project);
  const directDniDownloadCount = [
    hasDownloadablePhoto(dniFront?.photo) || assetFiles.dniFront,
    hasDownloadablePhoto(dniBack?.photo) || assetFiles.dniBack,
  ].filter(Boolean).length;
  const directIbiDownloadCount = Math.max(
    ibiPages.filter((page) => hasDownloadablePhoto(page)).length,
    countStoredAssetPrefix(assetFiles, 'ibi_'),
  );
  const directElectricityDownloadCount = Math.max(
    electricityPages.filter((page) => hasDownloadablePhoto(page?.photo)).length,
    countStoredAssetPrefix(assetFiles, 'electricity_'),
  );
  const dniDownloadCount = directDniDownloadCount + countStoredOriginals(formData, assetFiles, 'dni');
  const ibiDownloadCount = directIbiDownloadCount + countStoredOriginals(formData, assetFiles, 'ibi');
  const electricityDownloadCount = directElectricityDownloadCount
    + countStoredOriginals(formData, assetFiles, 'electricityBill');
  const ibiPresent = directIbiDownloadCount > 0 || countStoredOriginals(formData, assetFiles, 'ibi') > 0;
  const electricityPresent = directElectricityDownloadCount > 0
    || countStoredOriginals(formData, assetFiles, 'electricityBill') > 0;

  const items: DashboardStatusItem[] = [
    statusFromPresence('dni', 'DNI / NIE', dniComplete, dniNeedsManualReview, dniPendingLabel, dniDownloadCount),
    statusFromPresence(
      'ibi',
      'IBI / Escritura',
      ibiPresent,
      Boolean(formData?.ibi?.extraction?.needsManualReview),
      'pendiente',
      ibiDownloadCount,
    ),
  ];

  if (project?.productType !== 'aerothermal') {
    items.push(statusFromPresence(
      'electricity',
      'Factura de luz',
      electricityPresent,
      electricityPages.some((page: any) => Boolean(page?.extraction?.needsManualReview)),
      'pendiente',
      electricityDownloadCount,
    ));
  }

  if (signedDocuments.length > 0) {
    const allSigned = signedDocuments.every((item) => item.present);
    const deferred = !allSigned && signedDocuments.some((item) => item.status === 'deferred');
    items.push(
      allSigned
        ? buildStatusItem('representation', 'Representación', '✓', 'success', signedDocuments.filter((item) => item.present).length)
        : deferred
          ? buildStatusItem('representation', 'Representación', 'aplazada', 'muted')
          : buildStatusItem('representation', 'Representación', 'pendiente', 'pending'),
    );
  }

  if (additionalDocuments.length > 0) {
    const manualReview = additionalDocuments.some((item) => item.needsManualReview);
    items.push(
      buildStatusItem(
        'additional-documents',
        'Documento adicional',
        manualReview ? `${formatFileCount(additionalDocuments.length)} · revisar` : formatFileCount(additionalDocuments.length),
        manualReview ? 'warning' : 'success',
        additionalDocuments.length,
      ),
    );
  }

  return items;
}

export function getDashboardPhotoGroups(project: any): DashboardAssetGroup[] {
  const assetFiles = project?.assetFiles || {};

  return getPropertyPhotoGroups(project?.formData)
    .map((group) => {
      const previewItems = group.photos
        .map((photo, index) => toAssetItem(
          `${group.key}-${index}`,
          `${group.label} ${index + 1}`,
          photo?.preview,
        ))
        .filter(Boolean) as DashboardAssetItem[];

      if (previewItems.length > 0) {
        return { key: group.key, label: group.label, items: previewItems };
      }

      const storedKeys = Object.keys(assetFiles)
        .filter((key) => key.startsWith(`${group.key}_`))
        .sort();

      return {
        key: group.key,
        label: group.label,
        items: storedKeys.map((key, index) => ({
          key,
          label: `${group.label} ${index + 1}`,
          dataUrl: assetFiles[key],
          mimeType: getPathMimeType(assetFiles[key]),
        })),
      };
    })
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
  const additionalBankDocuments = getDashboardAdditionalBankDocumentAssets(project);

  return [
    { key: 'documents', label: 'Documentos', items: [...primaryDocuments, ...ibiItems, ...electricityItems] },
    { key: 'additional-bank-documents', label: 'Documentos adicionales', items: additionalBankDocuments },
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
  const additionalDocuments = getDashboardAdditionalBankDocumentAssets(project);
  const photoGroups = getDashboardPhotoGroups(project);
  const downloadGroups = getDashboardDownloadGroups(project);
  const statusItems = getDashboardStatusItems(project);
  const snapshot = getSnapshot(project);
  const counts = buildCounts(project, documents, electricityPages, signedDocuments, finalSignatures);
  const warnings = computeDashboardWarnings(project);

  const rep = project?.formData?.representation || {};

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
    firstName: project?.summary?.firstName ?? snapshot.firstName ?? null,
    lastName: project?.summary?.lastName ?? snapshot.lastName ?? null,
    customerLanguage: project?.summary?.customerLanguage ?? project?.customerLanguage ?? null,
    isCompany: !!(project?.summary?.isCompany ?? rep.isCompany),
    companyName: project?.summary?.companyName ?? rep.companyName ?? null,
    companyNIF: project?.summary?.companyNIF ?? rep.companyNIF ?? null,
    companyAddress: project?.summary?.companyAddress ?? rep.companyAddress ?? null,
    companyMunicipality: project?.summary?.companyMunicipality ?? rep.companyMunicipality ?? null,
    companyPostalCode: project?.summary?.companyPostalCode ?? rep.companyPostalCode ?? null,
    documents,
    electricityPages,
    signedDocuments,
    energyCertificate,
    finalSignatures,
    additionalDocuments,
    photoGroups,
    downloadGroups,
    statusItems,
    warnings,
    counts,
  };
}
