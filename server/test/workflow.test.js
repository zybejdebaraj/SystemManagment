const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const bcrypt = require('bcryptjs');
const { createDatabase } = require('../db');
const { ensureSchema, transaction } = require('../src/utils/database');
const { createApp } = require('../app');
const config = require('../src/config/env');
const { RequestError } = require('../src/utils/validation');
const { createClientServer } = require('../../client/scripts/proxy.cjs');

test('inventory workflow uses PostgreSQL without modifying existing inventory', async t => {
  const url = config.database.connectionString ? new URL(config.database.connectionString) : null;
  assert(['localhost','127.0.0.1','[::1]','::1'].includes(url?.hostname || config.database.host), 'Tests require local PostgreSQL');
  assert.equal(url ? url.pathname : `/${config.database.database}`, '/inventory_db');
  const schema = `inventory_qa_${crypto.randomBytes(6).toString('hex')}`;
  const admin = createDatabase(config.database);
  const db = createDatabase({ ...config.database, options: `-c search_path=${schema},public` });
  const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inventory-uploads-test-'));
  const servers = [], stores = [];
  t.after(async () => {
    try {
      for (const server of servers) {
        const stopped = new Promise(resolve => server.close(resolve));
        server.closeAllConnections(); await stopped;
      }
      stores.forEach(store => store.close());
      await db.end();
      assert.match(schema, /^inventory_qa_[a-f0-9]{12}$/);
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    } finally {
      await admin.end();
      assert.equal(path.dirname(path.resolve(uploadDir)), path.resolve(os.tmpdir()));
      assert(path.basename(uploadDir).startsWith('inventory-uploads-test-'));
      fs.rmSync(uploadDir, { recursive: true, force: true });
    }
  });
  await admin.query(`CREATE SCHEMA ${schema}`);
  await ensureSchema(db);
  await ensureSchema(db);
  async function serve() {
    const store = new PgSession({ pool: db, schemaName: schema, tableName: 'user_sessions', pruneSessionInterval: false });
    stores.push(store);
    const app = createApp({ db, config: { ...config, google: null, production: false }, sessionStore: store, uploadDir });
    const server = app.listen(0, '127.0.0.1'); servers.push(server);
    await once(server, 'listening');
    return `http://127.0.0.1:${server.address().port}`;
  }
  const backendBase = await serve();
  const client = createClientServer({ target: backendBase }); servers.push(client);
  client.listen(0, '127.0.0.1'); await once(client, 'listening');
  const base = `http://127.0.0.1:${client.address().port}`;
  assert.notEqual(base, backendBase, 'Client and server must listen on different ports');
  const jar = new Map();
  let csrf;
  async function request(method, url, body, expected = 200, options = {}) {
    const headers = { Cookie: [...jar].map(([key, value]) => `${key}=${value}`).join('; '), ...options.headers };
    if (body && !(body instanceof FormData)) headers['Content-Type'] = 'application/x-www-form-urlencoded';
    const payload = body instanceof FormData ? body : body ? new URLSearchParams({ _csrf: csrf || '', ...body }) : undefined;
    const response = await fetch((options.base || base) + url, { method, headers, body: payload, redirect: 'manual' });
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(';')[0], index = pair.indexOf('=');
      jar.set(pair.slice(0, index), pair.slice(index + 1));
    }
    const html = await response.text();
    assert.equal(response.status, expected, `${method} ${url}: ${html.slice(0, 200)}`);
    const token = html.match(/name="_csrf" value="([a-f0-9]{64})"/);
    if (token) csrf = token[1];
    return { html, headers: response.headers };
  }
  let userId, supplierId, productId;
  const product = { name: "QA product's name", description: 'Test description', price: '12.50', stock: '0', category: 'accessories' };
  await t.test('readiness and anonymous access guards', async () => {
    assert.equal(JSON.parse((await request('GET', '/health')).html).database, 'postgresql');
    for (const route of ['/dashboard','/inventory/products','/inventory/suppliers','/inventory/reports']) {
      assert.equal((await request('GET', route, undefined, 302)).headers.get('location'), '/');
    }
    await request('GET', '/'); assert.match(csrf, /^[a-f0-9]{64}$/);
  });
  await t.test('client assets are served from their new folder without exposing server files', async () => {
    for (const asset of ['/styles.css','/image/inv3.jpg','/js/products.js','/js/dashboard.js','/js/workspace.js','/js/overview.js','/vendor/chart.js']) {
      const response = await fetch(base + asset);
      assert.equal(response.status, 200, asset); assert((await response.arrayBuffer()).byteLength > 0);
    }
    for (const file of ['/server/.env.local','/server/inventory_db.sql','/.env.local','/package.json']) await request('GET', file, undefined, 404);
  });
  await t.test('CSRF protection rejects absent, stale, and malformed tokens', async () => {
    for (const token of ['', 'x'.repeat(64), 'é'.repeat(64)]) {
      await request('POST', '/signup', { _csrf: token, name: 'QA', email: 'qa@example.invalid', password: 'QA-password!' }, 403);
    }
    assert.equal((await db.query('SELECT COUNT(*)::int AS count FROM users')).rows[0].count, 0);
  });
  await t.test('signup validates fields and stores a bcrypt hash', async () => {
    await request('POST', '/signup', { name: 'QA', email: 'invalid', password: 'short' }, 400);
    await request('POST', '/signup', { name: 'QA Owner', email: 'QA@EXAMPLE.INVALID', password: 'QA-password!' }, 302);
    const user = (await db.query('SELECT * FROM users')).rows[0]; userId = user.id;
    assert.equal(user.email, 'qa@example.invalid');
    assert.notEqual(user.password, 'QA-password!'); assert(await bcrypt.compare('QA-password!', user.password));
    await request('GET', '/dashboard');
  });
  await t.test('all existing pages render through the retained EJS layout', async () => {
    for (const route of ['/dashboard','/inventory','/inventory/products','/inventory/products/add','/inventory/suppliers','/inventory/suppliers/add','/inventory/reports','/inventory/restock','/inventory/sales','/inventory/profile','/inventory/settings/profile','/inventory/settings/security','/inventory/settings/preferences']) {
      if (route === '/inventory') { await request('GET', route, undefined, 302); continue; }
      const { html } = await request('GET', route);
      assert.equal((html.match(/<!DOCTYPE html>/gi) || []).length, 1, route);
      assert.match(html, /Inventory/);
      assert.equal((html.match(/bootstrap(?:\.bundle)?\.min\.js/g) || []).length, 1, route);
      for (const form of html.matchAll(/<form\b[^>]*>([\s\S]*?)<\/form>/g)) assert.match(form[1], /name="_csrf"/, route);
      for (const script of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
        if (script[1].includes('application/json')) JSON.parse(script[2]);
        else new vm.Script(script[2]);
      }
    }
  });
  await t.test('PostgreSQL session cookies work in another app instance', async () => {
    const otherBase = await serve();
    const { html } = await request('GET', '/inventory/profile', undefined, 200, { base: otherBase });
    assert.match(html, /QA Owner/);
    assert((await db.query('SELECT COUNT(*)::int AS count FROM user_sessions')).rows[0].count > 0);
  });
  await t.test('private pages are not cached and missing pages provide a usable recovery link', async () => {
    const dashboard = await request('GET', '/dashboard');
    assert.equal(dashboard.headers.get('cache-control'), 'no-store');
    const missing = await request('GET', '/inventory/missing', undefined, 404);
    assert.match(missing.html, /Page not found/);
    assert.match(missing.html, /href="\/dashboard"/);
  });
  await t.test('supplier CRUD keeps parameterized names and correct edit URLs', async () => {
    await request('POST', '/inventory/suppliers/add', { name: 'Supplier', contact: '123', email: 'supplier@example.invalid', address: 'QA street' }, 302);
    supplierId = (await db.query('SELECT id FROM suppliers')).rows[0].id;
    await request('GET', `/inventory/suppliers/edit/${supplierId}`);
    await request('POST', `/inventory/suppliers/edit/${supplierId}`, { name: "Supplier's updated name", contact: '456', email: 'supplier@example.invalid', address: 'QA street 2' }, 302);
    assert.equal((await db.query('SELECT name FROM suppliers WHERE id=$1', [supplierId])).rows[0].name, "Supplier's updated name");
    await request('GET', '/inventory/suppliers/edit/2147483647', undefined, 404);
  });
  await t.test('products support zero stock, decimal prices, updates, and safe delete labels', async () => {
    await request('POST', '/inventory/products/add', { ...product, supplier_id: String(supplierId) }, 302);
    productId = (await db.query('SELECT id FROM products')).rows[0].id;
    const listed = await request('GET', '/inventory/products');
    assert.equal((listed.html.match(/Product added successfully!/g) || []).length, 1);
    assert(!(await request('GET', '/inventory/products')).html.includes('Product added successfully!'));
    assert.match(listed.html, /data-name="QA product&#39;s name"/);
    assert(!listed.html.includes("confirmDelete('"));
    const editor = await request('GET', `/inventory/products/edit/${productId}`);
    const revision = editor.html.match(/name="revision" value="(\d+)"/)[1];
    await request('POST', `/inventory/products/edit/${productId}`, { ...product, price: '0', stock: '3', revision }, 302);
    const updated = (await db.query('SELECT * FROM products WHERE id=$1', [productId])).rows[0];
    assert.equal(Number(updated.price), 0); assert.equal(updated.stock, 3); assert.equal(updated.supplier_id, supplierId);
  });
  await t.test('invalid product values and missing IDs are client errors', async () => {
    for (const fields of [{ price: '-1' }, { price: '1.999' }, { stock: '-1' }, { stock: '2.5' }, { supplier_id: '2147483647' }]) {
      await request('POST', '/inventory/products/add', { ...product, ...fields }, 400);
    }
    await request('GET', '/inventory/products/edit/not-an-id', undefined, 400);
    await request('POST', '/inventory/products/delete/2147483647', {}, 404);
  });
  await t.test('product forms preserve custom categories and allow supplier assignment or removal', async () => {
    const fields = { name: 'Unassigned QA', category: 'custom_spares', description: '', price: '0', stock: '0', supplier_id: '' };
    const addPage = (await request('GET', '/inventory/products/add')).html;
    assert(!addPage.match(/<select[^>]*id="supplier_id"[^>]*>/)[0].includes('required'));
    assert(!addPage.match(/<textarea[^>]*id="description"[^>]*>/)[0].includes('required'));
    await request('POST', '/inventory/products/add', fields, 302);
    const id = (await db.query('SELECT id FROM products WHERE name=$1', [fields.name])).rows[0].id;
    for (const assignment of [String(supplierId), '']) {
      const { html } = await request('GET', `/inventory/products/edit/${id}`);
      assert.match(html, /value="custom_spares" selected/);
      assert.match(html, /name="supplier_id"/);
      assert(!html.match(/<textarea[^>]*id="description"[^>]*>/)[0].includes('required'));
      const revision = html.match(/name="revision" value="(\d+)"/)[1];
      await request('POST', `/inventory/products/edit/${id}`, { ...fields, supplier_id: assignment, revision }, 302);
      const saved = (await db.query('SELECT * FROM products WHERE id=$1', [id])).rows[0];
      assert.equal(saved.supplier_id, assignment ? supplierId : null);
      assert.equal(saved.category, 'custom_spares');
      assert.equal(saved.description, '');
    }
    await request('POST', `/inventory/products/delete/${id}`, {}, 302);
  });
  await t.test('concurrent restocks preserve every quantity and authenticated user ID', async () => {
    const send = () => fetch(base + '/inventory/restock', { method: 'POST', redirect: 'manual', headers: { Cookie: [...jar].map(([k,v]) => `${k}=${v}`).join('; '), 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ _csrf: csrf, product_id: productId, restock_quantity: '2' }) });
    const responses = await Promise.all([send(), send()]);
    for (const response of responses) { assert.equal(response.status, 302); await response.text(); }
    assert.equal((await db.query('SELECT stock FROM products WHERE id=$1', [productId])).rows[0].stock, 7);
    const logs = (await db.query('SELECT * FROM restock_logs WHERE product_id=$1', [productId])).rows;
    assert.equal(logs.length, 2); assert(logs.every(log => log.restocked_by === userId && log.restock_quantity === 2));
    for (const quantity of ['-1','0','1.5','invalid']) await request('POST', '/inventory/restock', { product_id: productId, restock_quantity: quantity }, 400);
  });
  await t.test('failed restock logging rolls stock changes back', async () => {
    const before = (await db.query('SELECT stock FROM products WHERE id=$1', [productId])).rows[0].stock;
    await assert.rejects(transaction(db, async client => {
      await client.query('UPDATE products SET stock=stock+1 WHERE id=$1', [productId]);
      await client.query('INSERT INTO restock_logs(product_id,restock_quantity,restocked_by) VALUES($1,1,2147483647)', [productId]);
    }), error => error.code === '23503');
    assert.equal((await db.query('SELECT stock FROM products WHERE id=$1', [productId])).rows[0].stock, before);
  });
  await t.test('stale product editors cannot overwrite later restocks or edits', async () => {
    const route = `/inventory/products/edit/${productId}`;
    const revision = (await request('GET', route)).html.match(/name="revision" value="(\d+)"/)[1];
    const before = (await db.query('SELECT stock FROM products WHERE id=$1', [productId])).rows[0].stock;
    await request('POST', '/inventory/restock', { product_id: productId, restock_quantity: '2' }, 302);
    const conflict = await request('POST', route, { ...product, stock: before, revision }, 409);
    assert.match(conflict.html, /changed after you opened it/);
    assert.match(conflict.html, /Reload product editor/);
    assert.equal((await db.query('SELECT stock FROM products WHERE id=$1', [productId])).rows[0].stock, before + 2);
    await request('POST', route, product, 400);
    const current = (await request('GET', route)).html.match(/name="revision" value="(\d+)"/)[1];
    await request('POST', route, { ...product, stock: before + 2, revision: current }, 302);
    await request('POST', route, { ...product, stock: before, revision: current }, 409);
  });
  await t.test('dashboard chart data escapes script content and counts all stock levels', async () => {
    await db.query('UPDATE products SET category=$1,stock=12 WHERE id=$2', ['</script><script>alert(1)</script>', productId]);
    const { html } = await request('GET', '/dashboard');
    assert(!html.includes('</script><script>alert(1)</script>'));
    assert.match(html, /\\u003c\/script>/);
    const chartData = JSON.parse(html.match(/<script id="dashboard-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
    assert.equal(chartData.stockLevels.good, 1);
    assert.equal(chartData.categoryDistribution[0].category, '</script><script>alert(1)</script>');
  });
  await t.test('overview shows supplier details, prioritizes low stock, and safely returns after restocking', async () => {
    const inserted = await db.query(`INSERT INTO products(name,category,price,stock,supplier_id)
      SELECT 'Overview QA '||n,'accessories',5,CASE WHEN n=1 THEN 0 ELSE 20 END,$1
      FROM generate_series(1,9) n RETURNING id`, [supplierId]);
    try {
      const { html } = await request('GET', '/dashboard');
      const rows = [...html.matchAll(/data-product-details="([^"]+)"/g)].map(match => JSON.parse(match[1].replace(/&#34;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')));
      assert.equal(rows.length, 8);
      assert.equal(rows[0].name, 'Overview QA 1');
      assert.equal(rows[0].supplier, "Supplier's updated name");
      assert.equal(rows[0].stock, 0);
      assert.equal(rows[0].price, '₹5.00');
      assert.match((await request('GET', '/inventory/reports')).html, /name="return_to" value="\/inventory\/reports"/);
      const quantities = (await db.query('SELECT stock FROM products WHERE id=$1', [productId])).rows[0].stock;
      for (const [return_to, expected] of [['/dashboard','/dashboard'], ['/inventory/reports','/inventory/reports'], ['https://example.invalid','/inventory/products']]) {
        const response = await request('POST', '/inventory/restock', { product_id: productId, restock_quantity: '1', return_to }, 302);
        assert.equal(response.headers.get('location'), expected);
      }
      assert.equal((await db.query('SELECT stock FROM products WHERE id=$1', [productId])).rows[0].stock, quantities + 3);
    } finally { await db.query('DELETE FROM products WHERE id=ANY($1::int[])', [inserted.rows.map(row => row.id)]); }
  });
  await t.test('settings, preferences, and profile updates persist in PostgreSQL', async () => {
    await request('POST', '/inventory/settings/update-name', { name: 'Updated QA' }, 302);
    assert.match((await request('GET', '/inventory/profile')).html, /Updated QA/);
    await request('POST', '/inventory/settings/update-email', { email: 'changed@example.invalid' }, 302);
    await request('POST', '/inventory/settings/update-preferences', { theme: 'dark', language: 'en', email_notifications: 'on' }, 302);
    await request('POST', '/inventory/settings/update-session-timeout', { 'session-timeout': '60' }, 302);
    const user = (await db.query('SELECT * FROM users WHERE id=$1', [userId])).rows[0];
    assert.equal(user.theme, 'dark'); assert.equal(user.email_notifications, true); assert.equal(user.session_timeout, 60);
    await request('POST', '/inventory/settings/change-password', { 'current-password': 'wrong', 'new-password': 'New-password!', 'confirm-password': 'New-password!' }, 400);
    await request('POST', '/inventory/settings/change-password', { 'current-password': 'QA-password!', 'new-password': 'New-password!', 'confirm-password': 'New-password!' }, 302);
  });
  await t.test('uploads require CSRF and real PNG or JPEG content', async () => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWQAAAABJRU5ErkJggg==', 'base64');
    const form = new FormData(); form.set('_csrf', csrf); form.set('profilePic', new Blob([png], { type: 'image/png' }), 'avatar.png');
    await request('POST', '/inventory/settings/upload-profile-pic', form, 302);
    assert.equal(fs.readdirSync(uploadDir).length, 1);
    const previous = (await db.query('SELECT profile_pic FROM users WHERE id=$1', [userId])).rows[0].profile_pic;
    const replacement = new FormData(); replacement.set('_csrf', csrf); replacement.set('profilePic', new Blob([png], { type: 'image/png' }), 'replacement.png');
    await request('POST', '/inventory/settings/upload-profile-pic', replacement, 302);
    const current = (await db.query('SELECT profile_pic FROM users WHERE id=$1', [userId])).rows[0].profile_pic;
    assert.notEqual(current, previous);
    assert.equal(fs.existsSync(path.join(uploadDir, path.basename(previous))), false);
    assert.equal(fs.readdirSync(uploadDir).length, 1);
    const bad = new FormData(); bad.set('_csrf', csrf); bad.set('profilePic', new Blob(['not an image'], { type: 'image/png' }), 'bad.png');
    await request('POST', '/inventory/settings/upload-profile-pic', bad, 400);
    const forged = new FormData(); forged.set('profilePic', new Blob([png], { type: 'image/png' }), 'forged.png');
    await request('POST', '/inventory/settings/upload-profile-pic', forged, 403);
    assert.equal(fs.readdirSync(uploadDir).length, 1);
  });
  await t.test('failed profile writes remove the new file and preserve the old profile picture', async () => {
    const before = (await db.query('SELECT profile_pic FROM users WHERE id=$1', [userId])).rows[0].profile_pic;
    const originalQuery = db.query;
    db.query = function(sql, ...args) {
      if (typeof sql === 'string' && sql.includes('UPDATE users SET profile_pic=')) return Promise.reject(new RequestError(503, 'Temporary database failure'));
      return originalQuery.call(this, sql, ...args);
    };
    try {
      const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWQAAAABJRU5ErkJggg==', 'base64');
      const form = new FormData(); form.set('_csrf', csrf); form.set('profilePic', new Blob([png], { type: 'image/png' }), 'avatar.png');
      await request('POST', '/inventory/settings/upload-profile-pic', form, 503);
    } finally { db.query = originalQuery; }
    assert.equal(fs.readdirSync(uploadDir).length, 1);
    assert.equal((await db.query('SELECT profile_pic FROM users WHERE id=$1', [userId])).rows[0].profile_pic, before);
  });
  await t.test('deleting a supplier retains products and deleting products removes restock logs', async () => {
    await request('POST', `/inventory/suppliers/delete/${supplierId}`, {}, 302);
    assert.equal((await db.query('SELECT supplier_id FROM products WHERE id=$1', [productId])).rows[0].supplier_id, null);
    await request('POST', `/inventory/products/delete/${productId}`, {}, 302);
    assert.equal((await db.query('SELECT COUNT(*)::int AS count FROM restock_logs')).rows[0].count, 0);
  });
  await t.test('logout destroys PostgreSQL session and login works with the updated password', async () => {
    await request('POST', '/logout', {}, 302);
    await request('GET', '/dashboard', undefined, 302);
    await request('GET', '/');
    await request('POST', '/login', { email: 'changed@example.invalid', password: 'QA-password!' }, 401);
    await request('POST', '/login', { email: 'changed@example.invalid', password: 'New-password!' }, 302);
    await request('GET', '/dashboard');
  });
});
