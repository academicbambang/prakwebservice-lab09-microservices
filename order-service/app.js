'use strict';

const { randomUUID } = require('node:crypto');
const express = require('express');
const { OrderError, validateOrderInput, priceOrder } = require('./order');

function createOrderApp({
  catalogUrl = process.env.CATALOG_SERVICE_URL || 'http://127.0.0.1:3000',
  fetchImpl = fetch,
} = {}) {
  const app = express();
  const orders = new Map();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '32kb' }));

  async function reserveCatalogProducts(items) {
    const quantities = new Map();
    for (const { productId, quantity } of items) {
      quantities.set(productId, (quantities.get(productId) || 0) + quantity);
    }
    const reservations = [...quantities].map(([productId, quantity]) => ({ productId, quantity }));
    const single = reservations.length === 1;
    const route = single
      ? `/products/${encodeURIComponent(reservations[0].productId)}/reserve`
      : '/reservations';
    const body = single ? { qty: reservations[0].quantity } : { items: reservations };
    const controller = new AbortController();
    let timeoutId;
    const timeout = new Promise((resolve, reject) => {
      timeoutId = setTimeout(() => {
        controller.abort();
        reject(new OrderError('Catalog service is unavailable or timed out', 503));
      }, 2000);
    });

    async function requestReservation() {
      const response = await fetchImpl(`${catalogUrl.replace(/\/+$/, '')}${route}`, {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response || !Number.isInteger(response.status) || typeof response.json !== 'function') {
        throw new OrderError('Catalog returned an invalid response', 502);
      }
      if (response.status >= 500) throw new OrderError('Catalog service is unavailable', 503);
      if (response.status === 404 || response.status === 409) {
        let payload;
        try {
          payload = await response.json();
        } catch (error) {
          // JSON error boleh memakai pesan bawaan; gangguan transport tetap berarti unavailable.
          if (!(error instanceof SyntaxError)) throw error;
          payload = null;
        }
        const message = typeof payload?.error === 'string' && payload.error.trim()
          ? payload.error
          : (response.status === 404 ? 'Product not found' : 'Insufficient stock');
        throw new OrderError(message, response.status);
      }
      if (!response.ok) throw new OrderError('Catalog returned an invalid response', 502);

      let payload;
      try {
        payload = await response.json();
      } catch (error) {
        if (error instanceof SyntaxError) {
          throw new OrderError('Catalog returned invalid product data', 502);
        }
        throw error;
      }
      const reservedProducts = single ? [payload?.data] : payload?.data;
      if (!Array.isArray(reservedProducts) || reservedProducts.length !== quantities.size) {
        throw new OrderError('Catalog returned invalid product data', 502);
      }
      const productsById = new Map();
      for (const product of reservedProducts) {
        if (!product || !quantities.has(product.id) || productsById.has(product.id)) {
          throw new OrderError('Catalog returned invalid product data', 502);
        }
        productsById.set(product.id, product);
      }
      return productsById;
    }

    try {
      // Deadline juga mencakup pembacaan body, termasuk bila fetchImpl pengujian mengabaikan abort.
      return await Promise.race([requestReservation(), timeout]);
    } catch (error) {
      if (error instanceof OrderError) throw error;
      throw new OrderError('Catalog service is unavailable or timed out', 503);
    } finally {
      clearTimeout(timeoutId);
      // Batalkan juga body yang tidak dibaca, misalnya respons HTTP 5xx yang terus streaming.
      controller.abort();
    }
  }

  // API key diperiksa gateway. Jalankan backend di jaringan internal/loopback.
  app.get('/health', (req, res) => res.json({ status: 'ok', service: 'order-service' }));

  app.get('/orders', (req, res) => {
    res.json({ service: 'order-service', data: [...orders.values()] });
  });

  app.get('/orders/:id', (req, res) => {
    const order = orders.get(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    return res.json({ data: order });
  });

  app.post('/orders', async (req, res) => {
    const input = validateOrderInput(req.body);
    const productsById = await reserveCatalogProducts(input.items);
    // Respons reserve berisi stok sesudah dikurangi, jadi jangan memeriksa stok dua kali.
    const pricedOrder = priceOrder(input.items, productsById, { checkStock: false });
    const order = {
      id: `ord-${randomUUID()}`,
      customerName: input.customerName,
      ...pricedOrder,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    // Reservasi dan penyimpanan order belum memakai transaksi lintas service/kompensasi.
    orders.set(order.id, order);
    return res.status(201).location(`/orders/${order.id}`).json({ data: order });
  });

  app.use((req, res) => res.status(404).json({ error: 'Route not found' }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof OrderError) return res.status(error.status).json({ error: error.message });
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

module.exports = { createOrderApp };
