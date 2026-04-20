function extractCompletedDocKeys(formData, assetFiles, existingFormData = null) {
  const keys = [];
  const af = assetFiles || {};

  const hasDniFront =
    formData?.dni?.front?.photo
    || Boolean(af.dniFront)
    || Boolean(formData?.dni?.front?.extraction)
    || existingFormData?.dni?.front?.photo;
  const hasDniBack =
    formData?.dni?.back?.photo
    || Boolean(af.dniBack)
    || Boolean(formData?.dni?.back?.extraction)
    || existingFormData?.dni?.back?.photo;

  if (hasDniFront) keys.push('dni_front');
  if (hasDniBack) keys.push('dni_back');

  const hasIbi =
    formData?.ibi?.photo
    || (Array.isArray(formData?.ibi?.pages) && formData.ibi.pages.length > 0)
    || Object.keys(af).some((key) => key.startsWith('ibi_'));
  if (hasIbi) {
    keys.push('ibi');
  }

  const hasElectricity =
    (Array.isArray(formData?.electricityBill?.pages) && formData.electricityBill.pages.length > 0)
    || Object.keys(af).some((key) => key.startsWith('electricity_'));
  if (hasElectricity) {
    keys.push('electricity_bill');
  }

  if (formData?.energyCertificate?.status === 'completed') {
    keys.push('energy_certificate');
  }

  const location = formData?.representation?.location ?? formData?.location;
  if (location === 'cataluna') {
    if (formData?.representation?.renderedDocuments?.catalunaIva) keys.push('cataluna_iva');
    if (formData?.representation?.renderedDocuments?.catalunaGeneralitat) keys.push('cataluna_generalitat');
    if (formData?.representation?.renderedDocuments?.catalunaRepresentacio) keys.push('cataluna_representacio');
  } else if (location) {
    if (formData?.representation?.renderedDocuments?.spainIva) keys.push('spain_iva');
    if (formData?.representation?.renderedDocuments?.spainPoder) keys.push('spain_poder');
  }

  return keys;
}

module.exports = {
  extractCompletedDocKeys,
};
