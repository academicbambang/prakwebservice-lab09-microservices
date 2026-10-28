'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createGateway } = require('../gateway/gateway');
const { createCatalogApp } = require('../catalog-service/app');

async function serve(t, app) {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
    app.locals.shutdown?.();
  });
  return `http://127.0.0.1:${server.address().port}`;
}

test('documentation and frontend assets load without spending the API quota', async (t) => {
  const base = await serve(t, createGateway());
  for (const route of ['/app.js', '/styles.css', '/sandbox', '/docs/', '/docs/swagger-ui.css', '/docs/swagger-ui-bundle.js']) {
    const response = await fetch(base + route);
    assert.equal(response.status, 200, route);
    await response.arrayBuffer();
  }
  for (let i = 0; i < 21; i++) {
    const response = await fetch(base + '/openapi.json');
    assert.equal(response.status, 200);
    assert.equal((await response.json()).openapi, '3.0.3');
  }
  for (let i = 0; i < 20; i++) {
    const response = await fetch(base + '/health');
    assert.equal(response.status, 200);
    await response.arrayBuffer();
  }
  const limited = await fetch(base + '/health');
  assert.equal(limited.status, 429);
  await limited.arrayBuffer();
});

test('Apollo Studio can query the public catalog through the gateway', async (t) => {
  const catalogUrl = await serve(t, createCatalogApp());
  const base = await serve(t, createGateway({ catalogUrl }));
  const origin = 'https://studio.apollographql.com';
  const preflight = await fetch(base + '/product-service/graphql', {
    method: 'OPTIONS',
    headers: { origin, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type,apollo-require-preflight' },
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
  assert.equal(preflight.headers.get('access-control-allow-credentials'), null);
  const response = await fetch(base + '/product-service/graphql', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json', 'apollo-require-preflight': 'true' },
    body: JSON.stringify({ query: '{ products { id name stock } }' }),
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), origin);
  const result = await response.json();
  assert.equal(result.data.products.length, 3);
  assert.equal(result.data.products[0].stock, 40);
});

test('CORS support does not grant unrelated origins access to the order API', async (t) => {
  const base = await serve(t, createGateway({ apiKey: 'test-only-key' }));
  for (const origin of ['https://example.invalid', 'https://studio.apollographql.com.evil.invalid']) {
    const response = await fetch(base + '/product-service/graphql', { method: 'OPTIONS', headers: { origin } });
    assert.equal(response.status, 403);
    assert.equal(response.headers.get('access-control-allow-origin'), null);
    await response.arrayBuffer();
  }
  const order = await fetch(base + '/order-service/orders', { headers: { origin: 'https://studio.apollographql.com' } });
  assert.equal(order.status, 401);
  assert.equal(order.headers.get('access-control-allow-origin'), null);
  assert.deepEqual(await order.json(), { error: 'Unauthorized' });
  const secret = await fetch(base + '/.env');
  assert.equal(secret.status, 404);
  assert.deepEqual(await secret.json(), { error: 'Route tidak ditemukan' });
});
