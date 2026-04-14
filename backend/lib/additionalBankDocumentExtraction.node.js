const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getAdditionalBankDocumentPrompt,
  getAdditionalBankDocumentWrongDocumentMessage,
  isAdditionalBankDocumentType,
  normalizeAdditionalBankDocumentExtraction,
} = require('./additionalBankDocumentExtraction');

test('recognizes supported additional bank document types', () => {
  assert.equal(isAdditionalBankDocumentType('payroll'), true);
  assert.equal(isAdditionalBankDocumentType('tax-return'), true);
  assert.equal(isAdditionalBankDocumentType('electricity'), false);
});

test('returns prompt and localized wrong-document message', () => {
  const prompt = getAdditionalBankDocumentPrompt('bank-statements');
  assert.match(prompt, /bank statement/i);
  assert.match(getAdditionalBankDocumentWrongDocumentMessage('bank-statements'), /extractos bancarios/i);
});

test('normalizes extracted identifiers for additional bank documents', () => {
  const result = normalizeAdditionalBankDocumentExtraction('bank-ownership-certificate', {
    isCorrectDocument: true,
    extractedData: {
      holderName: ' Ana Pérez ',
      referenceOrIban: 'es12 3456 7890 1234 5678 9012',
      documentNumber: ' 1234 a ',
    },
  });

  assert.equal(result.wrongDocumentMessage, null);
  assert.equal(result.extraction.extractedData.holderName, 'Ana Pérez');
  assert.equal(result.extraction.extractedData.referenceOrIban, 'ES1234567890123456789012');
  assert.equal(result.extraction.extractedData.documentNumber, '1234A');
});

test('forces wrong-document when AI returns no usable core data', () => {
  const result = normalizeAdditionalBankDocumentExtraction('payroll', {
    isCorrectDocument: true,
    extractedData: {
      holderName: '   ',
      issuerName: null,
      referenceOrIban: null,
      period: null,
      amount: null,
      summary: null,
    },
  });

  assert.match(result.wrongDocumentMessage, /nómina/i);
});
