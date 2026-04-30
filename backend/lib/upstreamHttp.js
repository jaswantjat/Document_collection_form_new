const http = require('node:http');
const https = require('node:https');

function isLocalHostname(hostname) {
  return (
    hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname === '::1'
  );
}

class UpstreamResponse {
  constructor(status, statusText, headers, body) {
    this.status = status;
    this.statusText = statusText || '';
    this.headers = headers || {};
    this._body = body || Buffer.alloc(0);
  }

  get ok() {
    return this.status >= 200 && this.status < 300;
  }

  async text() {
    return this._body.toString('utf8');
  }

  async json() {
    return JSON.parse(await this.text());
  }

  async arrayBuffer() {
    const view = this._body;
    return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
  }
}

function normalizeBody(body) {
  if (body == null) return null;
  if (Buffer.isBuffer(body)) return body;
  if (typeof body === 'string') return Buffer.from(body);
  if (body instanceof Uint8Array) return Buffer.from(body);
  throw new TypeError('Unsupported upstream request body type.');
}

function buildRequestOptions(url, method, headers, family) {
  const isHttps = url.protocol === 'https:';
  const defaultPort = isHttps ? 443 : 80;
  return {
    protocol: url.protocol,
    hostname: url.hostname,
    port: url.port ? Number(url.port) : defaultPort,
    path: `${url.pathname}${url.search}`,
    method,
    headers,
    family,
  };
}

function requestUpstream(
  rawUrl,
  {
    method = 'GET',
    headers = {},
    body = null,
    timeoutMs = 30000,
    family,
  } = {}
) {
  const url = new URL(rawUrl);
  const normalizedBody = normalizeBody(body);
  const resolvedFamily =
    typeof family === 'number'
      ? family
      : isLocalHostname(url.hostname)
        ? undefined
        : 4;
  const transport = url.protocol === 'https:' ? https : http;
  const requestHeaders = { ...headers };

  if (normalizedBody && !('Content-Length' in requestHeaders) && !('content-length' in requestHeaders)) {
    requestHeaders['Content-Length'] = String(normalizedBody.length);
  }

  return new Promise((resolve, reject) => {
    const req = transport.request(
      buildRequestOptions(url, method, requestHeaders, resolvedFamily),
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        res.on('end', () => {
          resolve(new UpstreamResponse(
            res.statusCode || 0,
            res.statusMessage || '',
            res.headers,
            Buffer.concat(chunks),
          ));
        });
      }
    );

    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Upstream request timed out after ${timeoutMs}ms.`));
    });

    if (normalizedBody) req.write(normalizedBody);
    req.end();
  });
}

module.exports = {
  requestUpstream,
  UpstreamResponse,
};
