/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  getIdentityDocumentPendingLabel,
  isIdentityDocumentComplete,
} from '@/lib/identityDocument';
import type {
  DashboardAssetItem,
  DashboardDocumentItem,
  DashboardSignedPdfItem,
} from '@/lib/dashboardProject';

export interface DashboardStatusItem {
  key: string;
  label: string;
  stateLabel: string;
  tone: 'success' | 'pending' | 'warning' | 'muted';
  downloadCount?: number;
}

interface StatusItemDependencies {
  signedDocuments: DashboardSignedPdfItem[];
  additionalDocuments: DashboardAssetItem[];
  documents?: DashboardDocumentItem[];
  electricityPages?: DashboardDocumentItem[];
}

function getElectricityPages(formData: any): any[] {
  const bill = formData?.electricityBill;
  if (!bill) return [];
  if (Array.isArray(bill.pages)) return bill.pages;
  return [bill.front, bill.back].filter((page) => page?.photo);
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

function countStoredAssetPrefix(assetFiles: Record<string, string>, prefix: string) {
  return Object.keys(assetFiles).filter((key) => key.startsWith(prefix)).length;
}

function countStoredPdfs(formData: any, section: 'dni' | 'ibi' | 'electricityBill') {
  const files = formData?.[section]?.originalPdfs;
  return Array.isArray(files) ? files.length : 0;
}

function countStoredOriginals(
  formData: any,
  assetFiles: Record<string, string>,
  section: 'dni' | 'ibi' | 'electricityBill'
) {
  const prefixes = {
    dni: 'dniOriginal_',
    ibi: 'ibiOriginal_',
    electricityBill: 'electricityOriginal_',
  } as const;
  return Math.max(
    countStoredPdfs(formData, section),
    countStoredAssetPrefix(assetFiles, prefixes[section])
  );
}

function buildStatusItem(
  key: string,
  label: string,
  stateLabel: string,
  tone: DashboardStatusItem['tone'],
  downloadCount = 0
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
  const stateLabel = typeof item.stateLabel === 'string' && item.stateLabel.trim()
    ? item.stateLabel.trim()
    : null;
  const tone = item.tone;
  const downloadCount = typeof item.downloadCount === 'number'
    ? Math.max(0, item.downloadCount)
    : 0;

  if (!key || !label || !stateLabel) return null;
  if (tone !== 'success' && tone !== 'pending' && tone !== 'warning' && tone !== 'muted') {
    return null;
  }

  return buildStatusItem(key, label, stateLabel, tone, downloadCount);
}

function statusFromPresence(
  key: string,
  label: string,
  present: boolean,
  needsManualReview = false,
  pendingLabel = 'pendiente',
  downloadCount = 0
): DashboardStatusItem {
  if (needsManualReview) return buildStatusItem(key, label, 'revisar', 'warning', downloadCount);
  if (present) return buildStatusItem(key, label, '✓', 'success', downloadCount);
  return buildStatusItem(key, label, pendingLabel, 'pending', downloadCount);
}

function formatFileCount(count: number) {
  return `${count} archivo${count === 1 ? '' : 's'}`;
}

function getIdentityStatus(formData: any, assetFiles: Record<string, string>) {
  const dniFront = formData?.dni?.front || {};
  const dniBack = formData?.dni?.back || {};
  const hasDniOriginal = countStoredAssetPrefix(assetFiles, 'dniOriginal_') > 0;
  const frontPresent = Boolean(
    hasDownloadablePhoto(dniFront?.photo)
    || assetFiles.dniFront
    || (hasDniOriginal && (dniFront?.photo || dniFront?.extraction))
  );
  const backPresent = Boolean(
    hasDownloadablePhoto(dniBack?.photo)
    || assetFiles.dniBack
    || (hasDniOriginal && (dniBack?.photo || dniBack?.extraction))
  );
  const complete = isIdentityDocumentComplete({ front: dniFront, back: dniBack })
    || (frontPresent && backPresent);
  const downloadCount = [frontPresent, backPresent].filter(Boolean).length
    + countStoredOriginals(formData, assetFiles, 'dni');

  return statusFromPresence(
    'dni',
    'DNI / NIE',
    complete,
    Boolean(dniFront?.extraction?.needsManualReview || dniBack?.extraction?.needsManualReview),
    getIdentityDocumentPendingLabel(dniFront, dniBack) || 'pendiente',
    downloadCount
  );
}

function getPropertyStatusItems(formData: any, assetFiles: Record<string, string>, productType: string) {
  const ibiPages = getIbiPages(formData);
  const electricityPages = getElectricityPages(formData);
  const ibiDirectCount = Math.max(
    ibiPages.filter((page) => hasDownloadablePhoto(page)).length,
    countStoredAssetPrefix(assetFiles, 'ibi_')
  );
  const electricityDirectCount = Math.max(
    electricityPages.filter((page) => hasDownloadablePhoto(page?.photo)).length,
    countStoredAssetPrefix(assetFiles, 'electricity_')
  );
  const items = [
    statusFromPresence(
      'ibi',
      'IBI / Escritura',
      ibiDirectCount > 0 || countStoredOriginals(formData, assetFiles, 'ibi') > 0,
      Boolean(formData?.ibi?.extraction?.needsManualReview),
      'pendiente',
      ibiDirectCount + countStoredOriginals(formData, assetFiles, 'ibi')
    ),
  ];

  if (productType !== 'aerothermal') {
    items.push(statusFromPresence(
      'electricity',
      'Factura de luz',
      electricityDirectCount > 0
        || countStoredOriginals(formData, assetFiles, 'electricityBill') > 0,
      electricityPages.some((page: any) => Boolean(page?.extraction?.needsManualReview)),
      'pendiente',
      electricityDirectCount + countStoredOriginals(formData, assetFiles, 'electricityBill')
    ));
  }

  return items;
}

function getRepresentationStatusItem(signedDocuments: DashboardSignedPdfItem[]) {
  if (signedDocuments.length === 0) return null;
  const allSigned = signedDocuments.every((item) => item.present);
  if (allSigned) {
    return buildStatusItem(
      'representation',
      'Representación',
      '✓',
      'success',
      signedDocuments.filter((item) => item.present).length
    );
  }

  const deferred = signedDocuments.some((item) => item.status === 'deferred');
  return buildStatusItem(
    'representation',
    'Representación',
    deferred ? 'aplazada' : 'pendiente',
    deferred ? 'muted' : 'pending'
  );
}

function getAdditionalDocumentsStatusItem(additionalDocuments: DashboardAssetItem[]) {
  if (additionalDocuments.length === 0) return null;
  const manualReview = additionalDocuments.some((item) => item.needsManualReview);
  return buildStatusItem(
    'additional-documents',
    'Documento adicional',
    manualReview
      ? `${formatFileCount(additionalDocuments.length)} · revisar`
      : formatFileCount(additionalDocuments.length),
    manualReview ? 'warning' : 'success',
    additionalDocuments.length
  );
}

function findSummaryDocument(documents: DashboardDocumentItem[], key: string) {
  return documents.find((item) => item.key === key);
}

function getIdentitySummaryStatus(documents: DashboardDocumentItem[]) {
  const front = findSummaryDocument(documents, 'dniFront');
  const back = findSummaryDocument(documents, 'dniBack');
  const frontPresent = Boolean(front?.present);
  const backPresent = Boolean(back?.present);
  const downloadCount = [frontPresent, backPresent].filter(Boolean).length;
  const needsManualReview = Boolean(front?.needsManualReview || back?.needsManualReview);

  if (frontPresent && backPresent) {
    return buildStatusItem('dni', 'DNI / NIE', '✓', 'success', downloadCount);
  }
  if (frontPresent || backPresent) {
    return buildStatusItem(
      'dni',
      'DNI / NIE',
      frontPresent ? 'frontal' : 'trasera',
      needsManualReview ? 'warning' : 'pending',
      downloadCount
    );
  }
  return buildStatusItem('dni', 'DNI / NIE', 'pendiente', 'pending');
}

function getSummaryPropertyStatusItems(
  documents: DashboardDocumentItem[],
  electricityPages: DashboardDocumentItem[],
  productType: string
) {
  const ibi = findSummaryDocument(documents, 'ibi');
  const ibiPresent = Boolean(ibi?.present);
  const electricityCount = electricityPages.filter((page) => page.present).length;
  const items = [
    statusFromPresence(
      'ibi',
      'IBI / Escritura',
      ibiPresent,
      Boolean(ibi?.needsManualReview),
      'pendiente',
      ibiPresent ? 1 : 0
    ),
  ];

  if (productType !== 'aerothermal') {
    items.push(buildStatusItem(
      'electricity',
      'Factura de luz',
      electricityCount > 0
        ? `${electricityCount} página${electricityCount === 1 ? '' : 's'}`
        : 'pendiente',
      electricityCount > 0 ? 'success' : 'pending',
      electricityCount
    ));
  }

  return items;
}

function getSummaryDerivedStatusItems(
  project: any,
  documents: DashboardDocumentItem[],
  electricityPages: DashboardDocumentItem[],
  signedDocuments: DashboardSignedPdfItem[],
  additionalDocuments: DashboardAssetItem[]
) {
  const representationStatus = getRepresentationStatusItem(signedDocuments);
  const additionalStatus = getAdditionalDocumentsStatusItem(additionalDocuments);

  return [
    getIdentitySummaryStatus(documents),
    ...getSummaryPropertyStatusItems(documents, electricityPages, project?.productType),
    ...(representationStatus ? [representationStatus] : []),
    ...(additionalStatus ? [additionalStatus] : []),
  ];
}

export function getDashboardStatusItems(
  project: any,
  {
    signedDocuments,
    additionalDocuments,
    documents = [],
    electricityPages = [],
  }: StatusItemDependencies
): DashboardStatusItem[] {
  if (!project?.formData && Array.isArray(project?.summary?.statusItems)) {
    return project.summary.statusItems
      .map(normalizeSummaryStatusItem)
      .filter(Boolean) as DashboardStatusItem[];
  }
  if (!project?.formData && (documents.length > 0 || electricityPages.length > 0)) {
    return getSummaryDerivedStatusItems(
      project,
      documents,
      electricityPages,
      signedDocuments,
      additionalDocuments
    );
  }

  const formData = project?.formData || {};
  const assetFiles = project?.assetFiles || {};
  const representationStatus = getRepresentationStatusItem(signedDocuments);
  const additionalStatus = getAdditionalDocumentsStatusItem(additionalDocuments);

  return [
    getIdentityStatus(formData, assetFiles),
    ...getPropertyStatusItems(formData, assetFiles, project?.productType),
    ...(representationStatus ? [representationStatus] : []),
    ...(additionalStatus ? [additionalStatus] : []),
  ];
}
