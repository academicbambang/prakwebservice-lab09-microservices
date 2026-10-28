const { spawn } = require('node:child_process');
const { resolve } = require('node:path');
const { loadLocalEnv } = require('../gateway/config');

const root = resolve(__dirname, '..');

function buildProcessConfigs(env = process.env) {
  const catalogPort = env.CATALOG_PORT || '3000';
  const orderPort = env.ORDER_PORT || '3001';
  const serviceEnv = {
    ...env,
    // The stack's upstreams stay on loopback even when the gateway is public.
    CATALOG_PORT: catalogPort,
    ORDER_PORT: orderPort,
    CATALOG_SERVICE_URL: `http://127.0.0.1:${catalogPort}`,
    ORDER_SERVICE_URL: `http://127.0.0.1:${orderPort}`,
  };
  return [
    { file: 'catalog-service/server.js', env: { ...serviceEnv, HOST: '127.0.0.1' } },
    { file: 'order-service/server.js', env: { ...serviceEnv, HOST: '127.0.0.1' } },
    { file: 'gateway/gateway.js', env: { ...serviceEnv, HOST: env.HOST || '127.0.0.1' } },
  ];
}

if (require.main === module) {
  loadLocalEnv();
  const children = [];
  let stopping = false;
  function stop(code = 0) {
    if (stopping) return;
    stopping = true;
    for (const child of children) if (child.exitCode === null) child.kill();
    process.exitCode = code;
  }
  for (const { file, env } of buildProcessConfigs()) {
    const child = spawn(process.execPath, [resolve(root, file)], { cwd: root, env, stdio: 'inherit', windowsHide: true });
    children.push(child);
    child.on('error', (error) => { console.error(error.message); stop(1); });
    child.on('exit', (code) => { if (!stopping) stop(code || 1); });
  }
  process.on('SIGINT', () => stop());
  process.on('SIGTERM', () => stop());
}

module.exports = { buildProcessConfigs };
