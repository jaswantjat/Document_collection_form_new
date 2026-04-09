const ATTEMPT_KEY_PREFIX = 'eltex_submit_attempt_';

function storageKey(projectCode: string): string {
  return `${ATTEMPT_KEY_PREFIX}${projectCode}`;
}

function createAttemptId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `attempt-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getOrCreateSubmissionAttempt(projectCode: string): string {
  try {
    const existing = localStorage.getItem(storageKey(projectCode));
    if (existing) return existing;
  } catch {
    return createAttemptId();
  }

  const attemptId = createAttemptId();
  try {
    localStorage.setItem(storageKey(projectCode), attemptId);
  } catch {
    return attemptId;
  }

  return attemptId;
}

export function clearSubmissionAttempt(projectCode: string): void {
  try {
    localStorage.removeItem(storageKey(projectCode));
  } catch {
    // Ignore storage failures; submit idempotency still works for the current request.
  }
}
