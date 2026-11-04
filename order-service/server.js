'use strict';

const { createOrderApp } = require('./app');
const { createOrderPublisher } = require('./publisher');
const { loadLocalEnv } = require('../gateway/config');

if (require.main === module) {
  loadLocalEnv();
  const publisher = createOrderPublisher();
  // gateway/.env also contains PORT, which belongs to the gateway, not this backend.
  const port = Number(process.env.ORDER_PORT || 3001);
  const host = process.env.HOST || '127.0.0.1';
  const server = createOrderApp({ publishOrderCreated: publisher.publishOrderCreated }).listen(port, host, () => {
    console.log(`order-service listening on http://${host}:${port}`);
    void publisher.start();
  });
  server.on('error', (error) => {
    console.error(`order-service failed to start: ${error.message}`);
    process.exitCode = 1;
    void publisher.stop();
  });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => server.close(async () => { await publisher.stop(); process.exit(0); }));
  }
}
