const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getSpaFallbackResponseKind,
  hasExplicitExtension,
} = require('./spaFallback');

test('hasExplicitExtension detects paths that name a concrete file', () => {
  assert.equal(hasExplicitExtension('/assets/index-abc123.js'), true);
  assert.equal(hasExplicitExtension('/favicon.ico'), true);
  assert.equal(hasExplicitExtension('/dashboard'), false);
});

test('getSpaFallbackResponseKind keeps customer and dashboard routes on the SPA shell', () => {
  assert.equal(getSpaFallbackResponseKind('/'), 'spa');
  assert.equal(getSpaFallbackResponseKind('/dashboard'), 'spa');
  assert.equal(getSpaFallbackResponseKind('/review'), 'spa');
  assert.equal(getSpaFallbackResponseKind('/property-docs'), 'spa');
});

test('getSpaFallbackResponseKind blocks API and asset misses from rewriting to index.html', () => {
  assert.equal(getSpaFallbackResponseKind('/api/unknown'), 'api-404');
  assert.equal(getSpaFallbackResponseKind('/uploads/missing.png'), 'asset-404');
  assert.equal(getSpaFallbackResponseKind('/assets/missing.js'), 'asset-404');
  assert.equal(getSpaFallbackResponseKind('/favicon.ico'), 'asset-404');
});
