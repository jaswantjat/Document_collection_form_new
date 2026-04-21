function getEffectiveLocation(formData) {
  return formData?.location ?? formData?.representation?.location ?? null;
}

function getElectricityPages(formData) {
  const bill = formData?.electricityBill;
  if (!bill) return [];
  if (Array.isArray(bill.pages)) return bill.pages;

  const pages = [];
  if (bill.front?.photo) pages.push(bill.front);
  if (bill.back?.photo) pages.push(bill.back);
  return pages;
}

function getIbiPages(formData) {
  if (Array.isArray(formData?.ibi?.pages) && formData.ibi.pages.length > 0) {
    return formData.ibi.pages;
  }
  return formData?.ibi?.photo ? [formData.ibi.photo] : [];
}

function hasPhotoLikeValue(photo) {
  return Boolean(photo);
}

function hasRenderedDocumentAsset(representation, key) {
  return Boolean(representation?.renderedDocuments?.[key]);
}

function getFirstElectricityData(formData) {
  const pages = getElectricityPages(formData);
  const merged = {};

  for (const page of pages) {
    const data = page?.extraction?.extractedData || {};
    for (const [key, value] of Object.entries(data)) {
      if (value && !merged[key]) {
        merged[key] = value;
      }
    }
  }

  return merged;
}

function getProjectSnapshot(formData) {
  const dniFront = formData?.dni?.front?.extraction?.extractedData || {};
  const dniBack = formData?.dni?.back?.extraction?.extractedData || {};
  const ibi = formData?.ibi?.extraction?.extractedData || {};
  const eb = getFirstElectricityData(formData);
  const contract = formData?.contract?.extraction?.extractedData || {};
  const representation = formData?.representation || {};

  const fullName = contract.fullName || dniFront.fullName || eb.titular || ibi.titular || '';
  let firstName = dniFront.firstName || null;
  let lastName = dniFront.lastName || null;

  if ((!firstName || !lastName) && fullName) {
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    if (parts.length > 0) {
      if (!firstName) {
        firstName = parts[0];
      }

      if (!lastName && parts.length > 1) {
        const fnWords = firstName ? firstName.trim().split(/\s+/).length : 1;
        const remaining = parts.slice(fnWords).join(' ');
        if (remaining) {
          lastName = remaining;
        }
      }
    }
  }

  return {
    location: getEffectiveLocation(formData),
    dniFront,
    dniBack,
    ibi,
    electricityData: eb,
    contract,
    representation,
    fullName,
    firstName,
    lastName,
    dniNumber: contract.nif || dniFront.dniNumber || eb.nifTitular || ibi.titularNif || '',
    address: contract.address || eb.direccionSuministro || dniBack.address || ibi.direccion || '',
    municipality: contract.municipality || eb.municipio || dniBack.municipality || ibi.municipio || '',
    province: contract.province || eb.provincia || ibi.provincia || '',
    postalCode: contract.postalCode || eb.codigoPostal || ibi.codigoPostal || representation.postalCode || '',
  };
}

function normalizeNamePart(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z]/g, '');
}

function computeDashboardWarnings(formData) {
  const warnings = [];
  if (!formData) {
    return warnings;
  }

  const dniName = formData?.dni?.front?.extraction?.extractedData?.fullName ?? null;
  const ebPages = getElectricityPages(formData);
  const ebTitular = ebPages[0]?.extraction?.extractedData?.titular ?? null;

  if (dniName && ebTitular) {
    const dniWords = dniName
      .split(/\s+/)
      .filter((word) => word.length > 2)
      .map(normalizeNamePart);
    const ebWords = ebTitular
      .split(/\s+/)
      .filter((word) => word.length > 2)
      .map(normalizeNamePart);
    const hasCommonWord = dniWords.some((word) => ebWords.includes(word));

    if (!hasCommonWord) {
      warnings.push({
        key: 'titular-mismatch',
        message: `El nombre del DNI («${dniName}») no coincide con el titular de la factura de luz («${ebTitular}»). Comprueba que el documento pertenezca al mismo titular.`,
      });
    }
  }

  return warnings;
}

