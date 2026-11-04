'use strict';

const amqp = require('amqplib');
const { setTimeout: delay } = require('node:timers/promises');

function decodeOrderEvent(msg) {
  const event = JSON.parse(msg.content.toString('utf8'));
  if (typeof msg.properties.messageId !== 'string' || !msg.properties.messageId.trim()
      || event?.type !== 'order.created' || typeof event.data?.id !== 'string'
      || !Array.isArray(event.data.items) || event.data.items.length === 0
      || event.data.items.some((item) => typeof item.name !== 'string'
        || !Number.isInteger(item.quantity) || item.quantity < 1)) {
    throw new Error('Invalid order.created event or missing messageId');
  }
  return event;
}

function createMessageHandler({ channel, queue, consumerName, crash = false, processingMs = 1000,
  processed = new Set(), log, exit = (code) => process.exit(code) }) {
  return async (msg) => {
    if (!msg) { log({ kind: 'cancelled', message: 'Consumer dibatalkan oleh broker.' }); return; }
    const messageId = msg.properties.messageId;
    let event;
    try { event = decodeOrderEvent(msg); }
    catch {
      log({ kind: 'invalid', messageId, message: 'Pesan rusak/tidak valid, dibuang tanpa requeue.' });
      channel.nack(msg, false, false);
      return;
    }
    if (processed.has(messageId)) {
      log({ kind: 'duplicate', messageId, orderId: event.data.id, message: 'Duplikat dalam proses ini, dilewati.' });
      channel.ack(msg);
      return;
    }
    log({ kind: 'received', messageId, orderId: event.data.id, redelivered: Boolean(msg.fields.redelivered) });
    await delay(processingMs);
    const detail = event.data.items.map((item) => `${item.name} x${item.quantity}`).join(', ');
    log({ kind: 'email', messageId, orderId: event.data.id,
      redelivered: Boolean(msg.fields.redelivered),
      message: `[${queue}/${consumerName}] email terkirim (simulasi): pesanan #${event.data.id} ${detail}` });
    processed.add(messageId);
    if (crash) {
      log({ kind: 'crash', messageId, message: 'Crash sebelum ack! Set processed akan hilang saat proses mati.' });
      exit(1);
      return;
    }
    channel.ack(msg);
    log({ kind: 'acked', messageId, orderId: event.data.id });
  };
}

async function startConsumer({
  url = process.env.AMQP_URL || 'amqp://127.0.0.1',
  exchange = process.env.ORDER_EXCHANGE || 'orders',
  queue = 'notification-queue', consumerName = `consumer-${process.pid}`,
  crash = false, processingMs = 1000,
  log = (entry) => console.log(JSON.stringify({ at: new Date().toISOString(), component: 'consumer', queue, consumer: consumerName, ...entry })),
  onDisconnect = () => {},
} = {}) {
  const connection = await amqp.connect(url, { timeout: 3000, clientProperties: { connection_name: `lab10-${consumerName}` } });
  let closing = false;
  connection.on('error', () => { log({ kind: 'connection-error', message: 'Koneksi broker terganggu.' }); });
  connection.on('close', () => {
    if (!closing) { log({ kind: 'disconnected', message: 'Broker terputus; jalankan ulang consumer setelah broker pulih.' }); onDisconnect(); }
  });
  try {
    const channel = await connection.createChannel();
    channel.on('error', () => { log({ kind: 'channel-error', message: 'Channel consumer ditutup broker.' }); });
    channel.on('close', () => { if (!closing) onDisconnect(); });
    await channel.assertExchange(exchange, 'fanout', { durable: true });
    await channel.assertQueue(queue, { durable: true });
    await channel.bindQueue(queue, exchange, '');
    await channel.prefetch(1);
    const handler = createMessageHandler({ channel, queue, consumerName, crash, processingMs, log });
    const { consumerTag } = await channel.consume(queue, (msg) => {
      // A closed channel leaves an unacked message for redelivery. Never ack on failure.
      void handler(msg).catch(() => {
        log({ kind: 'processing-error', messageId: msg?.properties.messageId, message: 'Pemrosesan terganggu; tutup consumer agar pesan dikirim ulang.' });
        if (!closing) { void connection.close().catch(() => {}); onDisconnect(); }
      });
    }, { noAck: false });
    log({ kind: 'ready', exchange, prefetch: 1, message: `[${queue}/${consumerName}] menunggu pesan...` });
    return {
      async stop() {
        closing = true;
        await channel.cancel(consumerTag).catch(() => {});
        // If still processing, closing requeues it. This is deliberately at-least-once.
        await connection.close().catch(() => {});
      },
    };
  } catch (error) {
    closing = true;
    await connection.close().catch(() => {});
    throw error;
  }
}

module.exports = { decodeOrderEvent, createMessageHandler, startConsumer };
