'use strict';

const { createCatalogApp } = require('./app');

if (require.main === module) {
  const port = Number(process.env.CATALOG_PORT || process.env.PORT || 3000);
  const host = process.env.HOST || '127.0.0.1';
  const server = createCatalogApp().listen(port, host, () => {
    console.log(`catalog-service listening on http://${host}:${port}`);
  });
  server.on('error', (error) => {
    console.error(`catalog-service failed to start: ${error.message}`);
    process.exitCode = 1;
  });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => server.close(() => process.exit(0)));
  }
}
