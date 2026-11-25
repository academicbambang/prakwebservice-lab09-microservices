'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:8080';

function compose(...args) {
  return execFileSync('docker', ['compose', '--ansi', 'never', ...args], { encoding: 'utf8' }).trim();
}

function showCompose(...args) {
  console.log(`$ docker compose ${args.join(' ')}`);
  const result = compose(...args);
  if (result) console.log(result);
}

async function waitFor(check, error) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const result = check();
    if (result) return result;
    await delay(1000);
  }
  throw new Error(error);
}

async function postOrder() {
  const requestId = randomUUID();
  const response = await fetch(new URL('/order-service/orders', baseUrl), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': process.env.API_KEY,
      'X-Request-Id': requestId,
    },
    body: JSON.stringify({ customerName: 'Uji Lab 13', items: [{ productId: 'prod-001', quantity: 1 }] }),
    signal: AbortSignal.timeout(5000),
  });
  const body = await response.json();
  console.log(`POST /order-service/orders → HTTP ${response.status}`);
  console.log(`X-Request-Id: ${response.headers.get('x-request-id')}`);
  console.log(JSON.stringify(response.ok ? { orderId: body.data.id } : body));
  assert.equal(response.headers.get('x-request-id'), requestId);
  return { status: response.status, requestId, orderId: body.data?.id };
}

async function main() {
  assert.ok(process.env.API_KEY, 'Muat API_KEY dari .env terlebih dahulu');
  showCompose('stop', 'product-service');
  try {
    assert.equal((await postOrder()).status, 503);
    showCompose('ps', '--all', 'product-service', 'order-service', 'gateway');
  } finally {
    showCompose('start', 'product-service');
  }

  await waitFor(() => {
    const status = compose('ps', '--format', 'json', 'product-service');
    return status && JSON.parse(status).Health === 'healthy';
  }, 'Product service belum healthy setelah dinyalakan kembali');
  console.log('product-service: healthy');
  const { status, requestId, orderId } = await postOrder();
  assert.equal(status, 201);
  assert.ok(orderId);

  const entries = await waitFor(() => {
    const logs = compose('logs', '--no-log-prefix', 'product-service', 'order-service', 'notification-service');
    const lines = logs.split('\n');
    const reservation = lines.find((line) => line.includes(requestId) && line.includes('"service":"catalog-service"'));
    const order = lines.find((line) => line.includes(requestId) && line.includes('"service":"order-service"'));
    const email = lines.find((line) => line.includes(requestId) && line.includes(orderId) && line.includes('"kind":"email"'));
    if (reservation && order && email) return [reservation, order, email];
  }, 'Log reservasi, order, atau notifikasi tidak ditemukan untuk X-Request-Id yang sama');
  console.log('\nLog untuk X-Request-Id yang sama');
  console.log(entries.join('\n'));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
