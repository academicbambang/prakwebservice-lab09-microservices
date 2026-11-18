'use strict';

const { setTimeout: delay } = require('node:timers/promises');
const { performance } = require('node:perf_hooks');

const targets = [
  { name: 'gateway', url: process.env.GATEWAY_URL || 'http://127.0.0.1:8080' },
  { name: 'catalog-service', url: process.env.PRODUCT_URL || 'http://127.0.0.1:3000' },
  { name: 'order-service', url: process.env.ORDER_URL || 'http://127.0.0.1:3001' },
];
const defaultInterval = 5000;
const configuredInterval = Number(process.env.INTERVAL_MS);
const interval = Number.isFinite(configuredInterval) && configuredInterval > 0
  ? configuredInterval
  : defaultInterval;

async function check(target) {
  const started = performance.now();
  let up = false;
  try {
    const response = await fetch(new URL('/health', target.url), {
      signal: AbortSignal.timeout(2000),
      redirect: 'error',
    });
    up = response.ok && (await response.json()).status === 'ok';
  } catch {
    // DNS, transport, timeout, or invalid JSON all mean the health check failed.
  }
  return { ...target, up, ms: Math.round(performance.now() - started) };
}

async function monitor() {
  const previous = new Map();
  while (true) {
    const results = await Promise.all(targets.map(check));
    const statuses = results.map(({ name, up, ms }) => `${name}=${up ? 'UP' : 'DOWN'}(${ms}ms)`);
    console.log(new Date().toISOString(), statuses.join('  '));
    for (const { name, up } of results) {
      if (previous.get(name) === true && !up) console.log(`ALERT: ${name} DOWN`);
      if (previous.get(name) === false && up) console.log(`RECOVERED: ${name}`);
      previous.set(name, up);
    }
    await delay(interval);
  }
}

monitor();