function getAdditionalDocumentLabel(entry) {
  if (
    entry?.type === 'other'
    && typeof entry?.customLabel === 'string'
    && entry.customLabel.trim()
  ) {
    return entry.customLabel.trim();
  }
  return 'Documento adicional';
}

function getDashboardAdditionalDocuments(formData) {
  const documents = Array.isArray(formData?.additionalBankDocuments)
    ? formData.additionalBankDocuments
    : [];

  return documents.flatMap((entry, entryIndex) => {
    const files = Array.isArray(entry?.files) ? entry.files : [];
    const baseLabel = getAdditionalDocumentLabel(entry);
    const needsManualReview = Boolean(
      entry?.issue?.code === 'manual-review'
      || entry?.extraction?.needsManualReview
    );

    return files.map((file, fileIndex) => ({
      key: file?.assetKey || file?.id || `${entry?.id || `additional-${entryIndex}`}-${fileIndex}`,
      label: files.length > 1 ? `${baseLabel} ${fileIndex + 1}` : baseLabel,
      dataUrl: '',
      mimeType: typeof file?.mimeType === 'string' ? file.mimeType : null,
      filename:
        typeof file?.filename === 'string' && file.filename.trim()
          ? file.filename.trim()
          : null,
      needsManualReview,
    }));
  });
}

function isEcDataComplete(ec) {
  if (!ec) return false;

  const housing = ec.housing || {};
  const thermal = ec.thermal || {};
  const additional = ec.additional || {};
  const area =
    housing.habitableAreaM2 !== null && housing.habitableAreaM2 !== undefined
      ? String(housing.habitableAreaM2).trim()
      : '';
  const floors =
    housing.floorCount !== null && housing.floorCount !== undefined
      ? String(housing.floorCount).trim()
      : '';
  const bedrooms =
    housing.bedroomCount !== null && housing.bedroomCount !== undefined
      ? String(housing.bedroomCount).trim()
      : '';

  if (!area || !floors || !bedrooms || !housing.averageFloorHeight) {
    return false;
  }

  const directions = ['north', 'east', 'south', 'west'];
  const doors = housing.doorsByOrientation || {};
  const windows = housing.windowsByOrientation || {};
  const missingDoors = directions.some((direction) => String(doors[direction] ?? '').trim() === '');
  const missingWindows = directions.some((direction) => String(windows[direction] ?? '').trim() === '');

  if (missingDoors || missingWindows) {
    return false;
  }

  if (!housing.windowFrameMaterial || !String(housing.doorMaterial ?? '').trim()) {
    return false;
  }
  if (!housing.windowGlassType) {
    return false;
  }
  if (housing.hasShutters === null || housing.hasShutters === undefined) {
    return false;
  }
  if (housing.hasShutters === true && !String(housing.shutterWindowCount ?? '').trim()) {
    return false;
  }

  if (!thermal.thermalInstallationType || !thermal.boilerFuelType) {
    return false;
  }
  if (!String(thermal.equipmentDetails ?? '').trim()) {
    return false;
  }
  if (thermal.hasAirConditioning === null || thermal.hasAirConditioning === undefined) {
    return false;
  }
  if (thermal.hasAirConditioning === true && !thermal.airConditioningType) {
    return false;
  }
  if (
    thermal.hasAirConditioning === true
    && !String(thermal.airConditioningDetails ?? '').trim()
  ) {
    return false;
  }
  if (
    (thermal.heatingEmitterType === 'radiadores-agua'
      || thermal.heatingEmitterType === 'radiadores-electricos')
    && !thermal.radiatorMaterial
  ) {
    return false;
  }
  if (!thermal.tipoFase || thermal.tipoFaseConfirmed === false) {
    return false;
  }

  if (!additional.soldProduct) {
    return false;
  }
  if (additional.isExistingCustomer === null || additional.isExistingCustomer === undefined) {
    return false;
  }
  if (additional.hasSolarPanels === null || additional.hasSolarPanels === undefined) {
    return false;
  }
  if (
    additional.hasSolarPanels === true
    && !String(additional.solarPanelDetails ?? '').trim()
  ) {
    return false;
  }

  return true;
}

