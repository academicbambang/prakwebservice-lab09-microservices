const express = require('express');
const path = require('node:path');
const { createHash, timingSafeEqual } = require('node:crypto');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { rateLimit, MemoryStore } = require('express-rate-limit');
const { loadLocalEnv, readConfig } = require('./config');

function createGateway(config = {}) {
  const {
    catalogUrl = 'http://127.0.0.1:3000',
    orderUrl = 'http://127.0.0.1:3001',
    apiKey = '',
    apiKeyHash = '',
    trustProxy = 0,
    rateWindowMs = 10_000,
  } = config;
  if (apiKeyHash && !/^[a-f\d]{64}$/i.test(apiKeyHash)) {
    throw new Error('API_KEY_SHA256 harus 64 karakter hexadecimal');
  }
  const digest = apiKeyHash ? Buffer.from(apiKeyHash, 'hex') :
    apiKey ? createHash('sha256').update(apiKey).digest() : null;
  const app = express();
  app.disable('x-powered-by');
  // Direct localhost clients must not be able to spoof X-Forwarded-For.
  // Use TRUST_PROXY=1 only behind a platform with exactly one trusted hop.
  app.set('trust proxy', trustProxy);

  // Render probes readiness independently of the caller's API request quota.
  app.get('/readyz', async (_req, res) => {
    const checks = await Promise.all([catalogUrl, orderUrl].map(async (url) => {
      try {
        const response = await fetch(new URL('/health', url), {
          signal: AbortSignal.timeout(1000),
          redirect: 'error',
        });
        await response.body?.cancel();
        return response.ok;
      } catch {
        return false;
      }
    }));
    const healthy = checks.every(Boolean);
    res.set('Cache-Control', 'no-store').status(healthy ? 200 : 503).json({
      status: healthy ? 'ok' : 'unavailable',
      service: 'gateway',
    });
  });

  const store = new MemoryStore();
  const limiter = rateLimit({
    store,
    windowMs: rateWindowMs,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Terlalu banyak request. Maksimal 20 request per 10 detik per IP.' },
  });
  app.use(limiter);
  app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'gateway' }));

  function proxy(prefix, target) {
    return createProxyMiddleware({
      pathFilter: (pathname) => pathname === prefix || pathname.startsWith(`${prefix}/`),
      target,
      changeOrigin: true,
      pathRewrite: (path) => path.replace(new RegExp(`^${prefix}(?=/|\\?|$)`), '') || '/',
      proxyTimeout: 5_000,
      timeout: 6_000,
      on: {
        // The key identifies a gateway caller; it is never needed by upstreams.
        proxyReq: (proxyReq) => proxyReq.removeHeader('x-api-key'),
        proxyRes: (proxyRes) => {
          // Relative resource locations must remain reachable through this gateway.
          const location = proxyRes.headers.location;
          if (typeof location === 'string' && location.startsWith('/') && !location.startsWith('//')) {
            proxyRes.headers.location = prefix + location;
          }
        },
        error: (_error, _req, res) => {
          if (!res.headersSent) {
            res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
          }
          res.end(JSON.stringify({ error: 'Service tujuan tidak tersedia' }));
        },
      },
    });
  }

  function requireApiKey(req, res, next) {
    const key = req.get('X-API-Key') || '';
    const suppliedDigest = createHash('sha256').update(key).digest();
    if (!digest || !key || !timingSafeEqual(digest, suppliedDigest)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
  }

  // Keep the incoming body stream intact. express.json() belongs to services.
  // Lab 09 uses the PDF prefixes; the Lab 08 URLs remain valid aliases.
  const productPrefixes = ['/catalog', '/product-service'];
  const orderPrefixes = ['/orders', '/order-service'];
  app.use(productPrefixes, (req, res, next) => {
    const reservesStock = req.method === 'POST'
      && /^\/(?:products\/[^/]+\/reserve|reservations)\/?$/i.test(req.path);
    return reservesStock ? requireApiKey(req, res, next) : next();
  });
  for (const prefix of productPrefixes) app.use(proxy(prefix, catalogUrl));
  app.use(orderPrefixes, requireApiKey);
  for (const prefix of orderPrefixes) app.use(proxy(prefix, orderUrl));
  app.use((_req, res) => res.status(404).json({ error: 'Route tidak ditemukan' }));
  // Tests can close MemoryStore's timer without affecting other app instances.
  app.locals.shutdown = () => store.shutdown();
  return app;
}

if (require.main === module) {
  try {
    loadLocalEnv();
    const config = readConfig();
    const app = createGateway(config);
    const server = app.listen(config.port, config.host, () => {
      console.log(`Gateway berjalan di http://${config.host}:${config.port}`);
      if (!config.apiKey && !config.apiKeyHash) console.warn('API key belum diatur; route /orders akan ditolak (401).');
    });
    server.on('error', (error) => { console.error(error.message); process.exitCode = 1; app.locals.shutdown(); });
    for (const signal of ['SIGINT', 'SIGTERM']) {
      process.on(signal, () => server.close(() => { app.locals.shutdown(); process.exit(0); }));
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { createGateway };
