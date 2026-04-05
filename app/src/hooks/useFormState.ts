import { useState, useCallback, useRef, useEffect, useEffectEvent } from 'react';
import { toast } from 'sonner';
import type {
  FormData, FormErrors, UploadedPhoto,
  AIExtraction, ProductType, FormItem, DocSlot, RepresentationData,
  StoredDocumentFile, EnergyCertificateData, ContractData,
  DocumentSlotKey, DocumentProcessingState
} from '@/types';
import { saveProgress } from '@/services/api';
import { mergeStoredDocumentFiles } from '@/lib/photoValidation';
import { isEnergyCertificateReadyToComplete } from '@/lib/energyCertificateValidation';

const emptyDocSlot = (): DocSlot => ({ photo: null, extraction: null });
const DOCUMENT_SLOT_KEYS: DocumentSlotKey[] = ['dniFront', 'dniBack', 'ibi'];
const emptyProcessingState = (): DocumentProcessingState => ({ status: 'idle', errorCode: undefined, errorMessage: undefined, pendingPreview: null });

function clearAllSignedRepresentationArtifacts(representation: RepresentationData): RepresentationData {
  return {
    ...representation,
    ivaCertificateSignature: null,
    representacioSignature: null,
    generalitatSignature: null,
    poderRepresentacioSignature: null,
    ivaCertificateEsSignature: null,
    renderedDocuments: {},
  };
}

function clearRenderedRepresentationArtifacts(representation: RepresentationData): RepresentationData {
  return {
    ...representation,
    renderedDocuments: {},
  };
}

function clearRepresentationArtifacts(
  representation: RepresentationData,
  preserveSignatures: boolean
): RepresentationData {
  return preserveSignatures
    ? clearRenderedRepresentationArtifacts(representation)
    : clearAllSignedRepresentationArtifacts(representation);
}

function clearGeneralitatArtifact(representation: RepresentationData): RepresentationData {
  const renderedDocuments = { ...(representation.renderedDocuments || {}) };
  delete renderedDocuments.catalunaGeneralitat;

  return {
    ...representation,
    generalitatSignature: null,
    renderedDocuments,
  };
}

function getAcceptedDocumentSlotState(formData: FormData, slotKey: DocumentSlotKey): DocumentProcessingState {
  const accepted =
    (slotKey === 'dniFront' && !!formData.dni.front.photo)
    || (slotKey === 'dniBack' && !!formData.dni.back.photo)
    || (slotKey === 'ibi' && (!!formData.ibi.photo || formData.ibi.pages.length > 0));

  return accepted ? { status: 'accepted', errorCode: undefined, errorMessage: undefined, pendingPreview: null } : emptyProcessingState();
}

function createInitialDocumentProcessing(formData: FormData) {
  return DOCUMENT_SLOT_KEYS.reduce<Record<DocumentSlotKey, DocumentProcessingState>>((acc, key) => {
    acc[key] = getAcceptedDocumentSlotState(formData, key);
    return acc;
  }, {} as Record<DocumentSlotKey, DocumentProcessingState>);
}

type LegacyElectricityPage = Partial<DocSlot> | null | undefined;
type LegacyElectricityBillData = Partial<FormData['electricityBill']> & {
  front?: LegacyElectricityPage;
  back?: LegacyElectricityPage;
  pages?: LegacyElectricityPage[];
};

function normalizeElectricityPage(page: LegacyElectricityPage): DocSlot {
  return {
    photo: page?.photo ?? null,
    extraction: page?.extraction ?? null,
  };
}

function normalizeElectricityPages(saved?: LegacyElectricityBillData | null): DocSlot[] {
  // Handle old front/back format → migrate to pages
  if (saved?.front || saved?.back) {
    const pages: DocSlot[] = [];
    if (saved.front?.photo) pages.push(normalizeElectricityPage(saved.front));
    if (saved.back?.photo) pages.push(normalizeElectricityPage(saved.back));
    return pages;
  }
  // New pages format
  if (Array.isArray(saved?.pages)) {
    return saved.pages.map((page) => normalizeElectricityPage(page));
  }
  return [];
}

