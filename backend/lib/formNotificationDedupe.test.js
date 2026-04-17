const test = require('node:test');
const assert = require('node:assert/strict');

const {
  FORM_NOTIFICATION_DEDUPE_WINDOW_MS,
  buildFormNotificationFingerprint,
  shouldSkipDuplicateFormNotification,
  recordFormNotification,
} = require('./formNotificationDedupe');

function makePayload(overrides = {}) {
  return {
    event_type: 'form_updated',
    order_id: 'ELT20260077',
    source: 'customer',
    project: {
      assessor: 'Luciano',
    },
    customer: {
      name: 'Ana Lopez',
    },
    links: {
      form: 'https://documentos.eltex.es/?code=ELT20260077',
    },
    documents: {
      pending_labels: ['Factura de luz', 'Firma final comercial'],
    },
    ...overrides,
  };
}

test('buildFormNotificationFingerprint ignores volatile timestamps and only tracks logical content', () => {
  const first = makePayload({ submitted_at_label: '17/4/26, 12:00', teams_message: 'A' });
  const second = makePayload({ submitted_at_label: '17/4/26, 12:01', teams_message: 'B' });

  assert.equal(
    buildFormNotificationFingerprint(first),
    buildFormNotificationFingerprint(second)
  );
});

test('shouldSkipDuplicateFormNotification suppresses the same notification inside the dedupe window', () => {
  const project = {};
  const payload = makePayload();
  const sentAt = '2026-04-17T10:00:00.000Z';

  recordFormNotification(project, payload, sentAt);

  assert.equal(
    shouldSkipDuplicateFormNotification(
      project,
      payload,
      Date.parse(sentAt) + FORM_NOTIFICATION_DEDUPE_WINDOW_MS - 1
    ),
    true
  );
});

test('shouldSkipDuplicateFormNotification allows the same notification again after the dedupe window', () => {
  const project = {};
  const payload = makePayload();
  const sentAt = '2026-04-17T10:00:00.000Z';

  recordFormNotification(project, payload, sentAt);

  assert.equal(
    shouldSkipDuplicateFormNotification(
      project,
      payload,
      Date.parse(sentAt) + FORM_NOTIFICATION_DEDUPE_WINDOW_MS + 1
    ),
    false
  );
});

test('shouldSkipDuplicateFormNotification allows changed pending items immediately', () => {
  const project = {};
  const original = makePayload();
  const changed = makePayload({
    documents: {
      pending_labels: ['Firma final comercial'],
    },
  });

  recordFormNotification(project, original, '2026-04-17T10:00:00.000Z');

  assert.equal(
    shouldSkipDuplicateFormNotification(project, changed, Date.parse('2026-04-17T10:00:30.000Z')),
    false
  );
});
