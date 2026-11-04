'use strict';

// Real RabbitMQ integration demo. Uses a new virtual host, never purges existing queues.
const assert = require('node:assert/strict');
const amqp = require('amqplib');
const { spawn } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { once } = require('node:events');
const { mkdirSync, writeFileSync } = require('node:fs');
const { createServer } = require('node:net');
const { resolve } = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const { requestJson } = require('../smoke-test');
const { writeEvidence, openScreenshotBrowser, screenshotDashboard, screenshotRecords } = require('./lab10-evidence');

const root = resolve(__dirname, '..');
const directory = resolve(root, process.env.LAB10_EVIDENCE_DIR || 'docs/evidence/lab10');

async function freePorts(count) {
  const probes = [];
  try {
    for (let i = 0; i < count; i++) {
      const server = createServer();
      probes.push(server);
      server.listen(0, '127.0.0.1');
      await once(server, 'listening');
    }
    return probes.map((server) => server.address().port);
  } finally { await Promise.all(probes.map((server) => new Promise((ok) => server.close(ok)))); }
}

async function waitFor(label, check, timeout = 20000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await check();
    if (value) return value;
    await delay(100);
  }
  throw new Error(`Timeout: ${label}`);
}

async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const done = once(child, 'exit');
  child.kill();
  await done;
}

