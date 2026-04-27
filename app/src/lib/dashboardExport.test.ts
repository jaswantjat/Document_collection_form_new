import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DashboardProjectExportSource } from './dashboardExport';
import {
  buildProjectZipBlob,
  downloadDashboardStatusGroup,
  downloadProjectZip,
  listDashboardExportEntries,
} from './dashboardExport';

const {
  downloadBlobMock,
  buildSignedPdfFactoryMock,
  buildEnergyCertificatePdfFactoryMock,
} = vi.hoisted(() => ({
  downloadBlobMock: vi.fn(),
  buildSignedPdfFactoryMock: vi.fn(async (_project: unknown, item: { key: string }) => (
    async () => new Blob([`signed:${item.key}`], { type: 'application/pdf' })
  )),
  buildEnergyCertificatePdfFactoryMock: vi.fn(async (project: { code: string }) => (
    async () => new Blob([`energy:${project.code}`], { type: 'application/pdf' })
  )),
}));

vi.mock('./dashboardHelpers', async () => {
  const actual = await vi.importActual<typeof import('./dashboardHelpers')>('./dashboardHelpers');
  return {
    ...actual,
    downloadBlob: downloadBlobMock,
    buildSignedPdfFactory: buildSignedPdfFactoryMock,
    buildEnergyCertificatePdfFactory: buildEnergyCertificatePdfFactoryMock,
  };
});

function makeDataUrl(payload: string, mimeType = 'image/jpeg') {
  return `data:${mimeType};base64,${Buffer.from(payload).toString('base64')}`;
}

function makePhoto(payload: string) {
  return {
    id: `photo-${payload}`,
    preview: makeDataUrl(payload),
    timestamp: 1,
    sizeBytes: payload.length,
  };
}

function makeStoredPdf(payload: string) {
  return {
    id: `pdf-${payload}`,
    filename: `${payload}.pdf`,
    mimeType: 'application/pdf',
    dataUrl: makeDataUrl(payload, 'application/pdf'),
    timestamp: 1,
    sizeBytes: payload.length,
  };
}

function makeStoredImage(payload: string, mimeType = 'image/jpeg') {
  const ext = mimeType === 'image/png' ? 'png' : 'jpg';
  return {
    id: `img-${payload}`,
    filename: `${payload}.${ext}`,
    mimeType,
    dataUrl: makeDataUrl(payload, mimeType),
    timestamp: 1,
    sizeBytes: payload.length,
  };
}

function makeCompletedEnergyCertificate() {
  return {
    status: 'completed' as const,
    housing: {
      cadastralReference: '1234567DF3813C0001AA',
      habitableAreaM2: '110',
      floorCount: '2',
      averageFloorHeight: '2.7-3.2m' as const,
      bedroomCount: '3',
      doorsByOrientation: { north: '1', east: '1', south: '1', west: '1' },
      windowsByOrientation: { north: '1', east: '1', south: '1', west: '1' },
      windowFrameMaterial: 'pvc' as const,
      doorMaterial: 'Madera',
      windowGlassType: 'doble' as const,
      hasShutters: false,
      shutterWindowCount: '',
    },
    thermal: {
      thermalInstallationType: 'aerotermia' as const,
      boilerFuelType: 'aerotermia' as const,
      equipmentDetails: 'Equipo exterior',
      hasAirConditioning: false,
      airConditioningType: null,
      airConditioningDetails: '',
      heatingEmitterType: 'radiadores-agua' as const,
      radiatorMaterial: 'aluminio' as const,
      tipoFase: 'monofasica' as const,
      tipoFaseConfirmed: true,
    },
    additional: {
      soldProduct: 'solo-paneles' as const,
      isExistingCustomer: false,
      hasSolarPanels: false,
      solarPanelDetails: '',
    },
    customerSignature: makeDataUrl('ec-signature', 'image/png'),
    renderedDocument: null,
    completedAt: '2026-04-09T10:00:00Z',
    skippedAt: null,
  };
}

