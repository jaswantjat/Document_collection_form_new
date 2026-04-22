function buildRuntimeHealth({
  service,
  environment,
  checks,
  persistence,
}) {
  const requiredChecks = Object.values(checks).filter((check) => check.required);
  const blockingFailure = requiredChecks.some((check) => check.ok !== true);
  const degraded =
    persistence.lastLoadSource !== 'primary'
    || Boolean(persistence.lastLoadError)
    || Boolean(persistence.lastSaveError);

  const ready = persistence.ready && !blockingFailure;
  const status = ready ? (degraded ? 'degraded' : 'ok') : 'error';

  return {
    status,
    ready,
    service,
    environment,
    timestamp: new Date().toISOString(),
    checks,
    persistence,
  };
}

module.exports = {
  buildRuntimeHealth,
};
