'use strict';

const { startConsumer } = require('./consumer');
const { loadLocalEnv } = require('../gateway/config');

async function main(args = process.argv.slice(2)) {
  loadLocalEnv();
  const allowed = new Set(['--crash']);
  if (args.some((arg) => arg.startsWith('--') && !allowed.has(arg))
      || args.filter((arg) => !arg.startsWith('--')).length > 1) {
    throw new Error('Gunakan: node notification-service/notification-service.js [nama-antrean] [--crash]');
  }
  const queue = args.find((arg) => !arg.startsWith('--')) || process.env.NOTIFICATION_QUEUE || 'notification-queue';
  const processingMs = Number(process.env.NOTIFICATION_DELAY_MS || 1000);
  if (!Number.isInteger(processingMs) || processingMs < 0 || processingMs > 60000) {
    throw new Error('NOTIFICATION_DELAY_MS harus bilangan bulat 0–60000');
  }
  const consumer = await startConsumer({
    queue, crash: args.includes('--crash'), processingMs,
    consumerName: process.env.CONSUMER_NAME || `consumer-${process.pid}`,
    onDisconnect: () => process.exit(1),
  });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, async () => { await consumer.stop(); process.exit(0); });
  }
}

if (require.main === module) {
  main().catch((error) => {
    // No raw connection URL/error: AMQP_URL may contain cloud secrets.
    console.error(JSON.stringify({ at: new Date().toISOString(), kind: 'startup-error',
      message: 'Consumer gagal dimulai. Periksa broker, AMQP_URL, nama antrean, dan argumen CLI.', code: error.code || 'CONSUMER_START_FAILED' }));
    process.exitCode = 1;
  });
}

module.exports = { main };
