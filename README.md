# Lab 09: Microservices Katalog dan Pesanan

**Bambang Herlambang — NRP 5803024019 — Praktikum individu**

Repository khusus Lab 09: [prakwebservice-lab09-microservices](https://github.com/academicbambang/prakwebservice-lab09-microservices). Gateway dipakai ulang dari [implementasi Lab 08](https://github.com/academicbambang/prakwebservice-lab08-api-gateway), lalu dilengkapi reservasi stok dan pengujian kegagalan antarservice.

## Implementasi

- `monolith/`: baseline satu proses yang langsung mengubah stok dari handler pesanan.
- `catalog-service/`: berperan sebagai **product-service**, pemilik produk, harga, dan stok; nama folder dipertahankan dari kode sumber Lab 08.
- `order-service/`: pemilik pesanan; reservasi stok dilakukan lewat HTTP ke katalog dengan timeout 2 detik dan respons `503` ketika katalog tidak tersedia.
- `gateway/`: pintu masuk `:8080`, routing, API key, dan batas 20 request per 10 detik per IP.

Diagram: [PNG](docs/lab09/arsitektur.png), [SVG](docs/lab09/arsitektur.svg), dan [Mermaid](docs/lab09/arsitektur.mmd). Penjelasan, pemetaan service proyek, prosedur manual, dan refleksi tersedia dalam [laporan Lab 09](docs/lab09/README.md).

## Menjalankan

Gunakan Node.js 22 atau lebih baru. Dari root repository:

```sh
npm install
npm run setup
npm start
```

Gateway berjalan pada `http://127.0.0.1:8080`, katalog pada `:3000`, dan pesanan pada `:3001`. `setup` membuat API key lokal dalam `gateway/.env`; gunakan nilainya sebagai `X-API-Key` untuk jalur pesanan dan reservasi stok. Nilai key tidak disertakan dalam repository atau bukti pengujian.

| Endpoint gateway | Fungsi |
| --- | --- |
| `GET /product-service/products` | Daftar produk |
| `GET /product-service/products/prod-001` | Detail produk dan sisa stok |
| `POST /order-service/orders` | Reservasi stok dan buat pesanan |
| `GET /order-service/orders` | Baca riwayat pesanan, termasuk saat katalog berhenti |

Body pesanan:

```json
{
  "customerName": "Bambang",
  "items": [{ "productId": "prod-001", "quantity": 2 }]
}
```

Alias `/catalog/*` dan `/orders/*` dari implementasi asal tetap tersedia. Untuk membandingkan baseline monolit, hentikan stack dengan `Ctrl+C`, lalu jalankan `npm run start:monolith`; lihat [petunjuk monolit](monolith/README.md).

## Pengujian dan bukti

```sh
npm test
npm run test:lab09
```

`test:lab09` menyiapkan tiga proses lokal pada port yang tersedia, memeriksa stok berkurang, menghentikan katalog, memeriksa POST `503` dan GET `200`, lalu menghidupkan katalog dan memeriksa POST `201`. Bukti tersedia dalam [halaman hasil](docs/evidence/lab09/index.html), [log test](docs/evidence/lab09/tests.txt), dan [catatan asal bukti](docs/evidence/lab09/README.md). Screenshot yang dilampirkan berasal dari halaman respons HTTP otomatis yang dirender browser; bukan screenshot Postman.

Untuk smoke test pada stack `npm start` yang sedang berjalan:

```sh
npm run test:smoke
```

Smoke test membuat pesanan sungguhan dan mengurangi stok. Pengujian batas gateway tersedia melalui `npm run test:rate-limit`; hentikan stack lain pada port `8080` lebih dahulu.

Untuk mengulangi skenario secara manual, import [collection Postman](docs/postman/lab09.postman_collection.json) dan [environment lokal](docs/postman/lab09.postman_environment.json), lalu isi `apiKey` secara lokal. Uji service mati memakai tiga terminal terpisah sebagaimana dijelaskan dalam laporan; launcher `npm start` menghentikan seluruh stack jika satu child keluar.

## Batasan

Data disimpan dalam memori dan direset ketika proses pemiliknya dimulai ulang. Reservasi beberapa produk bersifat atomik dalam satu proses katalog, tetapi belum ada transaksi terdistribusi antara pengurangan stok dan penyimpanan pesanan. Kegagalan setelah reservasi dapat membutuhkan kompensasi atau reservasi dengan masa berlaku pada pengembangan berikutnya.