function makeProject(location: 'cataluna' | 'madrid' = 'cataluna'): DashboardProjectExportSource {
  const isCataluna = location === 'cataluna';

  return {
    code: 'ELTZIP001',
    customerName: 'Maria Lopez',
    phone: '+34600000000',
    email: 'maria@example.com',
    productType: 'solar',
    assessor: 'Carlos',
    assessorId: 'ASR001',
    createdAt: '2026-04-09T10:00:00Z',
    lastActivity: '2026-04-09T10:00:00Z',
    assetFiles: {},
    formData: {
      dni: {
        front: { photo: makePhoto('dni-front'), extraction: null },
        back: { photo: makePhoto('dni-back'), extraction: null },
        originalPdfs: [makeStoredPdf('dni-original')],
      },
      ibi: {
        photo: null,
        pages: [makePhoto('ibi-1'), makePhoto('ibi-2')],
        originalPdfs: [makeStoredPdf('ibi-original')],
        extraction: null,
      },
      electricityBill: {
        pages: [
          { photo: makePhoto('bill-1'), extraction: null },
          { photo: makePhoto('bill-2'), extraction: null },
        ],
        originalPdfs: [makeStoredPdf('bill-original')],
      },
      contract: { originalPdfs: [], extraction: null },
      representation: {
        location,
        isCompany: location === 'madrid',
        companyName: location === 'madrid' ? 'Empresa Solar SL' : '',
        companyNIF: location === 'madrid' ? 'B12345678' : '',
        companyAddress: location === 'madrid' ? 'Gran Via 1' : '',
        companyMunicipality: location === 'madrid' ? 'Madrid' : '',
        companyPostalCode: location === 'madrid' ? '28001' : '',
        postalCode: '08001',
        ivaPropertyAddress: 'Calle Solar 1',
        ivaCertificateSignature: isCataluna ? makeDataUrl('iva-cat', 'image/png') : null,
        representacioSignature: isCataluna ? makeDataUrl('rep-cat', 'image/png') : null,
        generalitatRole: 'titular' as const,
        generalitatSignature: isCataluna ? makeDataUrl('gen-cat', 'image/png') : null,
        poderRepresentacioSignature: isCataluna ? null : makeDataUrl('poder-es', 'image/png'),
        ivaCertificateEsSignature: isCataluna ? null : makeDataUrl('iva-es', 'image/png'),
        renderedDocuments: {},
      },
      energyCertificate: makeCompletedEnergyCertificate(),
      signatures: {
        customerSignature: makeDataUrl('customer-signature', 'image/png'),
        repSignature: makeDataUrl('rep-signature', 'image/png'),
      },
      electricalPanel: { photos: [makePhoto('panel-1')] },
      roof: { photos: [makePhoto('roof-1')] },
      installationSpace: { photos: [makePhoto('space-1')] },
      radiators: { photos: [makePhoto('radiator-1')] },
    } as DashboardProjectExportSource['formData'] & Record<string, unknown>,
  };
}

