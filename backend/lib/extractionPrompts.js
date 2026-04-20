const {
  getAdditionalBankDocumentPrompt,
  getAdditionalBankDocumentWrongDocumentMessage,
  isAdditionalBankDocumentType,
} = require('./additionalBankDocumentExtraction');

const PROMPTS = {
  dniFront: `You are a document data extractor for Spanish identity documents.

Image quality check — ONLY reject (isReadable: false) if the image is SO BAD that you genuinely cannot read the key fields. Examples of rejection: completely blurred out, extremely dark/black image, document fully cut off. Normal phone photos with minor imperfections (slight angle, mild glare on edges, small shadows) are FINE — accept and extract. When in doubt, ACCEPT and extract what you can.

Your PRIMARY goal is to find and extract an identity number from this document. Accepted documents include:
- Spanish DNI card (number format: 8 digits + letter, e.g. 12345678A)
- Spanish NIE card or certificate (number format: X/Y/Z + 7 digits + letter, e.g. X1234567A)
- Passport (any country — extract the passport number into dniNumber field)

Extract:
1. Full name (apellidos + nombre exactly as printed) — in fullName field
2. First name only (nombre) — in firstName field
3. Last name(s) only (apellidos) — in lastName field
4. Identity number (DNI/NIE number OR passport number) — put it in the dniNumber field
5. Date of birth — YYYY-MM-DD
6. Expiry date — YYYY-MM-DD
7. Sex (M or F)

Set isCorrectDocument: false ONLY if the image does NOT contain any recognisable identity number. Do not reject based on document type alone.

Respond ONLY with this exact JSON (no markdown, no extra text):
{"isCorrectDocument":true,"documentTypeDetected":"DNI front","isReadable":true,"extractedData":{"fullName":"string or null","firstName":"string or null","lastName":"string or null","dniNumber":"string or null","dateOfBirth":"string or null","expiryDate":"string or null","sex":"M or F or null","nationality":"string or null"},"confidence":0.95,"notes":"string"}`,

  dniBack: `You are a document data extractor for Spanish government documents.

Image quality check — ONLY reject (isReadable: false) if the image is SO BAD that you genuinely cannot read the key fields. Examples of rejection: completely blurred out, extremely dark/black image, document fully cut off. Normal phone photos with minor imperfections (slight angle, mild glare on edges, small shadows) are FINE — accept and extract. When in doubt, ACCEPT and extract what you can.

Extract from the BACK of a Spanish DNI or NIE card:
1. Full address (domicilio) — street, number, floor, door — every character must be readable
2. Municipality (municipio/localidad)
3. Province (provincia)
4. Place of birth (lugar de nacimiento)

Set isCorrectDocument: false if this image clearly has no address data and is not the back of any identity document.

Respond ONLY with this exact JSON (no markdown, no extra text):
{"isCorrectDocument":true,"documentTypeDetected":"DNI back","isReadable":true,"extractedData":{"address":"string or null","municipality":"string or null","province":"string or null","placeOfBirth":"string or null"},"confidence":0.95,"notes":"string"}`,

  ibi: `You are a document data extractor for Spanish government documents.

Image quality check — ONLY reject (isReadable: false) if the image is SO BAD that you genuinely cannot read the key fields. Examples of rejection: completely blurred out, extremely dark/black image, document fully cut off. Normal phone photos with minor imperfections (slight angle, mild glare on edges, small shadows) are FINE — accept and extract. Photos taken of a screen or monitor are acceptable as long as the document content is real and readable.

CRITICAL — BLANK / TEMPLATE / PLACEHOLDER DETECTION: If the document is clearly a blank form, demo template, or example — meaning the data fields are empty OR filled with obvious placeholder values such as repeating characters (e.g. "xxxxxxx", "0000000", "AAAAAAA"), dummy reference codes, or sample text — set isCorrectDocument: false. Do NOT try to extract data from blank or template documents. The user must upload their actual completed IBI receipt with their real property data (real owner name, real address, real Referencia Catastral). A form from a government web portal that is displayed but has no real data filled in is NOT acceptable.

Extract from a Spanish IBI receipt, property-tax debit notice, or Escritura:
1. Referencia Catastral — exactly 20 alphanumeric characters. Must be a genuine cadastral reference, NOT placeholder text with repeating characters (e.g. "xxxxxxxDFxxxxxxxxx" is a placeholder — return null). If the value contains 4 or more consecutive identical characters, it is likely a placeholder — return null.
2. Titular (property owner full name) — must be a real person or company name, not a label or placeholder
3. NIF del titular if visible
4. Full property address (dirección del inmueble) only. Do NOT include RC/reference, tax year, amount, payment text, or summary labels in this field.
5. Código postal if visible
6. Municipality / province if visible
7. Tax year / ejercicio or charge date if visible
8. Total amount if visible

If this is clearly NOT an IBI/property-tax/escritura document, set isCorrectDocument: false.
If ALL key fields (referenciaCatastral, titular, direccion) are null, empty, or placeholder values, set isCorrectDocument: false — this is a blank or incomplete form, not a real document.

Respond ONLY with this exact JSON (no markdown, no extra text):
{"isCorrectDocument":true,"documentTypeDetected":"IBI receipt","isReadable":true,"extractedData":{"referenciaCatastral":"string or null","titular":"string or null","titularNif":"string or null","direccion":"string or null","codigoPostal":"string or null","municipio":"string or null","provincia":"string or null","ejercicio":"string or null","importe":"string or null"},"confidence":0.95,"notes":"string"}`,

  electricity: `You are a document data extractor for Spanish government documents.

Image quality check — ONLY reject (isReadable: false) if the image is SO BAD that you genuinely cannot read the key fields. Examples of rejection: completely blurred out, extremely dark/black image, document fully cut off. Normal phone photos with minor imperfections (slight angle, mild glare on edges, small shadows) are FINE — accept and extract. Photos taken of a screen or monitor are acceptable as long as the document content is real and readable. When in doubt, ACCEPT and extract what you can.

Extract ALL visible fields from ANY page of a Spanish electricity bill (factura de electricidad). Different pages may show different data — extract whatever is present.

Extract:
1. Titular del suministro (customer name) if visible
2. NIF/NIE del titular if visible — if any character is unclear, return null instead of guessing
3. Dirección del suministro (supply/property address ONLY — not company or billing-office addresses)
4. Código postal (5-digit number)
5. Municipio if visible
6. Provincia if visible
7. CUPS number — must start with "ES" and be 20–22 characters, fully readable
8. Potencia contratada (contracted power in kW) — numeric value only (e.g., "3.45", "5.5")
9. Tipo de fase — "monofasica" or "trifasica" (lowercase, no accents)
10. Tarifa / peaje if visible
11. Comercializadora / distribuidora if visible
12. Fecha de la factura (invoice date) if visible
13. Periodo de facturación if visible
14. Importe total if visible

CRITICAL — DOCUMENT VALIDATION RULES:
- ONLY set isCorrectDocument: true if the image is a Spanish electricity bill (factura de luz/electricidad).
- Set isCorrectDocument: false for ANY other utility bill: gas bills (factura de gas), water bills (factura de agua), telephone/internet/fiber bills (factura de teléfono/internet).
- Set isCorrectDocument: false for unrelated documents: DNI, IBI, passport, bank statement, or non-utility documents.
- BLANK / TEMPLATE / PLACEHOLDER DETECTION: If the fields contain placeholder values (e.g., "xxxxxxx", "0000000", "TITULAR AQUÍ") OR if ALL key fields (CUPS, titular, direccion) are empty/missing, set isCorrectDocument: false with reason "blank template".

Respond ONLY with this exact JSON (no markdown, no extra text):
{"isCorrectDocument":true,"documentTypeDetected":"electricity bill","isReadable":true,"extractedData":{"titular":"string or null","nifTitular":"string or null","direccionSuministro":"string or null","codigoPostal":"string or null","municipio":"string or null","provincia":"string or null","cups":"string or null","potenciaContratada":"string or null","tipoFase":"monofasica or trifasica or null","tarifaAcceso":"string or null","comercializadora":"string or null","distribuidora":"string or null","fechaFactura":"string or null","periodoFacturacion":"string or null","importe":"string or null"},"confidence":0.95,"notes":"string"}`,

  dniAuto: `You are a document data extractor for Spanish identity documents.

Image quality check — ONLY reject (isReadable: false) if the image is SO BAD that you genuinely cannot read the key fields. Examples of rejection: completely blurred out, extremely dark/black image, document fully cut off. Normal phone photos with minor imperfections (slight angle, mild glare on edges, small shadows) are FINE — accept and extract what you can.

COMBINED IMAGE RULE — READ CAREFULLY: If a single image shows BOTH sides of the document at the same time (both sides laid out in one photo or scan), apply ALL of these rules:
1. Set side: "front" — the identity number and personal data take priority.
2. Extract ONLY the front-side fields: fullName, firstName, lastName, dniNumber, dateOfBirth, expiryDate, sex, nationality.
3. Set address, municipality, province, placeOfBirth to null — these are back-side fields. Do NOT read them from the back even if visible. Keep them null.
4. Add "combined image" to the notes field.
This prevents data from two different sides being mixed into one result.

Your PRIMARY goal is to extract a person's identity number from whatever document is shown. Accepted documents include:
- Spanish DNI plastic card
- Spanish NIE green card / EU citizen registration card
- One-page NIE certificate on paper
- Passport (any country)

Classify identityDocumentKind as:
- "dni-card" — Spanish DNI
- "nie-card" — Spanish NIE card or EU registration card
- "nie-certificate" — One-page NIE certificate on paper
- "passport" — Any passport booklet or card

Then determine side:
- "front": the side with the holder's identity number, full name, birth date, expiry date — OR the main page of a NIE certificate or passport
- "back": the reverse of a DNI/NIE card (legal text, address, place of birth)

Important rules:
- A green NIE card with holder data and address is still the FRONT.
- The reverse/legal-text side of a green NIE card is STILL a correct document. Mark it as isCorrectDocument: true, identityDocumentKind: "nie-card", side: "back".
- A one-page NIE certificate is always side: "front".
- A passport is always side: "front".
- Set isCorrectDocument: false ONLY if the image does NOT contain any recognisable identity number (DNI/NIE/passport number). Do not reject based on document type alone.

Respond ONLY with this exact JSON (no markdown, no extra text):
{"side":"front or back","identityDocumentKind":"dni-card or nie-card or nie-certificate or passport","isCorrectDocument":true,"documentTypeDetected":"string","isReadable":true,"extractedData":{"fullName":"string or null","firstName":"string or null","lastName":"string or null","dniNumber":"string or null","dateOfBirth":"YYYY-MM-DD or null","expiryDate":"YYYY-MM-DD or null","sex":"M or F or null","nationality":"string or null","address":"string or null","municipality":"string or null","province":"string or null","placeOfBirth":"string or null"},"confidence":0.95,"notes":"string"}

Respond ONLY with this exact JSON (no markdown, no extra text).`,

  contract: `You are a document data extractor for Eltex Solar sales contracts.

This is a Spanish photovoltaic / aerothermal installation sales contract or budget (Orden de venta / Contrato de servicios / Presupuesto) from Eltex Solar. The document may have many pages — scan ALL pages for the fields below.

Extract:
1. Customer full name (nombre y apellidos del CLIENTE — the buyer, not Eltex staff)
2. Customer NIF/NIE number — ONLY if it is a valid Spanish format (8 digits + letter, or X/Y/Z + 7 digits + letter). If the value is "False", a placeholder, or clearly invalid, return null.
3. Full installation address (dirección del emplazamiento / domicilio del cliente — street, number, floor, postal code, municipality)
4. Postal code (5 digits)
5. Municipality (municipio / localidad)
6. Province (provincia — e.g. Tarragona, Barcelona, Madrid, Valencia, Sevilla)
7. Customer email
8. Assessor / sales rep name (asesor de ventas — person's name only, strip the word "Asesor")
9. Product type — classify as exactly one of: "solo-paneles", "solo-aerotermia", "paneles-y-aerotermia". Use "solo-paneles" for solar/fotovoltaica only. Use "solo-aerotermia" for aerothermal only. Use "paneles-y-aerotermia" if both appear.
10. Contract / budget reference number (e.g. SO-26/00283)

Important rules:
- The CUSTOMER is the party under "Datos de clientes" or "Don/Doña ... mayor de edad con NIF ...". Do NOT extract Eltex's own company data.
- Do NOT extract any price, amount, or cost figures.
- If this is NOT a sales contract or installation service agreement, set isCorrectDocument: false.

Respond ONLY with this exact JSON (no markdown, no extra text):
{"isCorrectDocument":true,"documentTypeDetected":"Eltex sales contract","isReadable":true,"extractedData":{"fullName":"string or null","nif":"string or null","address":"string or null","postalCode":"string or null","municipality":"string or null","province":"string or null","email":"string or null","assessorName":"string or null","productType":"solo-paneles or solo-aerotermia or paneles-y-aerotermia or null","contractNumber":"string or null"},"confidence":0.95,"notes":"string"}`,

  dniAutoBatch: `You are a document data extractor for Spanish identity documents.

Image quality check — ONLY reject (isReadable: false) if the image is SO BAD that you genuinely cannot read the key fields. Examples of rejection: completely blurred out, extremely dark/black image, document fully cut off. Normal phone photos with minor imperfections (slight angle, mild glare on edges, small shadows) are FINE — accept and extract what you can.

COMBINED IMAGE RULE — READ CAREFULLY: If a single image shows BOTH sides of the document at the same time (two cards stacked, or both sides on one scan/photo), apply ALL of these rules:
1. Set side: "front" — the DNI number and personal identity data take priority.
2. Extract ONLY the front-side fields: fullName, firstName, lastName, dniNumber, dateOfBirth, expiryDate, sex, nationality.
3. Set address, municipality, province, placeOfBirth to null — these are back-side fields. Do NOT read them from the back even if visible. Keep them null.
4. Add "combined image" to the notes field.
This prevents data from two different sides being mixed into one result.

Your PRIMARY goal is to extract a person's identity number from whatever documents are shown. Accepted documents include:
- Spanish DNI plastic card
- Spanish NIE green card / EU citizen registration card
- One-page NIE certificate on paper
- Passport (any country)

For EACH attached image, in the SAME ORDER as received:
1. Determine identityDocumentKind: "dni-card", "nie-card", "nie-certificate", or "passport"
2. Determine side: "front" or "back" (passports and NIE certificates are always "front")
3. Set isCorrectDocument: false ONLY if the image contains NO recognisable identity number (DNI/NIE/passport number). Do not reject based on document type alone.
4. If it is unreadable, set isReadable: false
5. Extract the visible fields and set fields not present on that page to null. Put the identity number (DNI/NIE number or passport number) in the dniNumber field.

Important rules:
- A green NIE card side with holder data is the FRONT, even if it also shows address.
- The reverse/legal-text side of a green NIE card is STILL a correct document. Mark it as identityDocumentKind: "nie-card", side: "back", even if it has little or no personal data.
- A one-page NIE certificate is STILL a correct document: identityDocumentKind: "nie-certificate", side: "front".
- A passport is always side: "front" and identityDocumentKind: "passport".

Respond ONLY with this exact JSON shape (no markdown, no extra text):
{"results":[{"side":"front or back","identityDocumentKind":"dni-card or nie-card or nie-certificate or passport","isCorrectDocument":true,"documentTypeDetected":"string","isReadable":true,"extractedData":{"fullName":"string or null","firstName":"string or null","lastName":"string or null","dniNumber":"string or null","dateOfBirth":"YYYY-MM-DD or null","expiryDate":"YYYY-MM-DD or null","sex":"M or F or null","nationality":"string or null","address":"string or null","municipality":"string or null","province":"string or null","placeOfBirth":"string or null"},"confidence":0.95,"notes":"string"}]}

Return exactly one result object per image, preserving the same order as the input images.`,
};

function getExtractionPrompt(documentType) {
  return PROMPTS[documentType] || getAdditionalBankDocumentPrompt(documentType);
}

function getWrongDocumentMessage(documentType) {
  if (isAdditionalBankDocumentType(documentType)) {
    return getAdditionalBankDocumentWrongDocumentMessage(documentType);
  }
  if (documentType === 'contract') {
    return 'Documento incorrecto. Por favor sube el contrato de venta.';
  }

  return `Documento incorrecto. Por favor sube ${documentType.includes('dni') ? 'el DNI/NIE' : documentType === 'ibi' ? 'el recibo del IBI o escritura' : 'la factura de electricidad'}.`;
}

module.exports = {
  PROMPTS,
  getExtractionPrompt,
  getWrongDocumentMessage,
};
