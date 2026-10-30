const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const { createClientServer } = require('../scripts/proxy.cjs');

async function listen(t, server, host = '127.0.0.1') {
  t.after(async () => {
    const closed = new Promise(resolve => server.close(resolve));
    server.closeAllConnections(); await closed;
  });
  server.listen(0, host); await once(server, 'listening');
  return `http://${host.includes(':') ? `[${host}]` : host}:${server.address().port}`;
}

test('client runs on its own port and forwards pages, cookies, and form bodies', async t => {
  const backend = await listen(t, http.createServer((req, res) => {
    let body = '';
    req.setEncoding('utf8'); req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      res.setHeader('Set-Cookie', ['inventory.sid=test; HttpOnly; SameSite=Lax', 'other=value; Path=/']);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ method: req.method, path: req.url, body, cookie: req.headers.cookie, origin: req.headers.origin }));
    });
  }));
  const client = await listen(t, createClientServer({ target: backend }));
  assert.notEqual(client, backend);
  const response = await fetch(client + '/inventory/products/add', {
    method: 'POST', headers: { Cookie: 'inventory.sid=old', Origin: client, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: '_csrf=test&name=Product',
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.getSetCookie().length, 2);
  assert.deepEqual(await response.json(), { method: 'POST', path: '/inventory/products/add', body: '_csrf=test&name=Product', cookie: 'inventory.sid=old', origin: client });
});

test('local redirects stay on the client while external OAuth redirects are preserved', async t => {
  let destination;
  const backend = await listen(t, http.createServer((req, res) => { res.writeHead(302, { Location: destination }); res.end(); }));
  const client = await listen(t, createClientServer({ target: backend }));
  for (const [value, expected] of [[backend + '/dashboard?filter=all', '/dashboard?filter=all'], ['/dashboard', '/dashboard'], ['https://accounts.google.com/example', 'https://accounts.google.com/example']]) {
    destination = value;
    const response = await fetch(client, { redirect: 'manual' }); await response.text();
    assert.equal(response.headers.get('location'), expected);
  }
});

test('client shows a useful error when the server is not running', async t => {
  const probe = http.createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
  const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
  const client = await listen(t, createClientServer({ target: `http://127.0.0.1:${port}` }));
  const response = await fetch(client);
  assert.equal(response.status, 502);
  assert.match(await response.text(), /Start npm run dev inside the server folder/);
});

test('slow backend requests time out without hanging the client', async t => {
  const backend = await listen(t, http.createServer(() => {}));
  const client = await listen(t, createClientServer({ target: backend, timeout: 50 }));
  const response = await fetch(client);
  assert.equal(response.status, 504); assert.match(await response.text(), /too long/);
});

test('proxy rejects unsupported or ambiguous backend targets', () => {
  for (const target of ['file:///test', 'http://user:password@localhost:3002', 'http://localhost:3002/path', 'http://localhost:3002/?x=1']) {
    assert.throws(() => createClientServer({ target }), /SERVER_URL/);
  }
});

test('malformed backend redirects return 502 while the client keeps serving requests', async t => {
  let destination = 'http://[invalid';
  const backend = await listen(t, http.createServer((req, res) => { res.writeHead(302, { Location: destination }); res.end(); }));
  const client = await listen(t, createClientServer({ target: backend }));
  const invalid = await fetch(client, { redirect: 'manual' });
  assert.equal(invalid.status, 502); assert.match(await invalid.text(), /invalid redirect/);
  destination = '/dashboard';
  const valid = await fetch(client, { redirect: 'manual' });
  assert.equal(valid.status, 302); assert.equal(valid.headers.get('location'), '/dashboard'); await valid.text();
});

test('client connects to an IPv6 loopback backend', async t => {
  const backend = await listen(t, http.createServer((req, res) => res.end('IPv6 inventory')), '::1');
  const client = await listen(t, createClientServer({ target: backend }));
  const response = await fetch(client);
  assert.equal(response.status, 200); assert.equal(await response.text(), 'IPv6 inventory');
});