async function parseZipPaths(blob: Blob) {
  const imported = await import('uzip');
  const UZIP = imported.default ?? imported;
  const files = UZIP.parse(await blob.arrayBuffer());
  return Object.keys(files).sort();
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('listDashboardExportEntries', () => {
  it('builds the full Catalonia archive inventory with grouped folders', () => {
    const entries = listDashboardExportEntries(makeProject('cataluna'));
    const archivePaths = entries.map((entry) => entry.archivePath);

    expect(archivePaths).toEqual(expect.arrayContaining([
      '1_documentos/dni_frontal.jpg',
      '1_documentos/dni_trasera.jpg',
      '1_documentos/ibi_escritura.jpg',
      '1_documentos/ibi_escritura_2.jpg',
      '1_documentos/factura_luz_pag_1.jpg',
      '1_documentos/factura_luz_pag_2.jpg',
      '1_documentos/dni_original_pdf.pdf',
      '1_documentos/ibi_original_pdf.pdf',
      '1_documentos/factura_luz_original_pdf.pdf',
      '2_pdfs_firmados/ELTZIP001_iva-cat.pdf',
      '2_pdfs_firmados/ELTZIP001_generalitat.pdf',
      '2_pdfs_firmados/ELTZIP001_autoritzacio-representacio.pdf',
      '3_certificado_energetico/ELTZIP001_certificado-energetico.pdf',
      '4_firmas_finales/firma_cliente.png',
      '4_firmas_finales/firma_comercial.png',
      '5_fotos_inmueble/cuadro_electrico_1.jpg',
      '5_fotos_inmueble/tejado_1.jpg',
      '5_fotos_inmueble/espacio_de_instalacion_1.jpg',
      '5_fotos_inmueble/radiadores_1.jpg',
    ]));
  });

  it('switches the signed PDF inventory for Spain company flows', () => {
    const entries = listDashboardExportEntries(makeProject('madrid'));
    const archivePaths = entries.map((entry) => entry.archivePath);

    expect(archivePaths).toContain('2_pdfs_firmados/ELTZIP001_iva-es.pdf');
    expect(archivePaths).toContain('2_pdfs_firmados/ELTZIP001_poder-representacion.pdf');
    expect(archivePaths.some((path) => path.includes('generalitat'))).toBe(false);
  });

  it('includes additional bank documents in the documents folder', () => {
    const project = makeProject('cataluna');
    project.formData = {
      ...project.formData!,
      additionalBankDocuments: [
        {
          id: 'ownership',
          type: 'bank-ownership-certificate',
          files: [{
            id: 'ownership-file',
            filename: 'ownership.pdf',
            mimeType: 'application/pdf',
            dataUrl: makeDataUrl('ownership', 'application/pdf'),
            timestamp: 1,
            sizeBytes: 100,
          }],
        },
        {
          id: 'other',
          type: 'other',
          customLabel: 'IRPF 2024',
          files: [{
            id: 'other-file',
            filename: 'irpf.png',
            mimeType: 'image/png',
            dataUrl: '',
            assetKey: 'bank-doc-other',
            timestamp: 1,
            sizeBytes: 100,
          }],
        },
      ],
    } as DashboardProjectExportSource['formData'] & Record<string, unknown>;
    project.assetFiles = {
      ...project.assetFiles,
      'bank-doc-other': '/uploads/assets/ELTZIP001/bank-doc-other.png',
    };

    const archivePaths = listDashboardExportEntries(project).map((entry) => entry.archivePath);

    expect(archivePaths).toEqual(expect.arrayContaining([
      '1_documentos/documento_adicional.pdf',
      '1_documentos/irpf_2024.png',
    ]));
  });

  it('keeps extra stored identity images with an image extension', () => {
    const project = makeProject('cataluna');
    project.formData = {
      ...project.formData!,
      dni: {
        ...project.formData!.dni,
        originalPdfs: [makeStoredImage('passport-copy')],
      },
    } as DashboardProjectExportSource['formData'] & Record<string, unknown>;

    const archivePaths = listDashboardExportEntries(project).map((entry) => entry.archivePath);

    expect(archivePaths).toContain('1_documentos/dni_original_pdf.jpg');
  });

  it('omits pending or empty optional artifacts', () => {
    const project = makeProject('cataluna');
    project.formData = {
      ...project.formData!,
      representation: {
        ...project.formData!.representation,
        ivaCertificateSignature: null,
        representacioSignature: null,
        generalitatSignature: null,
      },
      energyCertificate: {
        ...project.formData!.energyCertificate,
        status: 'not-started',
        renderedDocument: null,
      },
      signatures: {
        customerSignature: null,
        repSignature: null,
      },
      roof: { photos: [] },
      electricalPanel: { photos: [] },
      installationSpace: { photos: [] },
      radiators: { photos: [] },
    } as DashboardProjectExportSource['formData'] & Record<string, unknown>;

    const archivePaths = listDashboardExportEntries(project).map((entry) => entry.archivePath);

    expect(archivePaths.some((path) => path.startsWith('2_pdfs_firmados/'))).toBe(false);
    expect(archivePaths.some((path) => path.startsWith('3_certificado_energetico/'))).toBe(false);
    expect(archivePaths.some((path) => path.startsWith('4_firmas_finales/'))).toBe(false);
    expect(archivePaths.some((path) => path.startsWith('5_fotos_inmueble/'))).toBe(false);
  });

  it('uses uploaded property photo asset paths after previews were stripped', () => {
    const project = makeProject('cataluna');
    project.formData = {
      ...project.formData!,
      electricalPanel: { photos: [] },
      roof: { photos: [] },
      installationSpace: { photos: [] },
      radiators: { photos: [] },
    } as DashboardProjectExportSource['formData'] & Record<string, unknown>;
    project.assetFiles = {
      roof_0: '/uploads/assets/ELTZIP001/roof_0.jpg',
    };

    const archivePaths = listDashboardExportEntries(project).map((entry) => entry.archivePath);

    expect(archivePaths).toContain('5_fotos_inmueble/tejado_1.jpg');
  });

  it('preserves stored asset extensions for stripped primary documents and electricity pages', () => {
    const project = makeProject('cataluna');
    project.formData = {
      ...project.formData!,
      dni: {
        ...project.formData!.dni,
        front: { photo: null, extraction: null },
      },
      electricityBill: {
        ...project.formData!.electricityBill,
        pages: [],
      },
    } as DashboardProjectExportSource['formData'] & Record<string, unknown>;
    project.assetFiles = {
      ...project.assetFiles,
      dniFront: '/uploads/assets/ELTZIP001/dniFront.png',
      electricity_0: '/uploads/assets/ELTZIP001/electricity_0.webp',
    };

    const archivePaths = listDashboardExportEntries(project).map((entry) => entry.archivePath);

    expect(archivePaths).toContain('1_documentos/dni_frontal.png');
    expect(archivePaths).toContain('1_documentos/factura_luz_pag_1.webp');
  });
});

describe('buildProjectZipBlob', () => {
  it('encodes every export entry into the final ZIP', async () => {
    const blob = await buildProjectZipBlob(makeProject('cataluna'));
    const archivePaths = await parseZipPaths(blob);

    expect(blob.type).toBe('application/zip');
    expect(archivePaths).toContain('2_pdfs_firmados/ELTZIP001_iva-cat.pdf');
    expect(archivePaths).toContain('4_firmas_finales/firma_cliente.png');
    expect(archivePaths).toContain('5_fotos_inmueble/tejado_1.jpg');
  });
});

describe('downloadProjectZip', () => {
  it('downloads the browser-built ZIP using project detail when available', async () => {
    await downloadProjectZip(makeProject('cataluna'));

    expect(downloadBlobMock).toHaveBeenCalledTimes(1);
    expect(downloadBlobMock.mock.calls[0][1]).toBe('ELTZIP001_Maria_Lopez.zip');
  });

  it('fails closed and skips download when a generated artifact throws', async () => {
    buildSignedPdfFactoryMock.mockResolvedValueOnce(async () => {
      throw new Error('signed pdf failed');
    });

    await expect(downloadProjectZip(makeProject('cataluna'))).rejects.toThrow('signed pdf failed');
    expect(downloadBlobMock).not.toHaveBeenCalled();
  });
});

describe('downloadDashboardStatusGroup', () => {
  it('direct-downloads a one-file document with the project code prefix', async () => {
    const project = makeProject('cataluna');
    project.formData = {
      ...project.formData!,
      ibi: {
        ...project.formData!.ibi,
        pages: [makePhoto('ibi-one')],
        originalPdfs: [],
      },
    } as DashboardProjectExportSource['formData'] & Record<string, unknown>;

    await downloadDashboardStatusGroup(project, 'ibi');

    expect(downloadBlobMock).toHaveBeenCalledTimes(1);
    expect(downloadBlobMock.mock.calls[0][1]).toBe('ELTZIP001_ibi_escritura.jpg');
  });

  it('downloads a document mini ZIP for multi-file status documents', async () => {
    await downloadDashboardStatusGroup(makeProject('cataluna'), 'ibi');

    expect(downloadBlobMock).toHaveBeenCalledTimes(1);
    expect(downloadBlobMock.mock.calls[0][1]).toBe('ELTZIP001_ibi_escritura.zip');
    const archivePaths = await parseZipPaths(downloadBlobMock.mock.calls[0][0] as Blob);
    expect(archivePaths).toEqual(expect.arrayContaining([
      '1_documentos/ibi_escritura.jpg',
      '1_documentos/ibi_escritura_2.jpg',
      '1_documentos/ibi_original_pdf.pdf',
    ]));
  });

  it('regenerates only the energy certificate artifact from the current project', async () => {
    const project = makeProject('cataluna');
    project.assessor = 'Laura Martín Manzano';
    project.formData = {
      ...project.formData!,
      energyCertificate: {
        ...project.formData!.energyCertificate,
        renderedDocument: null,
      },
    } as DashboardProjectExportSource['formData'] & Record<string, unknown>;

    await downloadDashboardStatusGroup(project, 'energy-certificate');

    expect(buildEnergyCertificatePdfFactoryMock).toHaveBeenCalledWith(
      expect.objectContaining({ assessor: 'Laura Martín Manzano' }),
    );
    expect(buildSignedPdfFactoryMock).not.toHaveBeenCalled();
  });
});
