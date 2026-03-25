import { useState, useCallback, useRef, useEffect } from 'react';
import type {
  FormData, FormErrors, UploadedPhoto,
  AIExtraction, ProductType, FormItem, DocSlot, RepresentationData,
  DocumentSlotKey, DocumentProcessingState
} from '@/types';
import { saveProgress } from '@/services/api';

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
    || (slotKey === 'ibi' && !!formData.ibi.photo);

  return accepted ? { status: 'accepted', errorCode: undefined, errorMessage: undefined, pendingPreview: null } : emptyProcessingState();
}

function createInitialDocumentProcessing(formData: FormData) {
  return DOCUMENT_SLOT_KEYS.reduce<Record<DocumentSlotKey, DocumentProcessingState>>((acc, key) => {
    acc[key] = getAcceptedDocumentSlotState(formData, key);
    return acc;
  }, {} as Record<DocumentSlotKey, DocumentProcessingState>);
}

function normalizeElectricityPages(saved: any): DocSlot[] {
  // Handle old front/back format → migrate to pages
  if (saved?.front || saved?.back) {
    const pages: DocSlot[] = [];
    if (saved.front?.photo) pages.push({ photo: saved.front.photo, extraction: saved.front.extraction ?? null });
    if (saved.back?.photo) pages.push({ photo: saved.back.photo, extraction: saved.back.extraction ?? null });
    return pages;
  }
  // New pages format
  if (Array.isArray(saved?.pages)) {
    return saved.pages.map((p: any) => ({
      photo: p?.photo ?? null,
      extraction: p?.extraction ?? null,
    }));
  }
  return [];
}

