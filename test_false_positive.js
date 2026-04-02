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
    name: 'False Positive Check (bundle)',
    input: { documentTypeDetected: 'DNI', notes: 'this is a bundle of documents' },
    expected: false
  },
  {
    name: 'False Positive Check (dle)',
    input: { documentTypeDetected: 'DNI', notes: 'dle is not dl' },
    expected: false
  },
  {
    name: 'False Positive Check (middle word)',
    input: { documentTypeDetected: 'DNI', notes: 'this is model number 1' },
    expected: false
  },
  {
    name: 'False Positive Check (address with dl)',
    input: { documentTypeDetected: 'DNI', notes: 'address: Calle del Sol 12' },
    expected: false
  },
  {
    name: 'False Positive Check (dl at end)',
    input: { documentTypeDetected: 'DNI', notes: 'document dl' },
    expected: true // because ' dl' matches
  }
];

tests.forEach(t => {
  const result = isDrivingLicenseDetected(t.input);
  console.log(`${t.name}: ${result === t.expected ? 'PASS' : 'FAIL'} (Got ${result})`);
});

