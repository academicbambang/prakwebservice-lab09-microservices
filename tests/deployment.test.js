'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const express = require('express');
const { createGateway } = require('../gateway/gateway');
const { readConfig } = require('../gateway/config');
const { buildProcessConfigs } = require('../scripts/start');

async function serve(t, app) {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeAllConnections();
    app.locals.shutdown?.();
  }));
  return `http://127.0.0.1:${server.address().port}`;
}

function upstream(status = 200) {
  const app = express();
  app.get('/health', (_req, res) => res.status(status).json({ status: status === 200 ? 'ok' : 'unavailable' }));
  app.get('/products', (_req, res) => res.json({ data: [] }));
  return app;
}

test('gateway readiness succeeds only when both upstream health checks succeed', async (t) => {
  const catalogUrl = await serve(t, upstream());
  const orderUrl = await serve(t, upstream());
  const gatewayUrl = await serve(t, createGateway({ catalogUrl, orderUrl }));
  const response = await fetch(`${gatewayUrl}/readyz`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { status: 'ok', service: 'gateway' });
});

test('gateway readiness returns 503 when either upstream reports an error', async (t) => {
  const healthyUrl = await serve(t, upstream());
  const unhealthyUrl = await serve(t, upstream(503));
  for (const [catalogUrl, orderUrl] of [[healthyUrl, unhealthyUrl], [unhealthyUrl, healthyUrl]]) {
    const gatewayUrl = await serve(t, createGateway({ catalogUrl, orderUrl }));
    const response = await fetch(`${gatewayUrl}/readyz`);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { status: 'unavailable', service: 'gateway' });
  }
});

test('gateway readiness stops waiting for an unresponsive upstream', async (t) => {
  const hanging = express();
  hanging.get('/health', () => {});
  const catalogUrl = await serve(t, hanging);
  const orderUrl = await serve(t, upstream());
  const gatewayUrl = await serve(t, createGateway({ catalogUrl, orderUrl }));
  const response = await fetch(`${gatewayUrl}/readyz`, { signal: AbortSignal.timeout(4000) });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { status: 'unavailable', service: 'gateway' });
});

test('readiness probes neither use nor depend on the API rate-limit quota', async (t) => {
  const catalogUrl = await serve(t, upstream());
  const orderUrl = await serve(t, upstream());
  const gatewayUrl = await serve(t, createGateway({ catalogUrl, orderUrl }));
  for (let i = 0; i < 21; i++) {
    const response = await fetch(`${gatewayUrl}/readyz`);
    assert.equal(response.status, 200);
    await response.arrayBuffer();
  }
  for (let i = 0; i < 20; i++) {
    const response = await fetch(`${gatewayUrl}/catalog/products`);
    assert.equal(response.status, 200);
    await response.arrayBuffer();
  }
  const limited = await fetch(`${gatewayUrl}/catalog/products`);
  assert.equal(limited.status, 429);
  await limited.arrayBuffer();
  const ready = await fetch(`${gatewayUrl}/readyz`);
  assert.equal(ready.status, 200);
  assert.deepEqual(await ready.json(), { status: 'ok', service: 'gateway' });
});

test('stack exposes only the gateway host and connects backends through their configured loopback ports', () => {
  const processes = buildProcessConfigs({
    HOST: '0.0.0.0',
    PORT: '10000',
    CATALOG_PORT: '3100',
    ORDER_PORT: '3101',
    CATALOG_SERVICE_URL: 'https://unused.example.com',
    ORDER_SERVICE_URL: 'https://unused.example.com',
  });
  const catalog = processes.find(({ file }) => file === 'catalog-service/server.js');
  const order = processes.find(({ file }) => file === 'order-service/server.js');
  const gateway = processes.find(({ file }) => file === 'gateway/gateway.js');
  assert.equal(catalog.env.HOST, '127.0.0.1');
  assert.equal(order.env.HOST, '127.0.0.1');
  assert.equal(catalog.env.CATALOG_PORT, '3100');
  assert.equal(order.env.ORDER_PORT, '3101');
  assert.equal(order.env.CATALOG_SERVICE_URL, 'http://127.0.0.1:3100');
  assert.deepEqual(readConfig(gateway.env), {
    port: 10000,
    host: '0.0.0.0',
    catalogUrl: 'http://127.0.0.1:3100',
    orderUrl: 'http://127.0.0.1:3101',
    apiKey: '',
    apiKeyHash: '',
    trustProxy: 0,
  });
  const localGateway = buildProcessConfigs({}).find(({ file }) => file === 'gateway/gateway.js');
  assert.equal(readConfig(localGateway.env).host, '127.0.0.1');
  assert.equal(readConfig(localGateway.env).port, 8080);
});
