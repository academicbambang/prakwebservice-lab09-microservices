'use strict';

const { mkdirSync, writeFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { pathToFileURL } = require('node:url');

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function writeEvidence(directory, result) {
  mkdirSync(directory, { recursive: true });
  writeFileSync(resolve(directory, 'results.json'), JSON.stringify(result, null, 2) + '\n');
  const lines = [`LAB 10 / Eksekusi aktual: ${result.executedAt}`, `Status: ${result.passed ? 'LULUS' : 'BELUM SELESAI'}`, `Virtual host terisolasi: ${result.vhost}`];
  const sections = result.scenarios.map((scenario) => {
    const text = [scenario.title, scenario.summary, JSON.stringify(scenario.data, null, 2),
      ...(scenario.logs || []).map((entry) => JSON.stringify(entry))].join('\n\n');
    lines.push(text);
    writeFileSync(resolve(directory, `${scenario.id}.txt`), text + '\n');
    return `<section id="${escapeHtml(scenario.id)}"><span class="badge">${scenario.passed ? 'LULUS' : 'BELUM SELESAI'}</span><h2>${escapeHtml(scenario.title)}</h2><p>${escapeHtml(scenario.summary)}</p><p class="muted">Eksekusi ${escapeHtml(result.executedAt)} · vhost ${escapeHtml(result.vhost)}</p><pre>${escapeHtml(JSON.stringify(scenario.data, null, 2))}</pre>${scenario.logs?.length ? `<h3>Log proses Node.js aktual</h3><pre class="logs">${escapeHtml(scenario.logs.map((entry) => `${entry.at} [${entry.consumer || entry.component}] ${entry.kind} ${entry.messageId || ''}${entry.redelivered === undefined ? '' : ` redelivered=${entry.redelivered}`} ${entry.message || ''}`).join('\n'))}</pre>` : ''}<p class="foot">Sumber: npm run test:lab10. Log berasal dari proses dan RabbitMQ aktual; tampilan ini merender rekaman, bukan terminal. Email merupakan simulasi.</p></section>`;
  });
  writeFileSync(resolve(directory, 'execution.txt'), lines.join('\n\n') + '\n');
  writeFileSync(resolve(directory, 'index.html'), `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Bukti Lab 10 — RabbitMQ</title><style>
  *{box-sizing:border-box}body{margin:0;background:#eef2f5;color:#183344;font:16px/1.5 "Segoe UI",sans-serif}main{max-width:1500px;margin:36px auto;padding:0 24px}h1{font-size:32px}h2{font-size:25px;margin:10px 0}section{background:white;border:1px solid #c9d7e0;border-radius:12px;padding:28px;margin:24px 0}pre{font:13px/1.6 Consolas,monospace;white-space:pre-wrap;overflow-wrap:anywhere;background:#f3f6f8;border-radius:6px;padding:18px}pre.logs{background:#112936;color:#d9eff0}.muted,.foot{color:#526b7a;font-size:13px}.badge{display:inline-block;background:#dcf5e8;color:#156346;border-radius:20px;padding:3px 12px;font-weight:700;font-size:13px}a{color:#146d65}nav a{margin-right:16px}img{max-width:100%}
  </style></head><body><main><header><p>PRAKTIKUM WEB SERVICE / LAB 10</p><h1>Komunikasi antarservice melalui RabbitMQ</h1><p>Bambang Herlambang · 5803024019 · Marketplace UMKM</p><p>Producer, consumer, gateway, dan katalog berjalan sebagai proses terpisah. RabbitMQ memakai Docker dan vhost uji terisolasi.</p><nav>${result.scenarios.map((entry) => `<a href="#${escapeHtml(entry.id)}">${escapeHtml(entry.title)}</a>`).join('')}</nav></header>${sections.join('')}<p class="foot">Kredensial broker dan API key tidak disimpan dalam bukti. Screenshot dashboard-ready-3.png merupakan RabbitMQ Management UI asli; screenshot log lainnya merupakan halaman rekaman ini.</p></main></body></html>\n`.replace(/[ \t]+$/gm, ''));
}

async function openScreenshotBrowser() {
  const { chromium } = require('playwright');
  return chromium.launch({ headless: true,
    ...(process.env.LAB10_CHROMIUM_PATH ? { executablePath: process.env.LAB10_CHROMIUM_PATH } : {}),
  });
}

async function screenshotDashboard(browser, { managementUrl, username, password, vhost, directory, suffix = 'ready-3' }) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  try {
    const page = await context.newPage();
    await page.goto(managementUrl, { waitUntil: 'networkidle' });
    await page.locator('input[name="username"]').fill(username);
    await page.locator('input[name="password"]').fill(password);
    await page.locator('input[type="submit"]').click();
    await page.waitForURL('**/#/');
    const selector = page.locator('#show-vhost');
    if (await selector.count()) await selector.selectOption(vhost);
    await page.goto(`${managementUrl}/#/queues/${encodeURIComponent(vhost)}/notification-queue`);
    await page.getByRole('heading', { name: /notification-queue/ }).waitFor();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: resolve(directory, `dashboard-${suffix}.png`), fullPage: true });
    return { file: `dashboard-${suffix}.png`, url: page.url(), source: 'RabbitMQ Management UI asli' };
  } finally { await context.close(); }
}

async function screenshotRecords(browser, directory, scenarios) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  try {
    await page.goto(pathToFileURL(resolve(directory, 'index.html')).href);
    for (const scenario of scenarios) {
      await page.locator(`#${scenario.id}`).screenshot({ path: resolve(directory, `${scenario.id}.png`) });
    }
  } finally { await page.close(); }
}

module.exports = { writeEvidence, openScreenshotBrowser, screenshotDashboard, screenshotRecords };
