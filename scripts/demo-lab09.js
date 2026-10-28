'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { once } = require('node:events');
const { mkdirSync, writeFileSync } = require('node:fs');
const { createServer } = require('node:net');
const { resolve } = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const { requestJson, formatExchange, runSmokeTest } = require('../smoke-test');

const root = resolve(__dirname, '..');
const evidenceDir = resolve(root, 'docs/evidence/lab09');

async function freePorts(count) {
  const probes = [];
  try {
    for (let i = 0; i < count; i++) {
      const probe = createServer();
      probes.push(probe);
      probe.listen(0, '127.0.0.1');
      await once(probe, 'listening');
    }
    return probes.map((probe) => probe.address().port);
  } finally {
    await Promise.all(probes.map((probe) => new Promise((ok) => probe.close(ok))));
  }
}

async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit');
  child.kill();
  await exited;
}

async function waitReady(url, child) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if (child.startError) throw child.startError;
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Service berhenti sebelum siap: ${child.output}`);
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(500) });
      await response.arrayBuffer();
      if (response.ok) return;
    } catch { /* Retry while this newly started local process opens its socket. */ }
    await delay(50);
  }
  throw new Error(`Service tidak siap dalam 8 detik: ${url}\n${child.output}`);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
}

function evidenceHtml(smoke, failures) {
  function exchangeHtml(exchange) {
    return `<div class="exchange"><div class="request"><b>${escapeHtml(exchange.request.method)}</b> ${escapeHtml(exchange.request.url)}</div>
      ${exchange.request.body === undefined ? '' : `<p class="label">Request body</p><pre>${escapeHtml(JSON.stringify(exchange.request.body, null, 2))}</pre>`}
      <p class="label">HTTP ${exchange.response.status} &middot; ${exchange.durationMs} ms</p><pre>${escapeHtml(JSON.stringify(exchange.response.body, null, 2))}</pre></div>`;
  }
  const cards = [
    { id: 'smoke-test', title: '01 / Smoke test melalui gateway', note: `Tiga produk; pesanan HTTP 201; stok ${smoke.summary.stockBefore} menjadi ${smoke.summary.stockAfter}; total Rp${smoke.summary.total}.`, exchanges: smoke.exchanges },
    ...failures.cases.map((entry, index) => ({
      id: ['product-down-post', 'product-down-get', 'product-recovered-post'][index],
      title: `${String(index + 2).padStart(2, '0')} / ${entry.name}`,
      note: entry.state,
      exchanges: [entry.exchange],
    })),
  ];
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Bukti aktual Lab 09 - Microservices</title><style>
    *{box-sizing:border-box}body{margin:0;background:#f3f5f7;color:#182b39;font:16px/1.5 "Segoe UI",sans-serif}
    main{width:min(1180px,calc(100% - 48px));margin:32px auto}header{margin-bottom:28px}h1{font-size:30px;margin:0 0 8px}h2{font-size:23px;margin:0}p{margin:8px 0}
    .muted{color:#536675}.card{background:white;border:1px solid #d4dfe7;border-radius:14px;padding:28px;margin:24px 0;break-inside:avoid}.badge{display:inline-block;background:#dff3e9;color:#166443;padding:4px 12px;border-radius:30px;font-size:13px;font-weight:700;margin-bottom:12px}
    .identity{color:#536675;font-size:14px}.request{font:14px/1.5 Consolas,monospace;overflow-wrap:anywhere;background:#e9f0f5;padding:12px;border-radius:6px}.request b{color:#126049}
    .exchange{margin-top:22px}.label{font-size:13px;font-weight:700;color:#405a6c;margin:12px 0 4px}pre{white-space:pre-wrap;overflow-wrap:anywhere;margin:0;background:#f6f8fa;padding:14px;border-radius:6px;font:13px/1.5 Consolas,monospace}
    .foot{font-size:13px;color:#536675;margin-top:18px}nav a{margin-right:16px;color:#126049}@media print{body{background:white}main{width:100%;margin:0}.card{break-before:page;border:0}}
    </style></head><body><main><header><p class="muted">PRAKTIKUM WEB SERVICE / LAB 09</p><h1>Reservasi stok &amp; isolasi kegagalan</h1>
    <p>Bambang Herlambang &middot; 5803024019 &middot; Tugas individu</p><p class="muted">Rekaman respons HTTP aktual dari tiga proses lokal terpisah. ${escapeHtml(smoke.executedAt)}</p>
    <nav>${cards.map((card) => `<a href="#${card.id}">${escapeHtml(card.title.split(' / ')[0])}</a>`).join('')}</nav></header>
    ${cards.map((card) => `<section class="card" id="${card.id}"><span class="badge">LULUS</span><h2>${escapeHtml(card.title)}</h2><p class="identity">Bambang Herlambang &middot; 5803024019 &middot; Lab 09</p><p>${escapeHtml(card.note)}</p><p class="muted">Eksekusi: ${escapeHtml(smoke.executedAt)}</p>${card.exchanges.map(exchangeHtml).join('')}<p class="foot">Sumber: npm run test:lab09. Ini halaman bukti pengujian otomatis; bukan tangkapan layar Postman. Header API key tidak disimpan.</p></section>`).join('')}
    </main></body></html>\n`.replace(/[ \t]+$/gm, '');
}

