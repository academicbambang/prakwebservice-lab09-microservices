'use strict';

const { readFileSync } = require('node:fs');
const path = require('node:path');
const express = require('express');
const { buildSchema } = require('graphql');
const { createHandler } = require('graphql-http/lib/use/express');
const { createProductStore, ReservationError } = require('./products');

const schema = buildSchema(readFileSync(path.join(__dirname, 'schema.graphql'), 'utf8'));

function createCatalogApp() {
  const app = express();
  const { findProducts, findProduct, reserveProduct, reserveProducts } = createProductStore();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '32kb' }));

  // Backend ini diasumsikan berada di jaringan internal; API key diperiksa gateway.
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'catalog-service' });
  });

  app.get('/products', (req, res) => {
    const { category, search } = req.query;
    if ((category !== undefined && typeof category !== 'string')
      || (search !== undefined && typeof search !== 'string')) {
      return res.status(400).json({ error: 'category and search must each be a single string' });
    }
    return res.json({ service: 'catalog-service', data: findProducts({ category, search }) });
  });

  app.get('/products/:id', (req, res) => {
    const product = findProduct(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    return res.json({ data: product });
  });

  app.post('/products/:id/reserve', (req, res) => {
    return res.json({ data: reserveProduct(req.params.id, req.body?.qty) });
  });

  app.post('/reservations', (req, res) => {
    return res.json({ data: reserveProducts(req.body?.items) });
  });

  // graphql-http mempertahankan format respons dan validasi standar GraphQL.
  app.all('/graphql', createHandler({
    schema,
    rootValue: {
      products: findProducts,
      product: ({ id }) => findProduct(id),
    },
  }));

  app.use((req, res) => res.status(404).json({ error: 'Route not found' }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof ReservationError) return res.status(error.status).json({ error: error.message });
    if (error.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Request body is too large' });
    }
    if (error.type === 'entity.parse.failed' || error instanceof URIError) {
      return res.status(400).json({ error: 'Invalid request JSON or URL' });
    }
    return res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

module.exports = { createCatalogApp };
