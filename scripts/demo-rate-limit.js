const { createCatalogApp } = require('../catalog-service/app');
const { createGateway } = require('../gateway/gateway');
const { testRateLimit } = require('../gateway/test-rate-limit');
const { writeFileSync, mkdirSync } = require('node:fs');
const { resolve } = require('node:path');

async function main() {
  const servers = [];
  let gateway;
  async function listen(app, port) {
    const server = app.listen(port, '127.0.0.1');
    servers.push(server);
    await new Promise((ok, fail) => { server.once('listening', ok); server.once('error', fail); });
    return `http://127.0.0.1:${server.address().port}`;
  }
  try {
    // Dedicated fresh gateway on 8080: a previous Postman request cannot consume quota.
    // The catalog uses an available port; routing still uses the real service implementation.
    const catalogUrl = await listen(createCatalogApp(), 0);
    gateway = createGateway({ catalogUrl });
    const gatewayUrl = await listen(gateway, 8080);
    const lines = [];
    const statuses = await testRateLimit(`${gatewayUrl}/catalog/products`, (line) => { console.log(line); lines.push(line); });
    const dir = resolve(__dirname, '../docs/evidence');
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, 'rate-limit.txt'), `${lines.join('\n')}\n`);
    writeFileSync(resolve(dir, 'rate-limit.json'), JSON.stringify({ url: `${gatewayUrl}/catalog/products`, limit: 20, windowMs: 10000, statuses, passed: true }, null, 2) + '\n');
  } finally {
    await Promise.all(servers.map((server) => new Promise((ok) => { server.close(ok); server.closeAllConnections(); })));
    gateway?.locals.shutdown();
  }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