function buildDashboardSummary(project) {
  const formData = project?.formData || null;
  const snapshot = getProjectSnapshot(formData);
  const assetFiles = project?.assetFiles || {};
  const location = snapshot.location;
  const locality = [snapshot.postalCode, snapshot.municipality].filter(Boolean).join(' ');
  const displayAddress = [
    snapshot.address || null,
    locality || null,
    snapshot.province || null,
  ].filter(Boolean).join(', ') || null;

  const electricityPages = getElectricityPages(formData);
  const electricityAssetKeys = Object.keys(assetFiles)
    .filter((key) => key.startsWith('electricity_'))
    .sort();
  const electricityDocs =
    electricityPages.length > 0
      ? electricityPages.map((page, index) => ({
          key: `electricity_${index}`,
          label: `Factura luz — pág. ${index + 1}`,
          shortLabel: `Luz ${index + 1}`,
          present: Boolean(page?.photo || page?.extraction || assetFiles[`electricity_${index}`]),
          dataUrl: null,
          mimeType: null,
          needsManualReview: !!page?.extraction?.needsManualReview,
          extractedData: null,
        }))
      : electricityAssetKeys.length > 0
        ? electricityAssetKeys.map((key, index) => ({
            key,
            label: `Factura luz — pág. ${index + 1}`,
            shortLabel: `Luz ${index + 1}`,
            present: true,
            dataUrl: null,
            mimeType: null,
            needsManualReview: false,
            extractedData: null,
          }))
        : [{
            key: 'electricity_0',
            label: 'Factura de luz',
            shortLabel: 'Luz',
            present: false,
            dataUrl: null,
            mimeType: null,
            needsManualReview: false,
            extractedData: null,
          }];

  const ibiAssetKeys = Object.keys(assetFiles)
    .filter((key) => key.startsWith('ibi_'))
    .sort();

  const documents = [
    {
      key: 'dniFront',
      label: 'DNI frontal',
      shortLabel: 'DNI frontal',
      present: Boolean(
        hasPhotoLikeValue(formData?.dni?.front?.photo)
        || formData?.dni?.front?.extraction
        || assetFiles.dniFront
      ),
      dataUrl: null,
      mimeType: null,
      needsManualReview: !!formData?.dni?.front?.extraction?.needsManualReview,
      extractedData: null,
    },
    {
      key: 'dniBack',
      label: 'DNI trasera',
      shortLabel: 'DNI trasera',
      present: Boolean(
        hasPhotoLikeValue(formData?.dni?.back?.photo)
        || formData?.dni?.back?.extraction
        || assetFiles.dniBack
      ),
      dataUrl: null,
      mimeType: null,
      needsManualReview: !!formData?.dni?.back?.extraction?.needsManualReview,
      extractedData: null,
    },
    {
      key: 'ibi',
      label: 'IBI / Escritura',
      shortLabel: 'IBI',
      present: getIbiPages(formData).length > 0 || ibiAssetKeys.length > 0,
      dataUrl: null,
      mimeType: null,
      needsManualReview: !!formData?.ibi?.extraction?.needsManualReview,
      extractedData: null,
    },
  ];

  const signedDocuments = [];
  const representation = formData?.representation || {};
  const energyCertificate = formData?.energyCertificate || null;
  const additionalDocuments = getDashboardAdditionalDocuments(formData);
  const rawEcStatus =
    energyCertificate?.status
    || (energyCertificate?.skippedAt ? 'skipped' : 'not-started');
  const energyCertificateStatus =
    rawEcStatus === 'completed' && !isEcDataComplete(energyCertificate)
      ? 'pending'
      : rawEcStatus === 'completed'
        ? 'completed'
        : rawEcStatus === 'skipped'
          ? 'skipped'
          : 'pending';
  const signatureDeferred = Boolean(representation.signatureDeferred);
  const signedDocStatus = (present) => (
    present ? 'complete' : signatureDeferred ? 'deferred' : 'pending'
  );

  if (location === 'cataluna') {
    const ivaPresent = Boolean(
      representation.ivaCertificateSignature || hasRenderedDocumentAsset(representation, 'catalunaIva')
    );
    const genPresent = Boolean(
      representation.generalitatSignature || hasRenderedDocumentAsset(representation, 'catalunaGeneralitat')
    );
    const repPresent = Boolean(
      representation.representacioSignature || hasRenderedDocumentAsset(representation, 'catalunaRepresentacio')
    );
    signedDocuments.push(
      {
        key: 'cataluna-iva',
        label: 'IVA 10% Cataluña',
        filename: 'iva_10_cataluna_firmado.pdf',
        present: ivaPresent,
        status: signedDocStatus(ivaPresent),
      },
      {
        key: 'cataluna-generalitat',
        label: 'Declaració Generalitat',
        filename: 'declaracio_generalitat_firmada.pdf',
        present: genPresent,
        status: signedDocStatus(genPresent),
      },
      {
        key: 'cataluna-representacio',
        label: 'Autorització de representació',
        filename: 'autoritzacio_representacio_firmada.pdf',
        present: repPresent,
        status: signedDocStatus(repPresent),
      }
    );
  } else if (location === 'madrid' || location === 'valencia') {
    const ivaEsPresent = Boolean(
      representation.ivaCertificateEsSignature || hasRenderedDocumentAsset(representation, 'spainIva')
    );
    const poderPresent = Boolean(
      representation.poderRepresentacioSignature || hasRenderedDocumentAsset(representation, 'spainPoder')
    );
    signedDocuments.push(
      {
        key: 'spain-iva',
        label: 'IVA 10% España',
        filename: 'iva_10_espana_firmado.pdf',
        present: ivaEsPresent,
        status: signedDocStatus(ivaEsPresent),
      },
      {
        key: 'spain-poder',
        label: 'Poder de representación',
        filename: 'poder_representacion_firmado.pdf',
        present: poderPresent,
        status: signedDocStatus(poderPresent),
      }
    );
  }

  const allDocuments = [...documents, ...electricityDocs];
  const warnings = computeDashboardWarnings(formData);
  const energyCertificatePresent = energyCertificateStatus === 'completed';

  return {
    lastUpdated:
      project?.lastActivity
      || (project?.submissions?.length
        ? project.submissions[project.submissions.length - 1].timestamp
        : null)
      || project?.createdAt
      || null,
    location,
    address: displayAddress,
    displayAddress,
    customerDisplayName: snapshot.fullName || project?.customerName || '—',
    firstName: snapshot.firstName || null,
    lastName: snapshot.lastName || null,
    customerLanguage: project?.customerLanguage || project?.formData?.browserLanguage || null,
    postalCode: snapshot.postalCode || null,
    municipality: snapshot.municipality || null,
    province: snapshot.province || null,
    isCompany: Boolean(representation.isCompany),
    companyName: representation.companyName || null,
    companyNIF: representation.companyNIF || null,
    companyAddress: representation.companyAddress || null,
    companyMunicipality: representation.companyMunicipality || null,
    companyPostalCode: representation.companyPostalCode || null,
    documents,
    electricityPages: electricityDocs,
    signedDocuments,
    energyCertificate: {
      status: energyCertificateStatus,
      present: energyCertificatePresent,
      completedAt: energyCertificate?.completedAt || null,
      skippedAt: energyCertificate?.skippedAt || null,
    },
    additionalDocuments,
    finalSignatures: [],
    photoGroups: [],
    downloadGroups: [],
    warnings,
    counts: {
      documentsPresent: allDocuments.filter((doc) => doc.present).length,
      documentsTotal: allDocuments.length,
      manualReview: allDocuments.filter((doc) => doc.needsManualReview).length,
      signedFormsPresent: signedDocuments.filter((doc) => doc.present).length,
      signedFormsTotal: signedDocuments.length,
      pdfsAvailable: signedDocuments.filter((doc) => doc.present).length,
      pdfsTotal: signedDocuments.length,
      energyCertificatePresent,
      energyCertificateTotal: 1,
      finalSignaturesPresent: 0,
      finalSignaturesTotal: 0,
      documentsRemaining: allDocuments.filter((doc) => !doc.present).length,
    },
  };
}

module.exports = {
  buildDashboardSummary,
  getElectricityPages,
  getIbiPages,
  getProjectSnapshot,
};
