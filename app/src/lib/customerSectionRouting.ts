import { hasEnergyCertificateDecision } from '@/lib/energyCertificateFlow';
import { isIdentityDocumentComplete } from '@/lib/identityDocument';
import { hasRequiredPropertyDocs } from '@/lib/propertyDocsProgress';
import type { FormData, ProjectData, Section } from '@/types';

export function hasHolderTypeConfirmed(formData: FormData | null): boolean {
  return !!formData?.representation?.holderTypeConfirmed;
}

export function hasRepresentationDone(
  formData: FormData | null,
  location: string | null
): boolean {
  if (!formData || !location) return false;
  if (location === 'other') return true;

  const representation = formData.representation;
  if (!representation) return false;

  if (location === 'cataluna') {
    return Boolean(
      representation.ivaCertificateSignature
      && representation.generalitatSignature
      && representation.representacioSignature
    );
  }

  if (location === 'madrid' || location === 'valencia') {
    return Boolean(
      representation.ivaCertificateEsSignature
      && representation.poderRepresentacioSignature
    );
  }

  return false;
}

function shouldRouteReloadToReview(
  savedSection: Section | null,
  location: string | null
): boolean {
  return Boolean(savedSection && location);
}

function hasPropertyDocsDone(project: ProjectData): boolean {
  const formData = project.formData;
  if (!formData) return false;

  return hasRequiredPropertyDocs({
    productType: project.productType,
    dniDone: isIdentityDocumentComplete(formData.dni),
    ibiDone: Boolean(formData.ibi?.photo || formData.ibi?.pages?.length),
    electricityDone: Boolean(formData.electricityBill?.pages?.length),
  });
}

export function getInitialCustomerSection(
  project: ProjectData | null,
  urlCode: string | null,
  savedSection: Section | null
): Section | 'phone' {
  if (!project || !urlCode) return urlCode ? 'property-docs' : 'phone';

  const formData = project.formData;
  const location = formData?.location ?? formData?.representation?.location ?? null;
  const followUpDocumentFlow = hasRepresentationDone(formData, location);
  const hasEnergyDecision = hasEnergyCertificateDecision(
    formData?.energyCertificate
  );

  let nextSection: Section | 'phone';

  if (shouldRouteReloadToReview(savedSection, location)) {
    nextSection = 'review';
  } else if (savedSection) {
    if (savedSection === 'representation' && followUpDocumentFlow) {
      nextSection = hasEnergyDecision ? 'review' : 'energy-certificate';
    } else if (
      !followUpDocumentFlow
      && (savedSection !== 'representation' || !!location && location !== 'other')
    ) {
      nextSection = savedSection;
    } else if (followUpDocumentFlow) {
      nextSection = 'review';
    } else if (location === 'other') {
      nextSection = hasEnergyDecision ? 'review' : 'energy-certificate';
    } else if (location && !hasHolderTypeConfirmed(formData)) {
      nextSection = 'province-selection';
    } else if (location) {
      nextSection = 'representation';
    } else if (hasPropertyDocsDone(project)) {
      nextSection = 'province-selection';
    } else {
      nextSection = 'property-docs';
    }
  } else if (followUpDocumentFlow) {
    nextSection = 'review';
  } else if (location === 'other') {
    nextSection = hasEnergyDecision ? 'review' : 'energy-certificate';
  } else if (location && !hasHolderTypeConfirmed(formData)) {
    nextSection = 'province-selection';
  } else if (location) {
    nextSection = 'representation';
  } else if (hasPropertyDocsDone(project)) {
    nextSection = 'province-selection';
  } else {
    nextSection = 'property-docs';
  }

  return nextSection;
}
