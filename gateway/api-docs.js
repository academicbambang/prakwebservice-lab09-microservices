'use strict';

const express = require('express');
const swaggerUi = require('swagger-ui-dist');
const baseSpecification = require('./spec-base.json');

// Namespace every local component reference, including nested response references.
function namespaceSpec(spec, namespace) {
  function rewrite(value) {
    if (Array.isArray(value)) return value.map(rewrite);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key,
      key === '$ref' && typeof child === 'string' && child.startsWith('#/components/')
        ? child.replace(/^(#\/components\/[^/]+\/)/, `$1${namespace}_`) : rewrite(child)]));
  }
  const result = rewrite(spec);
  for (const entries of Object.values(result.components || {})) {
    for (const name of Object.keys(entries)) {
      entries[`${namespace}_${name}`] = entries[name];
      delete entries[name];
    }
  }
  return result;
}

async function buildSpec({
  catalogUrl = 'http://127.0.0.1:3000', orderUrl = 'http://127.0.0.1:3001',
  productDocUrl = process.env.PRODUCT_DOC_URL || new URL('/openapi.json', catalogUrl).href,
  orderDocUrl = process.env.ORDER_DOC_URL || new URL('/openapi.json', orderUrl).href,
  fetchImpl = fetch,
} = {}) {
  const merged = structuredClone(baseSpecification);
  merged.tags = [{ name: 'Kesehatan' }, { name: 'Products' }, { name: 'Orders' }];
  const sources = [
    { prefix: '/product-service', namespace: 'catalog', url: productDocUrl },
    { prefix: '/order-service', namespace: 'order', url: orderDocUrl },
  ];
  const results = await Promise.all(sources.map(async (source) => {
    try {
      const response = await fetchImpl(source.url, { signal: AbortSignal.timeout(2000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const spec = await response.json();
      if (spec.openapi !== '3.0.3' || !spec.paths) throw new Error('Invalid OpenAPI source');
      return { source, spec: namespaceSpec(spec, source.namespace) };
    } catch (error) {
      return { source, error: error.message };
    }
  }));
  merged['x-documentation-sources'] = results.map(({ source, error }) => ({
    prefix: source.prefix, available: !error, ...(error ? { error } : {}),
  }));
  for (const { source, spec } of results) {
    if (!spec) continue;
    for (const [kind, entries] of Object.entries(spec.components || {})) {
      Object.assign(merged.components[kind] ||= {}, entries);
    }
    for (const [route, item] of Object.entries(spec.paths)) {
      for (const [method, op] of Object.entries(item)) {
        if (!['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].includes(method)) continue;
        delete op.servers;
        op.responses['429'] = { $ref: '#/components/responses/RateLimited' };
        op.responses['502'] ||= { $ref: '#/components/responses/BadGateway' };
        const protectedRoute = source.namespace === 'order'
          || (method === 'post' && (route === '/reservations' || route.endsWith('/reserve')));
        op.security = protectedRoute ? [{ ApiKeyAuth: [] }] : [];
        if (protectedRoute) op.responses['401'] = { $ref: '#/components/responses/Unauthorized' };
      }
      delete item.servers;
      merged.paths[source.prefix + route] = item;
    }
  }
  return merged;
}

const page = `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Dokumentasi API | Lab 11 Microservices</title>
  <link rel="stylesheet" href="/docs/swagger-ui.css">
  <style>
    body { margin: 0; background: #fafafa; }
    .docs-header { padding: 18px 24px; background: #162b25; color: #fff; font: 15px/1.6 system-ui, sans-serif; }
    .docs-header strong { display: block; font-size: 19px; }
    .docs-header nav { display: flex; flex-wrap: wrap; gap: 20px; margin-top: 6px; }
    .docs-header a { color: #bfe9d4; }
    .docs-header p { margin: 8px 0 0; max-width: 850px; }
    #swagger-ui { max-width: 1300px; margin: 0 auto; }
  </style>
</head>
<body>
  <header class="docs-header">
    <strong>Lab 11 / Dokumentasi API Otomatis</strong>
    <nav aria-label="Navigasi dokumentasi"><a href="/">Dashboard</a><a href="/sandbox">Apollo Sandbox</a><a href="/openapi.json">OpenAPI JSON</a></nav>
    <p>Pilih endpoint dan gunakan Try it out untuk menguji. Isi X-API-Key melalui Authorize untuk pesanan dan reservasi stok. Setiap panggilan API berbagi batas 20 request per 10 detik.</p>
  </header>
  <main id="swagger-ui"></main>
  <script src="/docs/swagger-ui-bundle.js"></script>
  <script src="/docs/swagger-initializer.js"></script>
</body>
</html>`;

const initializer = `'use strict';
window.addEventListener('load', function () {
  window.ui = SwaggerUIBundle({
    url: '/openapi.json',
    dom_id: '#swagger-ui',
    deepLinking: true,
    displayRequestDuration: true,
    persistAuthorization: false,
    validatorUrl: null,
    queryConfigEnabled: false,
    presets: [SwaggerUIBundle.presets.apis],
    layout: 'BaseLayout'
  });
});
`;

// Mount before the API limiter: inspecting documentation does not spend API quota.
// Requests made by Swagger's Try it out still reach the ordinary gateway routes.
function mountApiDocs(app, options = {}) {
  app.get('/openapi.json', async (_req, res, next) => {
    try { res.set('Cache-Control', 'no-store').json(await buildSpec(options)); } catch (error) { next(error); }
  });
  app.get('/docs', (req, res, next) => {
    if (req.path.endsWith('/')) return next();
    return res.redirect(302, '/docs/');
  });
  app.get('/docs/', (_req, res) => res.type('html').send(page));
  app.get('/docs/swagger-initializer.js', (_req, res) => res.type('application/javascript').send(initializer));
  app.use('/docs', express.static(swaggerUi.getAbsoluteFSPath(), { index: false, redirect: false }));
}

module.exports = { mountApiDocs, buildSpec, namespaceSpec };
