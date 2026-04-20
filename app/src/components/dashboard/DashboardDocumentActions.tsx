import React, { useEffect, useRef, useState } from 'react';
import {
  Archive,
  Download,
  Eye,
  Loader2,
  RefreshCw,
  Scissors,
} from 'lucide-react';
import type { DashboardProjectRecord } from '@/services/api';
import type {
  DashboardAssetItem,
  DashboardSignedPdfItem,
} from '@/lib/dashboardProject';
import {
  buildEnergyCertificatePdfFactory,
  buildSignedPdfFactory,
  downloadBlob,
  downloadDataUrlAsset,
  openDataUrlInNewTab,
  viewPDFInNewTab,
} from '@/lib/dashboardHelpers';

export type LoadProjectDetail = (
  projectCode: string
) => Promise<DashboardProjectRecord>;

type ResolveAssets = (project: DashboardProjectRecord) => DashboardAssetItem[];

export function AssetButtons({
  asset,
  projectCode,
  compact = false,
}: {
  asset: DashboardAssetItem;
  projectCode: string;
  compact?: boolean;
}) {
  const baseClasses = compact ? 'h-7 w-7 rounded-md' : 'h-8 rounded-lg px-2.5';

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          openDataUrlInNewTab(asset.dataUrl);
        }}
        className={`${baseClasses} inline-flex items-center justify-center border border-gray-200 bg-white text-gray-600 transition-colors hover:bg-gray-50`}
        title={`Ver ${asset.label}`}
      >
        <Eye className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          downloadDataUrlAsset(asset, projectCode);
        }}
        className={`${baseClasses} inline-flex items-center justify-center border border-gray-200 bg-white text-gray-600 transition-colors hover:bg-gray-50`}
        title={`Descargar ${asset.label}`}
      >
        <Download className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export const DeferredAssetButtons = React.memo(function DeferredAssetButtons({
  projectCode,
  loadProjectDetail,
  resolveAssets,
  onOpenDetail,
}: {
  projectCode: string;
  loadProjectDetail: LoadProjectDetail;
  resolveAssets: ResolveAssets;
  onOpenDetail?: () => void;
}) {
  const [loading, setLoading] = useState<'view' | 'download' | null>(null);
  const loadProjectDetailRef = useRef(loadProjectDetail);
  const resolveAssetsRef = useRef(resolveAssets);

  useEffect(() => {
    loadProjectDetailRef.current = loadProjectDetail;
  }, [loadProjectDetail]);

  useEffect(() => {
    resolveAssetsRef.current = resolveAssets;
  }, [resolveAssets]);

  const run = async (mode: 'view' | 'download') => {
    setLoading(mode);
    try {
      const project = await loadProjectDetailRef.current(projectCode);
      const assets = resolveAssetsRef.current(project);

      if (assets.length === 0) {
        alert('No se encontraron archivos descargables para este documento.');
        return;
      }

      if (mode === 'view') {
        if (assets.length === 1 || !onOpenDetail) {
          openDataUrlInNewTab(assets[0].dataUrl);
        } else {
          onOpenDetail();
        }
        return;
      }

      assets.forEach((asset) => downloadDataUrlAsset(asset, projectCode));
    } catch (err) {
      console.error('Deferred asset action failed:', err);
      alert('No se pudo acceder a los archivos del documento.');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div
      className="flex items-center gap-1.5"
      data-testid="asset-action-buttons"
      data-loading={loading ?? 'none'}
    >
      <button
        type="button"
        disabled={loading !== null}
        aria-busy={loading === 'view'}
        data-testid="view-asset-btn"
        onClick={(event) => {
          event.stopPropagation();
          void run('view');
        }}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
        title="Ver archivo"
      >
        {loading === 'view' ? (
          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Eye className="h-3.5 w-3.5" />
        )}
      </button>
      <button
        type="button"
        disabled={loading !== null}
        aria-busy={loading === 'download'}
        data-testid="download-asset-btn"
        onClick={(event) => {
          event.stopPropagation();
          void run('download');
        }}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
        title="Descargar archivo"
      >
        {loading === 'download' ? (
          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Download className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
  );
});

export function SignedPdfButtons({
  projectCode,
  item,
  loadProjectDetail,
  compact = false,
}: {
  projectCode: string;
  item: DashboardSignedPdfItem;
  loadProjectDetail: LoadProjectDetail;
  compact?: boolean;
}) {
  const [loading, setLoading] = useState<'view' | 'download' | null>(null);
  const baseClasses = compact ? 'h-7 w-7 rounded-md' : 'h-8 rounded-lg px-2.5';

  const run = async (mode: 'view' | 'download') => {
    setLoading(mode);
    try {
      const project = await loadProjectDetail(projectCode);
      const pdfFactory = await buildSignedPdfFactory(project, item);

      if (mode === 'view') {
        await viewPDFInNewTab(pdfFactory);
      } else {
        const blob = await pdfFactory();
        downloadBlob(blob, item.filename);
      }
    } catch (err) {
      console.error('Signed PDF action failed:', err);
      alert('No se pudo generar el PDF firmado.');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        disabled={loading !== null}
        onClick={(event) => {
          event.stopPropagation();
          void run('view');
        }}
        className={`${baseClasses} inline-flex items-center justify-center border border-emerald-200 bg-white text-emerald-700 transition-colors hover:bg-emerald-50 disabled:opacity-50`}
        title={`Ver ${item.label}`}
      >
        {loading === 'view' ? (
          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Eye className="h-3.5 w-3.5" />
        )}
      </button>
      <button
        type="button"
        disabled={loading !== null}
        onClick={(event) => {
          event.stopPropagation();
          void run('download');
        }}
        className={`${baseClasses} inline-flex items-center justify-center border border-emerald-200 bg-white text-emerald-700 transition-colors hover:bg-emerald-50 disabled:opacity-50`}
        title={`Descargar ${item.label}`}
      >
        {loading === 'download' ? (
          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Download className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
  );
}

async function callAutocropper(documentType: string, images: string[]) {
  const response = await fetch('/api/autocropper/process', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ documentType, images }),
  });

  if (!response.ok) {
    throw new Error('Autocropper service error');
  }

  return response.json() as Promise<{
    success: boolean;
    cropped_images?: string[];
    combined_pdf?: string;
  }>;
}

function downloadDataUrlBlob(
  dataUrl: string,
  filename: string,
  mimeType: string
) {
  const encoded = dataUrl.split(',')[1];
  const blob = new Blob(
    [Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0))],
    { type: mimeType }
  );
  downloadBlob(blob, filename);
}

export function AutocropperButton({
  documentType,
  images,
  onPDFReady,
  projectCode,
}: {
  documentType: 'dni' | 'ibi' | 'electricity';
  images: string[];
  onPDFReady?: (pdfDataUrl: string) => void;
  projectCode: string;
}) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    cropped_images: string[];
    combined_pdf: string;
  } | null>(null);

  const handleAutocrop = async () => {
    setLoading(true);
    setResult(null);
    try {
      const response = await callAutocropper(documentType, images);
      if (response.success && response.combined_pdf) {
        setResult({
          combined_pdf: response.combined_pdf,
          cropped_images: response.cropped_images || [],
        });
        onPDFReady?.(response.combined_pdf);
      } else {
        alert(
          'No se pudo procesar el documento. Asegúrate de que el servicio autocropper está activo.'
        );
      }
    } catch (err) {
      console.error('Autocropper error:', err);
      alert('Error al conectar con el servicio de recorte automático.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        disabled={loading}
        onClick={() => void handleAutocrop()}
        className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-eltex-blue-200 bg-white px-2.5 text-eltex-blue-700 transition-colors hover:bg-eltex-blue-50 disabled:opacity-50"
        title="Recortar y generar PDF"
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Scissors className="h-3.5 w-3.5" />
        )}
        {!loading ? <span className="text-xs font-medium">Recortar</span> : null}
      </button>
      {result?.combined_pdf ? (
        <>
          <button
            type="button"
            onClick={() =>
              downloadDataUrlBlob(
                result.combined_pdf,
                `${projectCode}_${documentType}_recortado.pdf`,
                'application/pdf'
              )
            }
            className="inline-flex h-8 items-center justify-center rounded-lg border border-emerald-200 bg-white px-2.5 text-emerald-700 transition-colors hover:bg-emerald-50"
            title="Descargar PDF recortado"
          >
            <Download className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              result.cropped_images.forEach((imageDataUrl, index) => {
                downloadDataUrlBlob(
                  imageDataUrl,
                  `${projectCode}_${documentType}_${index + 1}_recortado.jpg`,
                  'image/jpeg'
                );
              });
            }}
            className="inline-flex h-8 items-center justify-center rounded-lg border border-blue-200 bg-white px-2.5 text-blue-700 transition-colors hover:bg-blue-50"
            title="Descargar imágenes recortadas"
          >
            <Archive className="h-3.5 w-3.5" />
          </button>
        </>
      ) : null}
    </div>
  );
}

