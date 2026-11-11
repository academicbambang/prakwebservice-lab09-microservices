'use strict';

const { readFileSync } = require('node:fs');
const path = require('node:path');
const express = require('express');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const { buildSchema } = require('graphql');
const { createHandler } = require('graphql-http/lib/use/express');
const { createProductStore, ReservationError } = require('./products');

const schema = buildSchema(readFileSync(path.join(__dirname, 'schema.graphql'), 'utf8'));

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
 *     ProductList:
 *       type: object
 *       required:
 *       - service
 *       - data
 *       properties:
 *         service:
 *           type: string
 *           enum:
 *           - catalog-service
 *         data:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Product'
 *     Product:
 *       type: object
 *       required:
 *       - id
 *       - name
 *       - category
 *       - price
 *       - stock
 *       - seller
 *       properties:
 *         id:
 *           type: string
 *           minLength: 1
 *           maxLength: 100
 *           example: prod-001
 *           description: Spasi awal/akhir dihapus; hasilnya harus 1-100 karakter.
 *         name:
 *           type: string
 *           minLength: 1
 *         category:
 *           type: string
 *         price:
 *           type: integer
 *           minimum: 0
 *           maximum: 9007199254740991
 *           description: Harga rupiah bulat.
 *         stock:
 *           type: integer
 *           minimum: 0
 *           maximum: 9007199254740991
 *           description: Stok saat ini, kembali ke seed saat service dimulai ulang.
 *         seller:
 *           type: string
 *       example:
 *         id: prod-001
 *         name: Kopi Arabika Gayo
 *         category: kuliner
 *         price: 85000
 *         stock: 40
 *         seller: Koperasi Kopi Gayo
 *     ProductResponse:
 *       type: object
 *       required:
 *       - data
 *       properties:
 *         data:
 *           $ref: '#/components/schemas/Product'
 *     ReserveInput:
 *       type: object
 *       required:
 *       - qty
 *       properties:
 *         qty:
 *           type: integer
 *           minimum: 1
 *           maximum: 9007199254740991
 *           example: 2
 *     BatchReservationResponse:
 *       type: object
 *       required:
 *       - data
 *       properties:
 *         data:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Product'
 *     BatchReservationInput:
 *       type: object
 *       required:
 *       - items
 *       properties:
 *         items:
 *           type: array
 *           minItems: 1
 *           maxItems: 50
 *           items:
 *             $ref: '#/components/schemas/ReservationItem'
 *       description: ID produk duplikat dijumlahkan. Seluruh batch divalidasi sebelum stok apa pun dikurangi.
 *     ReservationItem:
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
 *           maximum: 9007199254740991
 *     GraphQLResponse:
 *       type: object
 *       properties:
 *         data:
 *           type: object
 *           nullable: true
 *           additionalProperties: true
 *         errors:
 *           type: array
 *           items:
 *             type: object
 *             required:
 *             - message
 *             properties:
 *               message:
 *                 type: string
 *               locations:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     line:
 *                       type: integer
 *                     column:
 *                       type: integer
 *               path:
 *                 type: array
 *                 items:
 *                   oneOf:
 *                   - type: string
 *                   - type: integer
 *       anyOf:
 *       - required:
 *         - data
 *       - required:
 *         - errors
 *     GraphQLRequest:
 *       type: object
 *       required:
 *       - query
 *       properties:
 *         query:
 *           type: string
 *           minLength: 1
 *           example: query KatalogUMKM { products { id name category price stock seller } }
 *         operationName:
 *           type: string
 *           nullable: true
 *         variables:
 *           type: object
 *           nullable: true
 *           additionalProperties: true
 *         extensions:
 *           type: object
 *           nullable: true
 *           additionalProperties: true
 *   responses:
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
 * /health:
 *   get:
 *     operationId: productHealth
 *     summary: Kesehatan proses layanan produk
 *     tags:
 *     - Products
 *     security: []
 *     responses:
 *       '200':
 *         description: Layanan produk masih berjalan.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Health'
 *             example:
 *               status: ok
 *               service: catalog-service
 *       '500':
 *         $ref: '#/components/responses/InternalError'
 * /products:
 *   get:
 *     operationId: listProducts
 *     summary: Daftar dan cari produk
 *     tags:
 *     - Products
 *     security: []
 *     responses:
 *       '200':
 *         description: Daftar produk yang cocok.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ProductList'
 *             example:
 *               service: catalog-service
 *               data:
 *               - id: prod-001
 *                 name: Kopi Arabika Gayo
 *                 category: kuliner
 *                 price: 85000
 *                 stock: 40
 *                 seller: Koperasi Kopi Gayo
 *       '400':
 *         $ref: '#/components/responses/BadRequest'
 *       '500':
 *         $ref: '#/components/responses/InternalError'
 *     parameters:
 *     - name: category
 *       in: query
 *       description: Filter kategori tanpa membedakan huruf besar/kecil; satu nilai saja.
 *       schema:
 *         type: string
 *       example: kuliner
 *     - name: search
 *       in: query
 *       description: Pencarian sebagian nama produk tanpa membedakan huruf besar/kecil; satu nilai saja.
 *       schema:
 *         type: string
 *       example: kopi
 * /products/{id}:
 *   get:
 *     operationId: getProduct
 *     summary: Detail produk dan stok terbaru
 *     tags:
 *     - Products
 *     security: []
 *     responses:
 *       '200':
 *         description: Produk ditemukan.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ProductResponse'
 *             example:
 *               data:
 *                 id: prod-001
 *                 name: Kopi Arabika Gayo
 *                 category: kuliner
 *                 price: 85000
 *                 stock: 40
 *                 seller: Koperasi Kopi Gayo
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
 *       description: ID produk katalog; contoh prod-001.
 *       schema:
 *         type: string
 *         minLength: 1
 *         maxLength: 100
 *       example: prod-001
 * /products/{id}/reserve:
 *   post:
 *     operationId: reserveProduct
 *     summary: Kurangi stok satu produk
 *     tags:
 *     - Products
 *     security: []
 *     responses:
 *       '200':
 *         description: Reservasi berhasil; produk berisi stok sesudah pengurangan.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ProductResponse'
 *             example:
 *               data:
 *                 id: prod-001
 *                 name: Kopi Arabika Gayo
 *                 category: kuliner
 *                 price: 85000
 *                 stock: 38
 *                 seller: Koperasi Kopi Gayo
 *       '400':
 *         $ref: '#/components/responses/BadRequest'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 *       '409':
 *         $ref: '#/components/responses/Conflict'
 *       '413':
 *         $ref: '#/components/responses/PayloadTooLarge'
 *       '500':
 *         $ref: '#/components/responses/InternalError'
 *     description: Order Service memanggil endpoint ini melalui HTTP internal untuk pesanan satu produk unik. Melalui
 *       gateway, perubahan stok memerlukan API key. Operasi ini mengurangi stok dan tidak idempotent; jangan mengulang
 *       otomatis sesudah timeout.
 *     parameters:
 *     - name: id
 *       in: path
 *       required: true
 *       description: ID produk katalog; contoh prod-001.
 *       schema:
 *         type: string
 *         minLength: 1
 *         maxLength: 100
 *       example: prod-001
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ReserveInput'
 *           example:
 *             qty: 2
 * /reservations:
 *   post:
 *     operationId: reserveProductBatch
 *     summary: Reservasi atomik beberapa produk
 *     tags:
 *     - Products
 *     security: []
 *     responses:
 *       '200':
 *         description: Satu produk per ID unik, berisi stok sesudah pengurangan.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/BatchReservationResponse'
 *       '400':
 *         $ref: '#/components/responses/BadRequest'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 *       '409':
 *         $ref: '#/components/responses/Conflict'
 *       '413':
 *         $ref: '#/components/responses/PayloadTooLarge'
 *       '500':
 *         $ref: '#/components/responses/InternalError'
 *     description: Validasi seluruh batch sebelum mutasi, gabungkan jumlah produk duplikat, lalu kurangi semua stok
 *       dalam satu proses katalog. Atomic di katalog; belum merupakan transaksi terdistribusi dengan penyimpanan pesanan.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/BatchReservationInput'
 *           example:
 *             items:
 *             - productId: prod-001
 *               quantity: 2
 *             - productId: prod-002
 *               quantity: 1
 * /graphql:
 *   get:
 *     operationId: queryGraphQLGet
 *     summary: Query GraphQL melalui URL
 *     tags:
 *     - Products
 *     security: []
 *     responses:
 *       '200':
 *         description: Hasil eksekusi query. Periksa errors untuk kesalahan GraphQL.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/GraphQLResponse'
 *             example:
 *               data:
 *                 products:
 *                 - id: prod-001
 *                   name: Kopi Arabika Gayo
 *                   stock: 40
 *           application/graphql-response+json:
 *             schema:
 *               $ref: '#/components/schemas/GraphQLResponse'
 *             example:
 *               data:
 *                 products:
 *                 - id: prod-001
 *                   name: Kopi Arabika Gayo
 *                   stock: 40
 *       '400':
 *         description: JSON atau parameter tidak valid, query tidak valid, atau kesalahan validasi GraphQL.
 *         content:
 *           application/json:
 *             schema:
 *               anyOf:
 *               - $ref: '#/components/schemas/Error'
 *               - $ref: '#/components/schemas/GraphQLResponse'
 *           application/graphql-response+json:
 *             schema:
 *               $ref: '#/components/schemas/GraphQLResponse'
 *       '413':
 *         $ref: '#/components/responses/PayloadTooLarge'
 *       '406':
 *         description: Header Accept tidak didukung oleh GraphQL over HTTP.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/GraphQLResponse'
 *       '500':
 *         $ref: '#/components/responses/InternalError'
 *     description: 'Schema publik read-only: products(category, search) dan product(id). Apollo Sandbox tersedia di
 *       /sandbox. Schema dan query membaca stok katalog yang sama dengan REST.'
 *     parameters:
 *     - name: query
 *       in: query
 *       required: true
 *       schema:
 *         type: string
 *         minLength: 1
 *       example: query KatalogUMKM { products { id name category price stock seller } }
 *     - name: operationName
 *       in: query
 *       schema:
 *         type: string
 *       example: KatalogUMKM
 *     - name: variables
 *       in: query
 *       description: Object variabel GraphQL yang diserialisasi sebagai JSON.
 *       schema:
 *         type: string
 *       example: '{}'
 *   post:
 *     operationId: queryGraphQLPost
 *     summary: Query GraphQL melalui JSON
 *     tags:
 *     - Products
 *     security: []
 *     responses:
 *       '200':
 *         description: Hasil eksekusi query. Periksa errors untuk kesalahan GraphQL.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/GraphQLResponse'
 *             example:
 *               data:
 *                 products:
 *                 - id: prod-001
 *                   name: Kopi Arabika Gayo
 *                   stock: 40
 *           application/graphql-response+json:
 *             schema:
 *               $ref: '#/components/schemas/GraphQLResponse'
 *             example:
 *               data:
 *                 products:
 *                 - id: prod-001
 *                   name: Kopi Arabika Gayo
 *                   stock: 40
 *       '400':
 *         description: JSON atau parameter tidak valid, query tidak valid, atau kesalahan validasi GraphQL.
 *         content:
 *           application/json:
 *             schema:
 *               anyOf:
 *               - $ref: '#/components/schemas/Error'
 *               - $ref: '#/components/schemas/GraphQLResponse'
 *           application/graphql-response+json:
 *             schema:
 *               $ref: '#/components/schemas/GraphQLResponse'
 *       '413':
 *         $ref: '#/components/responses/PayloadTooLarge'
 *       '406':
 *         description: Header Accept tidak didukung oleh GraphQL over HTTP.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/GraphQLResponse'
 *       '415':
 *         description: Content-Type tidak didukung; gunakan application/json.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/GraphQLResponse'
 *       '500':
 *         $ref: '#/components/responses/InternalError'
 *     description: Tidak memerlukan API key karena schema hanya menawarkan query katalog. Introspection tersedia untuk
 *       Apollo Sandbox. Tetap memakai kuota API gateway.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/GraphQLRequest'
 *           example:
 *             query: query KatalogUMKM { products { id name category price stock seller } }
 */
const specification = swaggerJsdoc({
  failOnErrors: true,
  definition: { openapi: '3.0.3', info: { title: 'Product Service', version: '1.1.0' }, servers: [{ url: '/' }] },
  apis: [__filename],
});

function createCatalogApp() {
  const app = express();
  const { findProducts, findProduct, reserveProduct, reserveProducts } = createProductStore();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '32kb' }));
  app.get('/openapi.json', (_req, res) => res.json(specification));
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(specification));

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

module.exports = { specification, createCatalogApp };
