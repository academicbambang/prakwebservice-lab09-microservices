'use strict';

const { randomBytes } = require('node:crypto');
const { writeFileSync } = require('node:fs');
const { resolve } = require('node:path');

const envFile = resolve(__dirname, '../.env');
const values = [
  `API_KEY=${randomBytes(24).toString('hex')}`,
  'RABBITMQ_USER=lab13',
  `RABBITMQ_PASSWORD=${randomBytes(24).toString('hex')}`,
];
try {
  writeFileSync(envFile, values.join('\n') + '\n', { flag: 'wx', mode: 0o600 });
  console.log('Konfigurasi Compose dibuat di .env.');
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  console.log('Compose akan memakai konfigurasi dari .env yang sudah ada.');
}
