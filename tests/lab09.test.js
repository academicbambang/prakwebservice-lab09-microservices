'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const express = require('express');
const { createCatalogApp } = require('../catalog-service/app');
const { createOrderApp } = require('../order-service/app');
const { createGateway } = require('../gateway/gateway');

async function close(server) {
  if (!server.listening) return;
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeAllConnections();
  });
}

async function serve(t, app, port = 0) {
  const server = app.listen(port, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await close(server);
    app.locals.shutdown?.();
  });
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}

function postJson(url, body, headers = {}) {
  return fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(6000),
  });
}

function order(quantity = 1, items = [{ productId: 'prod-001', quantity }]) {
  return { customerName: 'Bambang Lab 09', items };
}

async function product(base, id = 'prod-001') {
  const response = await fetch(`${base}/products/${id}`);
  assert.equal(response.status, 200);
  return (await response.json()).data;
}

async function services(t) {
  const catalog = await serve(t, createCatalogApp());
  const orders = await serve(t, createOrderApp({ catalogUrl: catalog.url }));
  return { catalog, orders };
}

test('reserve validates quantity without changing stock and reports unknown products', async (t) => {
  const { url } = await serve(t, createCatalogApp());
  for (const qty of [undefined, null, true, '1', 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    const response = await postJson(`${url}/products/prod-001/reserve`, { qty });
    assert.equal(response.status, 400, `qty: ${String(qty)}`);
    assert.equal(typeof (await response.json()).error, 'string');
  }
  assert.equal((await postJson(`${url}/products/unknown/reserve`, { qty: 1 })).status, 404);
  assert.equal((await product(url)).stock, 40);
});

test('reserve accepts the final available unit and rejects overselling with 409', async (t) => {
  const { url } = await serve(t, createCatalogApp());
  const reserved = await postJson(`${url}/products/prod-001/reserve`, { qty: 40 });
  assert.equal(reserved.status, 200);
  assert.equal((await reserved.json()).data.stock, 0);
  const rejected = await postJson(`${url}/products/prod-001/reserve`, { qty: 1 });
  assert.equal(rejected.status, 409);
  assert.equal(typeof (await rejected.json()).error, 'string');
  assert.equal((await product(url)).stock, 0);
});

test('each catalog app owns independent stock and GraphQL sees REST reservations', async (t) => {
  const first = await serve(t, createCatalogApp());
  const second = await serve(t, createCatalogApp());
  assert.equal((await postJson(`${first.url}/products/prod-001/reserve`, { qty: 2 })).status, 200);
  assert.equal((await product(first.url)).stock, 38);
  assert.equal((await product(second.url)).stock, 40);
  const graphql = await postJson(`${first.url}/graphql`, {
    query: '{ product(id: "prod-001") { stock } products(search: "kopi") { stock } }',
  });
  assert.equal(graphql.status, 200);
  assert.deepEqual(await graphql.json(), {
    data: { product: { stock: 38 }, products: [{ stock: 38 }] },
  });
});

test('batch reservation counts duplicate product IDs and deducts each product once', async (t) => {
  const { url } = await serve(t, createCatalogApp());
  const response = await postJson(`${url}/reservations`, {
    items: [
      { productId: 'prod-001', quantity: 2 },
      { productId: 'prod-001', quantity: 3 },
      { productId: 'prod-002', quantity: 1 },
    ],
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.length, 2);
  assert.equal((await product(url)).stock, 35);
  assert.equal((await product(url, 'prod-002')).stock, 14);
});

test('rejected batch reservations never deduct stock from other products', async (t) => {
  const { url } = await serve(t, createCatalogApp());
  for (const [lastItem, status] of [
    [{ productId: 'prod-002', quantity: 16 }, 409],
    [{ productId: 'unknown', quantity: 1 }, 404],
    [{ productId: 'prod-002', quantity: 0 }, 400],
  ]) {
    const response = await postJson(`${url}/reservations`, {
      items: [{ productId: 'prod-001', quantity: 2 }, lastItem],
    });
    assert.equal(response.status, status);
    assert.equal((await product(url)).stock, 40);
    assert.equal((await product(url, 'prod-002')).stock, 15);
  }
  const duplicateOverflow = await postJson(`${url}/reservations`, {
    items: [{ productId: 'prod-001', quantity: 25 }, { productId: 'prod-001', quantity: 16 }],
  });
  assert.equal(duplicateOverflow.status, 409);
  assert.equal((await product(url)).stock, 40);
});

test('real order service can reserve all remaining stock and then returns 409', async (t) => {
  const { catalog, orders } = await services(t);
  const created = await postJson(`${orders.url}/orders`, order(40));
  assert.equal(created.status, 201);
  const snapshot = (await created.json()).data;
  assert.equal(snapshot.total, 3400000);
  assert.equal(snapshot.items[0].name, 'Kopi Arabika Gayo');
  assert.equal(snapshot.items[0].unitPrice, 85000);
  assert.equal((await product(catalog.url)).stock, 0);
  assert.equal((await postJson(`${orders.url}/orders`, order())).status, 409);
  assert.deepEqual((await (await fetch(`${orders.url}/orders`)).json()).data, [snapshot]);
});

test('concurrent orders cannot oversell the same catalog stock', async (t) => {
  const { catalog, orders } = await services(t);
  const responses = await Promise.all([
    postJson(`${orders.url}/orders`, order(25)),
    postJson(`${orders.url}/orders`, order(25)),
  ]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [201, 409]);
  for (const response of responses) await response.arrayBuffer();
  assert.equal((await product(catalog.url)).stock, 15);
  const stored = (await (await fetch(`${orders.url}/orders`)).json()).data;
  assert.equal(stored.length, 1);
  assert.equal(stored[0].items[0].quantity, 25);
});

test('orders with repeated and multiple products reserve aggregate quantities and authoritative prices', async (t) => {
  const { catalog, orders } = await services(t);
  const response = await postJson(`${orders.url}/orders`, {
    ...order(1, [
      { productId: 'prod-001', quantity: 2, unitPrice: 1 },
      { productId: 'prod-001', quantity: 3 },
      { productId: 'prod-002', quantity: 1 },
    ]),
    total: 1,
  });
  assert.equal(response.status, 201);
  assert.equal((await response.json()).data.total, 545000);
  assert.equal((await product(catalog.url)).stock, 35);
  assert.equal((await product(catalog.url, 'prod-002')).stock, 14);
});

test('invalid multi-product orders leave both catalog stock and order history intact', async (t) => {
  const { catalog, orders } = await services(t);
  for (const [lastItem, status] of [
    [{ productId: 'prod-002', quantity: 16 }, 409],
    [{ productId: 'unknown', quantity: 1 }, 404],
  ]) {
    const response = await postJson(`${orders.url}/orders`, order(1, [
      { productId: 'prod-001', quantity: 2 }, lastItem,
    ]));
    assert.equal(response.status, status);
    assert.equal((await product(catalog.url)).stock, 40);
    assert.equal((await product(catalog.url, 'prod-002')).stock, 15);
  }
  assert.deepEqual((await (await fetch(`${orders.url}/orders`)).json()).data, []);
});

test('duplicate-only order reserves the summed quantity through the single-product endpoint', async (t) => {
  const { catalog, orders } = await services(t);
  const response = await postJson(`${orders.url}/orders`, order(1, [
    { productId: 'prod-001', quantity: 20 },
    { productId: 'prod-001', quantity: 20 },
  ]));
  assert.equal(response.status, 201);
  assert.equal((await response.json()).data.total, 3400000);
  assert.equal((await product(catalog.url)).stock, 0);
});

test('through gateway: catalog failure gives POST 503, keeps GET 200, and restart restores POST 201', async (t) => {
  const { catalog, orders } = await services(t);
  const apiKey = 'lab09-test-only-key';
  const headers = { 'x-api-key': apiKey };
  const gateway = await serve(t, createGateway({ catalogUrl: catalog.url, orderUrl: orders.url, apiKey }));
  const created = await postJson(`${gateway.url}/order-service/orders`, order(2), headers);
  assert.equal(created.status, 201);
  const original = (await created.json()).data;
  const catalogPort = catalog.server.address().port;
  await close(catalog.server);

  const failed = await postJson(`${gateway.url}/order-service/orders`, order(), headers);
  assert.equal(failed.status, 503);
  assert.equal(typeof (await failed.json()).error, 'string');
  const surviving = await fetch(`${gateway.url}/order-service/orders`, { headers });
  assert.equal(surviving.status, 200);
  assert.deepEqual((await surviving.json()).data, [original]);

  const restarted = await serve(t, createCatalogApp(), catalogPort);
  assert.equal((await product(restarted.url)).stock, 40);
  const recovered = await postJson(`${gateway.url}/order-service/orders`, order(2), headers);
  assert.equal(recovered.status, 201);
  await recovered.arrayBuffer();
  assert.equal((await product(restarted.url)).stock, 38);
  const history = (await (await fetch(`${gateway.url}/order-service/orders`, { headers })).json()).data;
  assert.equal(history.length, 2);
  assert.deepEqual(history[0], original);
});

test('the 2-second catalog timeout includes waiting for response headers and body', async (t) => {
  for (const flushHeaders of [false, true]) {
    await t.test(flushHeaders ? 'response body stalls after headers' : 'response headers never arrive', async (subtest) => {
      const hanging = express();
      hanging.post('/products/:id/reserve', (_req, res) => {
        if (flushHeaders) {
          res.setHeader('content-type', 'application/json');
          res.flushHeaders();
          res.write('{"data":');
        }
      });
      const catalog = await serve(subtest, hanging);
      const orders = await serve(subtest, createOrderApp({ catalogUrl: catalog.url }));
      const started = performance.now();
      const response = await postJson(`${orders.url}/orders`, order());
      const elapsed = performance.now() - started;
      assert.equal(response.status, 503);
      assert.ok(elapsed >= 1500 && elapsed < 4500, `timeout took ${Math.round(elapsed)}ms`);
      assert.equal(typeof (await response.json()).error, 'string');
      assert.deepEqual((await (await fetch(`${orders.url}/orders`)).json()).data, []);
    });
  }
});
