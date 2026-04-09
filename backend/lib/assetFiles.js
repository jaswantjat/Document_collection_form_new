const fs = require('fs');
const path = require('path');

const MANAGED_ASSET_PREFIXES = [
  'ibi_',
  'electricity_',
  'dniOriginal_',
  'ibiOriginal_',
  'electricityOriginal_',
  'electricalPanel_',
  'roof_',
  'installationSpace_',
  'radiators_',
];
const MANAGED_ASSET_KEYS = new Set(['dniFront', 'dniBack', 'energyCert']);

function isManagedAssetKey(key) {
  return MANAGED_ASSET_KEYS.has(key) || MANAGED_ASSET_PREFIXES.some((prefix) => key.startsWith(prefix));
}

function normalizeActiveAssetKeys(rawActiveKeys) {
  if (rawActiveKeys === undefined) return null;

  const values = Array.isArray(rawActiveKeys)
    ? rawActiveKeys
    : typeof rawActiveKeys === 'string'
      ? JSON.parse(rawActiveKeys || '[]')
      : [];

  if (!Array.isArray(values)) return [];

  return [...new Set(values.filter((value) => typeof value === 'string' && isManagedAssetKey(value)))];
}

function pruneManagedAssetFiles(currentAssetFiles, activeAssetKeys) {
  const current = currentAssetFiles || {};
  if (!Array.isArray(activeAssetKeys)) {
    return { assetFiles: { ...current }, removedKeys: [], removedPaths: [] };
  }

  const activeKeys = new Set(activeAssetKeys);
  const nextAssetFiles = {};
  const removedKeys = [];
  const removedPaths = [];

  for (const [key, value] of Object.entries(current)) {
    if (!isManagedAssetKey(key) || activeKeys.has(key)) {
      nextAssetFiles[key] = value;
      continue;
    }

    removedKeys.push(key);
    if (typeof value === 'string' && value) removedPaths.push(value);
  }

  return { assetFiles: nextAssetFiles, removedKeys, removedPaths };
}

function deleteAssetFiles(dataDir, assetPaths) {
  const uniquePaths = [...new Set((assetPaths || []).filter((value) => typeof value === 'string' && value))];

  for (const assetPath of uniquePaths) {
    const relativePath = assetPath.replace(/^\/+/, '');
    const absolutePath = path.join(dataDir, relativePath);

    try {
      if (fs.existsSync(absolutePath)) fs.unlinkSync(absolutePath);
    } catch (error) {
      console.warn(`[upload-assets] Failed to delete stale asset ${absolutePath}: ${error.message}`);
    }
  }
}

module.exports = {
  deleteAssetFiles,
  isManagedAssetKey,
  normalizeActiveAssetKeys,
  pruneManagedAssetFiles,
};
