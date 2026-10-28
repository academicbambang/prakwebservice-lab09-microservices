'use strict';

const { createOrderApp } = require('./app');

if (require.main === module) {
  const port = Number(process.env.ORDER_PORT || process.env.PORT || 3001);
  const host = process.env.HOST || '127.0.0.1';
  const server = createOrderApp().listen(port, host, () => {
    console.log(`order-service listening on http://${host}:${port}`);
  });
  server.on('error', (error) => {
    console.error(`order-service failed to start: ${error.message}`);
    process.exitCode = 1;
  });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => server.close(() => process.exit(0)));
  }
}
