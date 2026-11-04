'use strict';

const { mkdirSync, writeFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { openScreenshotBrowser } = require('./lab10-evidence');

async function main() {
  const directory = resolve(__dirname, '../docs/lab10');
  mkdirSync(directory, { recursive: true });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="1030" viewBox="0 0 1440 1030">
  <defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto"><path d="M0,0 L10,5 L0,10 Z" fill="#375d70"/></marker><marker id="green" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto"><path d="M0,0 L10,5 L0,10 Z" fill="#177b67"/></marker></defs>
  <style>text{font-family:'Segoe UI',Arial,sans-serif;fill:#173748}.title{font-size:30px;font-weight:700}.label{font-size:22px;font-weight:700}.small{font-size:18px}.note{font-size:17px;fill:#4d6b7c}.box{fill:white;stroke:#bfd1db;stroke-width:2;rx:14}.event{fill:#e5f5ed;stroke:#77bca4;stroke-width:2;rx:14}.queue{fill:#fff3da;stroke:#d4b16a;stroke-width:2;rx:14}.line{fill:none;stroke:#375d70;stroke-width:2.5;marker-end:url(#arrow)}.async{fill:none;stroke:#177b67;stroke-width:3;marker-end:url(#green)}</style>
  <rect width="1440" height="1030" fill="#f1f5f7"/>
  <text x="40" y="48" class="title">Lab 10 - Marketplace UMKM</text>
  <text x="40" y="78" class="note">HTTP untuk keputusan stok; event untuk pekerjaan yang dapat menyusul.</text>
  <path class="line" d="M390 140 V110 H1200 V140"/><text x="795" y="103" class="note">GET /product-service/products</text>
  <rect class="box" x="40" y="140" width="160" height="100"/><text x="120" y="183" text-anchor="middle" class="label">Klien</text><text x="120" y="213" text-anchor="middle" class="small">Postman / UI</text>
  <rect class="box" x="280" y="140" width="220" height="100"/><text x="390" y="180" text-anchor="middle" class="label">Gateway :8080</text><text x="390" y="213" text-anchor="middle" class="small">API key + rate limit</text>
  <rect class="box" x="590" y="140" width="300" height="120"/><text x="740" y="180" text-anchor="middle" class="label">Order Service :3001</text><text x="740" y="213" text-anchor="middle" class="small">Pesanan + snapshot harga</text><text x="740" y="241" text-anchor="middle" class="note">Simpan dahulu, lalu publish</text>
  <rect class="box" x="1060" y="140" width="340" height="120"/><text x="1230" y="180" text-anchor="middle" class="label">Catalog Service :3000</text><text x="1230" y="213" text-anchor="middle" class="small">Produk, harga, dan stok</text><text x="1230" y="241" text-anchor="middle" class="note">Pemilik tunggal stok</text>
  <path class="line" d="M200 190 H280"/><path class="line" d="M500 190 H590"/>
  <path class="line" d="M890 190 H1060"/><text x="975" y="155" text-anchor="middle" class="note">1. HTTP reserve</text><text x="975" y="221" text-anchor="middle" class="note">timeout 2 detik</text>
  <path class="async" d="M740 260 V390"/><text x="760" y="306" class="small">2. order.created</text><text x="760" y="335" class="note">persistent + messageId</text><text x="760" y="363" class="note">HTTP 201 tanpa menunggu email</text>
  <rect class="event" x="505" y="390" width="470" height="120"/><text x="740" y="432" text-anchor="middle" class="label">RabbitMQ :5672</text><text x="740" y="466" text-anchor="middle" class="small">exchange orders - fanout - durable</text><text x="740" y="494" text-anchor="middle" class="note">Satu salinan per antrean terikat</text>
  <rect class="box" x="1070" y="390" width="330" height="120"/><text x="1235" y="432" text-anchor="middle" class="label">Management :15672</text><text x="1235" y="468" text-anchor="middle" class="small">Ready / Unacked / Consumers</text><path class="line" d="M1070 450 H975" stroke-dasharray="6 5"/>
  <path class="async" d="M650 510 V560 H385 V610"/><path class="async" d="M830 510 V560 H1125 V610"/>
  <rect class="queue" x="165" y="610" width="440" height="95"/><text x="385" y="650" text-anchor="middle" class="label">notification-queue</text><text x="385" y="680" text-anchor="middle" class="small">durable - competing consumers</text>
  <rect class="queue" x="955" y="610" width="340" height="95"/><text x="1125" y="650" text-anchor="middle" class="label">audit-queue</text><text x="1125" y="680" text-anchor="middle" class="small">durable - subscriber opsional</text>
  <path class="line" d="M285 705 V745 H195 V785"/><path class="line" d="M485 705 V745 H575 V785"/><path class="line" d="M1125 705 V785"/>
  <rect class="box" x="40" y="785" width="310" height="110"/><text x="195" y="824" text-anchor="middle" class="label">Notification worker A</text><text x="195" y="856" text-anchor="middle" class="small">Email simulasi, lalu ack</text><text x="195" y="882" text-anchor="middle" class="note">prefetch 1</text>
  <rect class="box" x="420" y="785" width="310" height="110"/><text x="575" y="824" text-anchor="middle" class="label">Notification worker B</text><text x="575" y="856" text-anchor="middle" class="small">Opsional, antrean sama</text><text x="575" y="882" text-anchor="middle" class="note">Membagi beban dengan A</text>
  <rect class="box" x="955" y="785" width="340" height="110"/><text x="1125" y="824" text-anchor="middle" class="label">Consumer audit</text><text x="1125" y="856" text-anchor="middle" class="small">Program sama, antrean berbeda</text><text x="1125" y="882" text-anchor="middle" class="note">Menerima salinan event</text>
  <rect x="40" y="935" width="1360" height="65" rx="10" fill="#dce9ef"/><text x="65" y="963" class="small">Ack setelah pemrosesan; crash sebelum ack menyebabkan redelivery (at-least-once).</text><text x="65" y="989" class="note">Set processed hanya di memori dan hilang saat restart. Belum ada outbox; event dapat hilang saat publisher terputus.</text>
  </svg>`;
  writeFileSync(resolve(directory, 'arsitektur.svg'), svg + '\n');
  const browser = await openScreenshotBrowser();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1030 }, deviceScaleFactor: 1.5 });
    await page.setContent(`<html><head><style>body{margin:0}</style></head><body>${svg}</body></html>`);
    await page.screenshot({ path: resolve(directory, 'arsitektur.png'), fullPage: true });
  } finally { await browser.close(); }
  console.log('Diagram Lab 10: docs/lab10/arsitektur.svg dan arsitektur.png');
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