async function main() {
  const [catalogPort, orderPort, gatewayPort] = await freePorts(3);
  const catalogUrl = `http://127.0.0.1:${catalogPort}`;
  const orderUrl = `http://127.0.0.1:${orderPort}`;
  const baseUrl = `http://127.0.0.1:${gatewayPort}`;
  const apiKey = randomBytes(32).toString('hex');
  const env = {
    ...process.env,
    HOST: '127.0.0.1',
    CATALOG_PORT: String(catalogPort),
    ORDER_PORT: String(orderPort),
    PORT: String(gatewayPort),
    CATALOG_SERVICE_URL: catalogUrl,
    ORDER_SERVICE_URL: orderUrl,
    API_KEY: apiKey,
    API_KEY_SHA256: '',
    TRUST_PROXY: '0',
  };
  const children = [];
  let interrupted = false;
  const onInterrupt = () => { interrupted = true; for (const child of children) child.kill(); };
  process.once('SIGINT', onInterrupt);
  process.once('SIGTERM', onInterrupt);

  function launch(file) {
    const child = spawn(process.execPath, [resolve(root, file)], {
      cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.output = '';
    child.on('error', (error) => { child.startError = error; });
    for (const stream of [child.stdout, child.stderr]) {
      stream.on('data', (chunk) => { child.output = (child.output + chunk.toString()).slice(-8000); });
    }
    children.push(child);
    return child;
  }

  try {
    let catalog = launch('catalog-service/server.js');
    const orders = launch('order-service/server.js');
    await Promise.all([waitReady(`${catalogUrl}/health`, catalog), waitReady(`${orderUrl}/health`, orders)]);
    const gateway = launch('gateway/gateway.js');
    await waitReady(`${baseUrl}/readyz`, gateway);
    const executedAt = new Date().toISOString();
    console.log('LAB 09 - tiga proses lokal terpisah; port tersedia dipilih otomatis.');
    const lines = [`Waktu eksekusi: ${executedAt}`];
    const smoke = { executedAt, ...await runSmokeTest({ baseUrl, apiKey, log: (line) => { console.log(line); lines.push(line); } }) };
    const cases = [];
    const input = { customerName: 'Bambang Uji Kegagalan', items: [{ productId: smoke.summary.productId, quantity: 2 }] };

    await stop(catalog);
    const downPost = await requestJson(baseUrl, '/order-service/orders', { apiKey, method: 'POST', body: input });
    assert.equal(downPost.response.status, 503, 'POST saat katalog mati harus 503');
    cases.push({ name: 'POST pesanan saat katalog mati', state: 'catalog-service dihentikan; order-service dan gateway tetap berjalan.', exchange: downPost });

    const downGet = await requestJson(baseUrl, '/order-service/orders', { apiKey });
    assert.equal(downGet.response.status, 200, 'GET pesanan harus tetap 200');
    assert.deepEqual(downGet.response.body.data.map((order) => order.id), [smoke.summary.orderId], 'Pesanan lama tetap tersedia dan POST yang gagal tidak disimpan');
    cases.push({ name: 'GET pesanan saat katalog mati', state: 'Pesanan dari smoke test tetap dapat ditampilkan tanpa menghubungi katalog.', exchange: downGet });

    catalog = launch('catalog-service/server.js');
    await waitReady(`${catalogUrl}/health`, catalog);
    const reset = await requestJson(baseUrl, `/product-service/products/${smoke.summary.productId}`, { apiKey });
    assert.equal(reset.response.status, 200);
    assert.equal(reset.response.body.data.stock, smoke.summary.stockBefore, 'Restart katalog mengembalikan fixture dalam memori');
    const recovered = await requestJson(baseUrl, '/order-service/orders', { apiKey, method: 'POST', body: input });
    assert.equal(recovered.response.status, 201, 'POST sesudah katalog pulih harus 201');
    cases.push({ name: 'POST pesanan sesudah katalog pulih', state: `Hanya catalog-service dinyalakan kembali. Stok kembali ke ${reset.response.body.data.stock} karena data tersimpan di memori.`, exchange: recovered });

    const finalProduct = await requestJson(baseUrl, `/product-service/products/${smoke.summary.productId}`, { apiKey });
    assert.equal(finalProduct.response.status, 200);
    assert.equal(finalProduct.response.body.data.stock, smoke.summary.stockBefore - 2);
    const finalOrders = await requestJson(baseUrl, '/order-service/orders', { apiKey });
    assert.equal(finalOrders.response.status, 200);
    assert.deepEqual(finalOrders.response.body.data.map((order) => order.id), [smoke.summary.orderId, recovered.response.body.data.id]);

    const failures = {
      executedAt, passed: true, processes: 'catalog, order, gateway: separate local Node.js child processes',
      cases,
      verification: { reset, finalProduct, finalOrders },
      summary: { statuses: cases.map((entry) => entry.exchange.response.status), stockAfterCatalogRestart: reset.response.body.data.stock, retainedOrderCount: finalOrders.response.body.data.length },
    };
    const failureLines = [`Waktu eksekusi: ${executedAt}`];
    for (const entry of cases) {
      const line = `${entry.name}\n${entry.state}\n${formatExchange(entry.exchange)}`;
      console.log(line);
      failureLines.push(line);
    }
    for (const [name, exchange] of Object.entries(failures.verification)) {
      failureLines.push(`Verifikasi ${name}\n${formatExchange(exchange)}`);
    }
    failureLines.push('LULUS: 503 -> 200 -> 201; pesanan lama tetap tersedia; stok katalog direset saat restart.');
    assert.equal(interrupted, false, 'Eksekusi dihentikan sebelum selesai');
    mkdirSync(evidenceDir, { recursive: true });
    writeFileSync(resolve(evidenceDir, 'smoke-test.json'), JSON.stringify(smoke, null, 2) + '\n');
    writeFileSync(resolve(evidenceDir, 'smoke-test.txt'), lines.join('\n\n') + '\n');
    writeFileSync(resolve(evidenceDir, 'service-failure.json'), JSON.stringify(failures, null, 2) + '\n');
    writeFileSync(resolve(evidenceDir, 'service-failure.txt'), failureLines.join('\n\n') + '\n');
    writeFileSync(resolve(evidenceDir, 'index.html'), evidenceHtml(smoke, failures));
    console.log(failureLines.at(-1));
    console.log('Bukti tersimpan di docs/evidence/lab09/. Semua proses demo akan dihentikan.');
  } finally {
    await Promise.all(children.map(stop));
    process.removeListener('SIGINT', onInterrupt);
    process.removeListener('SIGTERM', onInterrupt);
  }
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });

module.exports = { evidenceHtml };