export function EcPdfTableButtons({
  projectCode,
  loadProjectDetail,
}: {
  projectCode: string;
  loadProjectDetail: LoadProjectDetail;
}) {
  const [loading, setLoading] = useState<'view' | 'download' | null>(null);

  const run = async (mode: 'view' | 'download') => {
    setLoading(mode);
    try {
      const project = await loadProjectDetail(projectCode);
      const pdfFactory = await buildEnergyCertificatePdfFactory(project);

      if (mode === 'view') {
        await viewPDFInNewTab(pdfFactory);
      } else {
        const blob = await pdfFactory();
        downloadBlob(blob, `${projectCode}_certificado-energetico.pdf`);
      }
    } catch {
      alert('No se pudo generar el certificado energético.');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="mt-2 flex items-center gap-1.5">
      <button
        type="button"
        disabled={loading !== null}
        onClick={(event) => {
          event.stopPropagation();
          void run('view');
        }}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-emerald-200 bg-white text-emerald-700 transition-colors hover:bg-emerald-50 disabled:opacity-50"
        title="Ver certificado energético"
      >
        {loading === 'view' ? (
          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Eye className="h-3.5 w-3.5" />
        )}
      </button>
      <button
        type="button"
        disabled={loading !== null}
        onClick={(event) => {
          event.stopPropagation();
          void run('download');
        }}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-emerald-200 bg-white text-emerald-700 transition-colors hover:bg-emerald-50 disabled:opacity-50"
        title="Descargar certificado energético"
      >
        {loading === 'download' ? (
          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Download className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
  );
}
