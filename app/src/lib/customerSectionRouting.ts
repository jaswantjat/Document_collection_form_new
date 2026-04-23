import { hasEnergyCertificateDecision } from '@/lib/energyCertificateFlow';
import { hasRequiredPropertyDocs } from '@/lib/propertyDocsRequirements';
import type { FormData, ProjectData, Section } from '@/types';

function getEffectiveLocation(formData: FormData | null): string | null {
  return formData?.location ?? formData?.representation?.location ?? null;
}

function hasHolderTypeConfirmed(formData: FormData | null): boolean {
  return !!formData?.representation?.holderTypeConfirmed;
}

export function hasRepresentationDone(formData: FormData | null, location: string | null): boolean {
  if (!formData || !location) return false;
  if (location === 'other') return true;

  const rep = formData.representation;
  if (location === 'cataluna') {
    return !!(rep.ivaCertificateSignature && rep.generalitatSignature && rep.representacioSignature);
  }
  if (location === 'madrid' || location === 'valencia') {
    return !!(rep.ivaCertificateEsSignature && rep.poderRepresentacioSignature);
  }
  return false;
}

export function hasExistingRepresentationFlow(formData: FormData | null): boolean {
  return hasRepresentationDone(formData, getEffectiveLocation(formData));
}

function canReturnToReviewFromSavedSection(formData: FormData | null): boolean {
  const location = getEffectiveLocation(formData);
  return location === 'other' || hasRepresentationDone(formData, location);
}

export function getInitialCustomerSection(
  project: ProjectData,
  savedSection: Section | null
): Section {
  const fd = project.formData;
  const location = getEffectiveLocation(fd);
  const holderTypeConfirmed = hasHolderTypeConfirmed(fd);
  const followUpDocumentFlow = hasExistingRepresentationFlow(fd);
  const hasEnergyDecision = hasEnergyCertificateDecision(fd?.energyCertificate);

  if (savedSection) {
    if (savedSection === 'representation' && hasRepresentationDone(fd, location)) {
      return 'review';
    }
    if (savedSection === 'review') return 'review';
    if (savedSection === 'energy-certificate' && canReturnToReviewFromSavedSection(fd)) {
      return 'review';
    }
    if (!followUpDocumentFlow) {
      if (savedSection !== 'representation' || (!!location && location !== 'other')) {
        return savedSection;
      }
    }
  }

  if (followUpDocumentFlow) return 'review';
  if (hasRepresentationDone(fd, location)) return hasEnergyDecision ? 'review' : 'energy-certificate';
  if (location === 'other') return hasEnergyDecision ? 'review' : 'energy-certificate';
  if (location && !holderTypeConfirmed) return 'province-selection';
  if (location) return 'representation';
  if (hasRequiredPropertyDocs(fd, project.productType)) return 'province-selection';
  return 'property-docs';
}

export function getLikelyNextCustomerSection(
  currentSection: Section | 'phone',
  formData: FormData,
  followUpDocumentFlow: boolean
): Section | null {
  const location = getEffectiveLocation(formData);

  switch (currentSection) {
    case 'phone':
      return null;
    case 'property-docs':
      return followUpDocumentFlow ? 'review' : 'province-selection';
    case 'province-selection':
      return location === 'other'
        ? (hasEnergyCertificateDecision(formData.energyCertificate) ? 'review' : 'energy-certificate')
        : 'representation';
    case 'representation':
      return hasEnergyCertificateDecision(formData.energyCertificate)
        ? 'review'
        : 'energy-certificate';
    case 'energy-certificate':
      return 'review';
    default:
      return null;
  }
}
