'use strict';

const { writeFileSync } = require('node:fs');
const { resolve } = require('node:path');

function createOrder(name) {
  return {
    name,
    request: {
      method: 'POST',
      header: [{ key: 'Content-Type', value: 'application/json' }],
      url: '{{baseUrl}}/order-service/orders',
      body: { mode: 'raw', raw: JSON.stringify({ customerName: `Lab 10 ${name}`,
        items: [{ productId: '{{productId}}', quantity: 1 }] }, null, 2), options: { raw: { language: 'json' } } },
    },
    event: [{ listen: 'test', script: { type: 'text/javascript', exec: [
      "pm.test('Order tetap HTTP 201', () => pm.response.to.have.status(201));",
      "if (pm.response.code === 201) { const order = pm.response.json().data; pm.collectionVariables.set('lastOrderId', order.id); console.log('Cocokkan log consumer dengan messageId:', 'order-' + order.id); }",
    ] } }],
  };
}

const groups = [
  ['01 Normal - consumer harus ready dahulu', 'Broker, katalog, order, gateway, dan satu consumer aktif. HTTP 201 tidak menunggu email simulasi.', 1],
  ['02 Consumer mati - kirim tepat 3 order', 'Hentikan hanya notification consumer SETELAH queue/binding terbentuk. Kirim 3 request ini, ambil dashboard Ready=3, lalu nyalakan consumer dan simpan log pemulihan.', 3],
  ['03 Competing consumers - 6 order', 'Antrean kosong; dua consumer membaca notification-queue. Amati 6 ID order dibagi antara dua worker.', 6],
  ['04 Pub-sub - 2 order', 'Satu consumer notification-queue dan satu consumer audit-queue harus ready dahulu. Kedua antrean menerima dua event yang sama.', 2],
  ['05 Crash - hanya SATU order', 'Hentikan semua consumer notification-queue; jalankan node notification-service/notification-service.js --crash. Kirim satu order, tunggu crash, lalu mulai consumer biasa. Cocokkan messageId email pertama dan kedua.', 1],
];

const collection = {
  info: { name: 'Lab 10 - RabbitMQ Marketplace UMKM',
    description: 'Kelanjutan repository Lab 09. Jalankan folder secara MANUAL dan BERURUTAN dengan intervensi consumer sesuai deskripsi; jangan Run seluruh collection sekaligus. Isi apiKey secara lokal, jangan export nilainya. Dashboard RabbitMQ lokal :15672. Event menggunakan ID produk string dan items sesuai API Marketplace UMKM. Email adalah simulasi. Rate limit 20 request/10 detik/IP.',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
  auth: { type: 'apikey', apikey: [{ key: 'key', value: 'X-API-Key', type: 'string' },
    { key: 'value', value: '{{apiKey}}', type: 'string' }, { key: 'in', value: 'header', type: 'string' }] },
  variable: [{ key: 'baseUrl', value: 'http://127.0.0.1:8080' }, { key: 'productId', value: 'prod-001' }],
  item: groups.map(([name, description, count]) => ({ name, description,
    item: Array.from({ length: count }, (_, index) => createOrder(`Order ${index + 1} / ${name}`)) })),
};
collection.item.push({ name: '06 Lihat pesanan', request: { method: 'GET', url: '{{baseUrl}}/order-service/orders', header: [] },
  event: [{ listen: 'test', script: { type: 'text/javascript', exec: ["pm.test('Riwayat HTTP 200', () => pm.response.to.have.status(200));"] } }] });
const file = resolve(__dirname, '../docs/postman/lab10.postman_collection.json');
writeFileSync(file, JSON.stringify(collection, null, 2) + '\n');
console.log('Collection Lab 10 dibuat tanpa nilai kredensial.');
