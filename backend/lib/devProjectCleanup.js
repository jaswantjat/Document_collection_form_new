const DEFAULT_MAX_PROJECT_BYTES = 1024 * 1024;
const DEFAULT_STALE_MS = 15 * 60 * 1000;
const TRANSIENT_NAME_PATTERNS = [
  /^Admin Upload Test$/i,
  /^Refresh Sort \d+$/i,
  /^Stress \d+$/i,
  /^QA Recovery$/i,
];

function isQaBotProject(project) {
  return project?.assessor === 'QA Bot' || project?.assessorId === 'QA-BOT';
}

function hasTransientMarker(project) {
  const email = typeof project?.email === 'string' ? project.email.trim() : '';
  if (/@example\.com$/i.test(email)) return true;

  const customerName = typeof project?.customerName === 'string'
    ? project.customerName.trim()
    : '';
  return TRANSIENT_NAME_PATTERNS.some((pattern) => pattern.test(customerName));
}

function isProjectOlderThan(project, nowMs, staleMs) {
  const createdAtMs = Date.parse(project?.createdAt || '');
  if (!Number.isFinite(createdAtMs)) return true;
  return nowMs - createdAtMs >= staleMs;
}

function isOversizedProject(project, maxBytes) {
  return Buffer.byteLength(JSON.stringify(project)) >= maxBytes;
}

function pruneTransientQaProjects(
  database,
  {
    nowMs = Date.now(),
    staleMs = DEFAULT_STALE_MS,
    maxBytes = DEFAULT_MAX_PROJECT_BYTES,
    protectedCodes = [],
  } = {}
) {
  const removedCodes = [];

  for (const [code, project] of Object.entries(database?.projects || {})) {
    if (protectedCodes.includes(code)) continue;
    const oversizedProject = isOversizedProject(project, maxBytes);
    if (!isQaBotProject(project) && !hasTransientMarker(project) && !oversizedProject) continue;
    if ((project.submissions?.length ?? 0) > 0) continue;
    if (!isProjectOlderThan(project, nowMs, staleMs)) continue;
    if (!oversizedProject && !hasTransientMarker(project) && !isQaBotProject(project)) continue;

    delete database.projects[code];
    removedCodes.push(code);
  }

  return removedCodes;
}

module.exports = {
  pruneTransientQaProjects,
};
