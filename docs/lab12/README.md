# Lab 12 — Automated Testing & Monitoring API

Implementasi ini memakai gateway, Catalog Service, dan Order Service dari Lab 09. Folder layanan produknya bernama `catalog-service`, dengan prefix publik `/product-service`. Node.js 22 dan npm workspace mengikuti konfigurasi repo.

## Menjalankan dan menguji

```sh
npm ci
npm test
```

`npm test` menjalankan rangkaian tes sebelumnya dan 10 tes HTTP Lab 12. Tanpa `BASE_URL`, rangkaian Lab 12 menjalankan tiga aplikasi asli pada port loopback bebas dengan data awal baru. CI memakai `BASE_URL=http://127.0.0.1:8080` dan `API_KEY` khusus run agar tes Lab 12 mengakses tiga proses terpisah. Tes stok membandingkan jumlah sebelum dan sesudah order. Untuk mengulang tes pada proses yang sama, beri jeda satu jendela rate limit (10 detik) dan restart stack jika stok demo habis.

Jalankan `npm run setup` dan `npm start` untuk demo manual. Gunakan API key dari proses setup pada header `X-API-Key` saat memanggil rute order. Pada terminal lain, jalankan `node monitor.js`. Target dapat diubah dengan `GATEWAY_URL`, `PRODUCT_URL`, dan `ORDER_URL`. Interval default 5 detik dan batas waktu probe 2 detik. Untuk demo gangguan, jalankan proses secara terpisah dari root dengan `node catalog-service/server.js`, `node order-service/server.js`, dan `node gateway/gateway.js` di terminal masing-masing agar katalog dapat dihentikan sendiri.

| Layanan | Liveness langsung | Metrik langsung |
| --- | --- | --- |
| Gateway | `http://127.0.0.1:8080/health` | `http://127.0.0.1:8080/metrics` |
| Catalog Service | `http://127.0.0.1:3000/health` | `http://127.0.0.1:3000/metrics` |
| Order Service | `http://127.0.0.1:3001/health` | `http://127.0.0.1:3001/metrics` |

Metrik menghitung respons selesai sejak proses dimulai. Probe `/health` langsung dikecualikan. Gateway juga memiliki `/readyz` yang memeriksa liveness kedua backend. Untuk menelusuri order, ambil `X-Request-Id` dari respons dan cari `id` yang sama di log JSON ketiga proses. Log mencatat path, status, dan latensi tanpa body, query string, atau API key.

## Refleksi

Tes ini belum mencakup seluruh kondisi produksi, misalnya race condition ketika banyak pembeli memesan stok terakhir secara serentak. ID permintaan menghubungkan log lintas gateway, order, dan katalog, sedangkan log yang hanya ada di terminal sulit dicari dan bisa hilang setelah proses restart. Endpoint `/health` yang selalu menjawab `ok` dapat membuat monitor menandai proses UP meskipun dependensi yang dibutuhkan untuk melayani pesanan sedang gagal. Perbedaan huruf besar dan kecil pada nama impor bisa lulus di Windows dan gagal pada runner Linux karena filesystem Linux membedakan keduanya.
