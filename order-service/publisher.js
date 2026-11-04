'use strict';

const amqp = require('amqplib');

// No outbox: when RabbitMQ is down the order survives but its event can be lost.
// Confirm callbacks report broker acceptance asynchronously; HTTP never awaits a consumer.
function createOrderPublisher({
  url = process.env.AMQP_URL || 'amqp://127.0.0.1',
  exchange = process.env.ORDER_EXCHANGE || 'orders',
  retryMs = 3000,
  connect = amqp.connect,
  log = (entry) => console.log(JSON.stringify({ at: new Date().toISOString(), component: 'publisher', ...entry })),
} = {}) {
  const parsed = new URL(url);
  if (!['amqp:', 'amqps:'].includes(parsed.protocol)) throw new Error('AMQP_URL harus memakai amqp:// atau amqps://');
  let connection = null;
  let channel = null;
  let retry = null;
  let connecting = null;
  let stopped = true;
  let backpressure = false;
  let blocked = false;
  const pending = new Set();

  function scheduleReconnect() {
    if (stopped || retry) return;
    retry = setTimeout(() => { retry = null; void connectQueue(); }, retryMs);
    retry.unref?.();
  }

  function disconnect(candidate) {
    if (connection !== candidate) return;
    connection = null;
    channel = null;
    backpressure = false;
    blocked = false;
    // Do not retry uncertain publishes: a retry could produce a duplicate.
    log({ kind: 'disconnected', message: 'RabbitMQ terputus; mencoba terhubung kembali.' });
    void candidate.close().catch(() => {});
    scheduleReconnect();
  }

  function connectQueue() {
    if (stopped || channel) return Promise.resolve();
    if (connecting) return connecting;
    connecting = (async () => {
      let candidate;
      try {
        candidate = await connect(url, { timeout: 2000, clientProperties: { connection_name: 'lab10-order-publisher' } });
        // Never log AMQP_URL or the raw connection error (cloud credentials can be embedded).
        candidate.on('error', () => disconnect(candidate));
        candidate.on('close', () => disconnect(candidate));
        if (stopped) { await candidate.close(); return; }
        connection = candidate;
        candidate.on('blocked', () => { blocked = true; log({ kind: 'blocked', message: 'Broker menghentikan sementara publikasi.' }); });
        candidate.on('unblocked', () => { blocked = false; });
        const next = await candidate.createConfirmChannel();
        next.on('error', () => disconnect(candidate));
        next.on('close', () => disconnect(candidate));
        next.on('drain', () => { backpressure = false; });
        next.on('return', (msg) => log({
          kind: 'unroutable', messageId: msg.properties.messageId,
          message: 'Event tidak memiliki antrean tujuan; jalankan consumer sebelum membuat order.',
        }));
        await next.assertExchange(exchange, 'fanout', { durable: true });
        if (stopped || connection !== candidate) { await candidate.close().catch(() => {}); return; }
        channel = next;
        log({ kind: 'ready', exchange, message: 'Terhubung ke RabbitMQ; publisher siap.' });
      } catch (error) {
        if (connection === candidate) { connection = null; channel = null; }
        if (candidate) await candidate.close().catch(() => {});
        if (!stopped) log({ kind: 'unavailable', code: error.code || 'AMQP_CONNECTION_FAILED', message: 'RabbitMQ belum tersedia; coba lagi dalam 3 detik.' });
      } finally {
        connecting = null;
        if (!channel) scheduleReconnect();
      }
    })();
    return connecting;
  }

  function publishOrderCreated(order) {
    const messageId = `order-${order.id}`;
    if (!channel || blocked || backpressure || pending.size >= 1000) {
      log({ kind: 'not-published', orderId: order.id, messageId, message: 'Event TIDAK terkirim; order tetap disimpan. Tidak ada outbox/replay otomatis.' });
      return false;
    }
    const event = { type: 'order.created', data: order };
    pending.add(messageId);
    try {
      const writable = channel.publish(exchange, '', Buffer.from(JSON.stringify(event)), {
        persistent: true, mandatory: true, contentType: 'application/json',
        type: event.type, messageId, timestamp: Math.floor(Date.now() / 1000),
      }, (error) => {
        pending.delete(messageId);
        log({ kind: error ? 'unconfirmed' : 'confirmed', messageId, orderId: order.id,
          message: error ? 'Publikasi gagal/tidak pasti; tidak diulang otomatis.' : 'Broker mengonfirmasi event; bukan konfirmasi email.' });
      });
      backpressure = !writable; // false means buffered, not a broker rejection.
      log({ kind: 'published', messageId, orderId: order.id, exchange });
      return true;
    } catch {
      pending.delete(messageId);
      log({ kind: 'not-published', messageId, orderId: order.id, message: 'Publikasi gagal; order tetap disimpan.' });
      if (connection) disconnect(connection);
      return false;
    }
  }

  return {
    start() { stopped = false; return connectQueue(); },
    isReady() { return Boolean(channel) && !blocked; },
    publishOrderCreated,
    async stop() {
      stopped = true;
      clearTimeout(retry);
      retry = null;
      const current = connection;
      connection = null;
      channel = null;
      if (current) await current.close().catch(() => {});
      if (connecting) await connecting;
    },
  };
}

module.exports = { createOrderPublisher };
