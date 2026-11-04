'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter, once } = require('node:events');
const { setTimeout: delay } = require('node:timers/promises');
const { createOrderPublisher } = require('../order-service/publisher');
const { createMessageHandler } = require('../notification-service/consumer');
const { createCatalogApp } = require('../catalog-service/app');
const { createOrderApp } = require('../order-service/app');

const order = { id: 'ord-test', customerName: 'Lab 10',
  items: [{ productId: 'prod-001', name: 'Kopi', quantity: 1, unitPrice: 85000, subtotal: 85000 }], total: 85000 };

function message({ id = `order-${order.id}`, event = { type: 'order.created', data: order }, redelivered = false } = {}) {
  return { content: Buffer.from(JSON.stringify(event)), properties: { messageId: id }, fields: { redelivered } };
}

function broker() {
  const connection = new EventEmitter();
  const channel = new EventEmitter();
  channel.assertions = [];
  channel.assertExchange = async (...args) => channel.assertions.push(args);
  channel.publishes = [];
  channel.writable = true;
  channel.publish = (...args) => { channel.publishes.push(args); return channel.writable; };
  connection.createConfirmChannel = async () => channel;
  connection.close = async () => { connection.closed = true; connection.emit('close'); };
  return { connection, channel };
}

async function eventually(predicate) {
  const deadline = Date.now() + 1000;
  while (!predicate()) {
    assert.ok(Date.now() < deadline, 'Condition did not become true');
    await delay(5);
  }
}

test('Lab 10 publisher sends durable fanout events with IDs, persistence, confirms, and mandatory routing', async (t) => {
  const { connection, channel } = broker();
  const logs = [];
  const publisher = createOrderPublisher({ connect: async () => connection, log: (entry) => logs.push(entry) });
  t.after(() => publisher.stop());
  await publisher.start();
  assert.deepEqual(channel.assertions, [['orders', 'fanout', { durable: true }]]);
  assert.equal(publisher.publishOrderCreated(order), true);
  const [exchange, key, body, options, confirm] = channel.publishes[0];
  assert.equal(exchange, 'orders');
  assert.equal(key, '');
  assert.deepEqual(JSON.parse(body), { type: 'order.created', data: order });
  assert.equal(options.messageId, 'order-ord-test');
  assert.equal(options.persistent, true);
  assert.equal(options.mandatory, true);
  assert.equal(options.contentType, 'application/json');
  assert.equal(logs.some((entry) => entry.kind === 'confirmed'), false);
  confirm(null);
  assert.equal(logs.at(-1).kind, 'confirmed');
  channel.emit('return', { properties: options });
  assert.equal(logs.at(-1).kind, 'unroutable');
});

test('Lab 10 unavailable publisher reports loss without leaking the broker URL, then reconnects', async (t) => {
  const { connection } = broker();
  let attempts = 0;
  const logs = [];
  const publisher = createOrderPublisher({ retryMs: 10, url: 'amqp://private-user:private-secret@127.0.0.1',
    connect: async () => { if (++attempts === 1) throw new Error('private-secret'); return connection; },
    log: (entry) => logs.push(entry) });
  t.after(() => publisher.stop());
  await publisher.start();
  assert.equal(publisher.publishOrderCreated(order), false);
  assert.equal(logs.at(-1).kind, 'not-published');
  await eventually(() => publisher.isReady());
  assert.equal(attempts, 2);
  assert.equal(JSON.stringify(logs).includes('private-secret'), false);
});

test('Lab 10 channel errors reconnect once and stopping disables further retries', async () => {
  const first = broker();
  const second = broker();
  let attempts = 0;
  const publisher = createOrderPublisher({ retryMs: 10,
    connect: async () => (++attempts === 1 ? first.connection : second.connection), log: () => {} });
  await publisher.start();
  first.channel.emit('error', new Error('channel closed'));
  first.channel.emit('close');
  assert.equal(publisher.isReady(), false);
  await eventually(() => attempts === 2 && publisher.isReady());
  await publisher.stop();
  assert.equal(second.connection.closed, true);
  await delay(30);
  assert.equal(attempts, 2);
});

