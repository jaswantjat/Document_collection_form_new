import { Upload } from 'lucide-react';
import type { DashboardProjectRecord } from '@/services/api';
import type { AdminDocType } from '@/lib/dashboardDocumentUpload';
import { SectionHeading } from './DashboardShared';
import { DocumentDropZone } from './DocumentDropZone';

interface DropZoneSpec {
  docType: AdminDocType;
  label: string;
  description: string;
}

const DROPZONES: DropZoneSpec[] = [
  {
    docType: 'dni-front',
    label: 'DNI / NIE — frontal',
    description: 'Una sola imagen o PDF de la cara frontal del documento.',
  },
  {
    docType: 'dni-back',
    label: 'DNI / NIE — trasera',
    description: 'Una sola imagen o PDF de la cara trasera del documento.',
  },
  {
    docType: 'ibi',
    label: 'IBI / Escritura',
    description: 'Una o varias páginas del recibo IBI o de la escritura.',
  },
  {
    docType: 'electricity-bill',
    label: 'Factura de electricidad',
    description: 'Una o varias páginas de la factura de luz.',
  },
  {
    docType: 'additional-bank-document',
    label: 'Documento adicional',
    description: 'Cualquier documento de apoyo (sin extracción IA).',
  },
];

export function DashboardDocumentUploadsPanel({
  project,
  token,
  onUploaded,
}: {
  project: DashboardProjectRecord;
  token: string;
  onUploaded: () => Promise<void> | void;
}) {
  return (
    <section
      className="space-y-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm"
      data-testid="document-uploads-panel"
    >
      <SectionHeading icon={Upload} label="Subir documentos" />
      <p className="text-xs text-gray-500">
        Arrastra y suelta los archivos en la zona correspondiente, o haz clic
        para seleccionarlos. Cada documento se procesa de forma independiente.
      </p>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {DROPZONES.map((spec) => (
          <DocumentDropZone
            key={spec.docType}
            docType={spec.docType}
            label={spec.label}
            description={spec.description}
            project={project}
            token={token}
            onUploaded={onUploaded}
          />
        ))}
      </div>
    </section>
  );
}
