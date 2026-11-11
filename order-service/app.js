'use strict';

const { randomUUID } = require('node:crypto');
const express = require('express');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const { OrderError, validateOrderInput, priceOrder } = require('./order');

/**
 * @openapi
 * components:
 *   schemas:
 *     Health:
 *       type: object
 *       required:
 *       - status
 *       - service
 *       properties:
 *         status:
 *           type: string
 *           enum:
 *           - ok
 *           - unavailable
 *         service:
 *           type: string
 *           enum:
 *           - gateway
 *           - catalog-service
 *           - order-service
 *     Error:
 *       type: object
 *       required:
 *       - error
 *       properties:
 *         error:
 *           type: string
 *     OrderList:
 *       type: object
 *       required:
 *       - service
 *       - data
 *       properties:
 *         service:
 *           type: string
 *           enum:
 *           - order-service
 *         data:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Order'
 *     Order:
 *       type: object
 *       required:
 *       - id
 *       - customerName
 *       - items
 *       - total
 *       - status
 *       - createdAt
 *       properties:
 *         id:
 *           type: string
 *           pattern: ^ord-
 *         customerName:
 *           type: string
 *           minLength: 1
 *           maxLength: 100
 *         items:
 *           type: array
 *           minItems: 1
 *           maxItems: 50
 *           items:
 *             $ref: '#/components/schemas/OrderItem'
 *         total:
 *           type: integer
 *           minimum: 0
 *           maximum: 9007199254740991
 *         status:
 *           type: string
 *           enum:
 *           - pending
 *         createdAt:
 *           type: string
 *           format: date-time
 *       example:
 *         id: ord-00000000-0000-4000-8000-000000000001
 *         customerName: Bambang
 *         items:
 *         - productId: prod-001
 *           name: Kopi Arabika Gayo
 *           quantity: 2
 *           unitPrice: 85000
 *           subtotal: 170000
 *         total: 170000
 *         status: pending
 *         createdAt: '2026-10-28T09:00:00.000Z'
 *     OrderItem:
 *       type: object
 *       required:
 *       - productId
 *       - name
 *       - quantity
 *       - unitPrice
 *       - subtotal
 *       properties:
 *         productId:
 *           type: string
 *           minLength: 1
 *           maxLength: 100
 *           example: prod-001
 *           description: Spasi awal/akhir dihapus; hasilnya harus 1-100 karakter.
 *         name:
 *           type: string
 *         quantity:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *         unitPrice:
 *           type: integer
 *           minimum: 0
 *           maximum: 9007199254740991
 *         subtotal:
 *           type: integer
 *           minimum: 0
 *           maximum: 9007199254740991
 *     OrderResponse:
 *       type: object
 *       required:
 *       - data
 *       properties:
 *         data:
 *           $ref: '#/components/schemas/Order'
 *     OrderInput:
 *       type: object
 *       required:
 *       - customerName
 *       - items
 *       properties:
 *         customerName:
 *           type: string
 *           minLength: 1
 *           maxLength: 100
 *           description: Spasi awal/akhir dihapus; nama tidak boleh kosong.
 *         items:
 *           type: array
 *           minItems: 1
 *           maxItems: 50
 *           items:
 *             $ref: '#/components/schemas/OrderItemInput'
 *       description: Harga/total dari klien diabaikan. ID produk duplikat dijumlahkan saat reservasi.
 *       example:
 *         customerName: Bambang
 *         items:
 *         - productId: prod-001
 *           quantity: 2
 *     OrderItemInput:
 *       type: object
 *       required:
 *       - productId
 *       - quantity
 *       properties:
 *         productId:
 *           type: string
 *           minLength: 1
 *           maxLength: 100
 *           example: prod-001
 *           description: Spasi awal/akhir dihapus; hasilnya harus 1-100 karakter.
 *         quantity:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           example: 2
 *   responses:
 *     BadGateway:
 *       description: Gateway tidak dapat menghubungi service tujuan, atau data katalog tidak valid.
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Error'
 *           example:
 *             error: Service tujuan tidak tersedia
 *     InternalError:
 *       description: Kesalahan internal service.
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Error'
 *           example:
 *             error: Internal server error
 *     BadRequest:
 *       description: JSON, parameter, atau nilai input tidak valid.
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Error'
 *           example:
 *             error: qty must be a positive safe integer
 *     NotFound:
 *       description: Produk atau pesanan tidak ditemukan.
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Error'
 *           example:
 *             error: Product not found
 *     Conflict:
 *       description: Stok tidak cukup; batch yang ditolak tidak mengubah stok.
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Error'
 *           example:
 *             error: 'Insufficient stock for prod-001; available: 0'
 *     PayloadTooLarge:
 *       description: Body request melampaui 32 KB.
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Error'
 *           example:
 *             error: Request body is too large
 *     ServiceUnavailable:
 *       description: Katalog tidak tersedia atau deadline HTTP 2 detik terlampaui; pesanan baru tidak disimpan.
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Error'
 *           example:
 *             error: Catalog service is unavailable or timed out
 * /health:
 *   get:
 *     operationId: orderHealth
 *     summary: Kesehatan proses layanan pesanan
 *     tags:
 *     - Orders
 *     security: []
 *     responses:
 *       '200':
 *         description: Layanan pesanan masih berjalan.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Health'
 *             example:
 *               status: ok
 *               service: order-service
 *       '502':
 *         $ref: '#/components/responses/BadGateway'
 *       '500':
 *         $ref: '#/components/responses/InternalError'
 * /orders:
 *   get:
 *     operationId: listOrders
 *     summary: Riwayat pesanan
 *     tags:
 *     - Orders
 *     security: []
 *     responses:
 *       '200':
 *         description: Riwayat lokal tetap dapat dibaca saat layanan produk mati.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/OrderList'
 *             example:
 *               service: order-service
 *               data: []
 *       '502':
 *         $ref: '#/components/responses/BadGateway'
 *       '500':
 *         $ref: '#/components/responses/InternalError'
 *   post:
 *     operationId: createOrder
 *     summary: Buat pesanan dan reservasi stok
 *     tags:
 *     - Orders
 *     security: []
 *     responses:
 *       '201':
 *         description: Pesanan disimpan dengan snapshot nama dan harga dari katalog.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/OrderResponse'
 *             example:
 *               data:
 *                 id: ord-00000000-0000-4000-8000-000000000001
 *                 customerName: Bambang
 *                 items:
 *                 - productId: prod-001
 *                   name: Kopi Arabika Gayo
 *                   quantity: 2
 *                   unitPrice: 85000
 *                   subtotal: 170000
 *                 total: 170000
 *                 status: pending
 *                 createdAt: '2026-10-28T09:00:00.000Z'
 *         headers:
 *           Location:
 *             description: URL relatif detail pesanan melalui gateway.
 *             schema:
 *               type: string
 *               example: /order-service/orders/ord-00000000-0000-4000-8000-000000000001
 *       '502':
 *         $ref: '#/components/responses/BadGateway'
 *       '400':
 *         $ref: '#/components/responses/BadRequest'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 *       '409':
 *         $ref: '#/components/responses/Conflict'
 *       '413':
 *         $ref: '#/components/responses/PayloadTooLarge'
 *       '503':
 *         $ref: '#/components/responses/ServiceUnavailable'
 *       '500':
 *         $ref: '#/components/responses/InternalError'
 *     description: Order Service hanya memiliki data pesanan. Stok dimiliki Catalog Service dan diminta lewat HTTP
 *       dengan deadline 2 detik. Beberapa produk unik memakai reservasi batch. Belum ada kompensasi otomatis jika
 *       reservasi berhasil tetapi penyimpanan pesanan gagal.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/OrderInput'
 *           example:
 *             customerName: Bambang
 *             items:
 *             - productId: prod-001
 *               quantity: 2
 * /orders/{id}:
 *   get:
 *     operationId: getOrder
 *     summary: Detail pesanan yang tersimpan
 *     tags:
 *     - Orders
 *     security: []
 *     responses:
 *       '200':
 *         description: Snapshot pesanan saat transaksi.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/OrderResponse'
 *             example:
 *               data:
 *                 id: ord-00000000-0000-4000-8000-000000000001
 *                 customerName: Bambang
 *                 items:
 *                 - productId: prod-001
 *                   name: Kopi Arabika Gayo
 *                   quantity: 2
 *                   unitPrice: 85000
 *                   subtotal: 170000
 *                 total: 170000
 *                 status: pending
 *                 createdAt: '2026-10-28T09:00:00.000Z'
 *       '502':
 *         $ref: '#/components/responses/BadGateway'
 *       '400':
 *         $ref: '#/components/responses/BadRequest'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 *       '500':
 *         $ref: '#/components/responses/InternalError'
 *     parameters:
 *     - name: id
 *       in: path
 *       required: true
 *       description: ID pesanan dari respons pembuatan pesanan.
 *       schema:
 *         type: string
 *         minLength: 1
 *       example: ord-00000000-0000-4000-8000-000000000001
 */
const specification = swaggerJsdoc({
  failOnErrors: true,
  definition: { openapi: '3.0.3', info: { title: 'Order Service', version: '1.1.0' }, servers: [{ url: '/' }] },
  apis: [__filename],
});

function createOrderApp({
  catalogUrl = process.env.CATALOG_SERVICE_URL || 'http://127.0.0.1:3000',
  fetchImpl = fetch,
  publishOrderCreated = () => false,
} = {}) {
  const app = express();
  const orders = new Map();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '32kb' }));
  app.get('/openapi.json', (_req, res) => res.json(specification));
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(specification));

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
    // Synchronous enqueue only. Delivery/ack/email happen outside the HTTP request.
    publishOrderCreated(order);
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

module.exports = { specification, createOrderApp };
