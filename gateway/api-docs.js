'use strict';

const express = require('express');
const swaggerUi = require('swagger-ui-dist');
const specification = require('./openapi.json');

const page = `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Dokumentasi API | Lab 09 Microservices</title>
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
    <strong>Lab 09 / Dokumentasi API</strong>
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
function mountApiDocs(app) {
  app.get('/openapi.json', (_req, res) => res.json(specification));
  app.get('/docs', (req, res, next) => {
    if (req.path.endsWith('/')) return next();
    return res.redirect(302, '/docs/');
  });
  app.get('/docs/', (_req, res) => res.type('html').send(page));
  app.get('/docs/swagger-initializer.js', (_req, res) => res.type('application/javascript').send(initializer));
  app.use('/docs', express.static(swaggerUi.getAbsoluteFSPath(), { index: false, redirect: false }));
}

module.exports = { mountApiDocs };
