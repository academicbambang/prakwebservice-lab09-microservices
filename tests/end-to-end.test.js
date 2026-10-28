'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createCatalogApp } = require('../catalog-service/app');
const { createOrderApp } = require('../order-service/app');
const { createGateway } = require('../gateway/gateway');

test('real catalog, order, and gateway complete the product-to-order flow', async (t) => {
  const servers = [];
  let gateway;
  t.after(async () => {
    gateway?.locals.shutdown();
    for (const server of servers.reverse()) {
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      });
    }
  });

  async function serve(app) {
    const server = app.listen(0, '127.0.0.1');
    servers.push(server);
    await once(server, 'listening');
    return `http://127.0.0.1:${server.address().port}`;
  }

  const catalogUrl = await serve(createCatalogApp());
  const orderUrl = await serve(createOrderApp({ catalogUrl }));
  const apiKey = 'end-to-end-test-only-key';
  gateway = createGateway({ catalogUrl, orderUrl, apiKey });
  const gatewayUrl = await serve(gateway);
  const authorizedHeaders = { 'x-api-key': apiKey };

  const catalogResponse = await fetch(`${gatewayUrl}/catalog/products?search=kopi`);
  assert.equal(catalogResponse.status, 200);
  const catalog = await catalogResponse.json();
  assert.deepEqual(catalog.data.map((product) => product.id), ['prod-001']);

  const graphqlResponse = await fetch(`${gatewayUrl}/catalog/graphql`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: '{ products(search: "kopi") { id name } }' }),
  });
  assert.equal(graphqlResponse.status, 200);
  assert.deepEqual(await graphqlResponse.json(), {
    data: { products: [{ id: 'prod-001', name: 'Kopi Arabika Gayo' }] },
  });

  const unauthorizedResponse = await fetch(`${gatewayUrl}/orders/orders`);
  assert.equal(unauthorizedResponse.status, 401);
  assert.equal(typeof (await unauthorizedResponse.json()).error, 'string');

  const createResponse = await fetch(`${gatewayUrl}/orders/orders`, {
    method: 'POST',
    headers: { ...authorizedHeaders, 'content-type': 'application/json' },
    body: JSON.stringify({
      customerName: 'Siti Integrasi',
      items: [{ productId: 'prod-001', quantity: 2 }],
    }),
  });
  assert.equal(createResponse.status, 201);
  const { data: order } = await createResponse.json();
  assert.equal(order.customerName, 'Siti Integrasi');
  assert.equal(order.items[0].unitPrice, 85000);
  assert.equal(order.items[0].subtotal, 170000);
  assert.equal(order.total, 170000);
  assert.equal(order.status, 'pending');
  const remainingStock = await fetch(`${gatewayUrl}/catalog/products/prod-001`);
  assert.equal(remainingStock.status, 200);
  assert.equal((await remainingStock.json()).data.stock, 38);

  const location = createResponse.headers.get('location');
  assert.equal(location, `/orders/orders/${order.id}`);
  const detailResponse = await fetch(new URL(location, gatewayUrl), { headers: authorizedHeaders });
  assert.equal(detailResponse.status, 200);
  assert.deepEqual((await detailResponse.json()).data, order);

  const listResponse = await fetch(`${gatewayUrl}/orders/orders`, { headers: authorizedHeaders });
  assert.equal(listResponse.status, 200);
  assert.deepEqual((await listResponse.json()).data, [order]);
  // Memastikan record benar-benar disimpan oleh Order-Service yang sama.
  assert.deepEqual((await (await fetch(`${orderUrl}/orders`)).json()).data, [order]);
});
