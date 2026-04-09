import { normalizeFormData } from '@/hooks/useFormState';
import type { FormData, ProjectData } from '@/types';

function hasPreview(photo: { preview?: string } | null | undefined): boolean {
  return !!photo?.preview;
}

function hasDataUrl(file: { dataUrl?: string } | null | undefined): boolean {
  return !!file?.dataUrl;
}

export function mergeProjectWithDeviceBackup(
  project: ProjectData,
  backupFormData: FormData
): ProjectData {
  const serverData = normalizeFormData(project.formData);
  const backupData = normalizeFormData(backupFormData);

  const mergedFormData: FormData = {
    ...serverData,
    dni: {
      ...serverData.dni,
      front: {
        ...serverData.dni.front,
        photo: hasPreview(backupData.dni.front.photo)
          ? backupData.dni.front.photo
          : serverData.dni.front.photo,
        extraction: serverData.dni.front.extraction ?? null,
      },
      back: {
        ...serverData.dni.back,
        photo: hasPreview(backupData.dni.back.photo)
          ? backupData.dni.back.photo
          : serverData.dni.back.photo,
        extraction: serverData.dni.back.extraction ?? null,
      },
      originalPdfs: backupData.dni.originalPdfs.some(hasDataUrl)
        ? backupData.dni.originalPdfs
        : serverData.dni.originalPdfs,
      issue: serverData.dni.issue ?? backupData.dni.issue ?? null,
    },
    ibi: {
      ...serverData.ibi,
      photo: hasPreview(backupData.ibi.photo)
        ? backupData.ibi.photo
        : serverData.ibi.photo,
      pages: backupData.ibi.pages.some(hasPreview)
        ? backupData.ibi.pages
        : serverData.ibi.pages,
      originalPdfs: backupData.ibi.originalPdfs.some(hasDataUrl)
        ? backupData.ibi.originalPdfs
        : serverData.ibi.originalPdfs,
      extraction: serverData.ibi.extraction ?? null,
      issue: serverData.ibi.issue ?? backupData.ibi.issue ?? null,
    },
    electricityBill: {
      ...serverData.electricityBill,
      pages: backupData.electricityBill.pages.some((page) => hasPreview(page.photo))
        ? backupData.electricityBill.pages
        : serverData.electricityBill.pages,
      originalPdfs: backupData.electricityBill.originalPdfs.some(hasDataUrl)
        ? backupData.electricityBill.originalPdfs
        : serverData.electricityBill.originalPdfs,
      issue: serverData.electricityBill.issue ?? backupData.electricityBill.issue ?? null,
    },
    contract: {
      ...serverData.contract,
      originalPdfs: backupData.contract?.originalPdfs?.some(hasDataUrl)
        ? backupData.contract.originalPdfs
        : (serverData.contract?.originalPdfs ?? []),
      extraction: serverData.contract?.extraction ?? null,
      issue: serverData.contract?.issue ?? backupData.contract?.issue ?? null,
    },
    energyCertificate: {
      ...serverData.energyCertificate,
      renderedDocument: backupData.energyCertificate.renderedDocument?.imageDataUrl
        ? backupData.energyCertificate.renderedDocument
        : serverData.energyCertificate.renderedDocument,
      currentStepIndex: backupData.energyCertificate.currentStepIndex
        ?? serverData.energyCertificate.currentStepIndex,
    },
  };

  return {
    ...project,
    formData: mergedFormData,
  };
}
