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
    name: 'False Positive "dle" (contained in "idle" or as a word)',
    input: { documentTypeDetected: 'DNI', notes: 'document is idle' },
    expected: false
  },
  {
    name: 'False Positive "dl" in Calle',
    input: { documentTypeDetected: 'DNI', notes: 'Calle de la Luna' },
    expected: false
  },
  {
      name: 'Valid DNI note with "conducir" (unlikely but testable)',
      input: { documentTypeDetected: 'DNI', notes: 'documento de identidad' },
      expected: false
  }
];

tests.forEach(t => {
  const result = isDrivingLicenseDetected(t.input);
  console.log(`${t.name}: ${result === t.expected ? 'PASS' : 'FAIL'} (Got ${result})`);
});

