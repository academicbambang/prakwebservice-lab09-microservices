# Lab 12 — Automated Testing & Monitoring API

Implementasi ini memakai gateway, Catalog Service, dan Order Service dari Lab 09. Folder layanan produknya bernama `catalog-service`, dengan prefix publik `/product-service`. Node.js 22 dan npm workspace mengikuti konfigurasi repo.

## Menjalankan dan menguji

```sh
npm ci
npm test
```

`npm test` menjalankan rangkaian tes sebelumnya dan 10 tes HTTP Lab 12. Tanpa `BASE_URL`, rangkaian Lab 12 menjalankan tiga aplikasi asli pada port loopback bebas dengan data awal baru. CI memakai `BASE_URL=http://127.0.0.1:8080` dan `API_KEY` khusus run agar tes Lab 12 mengakses tiga proses terpisah. Tes stok membandingkan jumlah sebelum dan sesudah order. Untuk mengulang tes pada proses yang sama, beri jeda satu jendela rate limit (10 detik) dan restart stack jika stok demo habis.

Jalankan `npm run setup` dan `npm start` untuk demo manual. Gunakan API key dari proses setup pada header `X-API-Key` saat memanggil rute order. Pada terminal lain, jalankan `node monitor.js`. Target dapat diubah dengan `GATEWAY_URL`, `PRODUCT_URL`, dan `ORDER_URL`. Interval default 5 detik dan batas waktu probe 2 detik. Gunakan interval yang kurang agresif saat gateway menerima lalu lintas lain karena probe gateway memakai kuota yang sama. Untuk demo gangguan, jalankan proses secara terpisah dari root dengan `node catalog-service/server.js`, `node order-service/server.js`, dan `node gateway/gateway.js` di terminal masing-masing agar katalog dapat dihentikan sendiri.

| Layanan | Liveness langsung | Metrik langsung |
| --- | --- | --- |
| Gateway | `http://127.0.0.1:8080/health` | `http://127.0.0.1:8080/metrics` |
| Catalog Service | `http://127.0.0.1:3000/health` | `http://127.0.0.1:3000/metrics` |
| Order Service | `http://127.0.0.1:3001/health` | `http://127.0.0.1:3001/metrics` |

Metrik menghitung respons selesai sejak proses dimulai. Probe `/health` langsung dikecualikan. Gateway juga memiliki `/readyz` yang memeriksa liveness kedua backend. Untuk menelusuri order, ambil `X-Request-Id` dari respons dan cari `id` yang sama di log JSON ketiga proses. Log mencatat path, status, dan latensi tanpa body, query string, atau API key.

## Bukti pengujian

Gambar terminal memuat cuplikan output dari eksekusi lokal terhadap tiga proses terpisah. Gambar CI adalah tangkapan halaman GitHub Actions.

| Pemeriksaan | Hasil | Bukti |
| --- | --- | --- |
| `npm test` dua kali pada stack yang sama | 77/77 lulus pada kedua run | [Output npm test](evidence/npm-test-lulus.png) |
| Regresi status stok | Setelah status katalog diubah dari 409 ke 400, tes HTTP Order Service menerima 502 dan mengharapkan 409. Setelah status dikembalikan, 10/10 tes Lab 12 lulus | [Gagal](evidence/regresi-gagal.png) · [Lulus setelah diperbaiki](evidence/regresi-diperbaiki.png) |
| Pelacakan satu order | ID yang sama muncul di Catalog Service, Order Service, dan gateway | [Potongan log JSON](evidence/trace.jsonl) |
| Katalog dimatikan lalu dinyalakan | Monitor mencatat `ALERT` dan `RECOVERED`. Dua order saat gangguan mendapat 503 dan penghitung `errors5xx` Order Service naik dari 1 menjadi 3 | [Output monitor](evidence/monitor-alert-recovered.png) · [Metrik sebelum dan sesudah](evidence/metrics-order.json) |
| GitHub Actions hijau | Run berhasil di `lab12-testing-monitoring` | [Run hijau](https://github.com/academicbambang/prakwebservice-lab09-microservices/actions/runs/44275581885) · [Screenshot](evidence/ci-lulus.png) |
| GitHub Actions merah | `uji-gagal` sengaja mengubah status konflik stok katalog. Hasilnya 71 lulus, 6 gagal | [Run merah](https://github.com/academicbambang/prakwebservice-lab09-microservices/actions/runs/44275580502) · [Screenshot](evidence/ci-uji-gagal.png) |

Contoh dari langkah `Run tests` pada run merah:

```text
not ok 11 - POST order over available stock returns 409
    502 !== 409
# pass 71
# fail 6
```

Implementasi dan badge CI berada di branch `lab12-testing-monitoring`. Panduan menyebut `main` untuk run hijau, sementara repo Lab 09 mengatur Render untuk deploy otomatis dari `main`.

## Refleksi

Tes ini belum mencakup seluruh kondisi produksi, misalnya race condition ketika banyak pembeli memesan stok terakhir secara serentak. ID permintaan menghubungkan log lintas gateway, order, dan katalog, sedangkan log yang hanya ada di terminal sulit dicari dan bisa hilang setelah proses restart. Endpoint `/health` yang selalu menjawab `ok` dapat membuat monitor menandai proses UP meskipun dependensi yang dibutuhkan untuk melayani pesanan sedang gagal. Perbedaan huruf besar dan kecil pada nama impor bisa lulus di Windows dan gagal pada runner Linux karena filesystem Linux membedakan keduanya.
