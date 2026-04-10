const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const rateLimit = require('express-rate-limit');

const {
  configureTrustProxy,
  parseTrustProxyValue,
  resolveTrustProxySetting,
} = require('./trustProxy');

function withServer(app, handler) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', async () => {
      const address = server.address();
      const baseUrl = `http://127.0.0.1:${address.port}`;

      try {
        const result = await handler(baseUrl);
        server.close(() => resolve(result));
      } catch (error) {
        server.close(() => reject(error));
      }
    });
  });
}

test('parseTrustProxyValue handles booleans, numbers, and strings', () => {
  assert.equal(parseTrustProxyValue(undefined), undefined);
  assert.equal(parseTrustProxyValue(''), undefined);
  assert.equal(parseTrustProxyValue('true'), true);
  assert.equal(parseTrustProxyValue('false'), false);
  assert.equal(parseTrustProxyValue('2'), 2);
  assert.equal(parseTrustProxyValue('loopback'), 'loopback');
});

test('resolveTrustProxySetting defaults Railway deployments to one trusted hop', () => {
  assert.equal(resolveTrustProxySetting({ railwayEnvironment: 'production' }), 1);
  assert.equal(resolveTrustProxySetting({}), false);
  assert.equal(
    resolveTrustProxySetting({
      railwayEnvironment: 'production',
      trustProxyEnv: 'false',
    }),
    false,
  );
});

test('configureTrustProxy prevents express-rate-limit proxy validation errors on Railway', async () => {
  const app = express();
  configureTrustProxy(app, { railwayEnvironment: 'production' });

  const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use(limiter);
  app.get('/limited', (_req, res) => {
    res.json({ success: true });
  });

  const capturedErrors = [];
  const originalError = console.error;
  console.error = (...args) => {
    capturedErrors.push(args.join(' '));
  };

  try {
    await withServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/limited`, {
        headers: {
          'X-Forwarded-For': '203.0.113.10',
        },
      });

      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { success: true });
    });
  } finally {
    console.error = originalError;
  }

  assert.equal(
    capturedErrors.some((entry) => entry.includes('ERR_ERL_UNEXPECTED_X_FORWARDED_FOR')),
    false,
  );
});