async function main({ screenshots = process.argv.includes('--screenshots') } = {}) {
  mkdirSync(directory, { recursive: true });
  const executedAt = new Date().toISOString();
  const vhost = `lab10-${executedAt.replace(/\D/g, '').slice(0, 17)}-${randomBytes(2).toString('hex')}`;
  const managementUrl = (process.env.RABBITMQ_MANAGEMENT_URL || 'http://127.0.0.1:15672').replace(/\/$/, '');
  const broker = new URL(process.env.AMQP_URL || 'amqp://127.0.0.1');
  const username = decodeURIComponent(broker.username || 'guest');
  const password = decodeURIComponent(broker.password || 'guest');
  const authorization = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
  async function management(path, { method = 'GET', body } = {}) {
    const response = await fetch(`${managementUrl}/api${path}`, {
      method, headers: { authorization, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) throw new Error(`RabbitMQ Management API ${method} ${path.split('/')[1]}: HTTP ${response.status}`);
    return response.status === 204 || response.status === 201 ? null : response.json();
  }
  await management(`/vhosts/${encodeURIComponent(vhost)}`, { method: 'PUT', body: {} });
  await management(`/permissions/${encodeURIComponent(vhost)}/${encodeURIComponent(username)}`, {
    method: 'PUT', body: { configure: '.*', write: '.*', read: '.*' },
  });
  broker.pathname = `/${vhost}`;
  broker.searchParams.set('heartbeat', '5');
  const amqpUrl = broker.href;
  const result = { executedAt, vhost, passed: false, broker: {}, scenarios: [], screenshots: [] };
  const overview = await management('/overview');
  result.broker = { rabbitmqVersion: overview.rabbitmq_version, erlangVersion: overview.erlang_version,
    isolatedVhost: true, durableExchange: 'orders', exchangeType: 'fanout' };
  const [catalogPort, orderPort, gatewayPort] = await freePorts(3);
  const catalogUrl = `http://127.0.0.1:${catalogPort}`;
  const orderUrl = `http://127.0.0.1:${orderPort}`;
  const baseUrl = `http://127.0.0.1:${gatewayPort}`;
  const apiKey = randomBytes(32).toString('hex');
  const env = { ...process.env, HOST: '127.0.0.1', CATALOG_PORT: String(catalogPort),
    ORDER_PORT: String(orderPort), PORT: String(gatewayPort), CATALOG_SERVICE_URL: catalogUrl,
    ORDER_SERVICE_URL: orderUrl, API_KEY: apiKey, API_KEY_SHA256: '', TRUST_PROXY: '0',
    AMQP_URL: amqpUrl, ORDER_EXCHANGE: 'orders', NOTIFICATION_QUEUE: 'notification-queue', NOTIFICATION_DELAY_MS: '1000',
  };
  const children = [];
  let browser, admin;
  const interrupt = () => { for (const child of children) child.kill(); };
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);

  function launch(name, file, args = [], extraEnv = {}) {
    const child = spawn(process.execPath, [resolve(root, file), ...args], {
      cwd: root, env: { ...env, ...extraEnv }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.records = [];
    child.output = '';
    child.label = name;
    child.on('error', (error) => { child.startError = error; });
    for (const stream of [child.stdout, child.stderr]) {
      let buffer = '';
      stream.on('data', (chunk) => {
        const value = chunk.toString();
        child.output += value;
        buffer += value;
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop();
        for (const line of lines) {
          try { const record = JSON.parse(line); child.records.push(record); }
          catch { /* Server startup/dependency warnings are kept in the raw log. */ }
        }
      });
    }
    children.push(child);
    return child;
  }

  function ensureAlive(child) {
    if (child.startError) throw child.startError;
    if (child.exitCode !== null || child.signalCode !== null) throw new Error(`${child.label} berhenti sebelum siap`);
  }
  async function ready(child, kind = 'ready') {
    await waitFor(`${child.label} ${kind}`, () => { ensureAlive(child); return child.records.some((entry) => entry.kind === kind); });
  }
  async function httpReady(url, child) {
    await waitFor(`${child.label} HTTP`, async () => {
      ensureAlive(child);
      try { const response = await fetch(url, { signal: AbortSignal.timeout(600) }); await response.arrayBuffer(); return response.ok; }
      catch { return false; }
    });
  }
  function consumer(name, queue = 'notification-queue', crash = false, processingMs = 1000) {
    return launch(name, 'notification-service/notification-service.js', [queue, ...(crash ? ['--crash'] : [])], {
      CONSUMER_NAME: name, NOTIFICATION_DELAY_MS: String(processingMs),
    });
  }
  const queuePath = (queue = 'notification-queue') => `/queues/${encodeURIComponent(vhost)}/${encodeURIComponent(queue)}`;
  async function queueState(queue = 'notification-queue') {
    const state = await management(queuePath(queue));
    return { queue, durable: state.durable, ready: state.messages_ready ?? 0,
      unacked: state.messages_unacknowledged ?? 0, consumers: state.consumers ?? 0 };
  }
  async function stateIs(readyCount, consumerCount, queue = 'notification-queue') {
    return waitFor(`${queue} Ready=${readyCount}, consumers=${consumerCount}`, async () => {
      const state = await queueState(queue);
      return state.ready === readyCount && state.unacked === 0 && state.consumers === consumerCount && state;
    });
  }
  function emailRecords(child) { return child.records.filter((entry) => entry.kind === 'email'); }
  async function processed(child, count) {
    await waitFor(`${child.label} ${count} ack`, () => {
      ensureAlive(child);
      return child.records.filter((entry) => entry.kind === 'acked').length >= count;
    });
  }
  async function createOrder(label) {
    const exchange = await requestJson(baseUrl, '/order-service/orders', {
      apiKey, method: 'POST', body: { customerName: `Lab 10 ${label}`, items: [{ productId: 'prod-001', quantity: 1 }] },
    });
    assert.equal(exchange.response.status, 201, `Order ${label}`);
    return exchange;
  }
  function add(id, title, summary, data, logs = []) {
    result.scenarios.push({ id, title, summary, passed: true, data, logs });
    writeEvidence(directory, result);
    console.log(`LULUS / ${title}: ${summary}`);
  }

  try {
    if (screenshots) browser = await openScreenshotBrowser();
    admin = await amqp.connect(amqpUrl, { timeout: 3000 });
    admin.on('error', () => {});
    const adminChannel = await admin.createConfirmChannel();
    adminChannel.on('error', () => {});
    // Consumer first creates the durable queue/binding before any publication.
    const first = consumer('normal');
    await ready(first);
    const catalog = launch('catalog', 'catalog-service/server.js');
    const orders = launch('orders', 'order-service/server.js');
    const gateway = launch('gateway', 'gateway/gateway.js');
    await Promise.all([httpReady(`${catalogUrl}/health`, catalog), httpReady(`${orderUrl}/health`, orders), ready(orders)]);
    await httpReady(`${baseUrl}/readyz`, gateway);

    const normal = await createOrder('normal');
    const emailsAtResponse = emailRecords(first).length;
    assert.equal(emailsAtResponse, 0, 'HTTP response must not await simulated email');
    await processed(first, 1);
    assert.equal(emailRecords(first)[0].orderId, normal.response.body.data.id);
    add('normal-flow', '01 / Alur normal', 'Order HTTP 201 diterima sebelum email simulasi selesai.',
      { http: normal, emailsAtHttpResponse: emailsAtResponse, queueAfterAck: await stateIs(0, 1) }, first.records);
    await stop(first);
    await stateIs(0, 0);

    const queued = [];
    for (let i = 1; i <= 3; i++) queued.push(await createOrder(`consumer-mati-${i}`));
    const backlog = await stateIs(3, 0);
    add('consumer-down', '02 / Consumer mati', 'Tiga order tetap HTTP 201; notification-queue Ready=3, Unacked=0, Consumers=0.',
      { orders: queued, queue: backlog });
    if (browser) {
      result.screenshots.push(await screenshotDashboard(browser, { managementUrl, username, password, vhost, directory }));
    }
    const resumed = consumer('recovered');
    await ready(resumed);
    await processed(resumed, 3);
    assert.deepEqual(emailRecords(resumed).map((entry) => entry.orderId).sort(), queued.map((entry) => entry.response.body.data.id).sort());
    add('consumer-recovered', '03 / Consumer pulih', 'Ketiga event tertahan diproses dan di-ack; Ready kembali 0.',
      { queue: await stateIs(0, 1), processedOrders: emailRecords(resumed).map((entry) => entry.orderId) }, resumed.records);
    await stop(resumed);
    await stateIs(0, 0);

    const workerA = consumer('worker-A');
    const workerB = consumer('worker-B');
    await Promise.all([ready(workerA), ready(workerB)]);
    await stateIs(0, 2);
    const sharedOrders = [];
    for (let i = 1; i <= 6; i++) sharedOrders.push(await createOrder(`competing-${i}`));
    await waitFor('six competing acknowledgements', () => [workerA, workerB].reduce((n, child) => n + child.records.filter((entry) => entry.kind === 'acked').length, 0) === 6);
    const a = emailRecords(workerA).map((entry) => entry.orderId), b = emailRecords(workerB).map((entry) => entry.orderId);
    assert.ok(a.length > 0 && b.length > 0, 'Both workers must receive a share');
    assert.equal(new Set([...a, ...b]).size, 6);
    assert.deepEqual([...a, ...b].sort(), sharedOrders.map((entry) => entry.response.body.data.id).sort());
    add('competing-consumers', '04 / Competing consumers', `Satu antrean, enam event dibagi: worker-A=${a.length}, worker-B=${b.length}; tidak ada ID yang diproses dua worker.`,
      { sentOrderIds: sharedOrders.map((entry) => entry.response.body.data.id), workerA: a, workerB: b, queue: await stateIs(0, 2) },
      [...workerA.records, ...workerB.records].sort((x, y) => x.at.localeCompare(y.at)));
    await Promise.all([stop(workerA), stop(workerB)]);
    await stateIs(0, 0);

    const notification = consumer('pubsub-notification');
    const audit = consumer('pubsub-audit', 'audit-queue');
    await Promise.all([ready(notification), ready(audit)]);
    const broadcasts = [await createOrder('pubsub-1'), await createOrder('pubsub-2')];
    await Promise.all([processed(notification, 2), processed(audit, 2)]);
    const broadcastIds = broadcasts.map((entry) => entry.response.body.data.id).sort();
    for (const child of [notification, audit]) assert.deepEqual(emailRecords(child).map((entry) => entry.orderId).sort(), broadcastIds);
    add('pub-sub', '05 / Publish-subscribe', 'Dua antrean berbeda menerima salinan dari dua event yang sama: dua notifikasi dan dua audit simulasi.',
      { sentOrderIds: broadcastIds, queues: [await stateIs(0, 1), await stateIs(0, 1, 'audit-queue')] },
      [...notification.records, ...audit.records].sort((x, y) => x.at.localeCompare(y.at)));
    await Promise.all([stop(notification), stop(audit)]);
    await stateIs(0, 0);
    // Audit is no longer part of subsequent scenarios; remove only this demo's binding.
    await adminChannel.unbindQueue('audit-queue', 'orders', '');

    const crashing = consumer('crash-before-ack', 'notification-queue', true);
    await ready(crashing);
    const exit = once(crashing, 'exit');
    const crashOrder = await createOrder('crash');
    const [exitCode] = await exit;
    assert.equal(exitCode, 1);
    assert.equal(emailRecords(crashing).length, 1);
    assert.equal(crashing.records.some((entry) => entry.kind === 'acked'), false);
    const beforeRedelivery = await stateIs(1, 0);
    const afterCrash = consumer('after-crash');
    await ready(afterCrash);
    await processed(afterCrash, 1);
    const beforeEmail = emailRecords(crashing)[0], afterEmail = emailRecords(afterCrash)[0];
    assert.equal(beforeEmail.messageId, afterEmail.messageId);
    assert.equal(afterEmail.orderId, crashOrder.response.body.data.id);
    assert.equal(afterEmail.redelivered, true);
    add('crash-redelivery', '06 / Crash sebelum ack & redelivery', 'MessageId yang sama menghasilkan email simulasi dua kali; proses kedua menerima redelivered=true.',
      { orderId: crashOrder.response.body.data.id, messageId: beforeEmail.messageId, crashExitCode: exitCode,
        queueAfterCrash: beforeRedelivery, queueAfterRecovery: await stateIs(0, 1), simulatedEmailCount: 2,
        explanation: 'Set processed hanya di memori. Setelah restart, ID lama hilang dan pesan diproses ulang.' },
      [...crashing.records, ...afterCrash.records]);

    // In-process duplicates share the same ID and are skipped, unlike after a restart.
    const duplicateEvent = Buffer.from(JSON.stringify({ type: 'order.created', data: crashOrder.response.body.data }));
    adminChannel.sendToQueue('notification-queue', duplicateEvent, { persistent: true, contentType: 'application/json', messageId: beforeEmail.messageId });
    await adminChannel.waitForConfirms();
    await waitFor('duplicate skipped in same process', () => afterCrash.records.some((entry) => entry.kind === 'duplicate'));
    assert.equal(emailRecords(afterCrash).length, 1);
    const invalidBefore = afterCrash.records.filter((entry) => entry.kind === 'invalid').length;
    adminChannel.sendToQueue('notification-queue', Buffer.from('{broken-json'), { persistent: true, messageId: 'invalid-demo' });
    await adminChannel.waitForConfirms();
    await waitFor('invalid message discarded', () => afterCrash.records.filter((entry) => entry.kind === 'invalid').length === invalidBefore + 1);
    add('duplicate-and-invalid', '07 / Deduplikasi lokal & pesan rusak', 'Duplikat dalam proses yang sama di-ack tanpa email baru; JSON rusak di-nack tanpa requeue.',
      { originalMessageId: beforeEmail.messageId, newEmailsForDuplicate: 0, queue: await stateIs(0, 1) },
      afterCrash.records.filter((entry) => ['duplicate', 'invalid'].includes(entry.kind)));
    await stop(afterCrash);
    await stateIs(0, 0);

    // Break only this publisher's AMQP connection. Other apps/vhosts are untouched.
    const connections = await management('/connections');
    const publisherConnection = connections.find((entry) => entry.vhost === vhost && entry.client_properties?.connection_name === 'lab10-order-publisher');
    assert.ok(publisherConnection);
    const lostBefore = orders.records.filter((entry) => entry.kind === 'not-published').length;
    const readyBefore = orders.records.filter((entry) => entry.kind === 'ready').length;
    const disconnectedBefore = orders.records.filter((entry) => entry.kind === 'disconnected').length;
    await management(`/connections/${encodeURIComponent(publisherConnection.name)}`, { method: 'DELETE' });
    await waitFor('publisher disconnected', () => orders.records.filter((entry) => entry.kind === 'disconnected').length > disconnectedBefore);
    const withoutConnection = await createOrder('publisher-terputus');
    await waitFor('event loss logged', () => orders.records.filter((entry) => entry.kind === 'not-published').length > lostBefore);
    await waitFor('publisher reconnect', () => orders.records.filter((entry) => entry.kind === 'ready').length > readyBefore);
    await stateIs(0, 0);
    const withConnection = await createOrder('publisher-pulih');
    await stateIs(1, 0);
    const stored = await requestJson(baseUrl, '/order-service/orders', { apiKey });
    assert.equal(stored.response.status, 200);
    assert.ok(stored.response.body.data.some((entry) => entry.id === withoutConnection.response.body.data.id));
    assert.ok(orders.records.some((entry) => entry.kind === 'not-published' && entry.orderId === withoutConnection.response.body.data.id));
    const finalConsumer = consumer('publisher-recovered');
    await ready(finalConsumer);
    await processed(finalConsumer, 1);
    assert.deepEqual(emailRecords(finalConsumer).map((entry) => entry.orderId), [withConnection.response.body.data.id]);
    add('publisher-disconnected', '08 / Publisher terputus & pulih', 'Saat koneksi publisher ditutup, order tetap 201 tetapi event hilang. Setelah reconnect, order baru mengirim event; event yang hilang tidak diulang.',
      { interruption: 'Management API menutup hanya koneksi publisher, bukan mematikan seluruh broker.',
        orderDuringDisconnect: withoutConnection, orderAfterReconnect: withConnection,
        storedOrderCount: stored.response.body.data.length, deliveredAfterReconnect: emailRecords(finalConsumer).map((entry) => entry.orderId),
        queue: await stateIs(0, 1) },
      orders.records.filter((entry) => ['disconnected', 'not-published', 'ready'].includes(entry.kind)));
    await stop(finalConsumer);
    result.finalQueue = await stateIs(0, 0);
    result.passed = true;
    result.finishedAt = new Date().toISOString();
    writeEvidence(directory, result);
    if (browser) await screenshotRecords(browser, directory, result.scenarios);
    // Raw logs contain no credentials: neither service prints its AMQP_URL/API key.
    for (const child of children) writeFileSync(resolve(directory, `${child.label}.log.txt`), child.output);
    console.log(`LAB 10 LULUS: ${result.scenarios.length} skenario RabbitMQ aktual. Bukti: docs/evidence/lab10/`);
    console.log(`Virtual host ${vhost} dipertahankan untuk inspeksi; semua proses demo akan ditutup.`);
  } catch (error) {
    result.failure = { message: error.message };
    writeEvidence(directory, result);
    throw error;
  } finally {
    await Promise.allSettled(children.map(stop));
    if (admin) await admin.close().catch(() => {});
    if (browser) await browser.close();
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', interrupt);
  }
  return result;
}

if (require.main === module) {
  main().catch((error) => { console.error(`Lab 10 gagal: ${error.message}`); process.exitCode = 1; });
}

module.exports = { main };
