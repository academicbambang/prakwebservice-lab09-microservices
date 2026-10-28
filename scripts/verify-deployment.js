'use strict';

const assert = require('node:assert/strict');
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { requestJson, formatExchange, runSmokeTest } = require('../smoke-test');

async function main() {
  const metadataPath = resolve(__dirname, '../docs/evidence/deployment/service.json');
  const metadata = existsSync(metadataPath) ? JSON.parse(readFileSync(metadataPath, 'utf8')) : {};
  const baseUrl = process.env.BASE_URL || metadata.url;
  if (!baseUrl || !/^https:\/\//.test(baseUrl)) throw new Error('Atur BASE_URL ke alamat HTTPS deployment yang sebenarnya.');
  const keyPath = resolve(__dirname, '../gateway/.env.render');
  const apiKey = process.env.DEPLOY_API_KEY || (existsSync(keyPath) ? readFileSync(keyPath, 'utf8').match(/^API_KEY=(.+)$/m)?.[1]?.trim() : '');
  if (!apiKey) throw new Error('Jalankan npm run setup:render atau atur DEPLOY_API_KEY.');
  const lines = [];
  const log = (line) => { lines.push(line); console.log(line); };
  const exchanges = [];
  const startedAt = new Date().toISOString();
  const ready = await requestJson(baseUrl, '/readyz');
  assert.equal(ready.response.status, 200);
  exchanges.push(ready);
  log(formatExchange(ready));
  for (const route of ['/', '/app.js', '/styles.css', '/docs/', '/sandbox', '/laporan.pdf', '/laporan-latex.zip']) {
    const response = await fetch(new URL(route, baseUrl), { signal: AbortSignal.timeout(15000), redirect: 'error' });
    assert.equal(response.status, 200, route);
    const content = Buffer.from(await response.arrayBuffer());
    if (route.endsWith('.pdf')) assert.equal(content.subarray(0, 4).toString(), '%PDF');
    if (route.endsWith('.zip')) assert.equal(content.subarray(0, 2).toString(), 'PK');
    log(`GET ${new URL(route, baseUrl)} -> HTTP ${response.status} (${content.length} bytes)`);
  }
  const spec = await requestJson(baseUrl, '/openapi.json');
  assert.equal(spec.response.status, 200);
  assert.equal(spec.response.body.openapi, '3.0.3');
  exchanges.push(spec);
  const graph = await requestJson(baseUrl, '/product-service/graphql', {
    method: 'POST', body: { query: '{ products { id name price stock } }' },
  });
  assert.equal(graph.response.status, 200);
  assert.equal(graph.response.body.data.products.length, 3);
  exchanges.push(graph);
  log(formatExchange(graph));
  const unauthorized = await requestJson(baseUrl, '/order-service/orders');
  assert.equal(unauthorized.response.status, 401);
  exchanges.push(unauthorized);
  log(formatExchange(unauthorized));
  const smoke = await runSmokeTest({ baseUrl, apiKey, log });
  const orders = await requestJson(baseUrl, '/order-service/orders', { apiKey });
  assert.equal(orders.response.status, 200);
  assert.ok(orders.response.body.data.some((order) => order.id === smoke.summary.orderId));
  exchanges.push(orders);
  log(formatExchange(orders));
  const result = { startedAt, completedAt: new Date().toISOString(), baseUrl, passed: true, smoke, exchanges };
  const dir = resolve(__dirname, '../docs/evidence/deployment');
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, 'verification.json'), JSON.stringify(result, null, 2) + '\n');
  writeFileSync(resolve(dir, 'verification.txt'), lines.join('\n\n') + '\n');
  log('LULUS: frontend, Swagger, Sandbox, GraphQL, laporan, API key, dan reservasi stok pada URL publik.');
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });

module.exports = { main };
