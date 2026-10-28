const { randomBytes } = require('node:crypto');
const { existsSync, readFileSync, writeFileSync } = require('node:fs');
const { resolve } = require('node:path');

const file = resolve(__dirname, '../gateway/.env');
if (existsSync(file)) {
  console.log('gateway/.env sudah ada, tidak ditimpa.');
} else {
  const example = readFileSync(resolve(__dirname, '../gateway/.env.example'), 'utf8');
  writeFileSync(file, example.replace('API_KEY=replace-with-your-own-random-key', `API_KEY=${randomBytes(32).toString('hex')}`), { flag: 'wx' });
  console.log('gateway/.env dibuat dengan API key acak. Isi key hanya untuk pengujian lokal; jangan commit file ini.');
}
