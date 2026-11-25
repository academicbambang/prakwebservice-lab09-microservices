'use strict';

const { createOrderApp } = require('./app');

async function main() {
  const port = Number(process.env.ORDER_PORT || process.env.PORT || 3001);
  const host = process.env.HOST || '127.0.0.1';
  const publisher = process.env.AMQP_URL ? require('./publisher').createOrderPublisher() : undefined;
  await publisher?.start();
  const server = createOrderApp({ publishOrderCreated: publisher?.publishOrderCreated }).listen(port, host, () => {
    console.log(`order-service listening on http://${host}:${port}`);
  });
  server.on('error', async (error) => {
    console.error(`order-service failed to start: ${error.message}`);
    await publisher?.stop();
    process.exitCode = 1;
  });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => server.close(async () => { await publisher?.stop(); process.exit(0); }));
  }
}

if (require.main === module) {
  main().catch(() => {
    console.error('order-service gagal dimulai. Periksa konfigurasi broker.');
    process.exitCode = 1;
  });
}
