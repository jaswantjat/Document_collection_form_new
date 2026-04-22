const MAX_RECENT_ATTEMPTS = 5;

function ensureProjectDeliveryStatus(project) {
  if (!project.deliveryStatus || typeof project.deliveryStatus !== 'object') {
    project.deliveryStatus = {};
  }
  return project.deliveryStatus;
}

function ensureChannelStatus(project, channel) {
  const deliveryStatus = ensureProjectDeliveryStatus(project);
  if (!deliveryStatus[channel] || typeof deliveryStatus[channel] !== 'object') {
    deliveryStatus[channel] = {
      configured: false,
      state: 'idle',
      lastEventType: null,
      lastAttemptAt: null,
      lastSuccessAt: null,
      lastStatusCode: null,
      lastError: null,
      recentAttempts: [],
    };
  }
  return deliveryStatus[channel];
}

function appendAttempt(channelStatus, attempt) {
  channelStatus.recentAttempts = [
    attempt,
    ...(Array.isArray(channelStatus.recentAttempts) ? channelStatus.recentAttempts : []),
  ].slice(0, MAX_RECENT_ATTEMPTS);
}

function recordDeliveryAttempt(project, channel, {
  configured,
  eventType,
  outcome,
  statusCode = null,
  message = null,
  attemptedAt = new Date().toISOString(),
}) {
  const channelStatus = ensureChannelStatus(project, channel);
  channelStatus.configured = Boolean(configured);
  channelStatus.lastEventType = eventType || null;
  channelStatus.lastAttemptAt = attemptedAt;
  channelStatus.lastStatusCode = statusCode;
  channelStatus.lastError = outcome === 'failed' ? message : null;
  channelStatus.state = configured ? outcome : 'disabled';
  if (outcome === 'delivered') {
    channelStatus.lastSuccessAt = attemptedAt;
  }

  appendAttempt(channelStatus, {
    attemptedAt,
    eventType: eventType || null,
    outcome: configured ? outcome : 'disabled',
    statusCode,
    message,
  });

  return channelStatus;
}

module.exports = {
  MAX_RECENT_ATTEMPTS,
  ensureProjectDeliveryStatus,
  recordDeliveryAttempt,
};
