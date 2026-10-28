const { existsSync } = require('node:fs');
const { resolve } = require('node:path');

function loadLocalEnv() {
  const file = resolve(__dirname, '.env');
  if (existsSync(file)) process.loadEnvFile(file);
}

function readConfig(env = process.env) {
  const port = Number(env.PORT || 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT harus 1-65535');
  const trustProxy = Number(env.TRUST_PROXY || 0);
  if (!Number.isInteger(trustProxy) || trustProxy < 0) throw new Error('TRUST_PROXY harus bilangan bulat >= 0');
  for (const name of ['CATALOG_SERVICE_URL', 'ORDER_SERVICE_URL']) {
    if (!env[name]) continue;
    const url = new URL(env[name]);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
        url.pathname !== '/' || url.search || url.hash) {
      throw new Error(`${name} harus berupa origin HTTP(S) tanpa path, kredensial, atau query`);
    }
  }
  return {
    port,
    host: env.HOST || '127.0.0.1',
    catalogUrl: env.CATALOG_SERVICE_URL || 'http://127.0.0.1:3000',
    orderUrl: env.ORDER_SERVICE_URL || 'http://127.0.0.1:3001',
    apiKey: env.API_KEY || '',
    apiKeyHash: env.API_KEY_SHA256 || '',
    trustProxy,
  };
}

module.exports = { loadLocalEnv, readConfig };
