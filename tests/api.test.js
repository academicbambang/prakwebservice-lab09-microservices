'use strict';

const { after, before, test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createCatalogApp } = require('../catalog-service/app');
const { createOrderApp } = require('../order-service/app');
const { createGateway } = require('../gateway/gateway');

let baseUrl = process.env.BASE_URL;
const apiKey = baseUrl ? process.env.API_KEY : 'lab12-local-test-only';
const products = '/product-service/products';
const orders = '/order-service/orders';
const productId = 'prod-001';
const absentId = 'prod-unknown';
const servers = [];
let gateway;

async function listen(app) {
  const server = app.listen(0, '127.0.0.1');
  servers.push(server);
  await once(server, 'listening');
  return `http://127.0.0.1:${server.address().port}`;
}

before(async () => {
  assert.ok(apiKey, 'Set API_KEY for the gateway at BASE_URL');
  if (baseUrl) return;
  const catalogUrl = await listen(createCatalogApp());
  const orderUrl = await listen(createOrderApp({ catalogUrl }));
  gateway = createGateway({ catalogUrl, orderUrl, apiKey });
  baseUrl = await listen(gateway);
});

after(async () => {
  gateway?.locals.shutdown();
  for (const server of servers.reverse()) {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
      server.closeAllConnections();
    });
  }
});

async function request(path, { body, headers = {} } = {}) {
  const response = await fetch(new URL(path, baseUrl), {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
  return { status: response.status, headers: response.headers, body: await response.json() };
}

function createOrder(id = productId, quantity = 1, headers) {
  return request(orders, { body: { customerName: 'Uji Lab 12', items: [{ productId: id, quantity }] }, headers });
}

test('GET products returns a nonempty catalog with typed fields', async () => {
  const response = await request(products);
  assert.equal(response.status, 200);
  assert.ok(Array.isArray(response.body.data) && response.body.data.length > 0);
  for (const product of response.body.data) {
    assert.equal(typeof product.id, 'string');
    assert.equal(typeof product.name, 'string');
    assert.equal(typeof product.price, 'number');
    assert.equal(typeof product.stock, 'number');
  }
});

test('GET product detail returns the requested product', async () => {
  const response = await request(`${products}/${productId}`);
  assert.equal(response.status, 200);
  assert.equal(response.body.data.id, productId);
});

test('GET unknown product returns 404', async () => {
  const response = await request(`${products}/${absentId}`);
  assert.equal(response.status, 404);
  assert.ok(response.body.error);
});

test('POST order returns 201 and decreases stock by the requested quantity', async () => {
  const before = await request(`${products}/${productId}`);
  assert.equal(before.status, 200);
  const response = await createOrder();
  assert.equal(response.status, 201);
  const order = response.body.data;
  assert.equal(order.items[0].productId, productId);
  assert.equal(order.items[0].quantity, 1);
  assert.equal(order.total, before.body.data.price);
  const after = await request(`${products}/${productId}`);
  assert.equal(after.status, 200);
  assert.equal(after.body.data.stock, before.body.data.stock - 1);
});

test('POST order over available stock returns 409', async () => {
  const response = await createOrder(productId, 100);
  assert.equal(response.status, 409);
  assert.match(response.body.error, /Insufficient stock/);
});

test('POST order with invalid quantities returns 400', async () => {
  for (const quantity of [0, 'abc']) {
    const response = await createOrder(productId, quantity);
    assert.equal(response.status, 400);
    assert.ok(response.body.error);
  }
});

test('POST order for an unknown product returns 404', async () => {
  const response = await createOrder(absentId);
  assert.equal(response.status, 404);
  assert.ok(response.body.error);
});

test('GET orders includes a newly created order', async () => {
  const created = await createOrder();
  assert.equal(created.status, 201);
  const response = await request(orders);
  assert.equal(response.status, 200);
  assert.ok(response.body.data.some(({ id }) => id === created.body.data.id));
});

test('GET product health through the gateway reports ok', async () => {
  const response = await request('/product-service/health');
  assert.equal(response.status, 200);
  assert.equal(response.body.status, 'ok');
});

test('POST order generates and preserves X-Request-Id', async () => {
  const generated = await createOrder();
  assert.equal(generated.status, 201);
  assert.match(generated.headers.get('x-request-id') || '', /^[\da-f-]{36}$/i);

  const id = 'lab12-client-request';
  const preserved = await createOrder(productId, 1, { 'X-Request-Id': id });
  assert.equal(preserved.status, 201);
  assert.equal(preserved.headers.get('x-request-id'), id);
});
