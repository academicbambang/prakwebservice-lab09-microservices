'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const express = require('express');
const { buildSchema, parse, validate } = require('graphql');
const { mountApiDocs } = require('../gateway/api-docs');

async function serve(t, app) {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeAllConnections();
  }));
  return `http://127.0.0.1:${server.address().port}`;
}

async function documentation(t) {
  const app = express();
  mountApiDocs(app);
  return serve(t, app);
}

test('OpenAPI describes deployed-origin routes, authentication, and validation boundaries', async (t) => {
  const base = await documentation(t);
  const response = await fetch(`${base}/openapi.json`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /application\/json/);
  const spec = await response.json();
  assert.equal(spec.openapi, '3.0.3');
  assert.equal(spec.servers[0].url, '/');
  assert.deepEqual(spec.components.securitySchemes.ApiKeyAuth, {
    type: 'apiKey', in: 'header', name: 'X-API-Key',
    description: spec.components.securitySchemes.ApiKeyAuth.description,
  });
  for (const route of [
    '/order-service/health', '/order-service/orders', '/order-service/orders/{id}',
    '/product-service/products/{id}/reserve', '/product-service/reservations',
  ]) {
    for (const operation of Object.values(spec.paths[route])) {
      assert.deepEqual(operation.security, [{ ApiKeyAuth: [] }], route);
      assert.ok(operation.responses['401'], route);
    }
  }
  for (const [route, method] of [
    ['/product-service/products', 'get'], ['/product-service/graphql', 'get'],
    ['/product-service/graphql', 'post'], ['/readyz', 'get'],
  ]) {
    assert.deepEqual(spec.paths[route][method].security, [], `${method} ${route}`);
  }
  const orderPost = spec.paths['/order-service/orders'].post;
  for (const status of ['201', '400', '401', '404', '409', '413', '429', '502', '503']) {
    assert.ok(orderPost.responses[status], status);
  }
  assert.equal(spec.components.schemas.OrderItemInput.properties.quantity.minimum, 1);
  assert.equal(spec.components.schemas.OrderItemInput.properties.quantity.maximum, 100);
  assert.equal(spec.components.schemas.OrderInput.properties.items.maxItems, 50);
  assert.equal(spec.components.schemas.ReserveInput.properties.qty.minimum, 1);
  assert.equal(spec.components.schemas.Product.properties.stock.minimum, 0);
  assert.ok(!spec.paths['/readyz'].get.responses['429']);
});

test('all documented schema references resolve and operation IDs are unique', async (t) => {
  const base = await documentation(t);
  const spec = await (await fetch(`${base}/openapi.json`)).json();
  const ids = new Set();
  for (const [route, item] of Object.entries(spec.paths)) {
    for (const [method, operation] of Object.entries(item)) {
      if (!['get', 'post', 'put', 'patch', 'delete', 'options', 'head'].includes(method)) continue;
      assert.ok(operation.operationId, `${method} ${route}`);
      assert.ok(!ids.has(operation.operationId), operation.operationId);
      ids.add(operation.operationId);
      assert.ok(Object.keys(operation.responses).length > 0, route);
    }
  }
  function walk(value) {
    if (!value || typeof value !== 'object') return;
    if (typeof value.$ref === 'string') {
      assert.ok(value.$ref.startsWith('#/'), `unexpected remote ref: ${value.$ref}`);
      const target = value.$ref.slice(2).split('/').reduce((node, key) => node?.[key.replace(/~1/g, '/').replace(/~0/g, '~')], spec);
      assert.ok(target, `unresolved ref: ${value.$ref}`);
    }
    for (const child of Object.values(value)) walk(child);
  }
  walk(spec);
});

