const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  deleteAssetFiles,
  isManagedAssetKey,
  normalizeActiveAssetKeys,
  pruneManagedAssetFiles,
} = require('./assetFiles');

test('normalizeActiveAssetKeys returns null when the client did not send a manifest', () => {
  assert.equal(normalizeActiveAssetKeys(undefined), null);
});

test('normalizeActiveAssetKeys keeps only managed keys and deduplicates them', () => {
  const result = normalizeActiveAssetKeys(JSON.stringify(['dniFront', 'ibi_0', 'dniFront', 'not-real']));
  assert.deepEqual(result, ['dniFront', 'ibi_0']);
});

test('isManagedAssetKey recognizes exact and prefixed asset keys', () => {
  assert.equal(isManagedAssetKey('dniFront'), true);
  assert.equal(isManagedAssetKey('electricity_3'), true);
  assert.equal(isManagedAssetKey('randomField'), false);
});

test('pruneManagedAssetFiles removes stale managed keys but keeps unrelated keys', () => {
  const result = pruneManagedAssetFiles(
    {
      dniFront: '/uploads/assets/ELT001/dniFront.jpg',
      ibi_0: '/uploads/assets/ELT001/ibi_0.jpg',
      legacyAttachment: '/uploads/assets/ELT001/legacy.bin',
    },
    ['dniFront']
  );

  assert.deepEqual(result.assetFiles, {
    dniFront: '/uploads/assets/ELT001/dniFront.jpg',
    legacyAttachment: '/uploads/assets/ELT001/legacy.bin',
  });
  assert.deepEqual(result.removedKeys, ['ibi_0']);
  assert.deepEqual(result.removedPaths, ['/uploads/assets/ELT001/ibi_0.jpg']);
});

test('deleteAssetFiles removes files under the data directory', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asset-files-'));
  const uploadDir = path.join(tempDir, 'uploads', 'assets', 'ELT001');
  fs.mkdirSync(uploadDir, { recursive: true });

  const filePath = path.join(uploadDir, 'dniFront.jpg');
  fs.writeFileSync(filePath, 'test');
  assert.equal(fs.existsSync(filePath), true);

  deleteAssetFiles(tempDir, ['/uploads/assets/ELT001/dniFront.jpg']);

  assert.equal(fs.existsSync(filePath), false);
  fs.rmSync(tempDir, { recursive: true, force: true });
});
