const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { requestUpstream } = require('./upstreamHttp');

function listen(server) {
  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address()));
    server.on('error', reject);
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

test('requestUpstream posts JSON bodies and parses JSON responses', async () => {
  const server = http.createServer((req, res) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        method: req.method,
        headers: req.headers,
        body: JSON.parse(body),
      }));
    });
  });

  const address = await listen(server);

  try {
    const response = await requestUpstream(`http://127.0.0.1:${address.port}/json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hello: 'world' }),
      timeoutMs: 1000,
    });

    assert.equal(response.ok, true);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.method, 'POST');
    assert.equal(body.body.hello, 'world');
    assert.equal(body.headers['content-type'], 'application/json');
  } finally {
    await close(server);
  }
});

test('requestUpstream returns binary payloads via arrayBuffer', async () => {
  const payload = Buffer.from([0, 1, 2, 3, 4]);
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/octet-stream' });
    res.end(payload);
  });

  const address = await listen(server);

  try {
    const response = await requestUpstream(`http://127.0.0.1:${address.port}/binary`, {
      timeoutMs: 1000,
    });
    const arrayBuffer = await response.arrayBuffer();
    assert.deepEqual(Buffer.from(arrayBuffer), payload);
  } finally {
    await close(server);
  }
});

test('requestUpstream aborts when the upstream request times out', async () => {
  const server = http.createServer((_req, _res) => {
    // Intentionally never respond before the timeout window.
  });

  const address = await listen(server);

  try {
    await assert.rejects(
      requestUpstream(`http://127.0.0.1:${address.port}/timeout`, {
        timeoutMs: 50,
      }),
      /timed out/i,
    );
  } finally {
    await close(server);
  }
});
