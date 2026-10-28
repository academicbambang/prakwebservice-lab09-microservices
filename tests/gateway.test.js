const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createHash } = require('node:crypto');
const { createGateway } = require('../gateway/gateway');
const { readConfig } = require('../gateway/config');

async function listen(t, app) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((ok, fail) => { server.once('listening', ok); server.once('error', fail); });
  t.after(async () => {
    await new Promise((ok) => { server.close(ok); server.closeAllConnections(); });
    app.locals.shutdown?.();
  });
  return `http://127.0.0.1:${server.address().port}`;
}

async function fixture(t, config = {}) {
  const upstream = express();
  upstream.use(express.json());
  upstream.use((req, res) => res.status(req.method === 'POST' ? 201 : 200).json({
    path: req.path, query: req.query, method: req.method, body: req.body,
    receivedKey: req.get('X-API-Key') || null,
  }));
  const url = await listen(t, upstream);
  return listen(t, createGateway({ catalogUrl: url, orderUrl: url, apiKey: 'unit-test-only', ...config }));
}

test('routing katalog menghapus prefix dan mempertahankan query string', async (t) => {
  const url = await fixture(t);
  const res = await fetch(`${url}/catalog/products?category=kuliner&search=kopi`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { path: '/products', query: { category: 'kuliner', search: 'kopi' }, method: 'GET', receivedKey: null });
});

test('POST JSON diteruskan utuh ke service pesanan dan key tidak diteruskan', async (t) => {
  const url = await fixture(t);
  const payload = { customerName: 'Pelanggan Demo', items: [{ productId: 'prod-001', quantity: 2 }] };
  const res = await fetch(`${url}/orders/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': 'unit-test-only' }, body: JSON.stringify(payload) });
  assert.equal(res.status, 201);
  const actual = await res.json();
  assert.equal(actual.path, '/orders');
  assert.deepEqual(actual.body, payload);
  assert.equal(actual.receivedKey, null);
});

test('alias Lab 09 meneruskan produk dan pesanan dengan prefix yang benar', async (t) => {
  const url = await fixture(t);
  const product = await fetch(`${url}/product-service/products?search=kopi`);
  assert.equal(product.status, 200);
  assert.deepEqual(await product.json(), {
    path: '/products', query: { search: 'kopi' }, method: 'GET', receivedKey: null,
  });
  const payload = { customerName: 'Bambang', items: [{ productId: 'prod-001', quantity: 2 }] };
  const response = await fetch(`${url}/order-service/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': 'unit-test-only' },
    body: JSON.stringify(payload),
  });
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.path, '/orders');
  assert.deepEqual(body.body, payload);
  assert.equal(body.receivedKey, null);
  assert.equal((await fetch(`${url}/order-service/orders`)).status, 401);
});

test('reservasi stok melalui kedua prefix produk memerlukan API key', async (t) => {
  for (const prefix of ['/catalog', '/product-service']) {
    const url = await fixture(t);
    for (const [route, payload] of [
      ['/products/prod-001/reserve', { qty: 2 }],
      ['/reservations', { items: [{ productId: 'prod-001', quantity: 2 }] }],
    ]) {
      const options = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) };
      const unauthorized = await fetch(`${url}${prefix}${route}`, options);
      assert.equal(unauthorized.status, 401);
      assert.deepEqual(await unauthorized.json(), { error: 'Unauthorized' });
      const authorized = await fetch(`${url}${prefix}${route}`, {
        ...options, headers: { ...options.headers, 'X-API-Key': 'unit-test-only' },
      });
      assert.equal(authorized.status, 201);
      const body = await authorized.json();
      assert.equal(body.path, route);
      assert.deepEqual(body.body, payload);
      assert.equal(body.receivedKey, null);
    }
  }
});

for (const key of [undefined, '', 'wrong-key']) {
  test(`API key ${key === undefined ? 'tidak ada' : key === '' ? 'kosong' : 'salah'} ditolak`, async (t) => {
    const url = await fixture(t);
    const res = await fetch(`${url}/orders/orders`, { headers: key === undefined ? {} : { 'X-API-Key': key } });
    assert.equal(res.status, 401);
    assert.deepEqual(await res.json(), { error: 'Unauthorized' });
  });
}

test('konfigurasi tanpa key menolak akses pesanan', async (t) => {
  const url = await fixture(t, { apiKey: '' });
  assert.equal((await fetch(`${url}/orders/orders`, { headers: { 'X-API-Key': 'anything' } })).status, 401);
});

test('hash API key yang valid menerima key asal', async (t) => {
  const url = await fixture(t, { apiKey: '', apiKeyHash: createHash('sha256').update('hash-test-only').digest('hex') });
  const res = await fetch(`${url}/orders/orders`, { headers: { 'X-API-Key': 'hash-test-only' } });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).path, '/orders');
});

for (const path of ['/missing', '/catalogue/products', '/orders-other/orders', '/product-service-other/products', '/order-service-other/orders']) {
  test(`route ${path} tidak cocok dengan prefix service`, async (t) => {
    const url = await fixture(t);
    const res = await fetch(`${url}${path}`);
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { error: 'Route tidak ditemukan' });
  });
}

test('batas default tepat 20 request; request ke-21 hingga ke-30 mendapat 429', async (t) => {
  const url = await fixture(t);
  const statuses = [];
  for (let i = 1; i <= 30; i++) {
    const res = await fetch(`${url}/catalog/products`);
    statuses.push(res.status);
    if (i === 20) assert.equal(res.headers.get('ratelimit-remaining'), '0');
    if (i === 21) {
      assert.ok(Number(res.headers.get('retry-after')) > 0);
      assert.equal(res.headers.get('ratelimit-limit'), '20');
    }
    await res.arrayBuffer();
  }
  assert.deepEqual(statuses, [...Array(20).fill(200), ...Array(10).fill(429)]);
});

test('kuota dipulihkan setelah window berakhir', async (t) => {
  const url = await fixture(t, { rateWindowMs: 2000 });
  for (let i = 0; i < 20; i++) assert.equal((await fetch(`${url}/health`)).status, 200);
  assert.equal((await fetch(`${url}/health`)).status, 429);
  await new Promise((ok) => setTimeout(ok, 2100));
  assert.equal((await fetch(`${url}/health`)).status, 200);
});

test('upstream mati menghasilkan 502 JSON tanpa menggantung', async (t) => {
  // Reserve an unused ephemeral port, then release it before the request.
  const probe = express().listen(0, '127.0.0.1');
  await new Promise((ok) => probe.once('listening', ok));
  const target = `http://127.0.0.1:${probe.address().port}`;
  await new Promise((ok) => probe.close(ok));
  const url = await listen(t, createGateway({ catalogUrl: target }));
  const res = await fetch(`${url}/catalog/products`, { signal: AbortSignal.timeout(3000) });
  assert.equal(res.status, 502);
  assert.deepEqual(await res.json(), { error: 'Service tujuan tidak tersedia' });
});

test('konfigurasi menolak hash, port dan URL upstream tidak valid', () => {
  assert.throws(() => createGateway({ apiKeyHash: 'not-a-sha256-hash' }), /64/);
  assert.throws(() => readConfig({ PORT: '0' }), /PORT/);
  assert.throws(() => readConfig({ TRUST_PROXY: 'true' }), /TRUST_PROXY/);
  assert.throws(() => readConfig({ CATALOG_SERVICE_URL: 'ftp://example.com' }), /HTTP/);
  assert.throws(() => readConfig({ ORDER_SERVICE_URL: 'https://example.com/nested' }), /path/);
});
