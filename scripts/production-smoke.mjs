const baseUrl = (process.env.SMOKE_BASE_URL || process.env.BASE_URL || '').replace(/\/$/, '');
const apiBaseUrl = (process.env.SMOKE_API_BASE_URL || process.env.API_BASE_URL || '').replace(/\/$/, '');
const dashboardPassword = process.env.SMOKE_DASHBOARD_PASSWORD || process.env.DASHBOARD_PASSWORD || '';
const projectCode = process.env.SMOKE_PROJECT_CODE || '';
const notificationChannel = process.env.SMOKE_NOTIFICATION_CHANNEL || '';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function readJson(response, context) {
  try {
    return await response.json();
  } catch (error) {
    throw new Error(`${context} returned invalid JSON.`);
  }
}

async function checkHealth(url, expectedContext) {
  const response = await fetch(url);
  assert(response.ok, `${expectedContext} returned HTTP ${response.status}.`);
  const body = await readJson(response, expectedContext);
  assert(body.ready === true, `${expectedContext} is not ready.`);
  return body;
}

async function main() {
  assert(baseUrl, 'SMOKE_BASE_URL or BASE_URL is required.');
  assert(apiBaseUrl, 'SMOKE_API_BASE_URL or API_BASE_URL is required.');

  try {
    await checkHealth(`${baseUrl}/health`, '/health');
  } catch (error) {
    if (baseUrl === apiBaseUrl) {
      throw error;
    }
    await checkHealth(`${apiBaseUrl}/health`, '/health (api fallback)');
  }
  await checkHealth(`${apiBaseUrl}/api/health`, '/api/health');

  const rootResponse = await fetch(`${baseUrl}/`);
  assert(rootResponse.ok, `Frontend root returned HTTP ${rootResponse.status}.`);
  const rootHtml = await rootResponse.text();
  assert(/<html/i.test(rootHtml), 'Frontend root did not return HTML.');

  const customerUrl = projectCode
    ? `${baseUrl}/?code=${encodeURIComponent(projectCode)}`
    : `${baseUrl}/`;
  const customerResponse = await fetch(customerUrl);
  assert(customerResponse.ok, `Customer page returned HTTP ${customerResponse.status}.`);

  assert(dashboardPassword, 'SMOKE_DASHBOARD_PASSWORD or DASHBOARD_PASSWORD is required for dashboard smoke.');
  const loginResponse = await fetch(`${apiBaseUrl}/api/dashboard/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: dashboardPassword }),
  });
  assert(loginResponse.ok, `Dashboard login returned HTTP ${loginResponse.status}.`);
  const loginBody = await readJson(loginResponse, 'dashboard login');
  assert(loginBody.success === true && typeof loginBody.token === 'string', 'Dashboard login did not return a token.');

  if (projectCode) {
    const detailResponse = await fetch(`${apiBaseUrl}/api/dashboard/project/${encodeURIComponent(projectCode)}`, {
      headers: { 'x-dashboard-token': loginBody.token },
    });
    assert(detailResponse.ok, `Dashboard project detail returned HTTP ${detailResponse.status}.`);
    const detailBody = await readJson(detailResponse, 'dashboard project detail');
    assert(detailBody.success === true, 'Dashboard project detail returned success=false.');
    assert(detailBody.project?.code === projectCode, 'Dashboard project detail returned the wrong project.');

    if (notificationChannel) {
      const channel = detailBody.project?.deliveryStatus?.[notificationChannel];
      assert(channel, `Notification channel ${notificationChannel} was not present on the project.`);
      assert(channel.lastAttemptAt, `Notification channel ${notificationChannel} has no recorded attempts.`);
      assert(channel.state !== 'failed', `Notification channel ${notificationChannel} is currently failed.`);
    }
  }

  process.stdout.write('Production smoke checks passed.\n');
}

await main();
