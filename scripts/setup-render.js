'use strict';

const { randomBytes, createHash } = require('node:crypto');
const { existsSync, writeFileSync } = require('node:fs');
const { resolve } = require('node:path');

const file = resolve(__dirname, '../gateway/.env.render');
if (existsSync(file)) {
  console.log('gateway/.env.render sudah ada; key deployment tidak ditimpa.');
} else {
  const key = randomBytes(32).toString('hex');
  const digest = createHash('sha256').update(key).digest('hex');
  writeFileSync(file, [
    '# Private deployment credentials; never commit this file.',
    '# Client/Postman uses API_KEY; Render stores only API_KEY_SHA256.',
    `API_KEY=${key}`,
    `API_KEY_SHA256=${digest}`,
    '',
  ].join('\n'), { flag: 'wx', mode: 0o600 });
  console.log('Key deployment khusus Lab 09 dibuat dalam gateway/.env.render; nilainya tidak ditampilkan.');
}
