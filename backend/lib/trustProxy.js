function parseTrustProxyValue(value) {
  if (value === undefined || value === null) {
    return undefined;
  }

  const normalized = String(value).trim();
  if (normalized === '') {
    return undefined;
  }

  if (normalized === 'true') {
    return true;
  }

  if (normalized === 'false') {
    return false;
  }

  if (/^\d+$/.test(normalized)) {
    return Number(normalized);
  }

  return normalized;
}

function resolveTrustProxySetting({ railwayEnvironment, trustProxyEnv } = {}) {
  const explicitTrustProxy = parseTrustProxyValue(trustProxyEnv);
  if (explicitTrustProxy !== undefined) {
    return explicitTrustProxy;
  }

  if (railwayEnvironment) {
    return 1;
  }

  return false;
}

function configureTrustProxy(app, options) {
  const trustProxy = resolveTrustProxySetting(options);
  app.set('trust proxy', trustProxy);
  return trustProxy;
}

module.exports = {
  configureTrustProxy,
  parseTrustProxyValue,
  resolveTrustProxySetting,
};
