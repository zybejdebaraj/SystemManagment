const http = require('node:http');
const https = require('node:https');

function cleanHeaders(headers) {
  const excluded = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade']);
  for (const token of String(headers.connection || '').split(',')) excluded.add(token.trim().toLowerCase());
  return Object.fromEntries(Object.entries(headers).filter(([name]) => !excluded.has(name.toLowerCase())));
}

function createClientServer({ target = 'http://127.0.0.1:3002', timeout = 15000 } = {}) {
  const backend = new URL(target);
  if (!['http:', 'https:'].includes(backend.protocol) || backend.username || backend.password || backend.pathname !== '/' || backend.search || backend.hash) {
    throw new Error('SERVER_URL must be an HTTP(S) origin without credentials, a path, or query parameters');
  }
  const transport = backend.protocol === 'https:' ? https : http;
  return http.createServer((req, res) => {
    const headers = cleanHeaders(req.headers);
    headers.host = backend.host;
    headers['x-forwarded-host'] = req.headers.host;
    headers['x-forwarded-proto'] = 'http';
    let timedOut = false;
    const upstream = transport.request({
      protocol: backend.protocol, hostname: backend.hostname, port: backend.port,
      method: req.method, path: req.url, headers,
    }, response => {
      const responseHeaders = cleanHeaders(response.headers);
      if (responseHeaders.location) {
        const location = new URL(responseHeaders.location, backend);
        if (location.origin === backend.origin) responseHeaders.location = location.pathname + location.search + location.hash;
      }
      res.writeHead(response.statusCode, responseHeaders);
      response.on('error', () => res.destroy());
      response.pipe(res);
    });
    upstream.setTimeout(timeout, () => { timedOut = true; upstream.destroy(new Error('Backend timeout')); });
    upstream.on('error', () => {
      if (res.headersSent) { res.destroy(); return; }
      res.writeHead(timedOut ? 504 : 502, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(timedOut
        ? 'The inventory server took too long to respond. Please try again.'
        : `The inventory server is not running at ${backend.origin}. Start npm run dev inside the server folder, then refresh this page.`);
    });
    req.on('aborted', () => upstream.destroy());
    req.on('error', () => upstream.destroy());
    res.on('close', () => { if (!res.writableEnded) upstream.destroy(); });
    req.pipe(upstream);
  });
}

module.exports = { createClientServer };