const emptyContractData = (): ContractData => ({ originalPdfs: [], extraction: null });

export const initialFormData: FormData = {
  dni: { front: emptyDocSlot(), back: emptyDocSlot(), originalPdfs: [] },
  ibi: { photo: null, pages: [], originalPdfs: [], extraction: null },
  electricityBill: { pages: [], originalPdfs: [] },
  contract: emptyContractData(),
  browserLanguage: typeof navigator !== 'undefined' ? navigator.language : undefined,
  energyCertificate: {
    status: 'not-started',
    housing: {
      cadastralReference: '',
      habitableAreaM2: '',
      floorCount: '',
      averageFloorHeight: null,
      bedroomCount: '',
      doorsByOrientation: { north: '', east: '', south: '', west: '' },
      windowsByOrientation: { north: '', east: '', south: '', west: '' },
      windowFrameMaterial: null,
      doorMaterial: '',
      windowGlassType: null,
      hasShutters: null,
      shutterWindowCount: '',
    },
    thermal: {
      thermalInstallationType: null,
      boilerFuelType: null,
      equipmentDetails: '',
      hasAirConditioning: null,
      airConditioningType: null,
      airConditioningDetails: '',
      heatingEmitterType: null,
      radiatorMaterial: null,
    },
    additional: {
      soldProduct: null,
      isExistingCustomer: null,
      hasSolarPanels: null,
      solarPanelDetails: '',
    },
    customerSignature: null,
    renderedDocument: null,
    completedAt: null,
    skippedAt: null,
  },
  signatures: { customerSignature: null, repSignature: null },
  representation: {
    location: null,
    isCompany: false,
    companyName: '',
    companyNIF: '',
    companyAddress: '',
    companyMunicipality: '',
    companyPostalCode: '',
    postalCode: '',
    ivaPropertyAddress: '',
    ivaCertificateSignature: null,
    representacioSignature: null,
    generalitatRole: 'titular',
    generalitatSignature: null,
    poderRepresentacioSignature: null,
    ivaCertificateEsSignature: null,
    renderedDocuments: {},
  },
};

function mergeDocSlot(base: DocSlot, slot?: Partial<DocSlot> | null): DocSlot {
  return {
    ...base,
    ...slot,
    photo: slot?.photo ?? base.photo,
    extraction: slot?.extraction ?? base.extraction,
  };
}

