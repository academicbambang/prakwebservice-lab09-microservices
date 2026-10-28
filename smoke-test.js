'use strict';

const assert = require('node:assert/strict');
const { loadLocalEnv } = require('./gateway/config');

// Evidence records intentionally exclude request headers (including the API key).
async function requestJson(baseUrl, route, { method = 'GET', body, apiKey } = {}) {
  const startedAt = new Date().toISOString();
  const start = performance.now();
  const response = await fetch(new URL(route, baseUrl), {
    method,
    headers: {
      accept: 'application/json',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(apiKey ? { 'x-api-key': apiKey } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(5000),
  });
  const payload = await response.json();
  return {
    startedAt,
    durationMs: Math.round(performance.now() - start),
    request: { method, url: new URL(route, baseUrl).href, ...(body === undefined ? {} : { body }) },
    response: { status: response.status, body: payload },
  };
}

function formatExchange(exchange) {
  const { request, response } = exchange;
  return [
    `${request.method} ${request.url}`,
    ...(request.body === undefined ? [] : [`Request: ${JSON.stringify(request.body)}`]),
    `HTTP ${response.status} (${exchange.durationMs} ms)`,
    JSON.stringify(response.body, null, 2),
  ].join('\n');
}

async function runSmokeTest({ baseUrl = 'http://127.0.0.1:8080', apiKey, log = console.log } = {}) {
  if (!apiKey) throw new Error('API key diperlukan. Jalankan npm run setup, atau atur API_KEY untuk gateway yang diuji.');
  const exchanges = [];
  async function request(route, options = {}) {
    const exchange = await requestJson(baseUrl, route, { apiKey, ...options });
    exchanges.push(exchange);
    log(formatExchange(exchange));
    return exchange.response;
  }

  const listed = await request('/product-service/products');
  assert.equal(listed.status, 200, 'Daftar produk harus merespons 200');
  assert.equal(listed.body.data.length, 3, 'Fixture praktikum berisi tiga produk');
  const product = listed.body.data[0];
  assert.ok(product.stock >= 2, 'Stok produk pertama harus >= 2; restart katalog bila stok demo habis');

  const created = await request('/order-service/orders', {
    method: 'POST',
    body: { customerName: 'Bambang Lab 09', items: [{ productId: product.id, quantity: 2 }] },
  });
  assert.equal(created.status, 201, 'Pembuatan pesanan harus merespons 201');
  assert.equal(created.body.data.total, product.price * 2, 'Harga pesanan harus berasal dari katalog');
  const checked = await request(`/product-service/products/${encodeURIComponent(product.id)}`);
  assert.equal(checked.status, 200);
  assert.equal(checked.body.data.stock, product.stock - 2, 'Stok harus berkurang tepat dua');

  const summary = {
    productId: product.id,
    productCount: listed.body.data.length,
    orderId: created.body.data.id,
    orderStatus: created.status,
    stockBefore: product.stock,
    stockAfter: checked.body.data.stock,
    total: created.body.data.total,
  };
  log(`LULUS: ${summary.productCount} produk, order ${summary.orderStatus}, stok ${summary.stockBefore} -> ${summary.stockAfter}, total Rp${summary.total}.`);
  return { passed: true, summary, exchanges };
}

if (require.main === module) {
  loadLocalEnv();
  runSmokeTest({
    baseUrl: process.env.BASE_URL || `http://127.0.0.1:${process.env.PORT || 8080}`,
    apiKey: process.env.API_KEY,
  }).catch((error) => { console.error(error.message); process.exitCode = 1; });
}

module.exports = { requestJson, formatExchange, runSmokeTest };