test('Lab 10 publisher handles buffering and broker blocking without misreporting buffered messages as rejected', async (t) => {
  const { connection, channel } = broker();
  const publisher = createOrderPublisher({ connect: async () => connection, log: () => {} });
  t.after(() => publisher.stop());
  await publisher.start();
  channel.writable = false;
  assert.equal(publisher.publishOrderCreated(order), true);
  assert.equal(publisher.publishOrderCreated({ ...order, id: 'ord-other' }), false);
  assert.equal(channel.publishes.length, 1);
  channel.emit('drain');
  channel.writable = true;
  connection.emit('blocked');
  assert.equal(publisher.publishOrderCreated(order), false);
  connection.emit('unblocked');
  assert.equal(publisher.publishOrderCreated({ ...order, id: 'ord-next' }), true);
});

function consumerFixture(options = {}) {
  const acks = [], nacks = [], logs = [], exits = [];
  const handler = createMessageHandler({
    channel: { ack: (msg) => acks.push(msg), nack: (...args) => nacks.push(args) },
    queue: 'notification-queue', consumerName: 'unit', processingMs: 0,
    log: (entry) => logs.push(entry), exit: (code) => exits.push(code), ...options,
  });
  return { handler, acks, nacks, logs, exits };
}

test('Lab 10 consumer acknowledges after email and deduplicates the same messageId within one process', async () => {
  const { handler, acks, nacks, logs } = consumerFixture();
  const msg = message();
  await handler(msg);
  assert.deepEqual(logs.map((entry) => entry.kind), ['received', 'email', 'acked']);
  await handler(msg);
  assert.equal(logs.at(-1).kind, 'duplicate');
  assert.equal(logs.filter((entry) => entry.kind === 'email').length, 1);
  assert.equal(acks.length, 2);
  assert.equal(nacks.length, 0);
});

test('Lab 10 malformed JSON, missing IDs, and invalid event schemas are nacked without requeue', async () => {
  const { handler, acks, nacks } = consumerFixture();
  const malformed = { ...message(), content: Buffer.from('{') };
  for (const msg of [malformed, message({ id: '' }), message({ event: { type: 'unknown' } }),
    message({ event: { type: 'order.created', data: { ...order, items: [{ name: 'Kopi', quantity: 0 }] } } })]) {
    await handler(msg);
  }
  assert.equal(acks.length, 0);
  assert.equal(nacks.length, 4);
  for (const [, allUpTo, requeue] of nacks) assert.deepEqual([allUpTo, requeue], [false, false]);
});

test('Lab 10 crash is after the simulated email and before ack; a new process loses its deduplication Set', async () => {
  const crash = consumerFixture({ crash: true });
  await crash.handler(message());
  assert.equal(crash.logs.filter((entry) => entry.kind === 'email').length, 1);
  assert.deepEqual(crash.exits, [1]);
  assert.equal(crash.acks.length, 0);
  const recovered = consumerFixture();
  await recovered.handler(message({ redelivered: true }));
  assert.equal(recovered.logs.find((entry) => entry.kind === 'email').redelivered, true);
  assert.equal(recovered.acks.length, 1);
});

test('Lab 10 HTTP returns 201 without waiting for notifications and publishes only stored valid orders', async (t) => {
  async function serve(app) {
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
    return `http://127.0.0.1:${server.address().port}`;
  }
  const catalogUrl = await serve(createCatalogApp());
  const published = [];
  // Returning false simulates unavailable RabbitMQ, never consumer success.
  const orderUrl = await serve(createOrderApp({ catalogUrl, publishOrderCreated: (data) => { published.push(data); return false; } }));
  const post = (body) => fetch(`${orderUrl}/orders`, { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await post({})).status, 400);
  assert.equal(published.length, 0);
  const response = await post({ customerName: 'Lab 10', items: [{ productId: 'prod-001', quantity: 2 }] });
  assert.equal(response.status, 201);
  const stored = (await response.json()).data;
  assert.deepEqual(published, [stored]);
  assert.deepEqual((await (await fetch(`${orderUrl}/orders`)).json()).data, [stored]);
  assert.equal(stored.items[0].quantity, 2);
});
