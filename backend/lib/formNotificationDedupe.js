const FORM_NOTIFICATION_DEDUPE_WINDOW_MS = 2 * 60 * 1000;

function buildFormNotificationFingerprint(payload) {
  return JSON.stringify({
    eventType: payload?.event_type || null,
    orderId: payload?.order_id || null,
    source: payload?.source || null,
    assessor: payload?.project?.assessor || null,
    customerName: payload?.customer?.name || null,
    formLink: payload?.links?.form || null,
    pendingLabels: Array.isArray(payload?.documents?.pending_labels)
      ? payload.documents.pending_labels
      : [],
  });
}

function shouldSkipDuplicateFormNotification(
  project,
  payload,
  now = Date.now(),
  windowMs = FORM_NOTIFICATION_DEDUPE_WINDOW_MS
) {
  const state = project?.formNotificationState;
  if (!state || typeof state !== 'object') return false;
  if (typeof state.fingerprint !== 'string' || typeof state.sentAt !== 'string') return false;

  const lastSentAt = Date.parse(state.sentAt);
  if (Number.isNaN(lastSentAt)) return false;

  const sameFingerprint = state.fingerprint === buildFormNotificationFingerprint(payload);
  const withinWindow = now - lastSentAt <= windowMs;
  return sameFingerprint && withinWindow;
}

function recordFormNotification(project, payload, sentAt = new Date().toISOString()) {
  project.formNotificationState = {
    fingerprint: buildFormNotificationFingerprint(payload),
    sentAt,
    eventType: payload?.event_type || null,
  };
}

module.exports = {
  FORM_NOTIFICATION_DEDUPE_WINDOW_MS,
  buildFormNotificationFingerprint,
  shouldSkipDuplicateFormNotification,
  recordFormNotification,
};
