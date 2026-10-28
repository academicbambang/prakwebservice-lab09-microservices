'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createCatalogApp } = require('../catalog-service/app');
const { products } = require('../catalog-service/products');
const { createOrderApp } = require('../order-service/app');
const { OrderError, validateOrderInput, priceOrder } = require('../order-service/order');

async function serve(t, app) {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeAllConnections();
  }));
  return `http://127.0.0.1:${server.address().port}`;
}

function input(quantity = 1, extra = {}) {
  return { customerName: 'Siti', items: [{ productId: 'prod-001', quantity }], ...extra };
}

function fixtureFetch(url, options = {}) {
  const pathname = new URL(url).pathname;
  const productId = decodeURIComponent(pathname.split('/')[2]);
  const product = products.find((entry) => entry.id === productId);
  const qty = JSON.parse(options.body || '{}').qty;
  const status = !product ? 404 : qty > product.stock ? 409 : 200;
  const payload = status === 404 ? { error: 'Product not found' }
    : status === 409 ? { error: 'Insufficient stock' }
      : { data: { ...product, stock: product.stock - qty } };
  return Promise.resolve(new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  }));
}

function postJson(url, body) {
  return fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('BVA: quantity accepts the inclusive limits 1 and 100', () => {
  for (const quantity of [1, 100]) {
    assert.equal(validateOrderInput(input(quantity)).items[0].quantity, quantity);
  }
});

test('BVA/EP: quantity rejects outside limits, fractions, and invalid types', () => {
  for (const quantity of [-1, 0, 101, 1.5, '1', true, null, undefined, NaN, Infinity]) {
    const body = input(1, { items: [{ productId: 'prod-001', quantity }] });
    assert.throws(() => validateOrderInput(body), OrderError, `quantity: ${String(quantity)}`);
  }
});

test('BVA: customerName requires 1 to 100 characters after trimming', () => {
  assert.equal(validateOrderInput(input(1, { customerName: '  S  ' })).customerName, 'S');
  assert.equal(validateOrderInput(input(1, { customerName: 'S'.repeat(100) })).customerName.length, 100);
  for (const customerName of ['', '   ', 'S'.repeat(101), null, 123]) {
    assert.throws(() => validateOrderInput(input(1, { customerName })), OrderError);
  }
});

test('BVA: items accepts 1 and 50 entries and rejects 0 or 51', () => {
  const item = { productId: 'prod-001', quantity: 1 };
  assert.equal(validateOrderInput(input()).items.length, 1);
  assert.equal(validateOrderInput(input(1, { items: Array(50).fill(item) })).items.length, 50);
  for (const items of [[], Array(51).fill(item), null, 'prod-001']) {
    assert.throws(() => validateOrderInput(input(1, { items })), OrderError);
  }
});

test('EP: invalid bodies and product identifiers are rejected', () => {
  for (const body of [undefined, null, [], 'order']) {
    assert.throws(() => validateOrderInput(body), OrderError);
  }
  for (const item of [null, [], {}, { productId: ' ', quantity: 1 }, { productId: 1, quantity: 1 }]) {
    assert.throws(() => validateOrderInput(input(1, { items: [item] })), OrderError);
  }
});

test('prices and totals come from catalog values; client price fields are ignored', () => {
  const normalized = validateOrderInput({
    customerName: 'Siti',
    items: [
      { productId: 'prod-001', quantity: 2, unitPrice: 1, subtotal: 2 },
      { productId: 'prod-002', quantity: 1, price: 1 },
    ],
    total: 3,
  });
  const priced = priceOrder(normalized.items, new Map(products.map((product) => [product.id, product])));
  assert.deepEqual(priced.items.map(({ unitPrice, subtotal }) => ({ unitPrice, subtotal })), [
    { unitPrice: 85000, subtotal: 170000 },
    { unitPrice: 120000, subtotal: 120000 },
  ]);
  assert.equal(priced.total, 290000);
});

test('stock checks count repeated products together', () => {
  const items = [
    { productId: 'prod-001', quantity: 25 },
    { productId: 'prod-001', quantity: 16 },
  ];
  assert.throws(() => priceOrder(items, new Map(products.map((product) => [product.id, product]))), /Insufficient stock/);
  items[1].quantity = 15;
  assert.equal(priceOrder(items, new Map(products.map((product) => [product.id, product]))).total, 3400000);
});

test('malformed upstream prices are rejected instead of being used in totals', () => {
  const invalidProduct = { ...products[0], price: '85000' };
  assert.throws(() => priceOrder(input().items, new Map([[invalidProduct.id, invalidProduct]])), {
    status: 502,
  });
});

test('catalog REST exposes products, case-insensitive filters, and JSON errors', async (t) => {
  const base = await serve(t, createCatalogApp());
  assert.deepEqual(await (await fetch(`${base}/health`)).json(), { status: 'ok', service: 'catalog-service' });
  const all = await (await fetch(`${base}/products`)).json();
  assert.equal(all.service, 'catalog-service');
  assert.equal(all.data.length, 3);
  const filtered = await (await fetch(`${base}/products?category=KULINER&search=arabika`)).json();
  assert.deepEqual(filtered.data.map((product) => product.id), ['prod-001']);
  assert.deepEqual((await (await fetch(`${base}/products?category=no-match`)).json()).data, []);
  assert.equal((await (await fetch(`${base}/products/prod-002`)).json()).data.price, 120000);
  for (const route of ['/products/unknown', '/missing']) {
    const response = await fetch(`${base}${route}`);
    assert.equal(response.status, 404);
    assert.equal(typeof (await response.json()).error, 'string');
  }
  assert.equal((await fetch(`${base}/products?search=a&search=b`)).status, 400);
});

test('GraphQL POST selects requested fields and supports variables', async (t) => {
  const base = await serve(t, createCatalogApp());
  const response = await postJson(`${base}/graphql`, {
    query: 'query Catalog($category: String!) { products(category: $category) { id name price } }',
    variables: { category: 'KULINER' },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    data: { products: [{ id: 'prod-001', name: 'Kopi Arabika Gayo', price: 85000 }] },
  });
});

test('GraphQL GET returns one product and null for an unknown ID', async (t) => {
  const base = await serve(t, createCatalogApp());
  const query = '{ product(id: "prod-003") { id stock } missing: product(id: "unknown") { id } }';
  const response = await fetch(`${base}/graphql?${new URLSearchParams({ query })}`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { data: { product: { id: 'prod-003', stock: 30 }, missing: null } });
});

test('GraphQL reports invalid field selection using standard GraphQL errors', async (t) => {
  const base = await serve(t, createCatalogApp());
  const response = await postJson(`${base}/graphql`, { query: '{ products { secretField } }' });
  const body = await response.json();
  assert.ok(Array.isArray(body.errors));
  assert.match(body.errors[0].message, /secretField/);
});

test('order REST creates an authoritative total, Location, detail, and list', async (t) => {
  const base = await serve(t, createOrderApp({ fetchImpl: fixtureFetch }));
  assert.deepEqual(await (await fetch(`${base}/health`)).json(), { status: 'ok', service: 'order-service' });
  const response = await postJson(`${base}/orders`, {
    customerName: ' Siti ',
    items: [{ productId: 'prod-001', quantity: 2, unitPrice: 1 }],
    total: 2,
  });
  assert.equal(response.status, 201);
  const { data: order } = await response.json();
  assert.match(order.id, /^ord-/);
  assert.equal(order.customerName, 'Siti');
  assert.equal(order.status, 'pending');
  assert.equal(order.total, 170000);
  assert.equal(order.items[0].unitPrice, 85000);
  assert.equal(Number.isNaN(Date.parse(order.createdAt)), false);
  assert.equal(response.headers.get('location'), `/orders/${order.id}`);
  assert.deepEqual((await (await fetch(`${base}${response.headers.get('location')}`)).json()).data, order);
  const list = await (await fetch(`${base}/orders`)).json();
  assert.equal(list.service, 'order-service');
  assert.deepEqual(list.data, [order]);
});

test('each order app has independent in-memory state', async (t) => {
  const first = await serve(t, createOrderApp({ fetchImpl: fixtureFetch }));
  const second = await serve(t, createOrderApp({ fetchImpl: fixtureFetch }));
  assert.equal((await postJson(`${first}/orders`, input())).status, 201);
  assert.deepEqual((await (await fetch(`${second}/orders`)).json()).data, []);
});

test('invalid orders, unknown products, and insufficient stock return 400/404/409 and create no orders', async (t) => {
  const base = await serve(t, createOrderApp({ fetchImpl: fixtureFetch }));
  const invalidOrders = [
    [input(0), 400],
    [input(1, { items: [{ productId: 'unknown', quantity: 1 }] }), 404],
    [input(41), 409],
  ];
  for (const [body, status] of invalidOrders) {
    const response = await postJson(`${base}/orders`, body);
    assert.equal(response.status, status);
    assert.equal(typeof (await response.json()).error, 'string');
  }
  assert.deepEqual((await (await fetch(`${base}/orders`)).json()).data, []);
});

test('upstream network failure returns 503 and keeps the order list empty', async (t) => {
  const base = await serve(t, createOrderApp({ fetchImpl: async () => { throw new Error('offline'); } }));
  const response = await postJson(`${base}/orders`, input());
  assert.equal(response.status, 503);
  assert.equal(typeof (await response.json()).error, 'string');
  assert.deepEqual((await (await fetch(`${base}/orders`)).json()).data, []);
});

test('upstream HTTP failure returns 503 while invalid product data returns 502', async (t) => {
  for (const [fetchImpl, status] of [
    [async () => new Response('{}', { status: 500 }), 503],
    [async () => new Response(JSON.stringify({ data: { id: 'prod-001', price: -1 } })), 502],
  ]) {
    const base = await serve(t, createOrderApp({ fetchImpl }));
    const response = await postJson(`${base}/orders`, input());
    assert.equal(response.status, status);
    assert.equal(typeof (await response.json()).error, 'string');
  }
});

test('order service calls the configured catalog URL with an abort signal', async (t) => {
  let calledUrl;
  let calledOptions;
  const base = await serve(t, createOrderApp({
    catalogUrl: 'http://catalog.internal:9999/',
    fetchImpl: (url, options) => {
      calledUrl = url;
      calledOptions = options;
      return fixtureFetch(url, options);
    },
  }));
  assert.equal((await postJson(`${base}/orders`, input())).status, 201);
  assert.equal(calledUrl, 'http://catalog.internal:9999/products/prod-001/reserve');
  assert.equal(calledOptions.method, 'POST');
  assert.deepEqual(JSON.parse(calledOptions.body), { qty: 1 });
  assert.ok(calledOptions.signal instanceof AbortSignal);
});

test('unknown order and unknown routes return JSON 404', async (t) => {
  const base = await serve(t, createOrderApp({ fetchImpl: fixtureFetch }));
  for (const route of ['/orders/unknown', '/missing']) {
    const response = await fetch(`${base}${route}`);
    assert.equal(response.status, 404);
    assert.equal(typeof (await response.json()).error, 'string');
  }
});

test('both services reject malformed JSON with a JSON 400 response', async (t) => {
  for (const [app, route] of [[createCatalogApp(), '/graphql'], [createOrderApp(), '/orders']]) {
    const base = await serve(t, app);
    const response = await fetch(`${base}${route}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{invalid',
    });
    assert.equal(response.status, 400);
    assert.equal(typeof (await response.json()).error, 'string');
  }
});
