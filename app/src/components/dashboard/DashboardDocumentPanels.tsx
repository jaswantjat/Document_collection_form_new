import { useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CheckCircle,
  Clock,
  CreditCard,
  Download,
  Eye,
  FileText,
  PenLine,
  Sun,
  Zap,
} from 'lucide-react';
import type {
  DashboardAssetGroup,
  DashboardAssetItem,
  DashboardEnergyCertificateSummary,
  DashboardSignedPdfItem,
} from '@/lib/dashboardProject';
import {
  buildEnergyCertificatePdfFactory,
  downloadBlob,
  extensionFromMimeType,
  getDocumentAssetsFromProject,
  getIbiPages,
  viewPDFInNewTab,
} from '@/lib/dashboardHelpers';
import type {
  DNIData,
  ElectricityBillData,
  RepresentationData,
  UploadedPhoto,
} from '@/types';
import type { DashboardProjectRecord } from '@/services/api';
import {
  AssetButtons,
  AutocropperButton,
  SignedPdfButtons,
} from './DashboardDocumentActions';
import {
  DocImage,
  FieldRow,
  SectionHeading,
} from './DashboardShared';

function ImagePreviewCard({
  title,
  asset,
  projectCode,
  children,
  warning,
}: {
  title: string;
  asset: DashboardAssetItem | null;
  projectCode: string;
  children?: React.ReactNode;
  warning?: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-gray-500">{title}</p>
        {asset ? <AssetButtons asset={asset} projectCode={projectCode} /> : null}
      </div>
      {asset ? (
        <DocImage src={asset.dataUrl} alt={asset.label} className="h-40 w-full" />
      ) : (
        <div className="flex h-40 w-full items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50">
          <span className="text-sm text-gray-300">Sin archivo</span>
        </div>
      )}
      {children ? (
        <div className="space-y-1 rounded-xl bg-gray-50 p-3">
          {children}
          {warning ? (
            <span className="flex items-center gap-1 pt-1 text-xs text-orange-600">
              <AlertTriangle className="h-3 w-3" />
              Revisar manualmente
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function CompanyDisplay({
  representation,
}: {
  representation: RepresentationData | null | undefined;
}) {
  if (!representation?.isCompany) {
    return null;
  }

  return (
    <div className="space-y-3">
      <SectionHeading icon={Building2} label="Datos de la empresa" />
      <div className="space-y-1 rounded-xl border border-blue-100 bg-blue-50 p-3">
        <FieldRow label="Nombre empresa" value={representation.companyName} />
        <FieldRow label="NIF empresa" value={representation.companyNIF} />
        <FieldRow label="Dirección" value={representation.companyAddress} />
        <FieldRow label="Municipio" value={representation.companyMunicipality} />
        <FieldRow label="Código postal" value={representation.companyPostalCode} />
      </div>
    </div>
  );
}

function buildPreviewAsset(
  key: string,
  label: string,
  preview: string | null | undefined
): DashboardAssetItem | null {
  if (!preview) {
    return null;
  }

  const extension = extensionFromMimeType(undefined, preview);
  return {
    key,
    label,
    dataUrl: preview,
    mimeType: extension.startsWith('p') ? 'image/png' : 'image/jpeg',
  };
}

export function DNIDisplay({
  dni,
  projectCode,
}: {
  dni: DNIData | null | undefined;
  projectCode: string;
}) {
  if (!dni?.front?.photo && !dni?.back?.photo) {
    return null;
  }

  const frontData = dni.front?.extraction?.extractedData;
  const backData = dni.back?.extraction?.extractedData;
  const frontAsset = buildPreviewAsset(
    'dni-front',
    'DNI frontal',
    dni.front?.photo?.preview
  );
  const backAsset = buildPreviewAsset(
    'dni-back',
    'DNI trasera',
    dni.back?.photo?.preview
  );
  const dniImages = [dni.front?.photo?.preview, dni.back?.photo?.preview].filter(
    (preview): preview is string => Boolean(preview)
  );

  return (
    <div className="space-y-3">
      <SectionHeading
        icon={CreditCard}
        label="DNI / NIE"
        actions={
          dniImages.length > 0 ? (
            <AutocropperButton
              documentType="dni"
              images={dniImages}
              projectCode={projectCode}
            />
          ) : undefined
        }
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <ImagePreviewCard
          title="Cara frontal"
          asset={frontAsset}
          projectCode={projectCode}
          warning={dni.front?.extraction?.needsManualReview}
        >
          <FieldRow label="Nombre" value={frontData?.fullName} />
          <FieldRow label="DNI / NIE" value={frontData?.dniNumber} />
          <FieldRow label="Nacimiento" value={frontData?.dateOfBirth} />
          <FieldRow label="Válido hasta" value={frontData?.expiryDate} />
          <FieldRow label="Sexo" value={frontData?.sex} />
        </ImagePreviewCard>
        <ImagePreviewCard
          title="Cara trasera"
          asset={backAsset}
          projectCode={projectCode}
          warning={dni.back?.extraction?.needsManualReview}
        >
          <FieldRow label="Domicilio" value={backData?.address} />
          <FieldRow label="Municipio" value={backData?.municipality} />
          <FieldRow label="Provincia" value={backData?.province} />
          <FieldRow label="Lugar de nacimiento" value={backData?.placeOfBirth} />
        </ImagePreviewCard>
      </div>
      {Array.isArray(dni.originalPdfs) && dni.originalPdfs.length > 0 ? (
        <p className="text-xs text-gray-500">
          Archivos adicionales guardados: {dni.originalPdfs.length}
        </p>
      ) : null}
    </div>
  );
}

export function IBIDisplay({
  project,
}: {
  project: DashboardProjectRecord | null | undefined;
}) {
  const ibi = project?.formData?.ibi;
  const projectCode = project?.code ?? '';
  const pages = getIbiPages(ibi) as UploadedPhoto[];
  const assets = getDocumentAssetsFromProject(project || {}, 'ibi');

  if (pages.length === 0 && assets.length === 0) {
    return null;
  }

  const data = ibi?.extraction?.extractedData;
  const primaryAsset = assets[0] || null;
  const ibiImages = assets
    .filter((asset) => asset.dataUrl.startsWith('data:image/'))
    .map((asset) => asset.dataUrl);

  return (
    <div className="space-y-3">
      <SectionHeading
        icon={FileText}
        label="IBI / Escritura"
        actions={
          ibiImages.length > 0 ? (
            <AutocropperButton
              documentType="ibi"
              images={ibiImages}
              projectCode={projectCode}
            />
          ) : undefined
        }
      />
      <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
        <div className="space-y-2">
          {assets.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {assets.map((asset, index) => (
                <div key={asset.key} className="flex items-center gap-2">
                  {assets.length > 1 ? (
                    <span className="min-w-12 text-[11px] font-semibold text-gray-500">
                      {`Pág. ${index + 1}`}
                    </span>
                  ) : null}
                  <AssetButtons asset={asset} projectCode={projectCode} />
                </div>
              ))}
            </div>
          ) : null}
          {primaryAsset ? (
            <DocImage
              src={primaryAsset.dataUrl}
              alt={primaryAsset.label}
              className="h-56 w-full"
            />
          ) : (
            <div className="flex h-56 w-full items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50">
              <span className="text-sm text-gray-300">Sin archivo</span>
            </div>
          )}
        </div>
        <div className="space-y-1 rounded-xl bg-gray-50 p-3">
          <FieldRow label="Referencia Catastral" value={data?.referenciaCatastral} />
          <FieldRow label="Titular" value={data?.titular} />
          <FieldRow label="NIF titular" value={data?.titularNif} />
          <FieldRow label="Dirección" value={data?.direccion} />
          <FieldRow label="Código postal" value={data?.codigoPostal} />
          <FieldRow label="Municipio" value={data?.municipio} />
          <FieldRow label="Provincia" value={data?.provincia} />
          <FieldRow label="Ejercicio" value={data?.ejercicio} />
          <FieldRow label="Importe" value={data?.importe} />
          {ibi?.extraction?.needsManualReview ? (
            <span className="flex items-center gap-1 pt-1 text-xs text-orange-600">
              <AlertTriangle className="h-3 w-3" />
              Revisar manualmente
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function ElectricityDisplay({
  bill,
  projectCode,
}: {
  bill: ElectricityBillData | null | undefined;
  projectCode: string;
}) {
  const pages = bill?.pages ?? [];
  const normalizedPages = pages.length === 0 ? [bill?.front, bill?.back].filter(Boolean) : pages;
  const uploadedPages = normalizedPages.filter((page) => Boolean(page?.photo));

  if (uploadedPages.length === 0) {
    return null;
  }

  const electricityImages = uploadedPages.flatMap((page) =>
    page?.photo?.preview ? [page.photo.preview] : []
  );

  return (
    <div className="space-y-3">
      <SectionHeading
        icon={Zap}
        label={`Factura de electricidad — ${uploadedPages.length} imagen${uploadedPages.length !== 1 ? 'es' : ''}`}
        actions={
          electricityImages.length > 0 ? (
            <AutocropperButton
              documentType="electricity"
              images={electricityImages}
              projectCode={projectCode}
            />
          ) : undefined
        }
      />
      <div className="grid gap-4 lg:grid-cols-2">
        {uploadedPages.map((page, index) => {
          const asset = buildPreviewAsset(
            `electricity-${index}`,
            `Factura luz — pág. ${index + 1}`,
            page?.photo?.preview
          );
          const data = page?.extraction?.extractedData;

          return (
            <ImagePreviewCard
              key={`${projectCode}-electricity-${index}`}
              title={`Imagen ${index + 1}`}
              asset={asset}
              projectCode={projectCode}
              warning={page?.extraction?.needsManualReview}
            >
              <FieldRow label="Titular" value={data?.titular} />
              <FieldRow label="NIF titular" value={data?.nifTitular} />
              <FieldRow label="CUPS" value={data?.cups} />
              {data?.cupsWarning ? (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                  <span className="text-xs text-amber-800">{data.cupsWarning}</span>
                </div>
              ) : null}
              <FieldRow label="Potencia (kW)" value={data?.potenciaContratada} />
              <FieldRow label="Tipo fase" value={data?.tipoFase} />
              <FieldRow label="Tarifa" value={data?.tarifaAcceso} />
              <FieldRow label="Comercializadora" value={data?.comercializadora} />
              <FieldRow label="Distribuidora" value={data?.distribuidora} />
              <FieldRow label="Dirección suministro" value={data?.direccionSuministro} />
              <FieldRow label="Código postal" value={data?.codigoPostal} />
              <FieldRow label="Municipio" value={data?.municipio} />
              <FieldRow label="Provincia" value={data?.provincia} />
              <FieldRow label="Fecha factura" value={data?.fechaFactura} />
              <FieldRow label="Periodo facturación" value={data?.periodoFacturacion} />
              <FieldRow label="Importe" value={data?.importe} />
            </ImagePreviewCard>
          );
        })}
      </div>
    </div>
  );
}

export function PhotoGallery({
  group,
  projectCode,
}: {
  group: DashboardAssetGroup;
  projectCode: string;
}) {
  if (!group.items.length) {
    return null;
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-gray-500">{group.label}</p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {group.items.map((asset) => (
          <div
            key={asset.key}
            className="overflow-hidden rounded-xl border border-gray-200 bg-white"
          >
            <DocImage src={asset.dataUrl} alt={asset.label} className="h-40 w-full" />
            <div className="flex items-center justify-between gap-2 px-3 py-2">
              <p className="truncate text-xs font-medium text-gray-600">{asset.label}</p>
              <AssetButtons asset={asset} projectCode={projectCode} compact />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function FinalSignaturesPanel({
  signatures,
  projectCode,
}: {
  signatures: DashboardAssetItem[];
  projectCode: string;
}) {
  if (!signatures.length) {
    return null;
  }

  return (
    <div className="space-y-3">
      <SectionHeading icon={PenLine} label="Firmas finales" />
      <div className="grid gap-4 lg:grid-cols-2">
        {signatures.map((asset) => (
          <div
            key={asset.key}
            className="space-y-3 rounded-xl border border-gray-200 bg-white p-3"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-gray-800">{asset.label}</p>
              <AssetButtons asset={asset} projectCode={projectCode} />
            </div>
            <DocImage
              src={asset.dataUrl}
              alt={asset.label}
              className="h-40 w-full bg-white"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function SignedDocumentCard({
  item,
  projectCode,
  loadProjectDetail,
}: {
  item: DashboardSignedPdfItem;
  projectCode: string;
  loadProjectDetail: (projectCode: string) => Promise<DashboardProjectRecord>;
}) {
  const status = item.status ?? (item.present ? 'complete' : 'pending');
  const cardClass =
    status === 'complete'
      ? 'border-emerald-200 bg-emerald-50/70'
      : status === 'deferred'
        ? 'border-amber-200 bg-amber-50/60'
        : 'border-gray-200 bg-gray-50';
  const badgeClass =
    status === 'complete'
      ? 'bg-emerald-100 text-emerald-700'
      : status === 'deferred'
        ? 'bg-amber-100 text-amber-700'
        : 'bg-gray-100 text-gray-500';
  const badgeLabel =
    status === 'complete' ? 'Listo' : status === 'deferred' ? 'Firma diferida' : 'Pendiente';
  const subtitle =
    status === 'complete'
      ? 'Generado desde la imagen firmada actual'
      : status === 'deferred'
        ? 'El cliente eligió firmar más tarde'
        : 'Aún no firmado';

  return (
    <div className={`space-y-3 rounded-xl border p-4 ${cardClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-gray-900">{item.label}</p>
          <p className="mt-1 text-xs text-gray-500">{subtitle}</p>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${badgeClass}`}
        >
          {status === 'complete' ? (
            <CheckCircle className="h-3 w-3" />
          ) : status === 'deferred' ? (
            <AlertTriangle className="h-3 w-3" />
          ) : (
            <Clock className="h-3 w-3" />
          )}
          {badgeLabel}
        </span>
      </div>
      {item.present ? (
        <SignedPdfButtons
          projectCode={projectCode}
          item={item}
          loadProjectDetail={loadProjectDetail}
        />
      ) : (
        <p className="text-xs text-gray-400">
          {status === 'deferred'
            ? 'Disponible cuando el cliente complete la firma pendiente.'
            : 'Se habilitará cuando la firma correspondiente exista.'}
        </p>
      )}
    </div>
  );
}

function EnergyCertificateReadyCard({
  project,
}: {
  project: DashboardProjectRecord;
}) {
  const [ecViewing, setEcViewing] = useState(false);
  const [ecDownloading, setEcDownloading] = useState(false);

  return (
    <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-gray-900">Certificado energético</p>
          <p className="mt-1 text-xs text-gray-500">
            Generado al completar el cuestionario
          </p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700">
          <CheckCircle className="h-3 w-3" />
          Listo
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={ecViewing}
          onClick={async () => {
            setEcViewing(true);
            try {
              const pdfFactory = await buildEnergyCertificatePdfFactory(project);
              await viewPDFInNewTab(pdfFactory);
            } catch {
              alert('No se pudo visualizar el certificado energético.');
            } finally {
              setEcViewing(false);
            }
          }}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <Eye className="h-3 w-3" />
          {ecViewing ? 'Abriendo...' : 'Ver PDF'}
        </button>
        <button
          type="button"
          disabled={ecDownloading}
          onClick={async () => {
            setEcDownloading(true);
            try {
              const pdfFactory = await buildEnergyCertificatePdfFactory(project);
              const blob = await pdfFactory();
              downloadBlob(blob, `${project.code}_certificado-energetico.pdf`);
            } catch {
              alert('No se pudo descargar el certificado energético.');
            } finally {
              setEcDownloading(false);
            }
          }}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
        >
          <Download className="h-3 w-3" />
          {ecDownloading ? 'Descargando...' : 'Descargar PDF'}
        </button>
      </div>
    </div>
  );
}

export function SignedDocumentsSection({
  project,
  items,
  energyCertificate,
}: {
  project: DashboardProjectRecord;
  items: DashboardSignedPdfItem[];
  energyCertificate?: DashboardEnergyCertificateSummary;
}) {
  const hasEc = energyCertificate?.status === 'completed';

  if (!items.length && !hasEc) {
    return null;
  }

  const loadProjectDetail = async () => project;

  return (
    <div className="space-y-3">
      <SectionHeading icon={FileText} label="PDFs firmados" />
      <div className="grid gap-4 lg:grid-cols-2">
        {items.map((item) => (
          <SignedDocumentCard
            key={item.key}
            item={item}
            projectCode={project.code}
            loadProjectDetail={loadProjectDetail}
          />
        ))}
        {hasEc ? <EnergyCertificateReadyCard project={project} /> : null}
      </div>
    </div>
  );
}

export function EnergyCertificatePanel({
  project,
  energyCertificate,
}: {
  project: DashboardProjectRecord;
  energyCertificate: DashboardEnergyCertificateSummary;
}) {
  const [viewing, setViewing] = useState(false);
  const [downloading, setDownloading] = useState(false);

  if (!energyCertificate || energyCertificate.status === 'pending') {
    return null;
  }

  const asset = energyCertificate.asset || null;
  const isCompleted = energyCertificate.status === 'completed';

  return (
    <div className="space-y-3">
      <SectionHeading icon={Sun} label="Certificado energético" />
      <div
        className={`space-y-3 rounded-xl border p-4 ${
          isCompleted
            ? 'border-emerald-200 bg-emerald-50/70'
            : energyCertificate.status === 'skipped'
              ? 'border-gray-200 bg-gray-50'
              : 'border-amber-200 bg-amber-50/70'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-gray-900">Estado</p>
            <p className="mt-1 text-xs text-gray-500">
              {isCompleted
                ? 'Documento completado y disponible como PDF'
                : energyCertificate.status === 'skipped'
                  ? 'El cliente lo omitió'
                  : 'Pendiente de completar'}
            </p>
          </div>
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${
              isCompleted
                ? 'bg-emerald-100 text-emerald-700'
                : energyCertificate.status === 'skipped'
                  ? 'bg-gray-100 text-gray-600'
                  : 'bg-amber-100 text-amber-700'
            }`}
          >
            {isCompleted ? <CheckCircle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
            {energyCertificate.label}
          </span>
        </div>
        {asset ? (
          <DocImage
            src={asset.dataUrl}
            alt={asset.label}
            className="h-auto w-full rounded-xl border border-gray-200 bg-white"
          />
        ) : null}
        {isCompleted ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={viewing}
              onClick={async () => {
                setViewing(true);
                try {
                  const pdfFactory = await buildEnergyCertificatePdfFactory(project);
                  await viewPDFInNewTab(pdfFactory);
                } catch (err) {
                  console.error('Energy certificate view failed:', err);
                  alert('No se pudo visualizar el certificado energético.');
                } finally {
                  setViewing(false);
                }
              }}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <Eye className="h-3 w-3" />
              {viewing ? 'Abriendo...' : 'Ver PDF'}
            </button>
            <button
              type="button"
              disabled={downloading}
              onClick={async () => {
                setDownloading(true);
                try {
                  const pdfFactory = await buildEnergyCertificatePdfFactory(project);
                  const blob = await pdfFactory();
                  downloadBlob(blob, `${project.code}_certificado-energetico.pdf`);
                } catch (err) {
                  console.error('Energy certificate download failed:', err);
                  alert('No se pudo descargar el certificado energético.');
                } finally {
                  setDownloading(false);
                }
              }}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
            >
              <Download className="h-3 w-3" />
              {downloading ? 'Descargando...' : 'Descargar PDF'}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function DownloadGroupsSection({
  groups,
  projectCode,
}: {
  groups: DashboardAssetGroup[];
  projectCode: string;
}) {
  if (!groups.length) {
    return null;
  }

  return (
    <div className="space-y-3">
      <SectionHeading icon={Download} label="Descargas rápidas" />
      <div className="grid gap-4 xl:grid-cols-3">
        {groups.map((group) => (
          <div key={group.key} className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-sm font-semibold text-gray-800">{group.label}</p>
            <div className="mt-3 space-y-2">
              {group.items.map((asset) => (
                <div
                  key={asset.key}
                  className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2"
                >
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <span className="block truncate text-xs text-gray-700">
                      {asset.label}
                    </span>
                    {asset.needsManualReview ? (
                      <span
                        className="inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-1.5 py-0.5 text-[10px] font-semibold text-orange-700"
                        title="Revisión manual requerida"
                        data-testid="additional-bank-doc-review-badge"
                      >
                        <AlertTriangle className="h-2.5 w-2.5" />
                        Revisar
                      </span>
                    ) : null}
                  </div>
                  <AssetButtons asset={asset} projectCode={projectCode} compact />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
