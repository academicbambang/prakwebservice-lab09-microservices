# Asal bukti praktikum Lab 09

Bukti ini berasal dari pengujian lokal implementasi Lab 09 milik **Bambang Herlambang, 5803024019**. Pengujian ulang dilakukan pada repo lokal terpisah `prakwebservice-lab09-microservices`, yang memakai kembali gateway Lab 08, dengan Catalog Service sebagai layanan produk dan Order Service sebagai pemilik pesanan.

## Sumber eksekusi

- [`tests.txt`](tests.txt) adalah keluaran `npm test`: **58 test lulus, 0 gagal**.
- [`smoke-test.json`](smoke-test.json) dan [`smoke-test.txt`](smoke-test.txt) dihasilkan oleh `npm run test:lab09` dari request HTTP aktual melalui gateway. Hasilnya 3 produk, pesanan `201`, stok `40 → 38`, dan total `170000`.
- [`service-failure.json`](service-failure.json) dan [`service-failure.txt`](service-failure.txt) berasal dari eksekusi demo yang sama. Skrip menghentikan hanya proses katalog, memeriksa POST `503` dan GET `200`, menghidupkan kembali katalog, lalu memeriksa POST `201`. Verifikasi akhir menemukan dua pesanan tersimpan dan stok kopi `38`.
- [`index.html`](index.html) dibentuk dari rekaman request/respons eksekusi tersebut agar bukti dapat dibaca dan ditangkap dengan browser.
- [`launcher-smoke.txt`](launcher-smoke.txt) merekam pemeriksaan tambahan menggunakan `npm start` lalu `npm run test:smoke` pada port default `8080`: pesanan `201`, total `170000`, stok `40 → 38`. Ini eksekusi terpisah dari demo dan screenshot di atas.

Timestamp demo pada JSON adalah **`2026-10-28T09:32:19.961Z`**, setara **28 Oktober 2026 pukul 16.32.19 GMT+7 (UTC+7)**. Port pengujian dipilih otomatis pada loopback; angka port pada bukti dapat berbeda dari default aplikasi `8080`, `3000`, dan `3001`. Gateway, katalog, dan pesanan berjalan sebagai tiga proses Node.js terpisah selama demo. Proses pengujian ditutup setelah verifikasi selesai.

## Screenshot

| Berkas | Isi dan sumber |
| --- | --- |
| [`smoke-test.png`](smoke-test.png) | Tangkapan browser bagian smoke test pada `index.html`: daftar produk, pesanan sukses, dan stok sesudah pemesanan |
| [`product-down-post.png`](product-down-post.png) | Tangkapan browser respons POST `503` saat proses katalog telah dihentikan |
| [`product-down-get.png`](product-down-get.png) | Tangkapan browser respons GET `200` yang masih menampilkan pesanan sebelumnya saat katalog berhenti |
| [`product-recovered-post.png`](product-recovered-post.png) | Tangkapan browser respons POST `201` sesudah hanya proses katalog dihidupkan kembali |

Screenshot tersebut diambil dari halaman hasil pengujian otomatis yang dirender browser. Data yang ditampilkan adalah request dan respons HTTP yang dicatat skrip Node.js; **screenshot ini bukan tangkapan Postman**. Collection untuk pengulangan manual tersedia di [`docs/postman/lab09.postman_collection.json`](../../postman/lab09.postman_collection.json).

Header request, API key, dan nilai secret tidak dimasukkan ke rekaman atau halaman bukti. Skrip demo memakai API key sementara untuk stack pengujiannya. Screenshot menampilkan method, URL, status HTTP, body, dan konteks kondisi service tanpa membuka key tersebut.

## Regenerasi

Jalankan dari root repository:

```sh
npm test
npm run test:lab09
```

Simpan keluaran `npm test` ke `docs/evidence/lab09/tests.txt` bila ingin memperbarui log suite. `npm run test:lab09` menulis ulang berkas TXT, JSON, dan HTML demo dengan timestamp, ID pesanan, serta port dari eksekusi baru. **Berkas PNG tidak diperbarui otomatis.** Setelah demo diulang, buka `index.html` hasil terbaru di browser lalu ambil kembali keempat screenshot agar semuanya cocok dengan JSON, timestamp, dan ID pesanan yang sama. Jangan menggabungkan screenshot lama dengan log eksekusi baru seolah-olah berasal dari satu demo.

Diagram arsitektur tersedia terpisah di [`docs/lab09/arsitektur.png`](../../lab09/arsitektur.png), dengan sumber [`SVG`](../../lab09/arsitektur.svg) dan [`Mermaid`](../../lab09/arsitektur.mmd). Diagram menjelaskan rancangan; ia bukan bukti respons HTTP.
