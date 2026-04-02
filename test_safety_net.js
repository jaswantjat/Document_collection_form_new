const DRIVING_LICENSE_KEYWORDS = [
  'driving', 'driver', 'license', 'licence',
  'carnet de conducir', 'permiso de conducir', 'permiso de conducción',
  'conducir', 'conducción', 'dl ', ' dl', 'driving license', 'driving licence',
];

function isDrivingLicenseDetected(extraction) {
  if (!extraction) return false;
  const haystack = [
    extraction.documentTypeDetected || '',
    extraction.notes || '',
  ].join(' ').toLowerCase();
  return DRIVING_LICENSE_KEYWORDS.some((kw) => haystack.includes(kw));
}

const tests = [
  {
    name: 'Standard Driving License (ES)',
    input: { documentTypeDetected: 'Permiso de conducción', notes: '' },
    expected: true
  },
  {
    name: 'Driving License in notes',
    input: { documentTypeDetected: 'DNI', notes: 'This looks like a driving license' },
    expected: true
  },
  {
    name: 'DNI (Valid)',
    input: { documentTypeDetected: 'DNI front', notes: 'Extracted successfully' },
    expected: false
  },
  {
    name: 'DL Keyword (Space after)',
    input: { documentTypeDetected: 'DNI', notes: 'document type: dl ' },
    expected: true
  },
  {
    name: 'DL Keyword (Space before)',
    input: { documentTypeDetected: 'DNI', notes: 'type: dl' },
    expected: true // because ' dl' matches ' dl'
  },
  {
    name: 'False Positive Check (model)',
    input: { documentTypeDetected: 'DNI', notes: 'model of document' },
    expected: false
  },
  {
    name: 'False Positive Check (cradle)',
    input: { documentTypeDetected: 'DNI', notes: 'handled with care' },
    expected: false
  },
  {
      name: 'Spanish "conducir" in note',
      input: { documentTypeDetected: 'DNI', notes: 'El carnet de conducir no es un DNI' },
      expected: true
  }
];

tests.forEach(t => {
  const result = isDrivingLicenseDetected(t.input);
  console.log(`${t.name}: ${result === t.expected ? 'PASS' : 'FAIL'} (Got ${result})`);
});