export function normalizeFormData(savedFormData?: FormData | null): FormData {
  const normalizedLocation = savedFormData?.location ?? savedFormData?.representation?.location ?? null;

  // Build the normalized energy certificate object.
  const rawEc = {
    ...initialFormData.energyCertificate,
    ...savedFormData?.energyCertificate,
    housing: {
      ...initialFormData.energyCertificate.housing,
      ...savedFormData?.energyCertificate?.housing,
      doorsByOrientation: {
        ...initialFormData.energyCertificate.housing.doorsByOrientation,
        ...savedFormData?.energyCertificate?.housing?.doorsByOrientation,
      },
      windowsByOrientation: {
        ...initialFormData.energyCertificate.housing.windowsByOrientation,
        ...savedFormData?.energyCertificate?.housing?.windowsByOrientation,
      },
    },
    thermal: {
      ...initialFormData.energyCertificate.thermal,
      ...savedFormData?.energyCertificate?.thermal,
    },
    additional: {
      ...initialFormData.energyCertificate.additional,
      ...savedFormData?.energyCertificate?.additional,
    },
  };

  // Downgrade stale 'completed' status: if the saved data claims 'completed' but
  // the field data no longer passes full validation (e.g. data saved before per-step
  // validation was introduced), reset to 'in-progress' so the form routes the user
  // back to the energy certificate survey instead of treating it as done.
  // This correction is in-memory only; it persists when the user re-completes the
  // survey and saves.
  const normalizedEc =
    rawEc.status === 'completed' && !isEnergyCertificateReadyToComplete(rawEc)
      ? { ...rawEc, status: 'in-progress' as const }
      : rawEc;

  return {
    ...initialFormData,
    ...savedFormData,
    dni: {
      front: mergeDocSlot(initialFormData.dni.front, savedFormData?.dni?.front),
      back: mergeDocSlot(initialFormData.dni.back, savedFormData?.dni?.back),
      originalPdfs: savedFormData?.dni?.originalPdfs ?? initialFormData.dni.originalPdfs,
    },
    ibi: {
      ...initialFormData.ibi,
      ...savedFormData?.ibi,
      pages: savedFormData?.ibi?.pages
        ?? (savedFormData?.ibi?.photo ? [savedFormData.ibi.photo] : initialFormData.ibi.pages),
      originalPdfs: savedFormData?.ibi?.originalPdfs ?? initialFormData.ibi.originalPdfs,
    },
    electricityBill: {
      pages: normalizeElectricityPages(savedFormData?.electricityBill),
      originalPdfs: savedFormData?.electricityBill?.originalPdfs ?? initialFormData.electricityBill.originalPdfs,
    },
    contract: {
      originalPdfs: savedFormData?.contract?.originalPdfs ?? [],
      extraction: savedFormData?.contract?.extraction ?? null,
    },
    energyCertificate: normalizedEc,
    signatures: {
      ...initialFormData.signatures,
      ...savedFormData?.signatures,
    },
    location: normalizedLocation ?? undefined,
    representation: {
      ...initialFormData.representation,
      ...savedFormData?.representation,
      location: normalizedLocation,
      renderedDocuments: savedFormData?.representation?.renderedDocuments ?? initialFormData.representation.renderedDocuments,
    },
  };
}

export function getFormItems(): FormItem[] {
  const items: FormItem[] = [
    {
      id: 'dniFront',
      label: 'DNI — Cara frontal',
      section: 'property-docs',
      required: false,
      isComplete: (fd) => !!fd.dni.front.photo,
    },
    {
      id: 'dniBack',
      label: 'DNI — Cara trasera',
      section: 'property-docs',
      required: false,
      isComplete: (fd) => !!fd.dni.back.photo,
    },
    {
      id: 'ibi',
      label: 'IBI / Escritura',
      section: 'property-docs',
      required: false,
      isComplete: (fd) => !!fd.ibi.photo || fd.ibi.pages.length > 0,
    },
    {
      id: 'electricity',
      label: 'Factura de luz',
      section: 'property-docs',
      required: false,
      isComplete: (fd) => fd.electricityBill.pages.length > 0,
    },
  ];

  return items;
}

