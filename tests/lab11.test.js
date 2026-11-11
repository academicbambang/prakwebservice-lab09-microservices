'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSpec } = require('../gateway/api-docs');
const { specification: catalogSpec } = require('../catalog-service/app');
const { products } = require('../catalog-service/products');

test('every product fixture field is documented, including category, to catch the demonstrated drift', () => {
  for (const product of products) {
    for (const field of Object.keys(product)) {
      assert.ok(catalogSpec.components.schemas.Product.properties[field], `Undocumented product field: ${field}`);
    }
  }
});

test('live aggregation namespaces conflicting components and fetches again on every call', async () => {
  let calls = 0;
  const options = { fetchImpl: async (url) => {
    calls++;
    const catalog = String(url).includes(':3000');
    return new Response(JSON.stringify({ openapi: '3.0.3', paths: {
      '/sample': { get: { operationId: catalog ? 'catalogSample' : 'orderSample', responses: {
        '200': { description: 'ok', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      } } },
    }, components: { schemas: { Error: { type: catalog ? 'string' : 'integer' } } } }));
  } };
  const first = await buildSpec(options);
  assert.equal(first.components.schemas.catalog_Error.type, 'string');
  assert.equal(first.components.schemas.order_Error.type, 'integer');
  assert.equal(first.paths['/product-service/sample'].get.responses['200'].content['application/json'].schema.$ref,
    '#/components/schemas/catalog_Error');
  await buildSpec(options);
  assert.equal(calls, 4);
});

test('one unavailable documentation source is explicitly reported without hiding the healthy service', async () => {
  const spec = await buildSpec({ fetchImpl: async (url) => {
    if (String(url).includes(':3000')) throw new Error('offline');
    return new Response(JSON.stringify({ openapi: '3.0.3', paths: { '/orders': { get: {
      responses: { '200': { description: 'ok' } },
    } } } }));
  } });
  assert.ok(spec.paths['/order-service/orders']);
  assert.equal(spec['x-documentation-sources'][0].available, false);
  assert.equal(spec['x-documentation-sources'][1].available, true);
});
