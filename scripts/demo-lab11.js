'use strict';
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { randomBytes } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const Parser = require('@apidevtools/swagger-parser');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const Converter = require('openapi-to-postmanv2');
const { chromium } = require('playwright');
const { createCatalogApp } = require('../catalog-service/app');
const { createOrderApp } = require('../order-service/app');
const { createGateway } = require('../gateway/gateway');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'docs/evidence/lab11');

async function listen(app, port = 0) {
  const server = app.listen(port, '127.0.0.1');
  await once(server, 'listening');
  return server;
}
async function close(server) {
  if (!server?.listening) return;
  await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
}
const origin = (server) => `http://127.0.0.1:${server.address().port}`;
const save = (name, data) => fs.writeFileSync(path.join(output, name), JSON.stringify(data, null, 2) + '\n');

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const key = randomBytes(24).toString('hex');
  let catalog, orders, gateway, browser, gatewayApp;
  const driftFile = path.join(root, 'catalog-service/app.lab11-drift.local.cjs');
  try {
    // Reenact the lab's drift on an isolated copy: category already exists in Lab 09 data.
    let driftSource = fs.readFileSync(path.join(root, 'catalog-service/app.js'), 'utf8').replace(/\r\n/g, '\n');
    driftSource = driftSource.replace(' *       - category\n', '')
      .replace(' *         category:\n *           type: string\n', '')
      .replaceAll(' *         category: kuliner\n', '')
      .replaceAll(' *                 category: kuliner\n', '')
      .replaceAll(' *               category: kuliner\n', '');
    driftSource = driftSource.replace(/^ \* +category: kuliner\n/gm, '');
    fs.writeFileSync(driftFile, driftSource);
    const driftModule = require(driftFile);
    assert.ok(!driftModule.specification.components.schemas.Product.properties.category);
    catalog = await listen(driftModule.createCatalogApp());
    const catalogPort = catalog.address().port;
    orders = await listen(createOrderApp({ catalogUrl: origin(catalog) }));
    gatewayApp = createGateway({ catalogUrl: origin(catalog), orderUrl: origin(orders), apiKey: key });
    gateway = await listen(gatewayApp, 8080);
    const base = origin(gateway);
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    async function docs() {
      await page.goto(`${base}/docs/`);
      await page.waitForSelector('.opblock');
    }
    async function screenshot(name) { await page.screenshot({ path: path.join(output, name), fullPage: true }); }
    async function productDrift(name) {
      await docs();
      const block = page.locator('#operations-Products-listProducts');
      await block.locator('.opblock-summary').click();
      await block.getByRole('button', { name: 'Try it out' }).click();
      await block.getByRole('button', { name: 'Execute', exact: true }).click();
      await block.locator('.responses-inner .live-responses-table').waitFor();
      // Show the actual response and the schema in the same native Swagger page.
      await page.getByText('catalog_Product', { exact: true }).first().click();
      await screenshot(name);
    }
    const beforeSpec = await (await fetch(`${base}/openapi.json`)).json();
    const beforeData = await (await fetch(`${base}/product-service/products`)).json();
    save('drift-before.json', { documentedCategory: !!beforeSpec.components.schemas.catalog_Product.properties.category,
      actualCategory: beforeData.data[0].category, spec: beforeSpec });
    await productDrift('03-drift-before.png');
    await close(catalog);
    catalog = await listen(createCatalogApp(), catalogPort);
    const spec = await (await fetch(`${base}/openapi.json`)).json();
    assert.ok(spec.components.schemas.catalog_Product.properties.category);
    save('drift-after.json', { documentedCategory: true, actualCategory: beforeData.data[0].category, spec });
    await productDrift('04-drift-after.png');
    await docs();
    await screenshot('01-swagger-groups.png');
    // Authenticate only in memory; clear before screenshots so the key never appears in evidence.
    await page.evaluate((apiKey) => window.ui.authActions.authorize({ ApiKeyAuth: {
      name: 'ApiKeyAuth', schema: { type: 'apiKey', in: 'header', name: 'X-API-Key' }, value: apiKey,
    } }), key);
    const block = page.locator('#operations-Orders-createOrder');
    await block.locator('.opblock-summary').click();
    await block.getByRole('button', { name: 'Try it out' }).click();
    const exchanges = [];
    async function order(quantity, productId, expected, capture = false) {
      const input = { customerName: 'Praktikum Lab 11', items: [{ productId, quantity }] };
      await block.locator('textarea.body-param__text').fill(JSON.stringify(input, null, 2));
      const pending = page.waitForResponse((r) => r.url() === `${base}/order-service/orders` && r.request().method() === 'POST');
      await block.getByRole('button', { name: 'Execute', exact: true }).click();
      const response = await pending;
      const body = await response.json();
      assert.equal(response.status(), expected);
      assert.ok(spec.paths['/order-service/orders'].post.responses[String(expected)]);
      await block.locator('.live-responses-table').waitFor();
      exchanges.push({ input, status: response.status(), body, source: 'Swagger UI Try it out' });
      if (capture) {
        // Clear authorization and collapse curl (which includes the key), retain actual response UI.
        await page.evaluate(() => window.ui.authActions.logout(['ApiKeyAuth']));
        await block.locator('.curl').evaluateAll((nodes) => nodes.forEach((n) => n.remove()));
        await screenshot('02-swagger-409.png');
        await page.evaluate((apiKey) => window.ui.authActions.authorize({ ApiKeyAuth: {
          name: 'ApiKeyAuth', schema: { type: 'apiKey', in: 'header', name: 'X-API-Key' }, value: apiKey,
        } }), key);
      }
    }
    await order(2, 'prod-001', 201);
    const stock = await (await fetch(`${base}/product-service/products/prod-001`)).json();
    assert.equal(stock.data.stock, 38);
    await order(100, 'prod-001', 409, true);
    await order(2, 'prod-099', 404);
    await order(999, 'prod-001', 400);
    await close(catalog);
    await order(2, 'prod-001', 503);
    const partial = await (await fetch(`${base}/openapi.json`)).json();
    assert.equal(partial['x-documentation-sources'][0].available, false);
    catalog = await listen(createCatalogApp(), catalogPort);
    await Parser.validate(structuredClone(spec));
    const dereferenced = await Parser.dereference(structuredClone(spec));
    const ajv = addFormats(new Ajv({ strict: false }));
    for (const exchange of exchanges) {
      const schema = dereferenced.paths['/order-service/orders'].post.responses[String(exchange.status)].content['application/json'].schema;
      const validate = ajv.compile(schema);
      assert.ok(validate(exchange.body), JSON.stringify(validate.errors));
    }
    fs.writeFileSync(path.join(root, 'openapi.json'), JSON.stringify(spec, null, 2) + '\n');
    fs.writeFileSync(path.join(root, 'gateway/openapi.json'), JSON.stringify(spec, null, 2) + '\n');
    const conversion = await new Promise((resolve, reject) => Converter.convert({ type: 'json', data: spec }, {
      requestParametersResolution: 'Example', exampleParametersResolution: 'Example',
      folderStrategy: 'Tags', enableOptionalParameters: false,
    },
      (error, result) => error ? reject(error) : resolve(result)));
    assert.equal(conversion.result, true, conversion.reason);
    const collection = conversion.output.find((entry) => entry.type === 'collection').data;
    // Execute a real request from the generated collection with its relative origin resolved locally.
    function flatten(items) { return items.flatMap((item) => item.item ? flatten(item.item) : [item]); }
    const importedRequest = flatten(collection.item).find((item) => item.request.method === 'GET'
      && item.request.url.path.join('/') === 'product-service/products');
    assert.ok(importedRequest);
    collection.variable.find((entry) => entry.key === 'baseUrl').value = base;
    for (const param of importedRequest.request.url.query) param.disabled = true;
    fs.writeFileSync(path.join(root, 'docs/postman/lab11.postman_collection.json'), JSON.stringify(collection, null, 2) + '\n');
    const collectionResponse = await fetch(`${base}/${importedRequest.request.url.path.join('/')}`,
      { method: importedRequest.request.method });
    assert.equal(collectionResponse.status, 200);
    save('results.json', { executedAt: new Date().toISOString(), base, passed: true, exchanges,
      stockAfterOrder: stock.data.stock, openapiValidation: 'Swagger Parser: valid OpenAPI 3.0.3',
      responseSchemas: 'AJV: all recorded order responses valid', postmanConversion: conversion.result,
      collectionRequest: { name: importedRequest.name, status: collectionResponse.status },
      manualPostmanImport: 'Not yet verified in Postman application',
      swaggerEditorImport: 'Not yet verified at editor.swagger.io',
      drift: 'Isolated annotation copy without category, then catalog restarted with corrected original annotations',
    });
    console.log('LAB 11 PASS: Swagger UI 201/409/404/400/503, stock 40->38, drift before/after, OpenAPI validation, Postman collection.');
  } finally {
    await browser?.close();
    await Promise.all([close(gateway), close(orders), close(catalog)]);
    gatewayApp?.locals.shutdown();
    if (fs.existsSync(driftFile)) fs.unlinkSync(driftFile);
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
