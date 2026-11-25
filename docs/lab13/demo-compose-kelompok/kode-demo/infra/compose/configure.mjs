import { readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

const state = JSON.parse(readFileSync('.local/development.json', 'utf8'));
const common = {
  JWT_ISSUER: 'http://127.0.0.1:3001',
  JWT_AUDIENCE: 'umkm-api',
  JWT_PUBLIC_JWK: JSON.stringify(state.publicJwk),
};
function writeVars(path, vars) {
  writeFileSync(path, Object.entries(vars).map(([key, value]) => `${key}='${value}'`).join('\n') + '\n', { mode: 0o600 });
}
const authFile = 'services/auth/.dev.vars';
const auth = readFileSync(authFile, 'utf8');
writeFileSync(authFile, auth.replace("OAUTH_CALLBACK_URL='http://127.0.0.1:3001/auth/callback'", "OAUTH_CALLBACK_URL='http://127.0.0.1:3000/auth/callback'"));
const callback = randomBytes(24).toString('hex');
writeVars('services/order/.dev.vars', {
  ...common,
  ORDER_DATABASE_URL: process.env.ORDER_DATABASE_URL,
  COMPOSE_LOCAL_DATABASE: '1',
  ORDER_CLIENT_ID: 'order-service',
  ORDER_CLIENT_SECRET: state.orderClientSecret,
});
writeVars('services/payment/.dev.vars', {
  ...common,
  APP_ENV: 'development',
  PAYMENT_DATABASE_URL: process.env.PAYMENT_DATABASE_URL,
  COMPOSE_LOCAL_DATABASE: '1',
  XENDIT_SECRET_KEY: callback,
  XENDIT_CALLBACK_TOKEN: callback,
  COMPOSE_XENDIT_ORIGIN: 'http://xendit-mock:3100',
});
const gateway = JSON.parse(readFileSync('gateway/wrangler.jsonc', 'utf8'));
gateway.services.push({ binding: 'ORDER', service: 'umkm-order' });
gateway.main = '../infra/compose/gateway.ts';
writeFileSync('gateway/wrangler.compose.jsonc', JSON.stringify(gateway, null, 2) + '\n', { mode: 0o600 });
writeVars('gateway/.dev.vars', { COMPOSE_CONTROL_TOKEN: callback });
writeFileSync('.local/compose-control-token', callback, { mode: 0o600 });