export const useFormState = (
  projectCode: string | null,
  productType: ProductType,
  savedFormData?: FormData | null,
  projectToken?: string | null,
  options?: { preserveRepresentationSignaturesOnDocumentChange?: boolean }
) => {
  const preserveRepresentationSignatures =
    options?.preserveRepresentationSignaturesOnDocumentChange ?? false;
  const [formData, setFormData] = useState<FormData>(() => normalizeFormData(savedFormData));
  const [documentProcessing, setDocumentProcessing] = useState<Record<DocumentSlotKey, DocumentProcessingState>>(
    () => createInitialDocumentProcessing(normalizeFormData(savedFormData))
  );
  const [electricityProcessing, setElectricityProcessing] = useState<DocumentProcessingState[]>([]);
  const [errors, setErrors] = useState<FormErrors>({});
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const consecutiveSaveFailures = useRef(0);
  const lastSavedPayload = useRef<string>('');

  const syncSavedFormData = useEffectEvent((nextSavedFormData?: FormData | null) => {
    const normalized = normalizeFormData(nextSavedFormData);
    setFormData(normalized);
    setDocumentProcessing(createInitialDocumentProcessing(normalized));
    setElectricityProcessing(
      normalized.electricityBill.pages.map((page) =>
        page.photo
          ? { status: 'accepted', errorCode: undefined, errorMessage: undefined, pendingPreview: null }
          : emptyProcessingState()
      )
    );
  });

  useEffect(() => {
    syncSavedFormData(savedFormData);
  }, [projectCode, savedFormData]);

  // Auto-save with debounce
  useEffect(() => {
    if (!projectCode) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      // Strip large binary fields so the payload stays small (photos are persisted
      // device-locally in IndexedDB and restored on load from there).
      const cleanData = JSON.parse(JSON.stringify(formData, (_key, value) => {
        if (value instanceof File) return undefined;
        if (_key === 'preview') return undefined;       // UploadedPhoto binary (~1-5 MB each)
        if (_key === 'dataUrl') return undefined;       // StoredDocumentFile binary (PDF data)
        if (_key === 'imageDataUrl') return undefined;  // RenderedDocumentAsset base64
        return value;
      }));
      // Skip the network round-trip when data hasn't changed since the last successful save.
      // This stops the debounce from re-posting the same heavy payload every 2 seconds
      // when the user navigates sections without editing anything.
      const snapshot = JSON.stringify(cleanData);
      if (snapshot === lastSavedPayload.current) return;
      saveProgress(projectCode, cleanData, projectToken).then(() => {
        lastSavedPayload.current = snapshot;
        if (consecutiveSaveFailures.current > 0) {
          consecutiveSaveFailures.current = 0;
          toast.dismiss('save-error');
        }
      }).catch((err: unknown) => {
        consecutiveSaveFailures.current += 1;
        console.error('[useFormState] Auto-save failed:', err);
        if (consecutiveSaveFailures.current >= 2) {
          toast.warning('No se pudo guardar el progreso — comprueba tu conexión', {
            id: 'save-error',
            duration: 5000,
          });
        }
      });
    }, 2000);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [formData, projectCode, projectToken]);

  const setDocumentProcessingState = useCallback((slotKey: DocumentSlotKey, nextState: DocumentProcessingState) => {
    setDocumentProcessing((prev) => ({ ...prev, [slotKey]: nextState }));
  }, []);

  // DNI
  const setDNIFrontPhoto = useCallback((photo: UploadedPhoto | null) => {
    setFormData(prev => ({
      ...prev,
      dni: {
        ...prev.dni,
        front: { photo, extraction: photo ? prev.dni.front.extraction : null },
        originalPdfs: photo || prev.dni.back.photo ? prev.dni.originalPdfs : [],
      },
      representation: clearRepresentationArtifacts(prev.representation, preserveRepresentationSignatures),
    }));
  }, [preserveRepresentationSignatures]);
  const setDNIFrontExtraction = useCallback((extraction: AIExtraction | null) => {
    setFormData(prev => ({
      ...prev,
      dni: { ...prev.dni, front: { ...prev.dni.front, extraction } },
      representation: clearRepresentationArtifacts(prev.representation, preserveRepresentationSignatures),
    }));
  }, [preserveRepresentationSignatures]);
  const setDNIBackPhoto = useCallback((photo: UploadedPhoto | null) => {
    setFormData(prev => ({
      ...prev,
      dni: {
        ...prev.dni,
        back: { photo, extraction: photo ? prev.dni.back.extraction : null },
        originalPdfs: photo || prev.dni.front.photo ? prev.dni.originalPdfs : [],
      },
      representation: clearRepresentationArtifacts(prev.representation, preserveRepresentationSignatures),
    }));
  }, [preserveRepresentationSignatures]);
  const setDNIBackExtraction = useCallback((extraction: AIExtraction | null) => {
    setFormData(prev => ({
      ...prev,
      dni: { ...prev.dni, back: { ...prev.dni.back, extraction } },
      representation: clearRepresentationArtifacts(prev.representation, preserveRepresentationSignatures),
    }));
  }, [preserveRepresentationSignatures]);

  // IBI
  const mergeDNIOriginalPdfs = useCallback((pdfs: StoredDocumentFile[]) => {
    if (pdfs.length === 0) return;
    setFormData(prev => ({
      ...prev,
      dni: {
        ...prev.dni,
        originalPdfs: mergeStoredDocumentFiles(prev.dni.originalPdfs, pdfs),
      },
      representation: clearRepresentationArtifacts(prev.representation, preserveRepresentationSignatures),
    }));
  }, [preserveRepresentationSignatures]);

  const setIBIDocument = useCallback((pages: UploadedPhoto[], extraction: AIExtraction | null, originalPdfs: StoredDocumentFile[] = []) => {
    const primaryPhoto = pages[0] ?? null;
    setFormData(prev => ({
      ...prev,
      ibi: {
        ...prev.ibi,
        photo: primaryPhoto,
        pages,
        originalPdfs,
        extraction: primaryPhoto ? extraction : null,
      },
      representation: clearRepresentationArtifacts(prev.representation, preserveRepresentationSignatures),
    }));
  }, [preserveRepresentationSignatures]);

  // Electricity — multi-page
  const addElectricityPages = useCallback((photos: UploadedPhoto[], extraction: AIExtraction, originalPdfs: StoredDocumentFile[] = []) => {
    if (photos.length === 0 && originalPdfs.length === 0) return;
    setFormData(prev => ({
      ...prev,
      electricityBill: {
        pages: [
          ...prev.electricityBill.pages,
          ...photos.map((photo) => ({ photo, extraction })),
        ],
        originalPdfs: mergeStoredDocumentFiles(prev.electricityBill.originalPdfs, originalPdfs),
      },
      representation: clearRepresentationArtifacts(prev.representation, preserveRepresentationSignatures),
    }));
    setElectricityProcessing(prev => [
      ...prev,
      ...photos.map((): DocumentProcessingState => ({ status: 'accepted', errorCode: undefined, errorMessage: undefined, pendingPreview: null })),
    ]);
  }, [preserveRepresentationSignatures]);

  const removeElectricityPage = useCallback((index: number) => {
    setFormData(prev => ({
      ...prev,
      electricityBill: {
        pages: prev.electricityBill.pages.filter((_, i) => i !== index),
        originalPdfs: prev.electricityBill.pages.filter((_, i) => i !== index).length > 0
          ? prev.electricityBill.originalPdfs
          : [],
      },
      representation: clearRepresentationArtifacts(prev.representation, preserveRepresentationSignatures),
    }));
    setElectricityProcessing(prev => prev.filter((_, i) => i !== index));
  }, [preserveRepresentationSignatures]);

  const setElectricityPageProcessing = useCallback((index: number, state: DocumentProcessingState) => {
    setElectricityProcessing(prev => {
      const next = [...prev];
      // Ensure array is long enough
      while (next.length <= index) next.push(emptyProcessingState());
      next[index] = state;
      return next;
    });
  }, []);

  // Contract
  const setContract = useCallback((contract: ContractData) => {
    setFormData(prev => ({ ...prev, contract }));
  }, []);

  // Representation
  const setRepresentation = useCallback((rep: RepresentationData) => {
    setFormData(prev => {
      const previous = prev.representation;
      const companyDetailsChanged =
        previous.isCompany !== rep.isCompany
        || previous.companyName !== rep.companyName
        || previous.companyNIF !== rep.companyNIF
        || previous.companyAddress !== rep.companyAddress
        || previous.companyMunicipality !== rep.companyMunicipality
        || previous.companyPostalCode !== rep.companyPostalCode;

      const generalitatRoleChanged = previous.generalitatRole !== rep.generalitatRole;
      let nextRepresentation = rep;

      if (companyDetailsChanged) nextRepresentation = clearAllSignedRepresentationArtifacts(nextRepresentation);
      else if (generalitatRoleChanged) nextRepresentation = clearGeneralitatArtifact(nextRepresentation);

      return { ...prev, representation: nextRepresentation };
    });
  }, []);

  const setEnergyCertificate = useCallback((energyCertificate: EnergyCertificateData) => {
    setFormData((prev) => ({
      ...prev,
      energyCertificate,
    }));
  }, []);

  // Location
  const setLocation = useCallback((location: 'cataluna' | 'madrid' | 'valencia' | 'other') => {
    setFormData(prev => {
      const previousLocation = prev.location ?? prev.representation.location;
      const shouldResetRegionSignatures = previousLocation != null && previousLocation !== location;
      const nextRepresentation = shouldResetRegionSignatures
        ? clearAllSignedRepresentationArtifacts(prev.representation)
        : prev.representation;

      return {
        ...prev,
        location,
        representation: {
          ...nextRepresentation,
          location,
        },
      };
    });
  }, []);

  // Validators
  const validatePropertyDocs = useCallback((): boolean => {
    const slotBusy = Object.values(documentProcessing).some(
      (slot) => slot.status === 'validating' || slot.status === 'extracting'
    );
    const electricityBusy = electricityProcessing.some(
      (slot) => slot.status === 'validating' || slot.status === 'extracting'
    );

    if (!slotBusy && !electricityBusy) {
      setErrors({});
      return true;
    }

    setErrors({
      'propertyDocs.blocking': 'Espera a que termine la verificación o extracción antes de continuar.',
    });
    return false;
  }, [documentProcessing, electricityProcessing]);

  const validateRepresentation = useCallback((): boolean => {
    const e: FormErrors = {};
    const effectiveLocation = formData.location ?? formData.representation.location;

    if (!effectiveLocation) e['representation.location'] = 'Selecciona tu ubicación';
    if (formData.representation.isCompany) {
      if (!formData.representation.companyName.trim()) e['representation.companyName'] = 'Nombre de empresa obligatorio';
      if (!formData.representation.companyNIF.trim()) e['representation.companyNIF'] = 'NIF obligatorio';
    }
    if (effectiveLocation !== 'other') {
      if (effectiveLocation === 'cataluna') {
        if (!formData.representation.ivaCertificateSignature) e['representation.ivaSignature'] = 'Firma del certificado IVA obligatoria';
        if (!formData.representation.representacioSignature) e['representation.representacioSignature'] = 'Firma de l\'autorització de representació obligatòria';
        if (!formData.representation.generalitatSignature) e['representation.generalitatSignature'] = 'Firma de la declaració Generalitat obligatòria';
      }
      if (effectiveLocation === 'madrid' || effectiveLocation === 'valencia') {
        if (!formData.representation.ivaCertificateEsSignature) e['representation.ivaCertificateEsSignature'] = 'Firma del certificado IVA obligatoria';
        if (!formData.representation.poderRepresentacioSignature) e['representation.poderRepresentacioSignature'] = 'Firma del poder de representación obligatoria';
      }
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }, [formData.location, formData.representation]);

  const getProgress = useCallback(() => {
    const items = getFormItems();
    const completed = items.filter(item => item.isComplete(formData, productType)).length;
    return { completed, total: items.length, percent: Math.round((completed / items.length) * 100) };
  }, [formData, productType]);

  const canSubmit = useCallback((): boolean => {
    const items = getFormItems();
    return items.filter(i => i.required).every(i => i.isComplete(formData, productType));
  }, [formData, productType]);

  const hasBlockingDocumentProcessing =
    Object.values(documentProcessing).some((slot) =>
      slot.status === 'validating' || slot.status === 'extracting'
    )
    || electricityProcessing.some((slot) =>
      slot.status === 'validating' || slot.status === 'extracting'
    );

  return {
    formData, errors, documentProcessing, electricityProcessing, hasBlockingDocumentProcessing,
    setDNIFrontPhoto, setDNIFrontExtraction,
    setDNIBackPhoto, setDNIBackExtraction,
    mergeDNIOriginalPdfs,
    setIBIDocument,
    addElectricityPages, removeElectricityPage, setElectricityPageProcessing,
    setContract,
    setLocation,
    setRepresentation,
    setEnergyCertificate,
    setDocumentProcessingState,
    validatePropertyDocs, validateRepresentation,
    getProgress, canSubmit, setErrors,
  };
};