export const initialFormData: FormData = {
  dni: { front: emptyDocSlot(), back: emptyDocSlot() },
  ibi: { photo: null, extraction: null },
  electricityBill: { pages: [] },
  electricalPanel: { photos: [] },
  roof: { photos: [], lengthM: '', widthM: '', roofType: '', orientation: '' },
  installationSpace: { photos: [], widthCm: '', depthCm: '', heightCm: '' },
  radiators: { photos: [], radiatorType: '', totalCount: '', heatingZones: '' },
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

function normalizeFormData(savedFormData?: FormData | null): FormData {
  const normalizedLocation = savedFormData?.location ?? savedFormData?.representation?.location ?? null;

  return {
    ...initialFormData,
    ...savedFormData,
    dni: {
      front: mergeDocSlot(initialFormData.dni.front, savedFormData?.dni?.front),
      back: mergeDocSlot(initialFormData.dni.back, savedFormData?.dni?.back),
    },
    ibi: {
      ...initialFormData.ibi,
      ...savedFormData?.ibi,
    },
    electricityBill: {
      pages: normalizeElectricityPages(savedFormData?.electricityBill),
    },
    electricalPanel: {
      ...initialFormData.electricalPanel,
      ...savedFormData?.electricalPanel,
      photos: savedFormData?.electricalPanel?.photos ?? initialFormData.electricalPanel.photos,
    },
    roof: {
      ...initialFormData.roof,
      ...savedFormData?.roof,
      photos: savedFormData?.roof?.photos ?? initialFormData.roof.photos,
    },
    installationSpace: {
      ...initialFormData.installationSpace,
      ...savedFormData?.installationSpace,
      photos: savedFormData?.installationSpace?.photos ?? initialFormData.installationSpace.photos,
    },
    radiators: {
      ...initialFormData.radiators,
      ...savedFormData?.radiators,
      photos: savedFormData?.radiators?.photos ?? initialFormData.radiators.photos,
    },
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

export function getFormItems(_productType: ProductType): FormItem[] {
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
      isComplete: (fd) => !!fd.ibi.photo,
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

export const useFormState = (projectCode: string | null, productType: ProductType, savedFormData?: FormData | null, projectToken?: string | null) => {
  const [formData, setFormData] = useState<FormData>(() => normalizeFormData(savedFormData));
  const [documentProcessing, setDocumentProcessing] = useState<Record<DocumentSlotKey, DocumentProcessingState>>(
    () => createInitialDocumentProcessing(normalizeFormData(savedFormData))
  );
  const [electricityProcessing, setElectricityProcessing] = useState<DocumentProcessingState[]>([]);
  const [errors, setErrors] = useState<FormErrors>({});
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const normalized = normalizeFormData(savedFormData);
    setFormData(normalized);
    setDocumentProcessing(createInitialDocumentProcessing(normalized));
    // Restore accepted state for existing pages
    setElectricityProcessing(
      normalized.electricityBill.pages.map((p) =>
        p.photo
          ? { status: 'accepted', errorCode: undefined, errorMessage: undefined, pendingPreview: null }
          : emptyProcessingState()
      )
    );
  }, [projectCode, savedFormData]);

  // Auto-save with debounce
  useEffect(() => {
    if (!projectCode) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const cleanData = JSON.parse(JSON.stringify(formData, (_key, value) => {
        if (value instanceof File) return undefined;
        return value;
      }));
      saveProgress(projectCode, cleanData, projectToken).catch(() => {});
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
      dni: { ...prev.dni, front: { photo, extraction: photo ? prev.dni.front.extraction : null } },
      representation: clearAllSignedRepresentationArtifacts(prev.representation),
    }));
  }, []);
  const setDNIFrontExtraction = useCallback((extraction: AIExtraction | null) => {
    setFormData(prev => ({
      ...prev,
      dni: { ...prev.dni, front: { ...prev.dni.front, extraction } },
      representation: clearAllSignedRepresentationArtifacts(prev.representation),
    }));
  }, []);
  const setDNIBackPhoto = useCallback((photo: UploadedPhoto | null) => {
    setFormData(prev => ({
      ...prev,
      dni: { ...prev.dni, back: { photo, extraction: photo ? prev.dni.back.extraction : null } },
      representation: clearAllSignedRepresentationArtifacts(prev.representation),
    }));
  }, []);
  const setDNIBackExtraction = useCallback((extraction: AIExtraction | null) => {
    setFormData(prev => ({
      ...prev,
      dni: { ...prev.dni, back: { ...prev.dni.back, extraction } },
      representation: clearAllSignedRepresentationArtifacts(prev.representation),
    }));
  }, []);

  // IBI
  const setIBIPhoto = useCallback((photo: UploadedPhoto | null) => {
    setFormData(prev => ({
      ...prev,
      ibi: { ...prev.ibi, photo, extraction: photo ? prev.ibi.extraction : null },
      representation: clearAllSignedRepresentationArtifacts(prev.representation),
    }));
  }, []);
  const setIBIExtraction = useCallback((extraction: AIExtraction | null) => {
    setFormData(prev => ({
      ...prev,
      ibi: { ...prev.ibi, extraction },
      representation: clearAllSignedRepresentationArtifacts(prev.representation),
    }));
  }, []);

  // Electricity — multi-page
  const addElectricityPage = useCallback((photo: UploadedPhoto, extraction: AIExtraction) => {
    setFormData(prev => ({
      ...prev,
      electricityBill: {
        pages: [...prev.electricityBill.pages, { photo, extraction }],
      },
      representation: clearAllSignedRepresentationArtifacts(prev.representation),
    }));
    setElectricityProcessing(prev => [
      ...prev,
      { status: 'accepted', errorCode: undefined, errorMessage: undefined, pendingPreview: null },
    ]);
  }, []);

  const removeElectricityPage = useCallback((index: number) => {
    setFormData(prev => ({
      ...prev,
      electricityBill: {
        pages: prev.electricityBill.pages.filter((_, i) => i !== index),
      },
      representation: clearAllSignedRepresentationArtifacts(prev.representation),
    }));
    setElectricityProcessing(prev => prev.filter((_, i) => i !== index));
  }, []);

  const setElectricityPageProcessing = useCallback((index: number, state: DocumentProcessingState) => {
    setElectricityProcessing(prev => {
      const next = [...prev];
      // Ensure array is long enough
      while (next.length <= index) next.push(emptyProcessingState());
      next[index] = state;
      return next;
    });
  }, []);

  // Property Photos
  const setElectricalPanelPhotos = useCallback((photos: UploadedPhoto[]) => {
    setFormData(prev => ({ ...prev, electricalPanel: { photos } }));
  }, []);
  const updateRoof = useCallback((field: string, value: any) => {
    setFormData(prev => ({ ...prev, roof: { ...prev.roof, [field]: value } }));
  }, []);
  const updateInstallationSpace = useCallback((field: string, value: any) => {
    setFormData(prev => ({ ...prev, installationSpace: { ...prev.installationSpace, [field]: value } }));
  }, []);
  const updateRadiators = useCallback((field: string, value: any) => {
    setFormData(prev => ({ ...prev, radiators: { ...prev.radiators, [field]: value } }));
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
    if (effectiveLocation === 'cataluna') {
      if (!formData.representation.ivaCertificateSignature) e['representation.ivaSignature'] = 'Firma del certificado IVA obligatoria';
      if (!formData.representation.representacioSignature) e['representation.representacioSignature'] = 'Firma de l\'autorització de representació obligatòria';
      if (!formData.representation.generalitatSignature) e['representation.generalitatSignature'] = 'Firma de la declaració Generalitat obligatòria';
    }
    if (effectiveLocation === 'madrid' || effectiveLocation === 'valencia') {
      if (!formData.representation.ivaCertificateEsSignature) e['representation.ivaCertificateEsSignature'] = 'Firma del certificado IVA obligatoria';
      if (!formData.representation.poderRepresentacioSignature) e['representation.poderRepresentacioSignature'] = 'Firma del poder de representación obligatoria';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }, [formData.location, formData.representation]);

  const getProgress = useCallback(() => {
    const items = getFormItems(productType);
    const completed = items.filter(item => item.isComplete(formData, productType)).length;
    return { completed, total: items.length, percent: Math.round((completed / items.length) * 100) };
  }, [formData, productType]);

  const canSubmit = useCallback((): boolean => {
    const items = getFormItems(productType);
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
    setIBIPhoto, setIBIExtraction,
    addElectricityPage, removeElectricityPage, setElectricityPageProcessing,
    setElectricalPanelPhotos,
    updateRoof, updateInstallationSpace, updateRadiators,
    setLocation,
    setRepresentation,
    setDocumentProcessingState,
    validatePropertyDocs, validateRepresentation,
    getProgress, canSubmit, setErrors,
  };
};
