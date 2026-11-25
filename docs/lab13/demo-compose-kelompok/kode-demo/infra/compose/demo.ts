import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setTimeout as wait } from 'node:timers/promises';
import { issueToken } from '../../packages/security/src/index.js';

const gateway = 'http://127.0.0.1:3000';
const state = JSON.parse(await readFile('.local/development.json', 'utf8'));
const control = await readFile('.local/compose-control-token', 'utf8');
const buyer = await issueToken({ sub: 'demo:buyer', role: 'buyer', scope: 'read:catalog' }, {
  JWT_ISSUER: 'http://127.0.0.1:3001',
  JWT_AUDIENCE: 'umkm-api',
  JWT_PUBLIC_JWK: JSON.stringify(state.publicJwk),
  JWT_PRIVATE_JWK: JSON.stringify(state.privateJwk),
});

async function request(path: string, init?: RequestInit, expectedNotFound = false) {
  const response = await fetch(gateway + path, { signal: AbortSignal.timeout(8000), ...init });
  const body = await response.json();
  assert.ok(response.ok || (expectedNotFound && response.status === 404),
    `${path}: HTTP ${response.status} ${JSON.stringify(body)}`);
  return { status: response.status, body };
}
async function until<T>(probe: () => Promise<T | undefined>, message: string) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const result = await probe();
    if (result !== undefined) return result;
    await wait(1500);
  }
  throw new Error(message);
}

const { body: catalog } = await request('/graphql', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: '{ products(first: 20) { nodes { id name available } } }' }),
});
const product = catalog.data.products.nodes.find((item: { available: number }) => item.available > 0);
assert.ok(product);
console.log('Catalog melalui Gateway: HTTP 200 · ' + product.name);

const authorization = { Authorization: `Bearer ${buyer}` };
const { status, body: order } = await request('/orders', {
  method: 'POST',
  headers: { ...authorization, 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
  body: JSON.stringify({ items: [{ productId: product.id, quantity: 1 }] }),
});
assert.equal(status, 201);
assert.equal(order.status, 'PENDING_PAYMENT');
console.log('Order: HTTP 201 · PENDING_PAYMENT · ' + order.id);

const operation = { method: 'POST', headers: { 'X-Compose-Control': control } };
const payment = await until(async () => {
  await request('/__compose/payment-jobs', operation);
  const { body } = await request('/payments?orderId=' + order.id, { headers: authorization }, true);
  return body.status === 'READY' ? body : undefined;
}, 'Invoice lokal belum READY setelah Order mengirim order.created');
console.log('Invoice: READY · ' + payment.paymentUrl);

const paymentUrl = new URL(payment.paymentUrl);
assert.equal(paymentUrl.origin, 'http://127.0.0.1:3100');
const callback = await fetch('http://xendit-mock:3100' + paymentUrl.pathname, {
  method: 'POST', signal: AbortSignal.timeout(10000),
});
const settled = await callback.json();
assert.equal(callback.status, 200, JSON.stringify(settled));
assert.equal(settled.paymentStatus, 'SUCCEEDED');
console.log('Webhook simulator: HTTP 200 · SUCCEEDED');

await request('/__compose/payment-relay', operation);
await until(async () => {
  const { body } = await request('/orders/' + order.id, { headers: authorization });
  return body.status === 'PAID' ? body : undefined;
}, 'Order belum PAID setelah Payment mengirim payment.succeeded');
console.log('Order: PAID · event Order–Payment diverifikasi melalui Queue Wrangler lokal.');
