#!/bin/sh
set -eu
npm run setup
node infra/compose/configure.mjs
exec node_modules/.bin/wrangler dev --local --ip 0.0.0.0 --port 3000 --inspector-port 0 \
  -c gateway/wrangler.compose.jsonc \
  -c services/auth/wrangler.jsonc \
  -c services/catalog/wrangler.jsonc \
  -c services/order/wrangler.jsonc \
  -c services/payment/wrangler.jsonc
