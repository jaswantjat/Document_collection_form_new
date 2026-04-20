const IDENTITY_DOCUMENT_KINDS = new Set([
  'dni-card',
  'nie-card',
  'nie-certificate',
  'passport',
]);

function isValidIdentityNumber(number) {
  if (!number || typeof number !== 'string') return false;
  const normalized = number.toUpperCase().replace(/[\s\-\.]/g, '');
  if (/^\d{8}[A-Z]$/.test(normalized)) return true;
  if (/^[XYZT]\d{7}[A-Z]$/.test(normalized)) return true;
  if (/^[A-Z]{1,3}\d{5,9}[A-Z0-9]?$/.test(normalized)) return true;
  if (/^[A-Z0-9]{6,12}$/.test(normalized)) return true;
  return false;
}

function normalizeExtractedStringFields(extractedData) {
  if (!extractedData || typeof extractedData !== 'object') return extractedData;
  const normalized = { ...extractedData };

  for (const [key, value] of Object.entries(normalized)) {
    if (typeof value === 'string') {
      normalized[key] = value.replace(/\s+/g, ' ').trim() || null;
    }
  }

  return normalized;
}

function normalizeIdentityExtraction(item) {
  if (!item || typeof item !== 'object') return item;

  const normalized = { ...item };
  normalized.extractedData = normalizeExtractedStringFields(normalized.extractedData) || {};

  const extractedData = normalized.extractedData;
  const detectedText = `${normalized.documentTypeDetected || ''} ${normalized.notes || ''}`.toLowerCase();
  const hasIdentityCore = Boolean(
    extractedData.fullName
    || extractedData.dniNumber
    || extractedData.dateOfBirth
    || extractedData.expiryDate
    || extractedData.sex
    || extractedData.nationality
  );
  const hasAddressData = Boolean(
    extractedData.address
    || extractedData.municipality
    || extractedData.province
    || extractedData.placeOfBirth
  );
  const explicitBackCue =
    detectedText.includes('back side')
    || detectedText.includes('back')
    || detectedText.includes('reverse')
    || detectedText.includes('reverso')
    || detectedText.includes('dorso')
    || detectedText.includes('trasera')
    || detectedText.includes('legal text');

  let identityDocumentKind = IDENTITY_DOCUMENT_KINDS.has(normalized.identityDocumentKind)
    ? normalized.identityDocumentKind
    : null;

  if (!identityDocumentKind) {
    const dniNumber = String(extractedData.dniNumber || '').toUpperCase();
    if (
      detectedText.includes('nie-certificate')
      || detectedText.includes('nie certificate')
      || detectedText.includes('certificado')
      || detectedText.includes('certificat')
    ) {
      identityDocumentKind = 'nie-certificate';
    } else if (detectedText.includes('nie') || /^[XYZT]/.test(dniNumber)) {
      identityDocumentKind = 'nie-card';
    } else {
      identityDocumentKind = 'dni-card';
    }
  }

  const aiExplicitSide =
    normalized.side === 'front' || normalized.side === 'back'
      ? normalized.side
      : null;
  let side = aiExplicitSide;

  if (identityDocumentKind === 'nie-certificate' || identityDocumentKind === 'passport') {
    side = 'front';
  } else if (hasAddressData && !hasIdentityCore) {
    side = 'back';
  } else if (hasAddressData && hasIdentityCore) {
    if (!side) side = 'front';
  } else if (explicitBackCue) {
    side = 'back';
  } else if (!side) {
    if (hasIdentityCore) side = 'front';
    else if (identityDocumentKind === 'nie-card') side = 'back';
  }

  if (side === 'front') {
    extractedData.address = null;
    extractedData.municipality = null;
    extractedData.province = null;
    extractedData.placeOfBirth = null;
  } else if (side === 'back') {
    extractedData.fullName = null;
    extractedData.firstName = null;
    extractedData.lastName = null;
    extractedData.dniNumber = null;
    extractedData.dateOfBirth = null;
    extractedData.expiryDate = null;
    extractedData.sex = null;
    extractedData.nationality = null;
  }

  normalized.identityDocumentKind = identityDocumentKind;
  normalized.side = side;
  return normalized;
}

module.exports = {
  isValidIdentityNumber,
  normalizeExtractedStringFields,
  normalizeIdentityExtraction,
};