test('Swagger UI loads local assets and initializes this gateway specification', async (t) => {
  const base = await documentation(t);
  const redirect = await fetch(`${base}/docs`, { redirect: 'manual' });
  assert.equal(redirect.status, 302);
  assert.equal(redirect.headers.get('location'), '/docs/');
  const page = await fetch(`${base}/docs/`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type'), /text\/html/);
  const html = await page.text();
  assert.match(html, /\/docs\/swagger-ui\.css/);
  assert.match(html, /\/docs\/swagger-ui-bundle\.js/);
  assert.match(html, /href="\/sandbox"/);
  const css = await fetch(`${base}/docs/swagger-ui.css`);
  assert.equal(css.status, 200);
  assert.match(css.headers.get('content-type'), /text\/css/);
  assert.match(await css.text(), /swagger-ui/);
  const bundle = await fetch(`${base}/docs/swagger-ui-bundle.js`);
  assert.equal(bundle.status, 200);
  assert.match(bundle.headers.get('content-type'), /javascript/);
  assert.ok((await bundle.arrayBuffer()).byteLength > 100000);

  const scriptResponse = await fetch(`${base}/docs/swagger-initializer.js`);
  assert.equal(scriptResponse.status, 200);
  const script = await scriptResponse.text();
  let configured;
  const SwaggerUIBundle = Object.assign((config) => { configured = config; }, { presets: { apis: {} } });
  vm.runInNewContext(script, {
    SwaggerUIBundle,
    window: { addEventListener: (_event, callback) => callback() },
  });
  assert.equal(configured.url, '/openapi.json');
  assert.equal(configured.validatorUrl, null);
  assert.equal(configured.persistAuthorization, false);
});

test('reading documentation does not reach a limiter mounted after it', async (t) => {
  const app = express();
  mountApiDocs(app);
  let apiCalls = 0;
  app.use((_req, res) => {
    apiCalls += 1;
    res.status(429).json({ error: 'API limiter fixture' });
  });
  const base = await serve(t, app);
  for (let i = 0; i < 25; i += 1) {
    const response = await fetch(`${base}${i % 2 ? '/docs/' : '/openapi.json'}`);
    assert.equal(response.status, 200);
    await response.arrayBuffer();
  }
  assert.equal(apiCalls, 0);
  assert.equal((await fetch(`${base}/product-service/products`)).status, 429);
  assert.equal(apiCalls, 1);
});

test('Apollo embed targets the current gateway and preloads a valid catalog query', () => {
  const html = readFileSync(path.join(__dirname, '../gateway/public/sandbox.html'), 'utf8');
  assert.match(html, /https:\/\/embeddable-sandbox\.cdn\.apollographql\.com\/_latest\/embeddable-sandbox\.umd\.production\.min\.js/);
  const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]).join('\n');
  const schema = buildSchema(readFileSync(path.join(__dirname, '../catalog-service/schema.graphql'), 'utf8'));
  for (const origin of ['http://127.0.0.1:8080', 'https://lab09.example.com']) {
    const elements = Object.fromEntries(['endpoint-label', 'studio-link', 'load-error'].map((id) => [id, { hidden: true }]));
    let config;
    vm.runInNewContext(inline, {
      URL,
      document: { getElementById: (id) => elements[id] },
      window: { location: { origin }, EmbeddedSandbox: function EmbeddedSandbox(options) { config = options; } },
    });
    assert.equal(config.initialEndpoint, `${origin}/product-service/graphql`);
    assert.equal(config.initialState.pollForSchemaUpdates, false);
    assert.equal(config.initialState.includeCookies, false);
    assert.equal(config.endpointIsEditable, false);
    assert.deepEqual(validate(schema, parse(config.initialState.document)), []);
    assert.equal(elements['endpoint-label'].textContent, config.initialEndpoint);
    const studio = new URL(elements['studio-link'].href);
    assert.equal(studio.origin, 'https://studio.apollographql.com');
    assert.equal(studio.searchParams.get('endpoint'), config.initialEndpoint);
    assert.equal(studio.searchParams.get('document'), config.initialState.document);
  }
});

test('Apollo page offers a readable fallback when the CDN cannot load', () => {
  const html = readFileSync(path.join(__dirname, '../gateway/public/sandbox.html'), 'utf8');
  const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]).join('\n');
  const elements = Object.fromEntries(['endpoint-label', 'studio-link', 'load-error'].map((id) => [id, { hidden: true }]));
  vm.runInNewContext(inline, {
    URL,
    document: { getElementById: (id) => elements[id] },
    window: { location: { origin: 'http://127.0.0.1:8080' } },
  });
  assert.equal(elements['load-error'].hidden, false);
  assert.match(html, /koneksi internet/);
});
