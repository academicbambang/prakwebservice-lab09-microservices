'use strict';

const { randomUUID } = require('node:crypto');
const express = require('express');

// Baseline Lab 09: produk dan pesanan dimiliki satu proses yang sama.
// Fixture sengaja lokal agar contoh monolit dapat dipelajari secara mandiri.
function createMonolithApp() {
  const products = [
    { id: 'prod-001', name: 'Kopi Arabika Gayo', price: 85000, stock: 40 },
    { id: 'prod-002', name: 'Tas Anyaman Pandan', price: 120000, stock: 15 },
    { id: 'prod-003', name: 'Kaos Batik UMKM', price: 95000, stock: 30 },
  ];
  const orders = [];
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '32kb' }));

  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'monolith' }));
  app.get('/products', (_req, res) => res.json({ data: products }));
  app.get('/products/:id', (req, res) => {
    const product = products.find((entry) => entry.id === req.params.id);
    return product ? res.json({ data: product }) : res.status(404).json({ error: 'Product not found' });
  });
  app.get('/orders', (_req, res) => res.json({ data: orders }));

  app.post('/orders', (req, res) => {
    const { customerName, items } = req.body || {};
    if (typeof customerName !== 'string' || !customerName.trim() || customerName.trim().length > 100
      || !Array.isArray(items) || items.length < 1 || items.length > 50) {
      return res.status(400).json({ error: 'customerName and 1 to 50 items are required' });
    }
    const requested = new Map();
    for (const item of items) {
      if (!item || typeof item.productId !== 'string' || !item.productId.trim()
        || item.productId.trim().length > 100
        || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 100) {
        return res.status(400).json({ error: 'Each item requires productId and integer quantity from 1 to 100' });
      }
      const productId = item.productId.trim();
      requested.set(productId, (requested.get(productId) || 0) + item.quantity);
    }

    // Validasi seluruh pesanan terlebih dahulu; penolakan tidak mengubah stok.
    for (const [productId, quantity] of requested) {
      const product = products.find((entry) => entry.id === productId);
      if (!product) return res.status(404).json({ error: `Unknown product: ${productId}` });
      if (quantity > product.stock) {
        return res.status(409).json({ error: `Insufficient stock for ${productId}; available: ${product.stock}` });
      }
    }

    const pricedItems = items.map(({ productId, quantity }) => {
      const product = products.find((entry) => entry.id === productId.trim());
      return { productId: product.id, name: product.name, quantity, unitPrice: product.price, subtotal: product.price * quantity };
    });
    const order = {
      id: `ord-${randomUUID()}`,
      customerName: customerName.trim(),
      items: pricedItems,
      total: pricedItems.reduce((sum, item) => sum + item.subtotal, 0),
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    for (const [productId, quantity] of requested) {
      // Titik ikatan monolit: handler pesanan mengubah data produk langsung.
      products.find((entry) => entry.id === productId).stock -= quantity;
    }
    orders.push(order);
    return res.status(201).json({ data: order });
  });

  app.use((_req, res) => res.status(404).json({ error: 'Route not found' }));
  app.use((error, _req, res, next) => {
    if (res.headersSent) return next(error);
    if (error.type === 'entity.too.large') return res.status(413).json({ error: 'Request body is too large' });
    if (error.type === 'entity.parse.failed' || error instanceof URIError) {
      return res.status(400).json({ error: 'Invalid request JSON or URL' });
    }
    return res.status(500).json({ error: 'Internal server error' });
  });
  return app;
}

if (require.main === module) {
  const port = Number(process.env.MONOLITH_PORT || 3000);
  const server = createMonolithApp().listen(port, '127.0.0.1', () => {
    console.log(`monolith listening on http://127.0.0.1:${port}`);
  });
  server.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => server.close(() => process.exit(0)));
  }
}

module.exports = { createMonolithApp };
