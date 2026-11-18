'use strict';

const { randomUUID } = require('node:crypto');
const { performance } = require('node:perf_hooks');

function mountObservability(app, service, { mountHealth = true } = {}) {
  const startedAt = new Date().toISOString();
  let requests = 0;
  let errors5xx = 0;
  let totalMs = 0;

  app.use((req, res, next) => {
    if (req.path.toLowerCase().replace(/\/$/, '') === '/health') return next();

    const suppliedId = req.get('X-Request-Id');
    const id = suppliedId && /^[A-Za-z0-9._-]{1,128}$/.test(suppliedId) ? suppliedId : randomUUID();
    req.id = id;
    req.headers['x-request-id'] = id;
    res.set('X-Request-Id', id);
    const started = performance.now();
    const requestPath = req.path;

    res.once('finish', () => {
      const duration = performance.now() - started;
      requests++;
      totalMs += duration;
      if (res.statusCode >= 500) errors5xx++;
      console.log(JSON.stringify({
        time: new Date().toISOString(),
        service,
        id,
        method: req.method,
        path: requestPath,
        status: res.statusCode,
        ms: Math.round(duration),
      }));
    });
    next();
  });

  if (mountHealth) {
    app.get('/health', (_req, res) => res.json({ status: 'ok', service }));
  }
  app.get('/metrics', (_req, res) => {
    res.set('Cache-Control', 'no-store').json({
      service,
      startedAt,
      requests,
      errors5xx,
      avgMs: requests ? Math.round(totalMs / requests) : 0,
    });
  });
}

module.exports = { mountObservability };
