const http = require('http');
const https = require('https');

function getDefaultPort(target) {
  return target.protocol === 'https:' ? 443 : 80;
}

function buildProxyHeaders(headers, target) {
  const nextHeaders = {
    ...headers,
    host: target.host,
    'x-forwarded-proto': target.protocol.replace(':', ''),
  };

  if (headers.host) {
    nextHeaders['x-forwarded-host'] = headers.host;
  }

  return nextHeaders;
}

function createProxyRequestOptions(target, req) {
  return {
    protocol: target.protocol,
    hostname: target.hostname,
    port: target.port || getDefaultPort(target),
    method: req.method,
    path: req.originalUrl || req.url,
    headers: buildProxyHeaders(req.headers || {}, target),
  };
}

function createDefaultRequestFactory(target) {
  const transport = target.protocol === 'https:' ? https : http;
  return (options, onResponse) => transport.request(options, onResponse);
}

function writeUpgradeResponse(socket, proxyResponse) {
  const statusCode = proxyResponse.statusCode || 101;
  const statusMessage = proxyResponse.statusMessage || 'Switching Protocols';
  let payload = `HTTP/1.1 ${statusCode} ${statusMessage}\r\n`;

  Object.entries(proxyResponse.headers || {}).forEach(([name, value]) => {
    if (typeof value === 'undefined') return;
    if (Array.isArray(value)) {
      value.forEach((entry) => {
        payload += `${name}: ${entry}\r\n`;
      });
      return;
    }
    payload += `${name}: ${value}\r\n`;
  });

  payload += '\r\n';
  socket.write(payload);
}

function createViteDevProxyMiddleware({
  targetUrl,
  requestFactory,
}) {
  const target = typeof targetUrl === 'string' ? new URL(targetUrl) : targetUrl;
  const sendRequest = requestFactory || createDefaultRequestFactory(target);

  return (req, res) => {
    const proxyRequest = sendRequest(createProxyRequestOptions(target, req), (proxyResponse) => {
      res.statusCode = proxyResponse.statusCode || 502;
      if (proxyResponse.statusMessage) res.statusMessage = proxyResponse.statusMessage;

      Object.entries(proxyResponse.headers || {}).forEach(([name, value]) => {
        if (typeof value !== 'undefined') {
          res.setHeader(name, value);
        }
      });

      proxyResponse.pipe(res);
    });

    proxyRequest.on('error', (error) => {
      if (res.headersSent) {
        res.end();
        return;
      }

      res.status(502).json({
        success: false,
        error: 'VITE_DEV_PROXY_ERROR',
        message: `Vite dev server unavailable: ${error.message}`,
      });
    });

    res.on('close', () => {
      if (!proxyRequest.destroyed) proxyRequest.destroy();
    });

    req.pipe(proxyRequest);
  };
}

function attachViteDevProxyUpgrade(server, {
  targetUrl,
  requestFactory,
}) {
  const target = typeof targetUrl === 'string' ? new URL(targetUrl) : targetUrl;
  const sendRequest = requestFactory || createDefaultRequestFactory(target);

  server.on('upgrade', (req, socket, head) => {
    const proxyRequest = sendRequest({
      ...createProxyRequestOptions(target, req),
      headers: {
        ...buildProxyHeaders(req.headers || {}, target),
        connection: req.headers.connection || 'Upgrade',
        upgrade: req.headers.upgrade || 'websocket',
      },
    });

    proxyRequest.on('upgrade', (proxyResponse, proxySocket, proxyHead) => {
      writeUpgradeResponse(socket, proxyResponse);
      if (head?.length) proxySocket.write(head);
      if (proxyHead?.length) socket.write(proxyHead);
      proxySocket.pipe(socket).pipe(proxySocket);
    });

    proxyRequest.on('response', (proxyResponse) => {
      socket.write(`HTTP/1.1 ${proxyResponse.statusCode || 502} ${proxyResponse.statusMessage || 'Bad Gateway'}\r\nConnection: close\r\n\r\n`);
      socket.destroy();
    });

    proxyRequest.on('error', () => {
      socket.destroy();
    });

    proxyRequest.end();
  });
}

module.exports = {
  attachViteDevProxyUpgrade,
  buildProxyHeaders,
  createProxyRequestOptions,
  createViteDevProxyMiddleware,
  writeUpgradeResponse,
};
