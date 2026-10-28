const assert = require('node:assert/strict');

async function testRateLimit(url = 'http://127.0.0.1:8080/catalog/products', write = console.log) {
  write('Uji rate limit gateway yang digunakan kembali - Lab 09 (Individu)');
  write(`URL: ${url}`);
  write('Batas: 20 request / 10 detik / IP; 30 request berurutan');
  const statuses = [];
  for (let i = 1; i <= 30; i++) {
    const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    await res.arrayBuffer();
    statuses.push(res.status);
    write(`${String(i).padStart(2, '0')}  ${res.status}${res.status === 429 ? '  Too Many Requests' : '  OK'}`);
  }
  assert.deepEqual(statuses, [...Array(20).fill(200), ...Array(10).fill(429)]);
  write('LULUS: 20 request pertama 200; request ke-21 s.d. ke-30 429.');
  return statuses;
}

if (require.main === module) {
  testRateLimit(process.argv[2]).catch((error) => {
    console.error(error.message);
    console.error('Pastikan service aktif dan tidak ada request lain selama window ini. Tunggu 10 detik, lalu ulangi.');
    process.exitCode = 1;
  });
}
module.exports = { testRateLimit };
