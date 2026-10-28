# Lab 09: Microservices Marketplace UMKM

**Bambang Herlambang — NRP 5803024019 — Praktikum individu**

Repository khusus Lab 09: [prakwebservice-lab09-microservices](https://github.com/academicbambang/prakwebservice-lab09-microservices). Gateway dipakai ulang dari [implementasi Lab 08](https://github.com/academicbambang/prakwebservice-lab08-api-gateway), lalu dilengkapi reservasi stok dan pengujian kegagalan antarservice.

Frontend **Ruang UMKM** menyediakan katalog, keranjang, checkout, dan riwayat pesanan melalui gateway. Deployment sesi ini memakai layanan baru tersendiri; konfigurasi, status, dan URL aktual dicatat dalam [panduan Render](docs/deployment-render.md).

**Deployment Lab 09 sudah live dan terverifikasi:** [buka aplikasi](https://prakwebservice-lab09-microservices.onrender.com), [Swagger UI](https://prakwebservice-lab09-microservices.onrender.com/docs/), atau [Apollo Sandbox](https://prakwebservice-lab09-microservices.onrender.com/sandbox). [Bukti deployment](docs/evidence/deployment/README.md) memuat status Render, hasil HTTP, pengujian browser, dan screenshot aplikasi publik. Layanan ini terpisah dari deployment Lab 08.

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

## Memakai aplikasi

1. Buka [Ruang UMKM lokal](http://127.0.0.1:8080), pilih produk, dan atur jumlah di keranjang.
2. Masukkan API key gateway pada panel **Akses pesanan**, lalu pilih **Aktifkan**.
3. Isi nama pemesan, lalu pilih **Buat pesanan**. Backend menentukan harga dan mengurangi stok katalog.
4. Buka tab **Pesanan** untuk membaca transaksi yang diterima. Gunakan tombol pembaruan untuk memuat ulang stok atau riwayat.

Key hanya berada dalam memori halaman dan hilang saat reload. Aplikasi menampilkan penolakan input, stok habis, gangguan layanan, dan batas akses. Jika konfirmasi pesanan terputus, periksa riwayat sebelum mengulang karena reservasi belum idempotent.

## Endpoint dan dokumentasi

| Endpoint gateway | Fungsi |
| --- | --- |
| `GET /product-service/products` | Daftar produk |
| `GET /product-service/products/prod-001` | Detail produk dan sisa stok |
| `POST /order-service/orders` | Reservasi stok dan buat pesanan |
| `GET /order-service/orders` | Baca riwayat pesanan, termasuk saat katalog berhenti |
| `GET /order-service/orders/:id` | Detail pesanan |
| `POST /product-service/products/:id/reserve` | Reservasi satu produk, body `{"qty":2}` |
| `POST /product-service/reservations` | Reservasi beberapa produk dengan validasi batch sebelum mutasi |
| `GET/POST /product-service/graphql` | Query katalog dan stok melalui GraphQL |
| `GET /docs/` | Swagger UI dan **Try it out** |
| `GET /openapi.json` | Spesifikasi OpenAPI 3.0.3 |
| `GET /sandbox` | Apollo Sandbox |
| `GET /health` | Kesehatan proses gateway |
| `GET /readyz` | Kesiapan kedua backend |

Body pesanan:

```json
{
  "customerName": "Bambang",
  "items": [{ "productId": "prod-001", "quantity": 2 }]
}
```

Alias `/catalog/*` dan `/orders/*` dari implementasi asal tetap tersedia. Untuk membandingkan baseline monolit, hentikan stack dengan `Ctrl+C`, lalu jalankan `npm run start:monolith`; lihat [petunjuk monolit](monolith/README.md).

Pesanan dan reservasi stok melalui gateway memerlukan `X-API-Key`. Swagger UI menyediakan **Authorize**; key tidak dipertahankan sesudah reload. Produk dan query GraphQL dapat dibaca tanpa key. Harga/total dari klien diabaikan; backend memakai katalog. Input tidak valid menghasilkan `400`, produk tidak dikenal `404`, stok tidak cukup `409`, dan gangguan/timeout katalog `503`.

Order Service tidak membaca array produk katalog. Satu ID produk unik memakai endpoint reserve; beberapa ID unik memakai reservasi batch. Produk duplikat dijumlahkan sebelum reservasi. Penolakan batch tidak mengurangi stok produk lain.

Apollo Sandbox memakai [SDK resmi Apollo](https://www.apollographql.com/docs/graphos/platform/sandbox) dari CDN sehingga memerlukan internet. Endpoint otomatis mengikuti origin gateway dengan path `/product-service/graphql`. Contoh query sudah diisi dan polling schema dinonaktifkan:

```graphql
query KatalogUMKM {
  products {
    id
    name
    category
    price
    stock
    seller
  }
}
```

Frontend/aset, dokumentasi, Sandbox, unduhan laporan, dan `/readyz` tidak memakai kuota API. **Panggilan API** dari frontend, Swagger, Sandbox, atau Postman tetap berbagi batas 20 request per 10 detik per IP. Respons `429` menyertakan `Retry-After`.

## Pengujian dan bukti

```sh
npm test
npm run test:lab09
```

[Log suite](docs/evidence/lab09/tests.txt) mencatat **67 dari 67 test lulus**. Cakupannya meliputi routing dan API key, harga dari katalog, validasi input, pengurangan stok, batch, pesanan bersamaan tanpa overselling, isolasi data, timeout termasuk pembacaan body, dokumentasi, dan frontend.

`test:lab09` menyiapkan tiga proses lokal pada port yang tersedia, memeriksa stok berkurang, menghentikan katalog, memeriksa POST `503` dan GET `200`, lalu menghidupkan katalog dan memeriksa POST `201`. Bukti tersedia dalam [halaman hasil](docs/evidence/lab09/index.html), [log test](docs/evidence/lab09/tests.txt), dan [catatan asal bukti](docs/evidence/lab09/README.md). Screenshot yang dilampirkan berasal dari halaman respons HTTP otomatis yang dirender browser; bukan screenshot Postman.

Untuk smoke test pada stack `npm start` yang sedang berjalan:

```sh
npm run test:smoke
```

Smoke test membuat pesanan sungguhan dan mengurangi stok. Pengujian batas gateway tersedia melalui `npm run test:rate-limit`; hentikan stack lain pada port `8080` lebih dahulu.

Untuk mengulangi skenario secara manual, import [collection Postman](docs/postman/lab09.postman_collection.json) dan [environment lokal](docs/postman/lab09.postman_environment.json), lalu isi `apiKey` secara lokal. Folder normal/input negatif dijalankan saat katalog aktif. Folder kegagalan memerlukan intervensi untuk menghentikan/menghidupkan **hanya katalog**; jangan jalankan seluruh collection sekaligus. Folder alat pengembang menyediakan request health, readiness, GraphQL, dan OpenAPI. Uji service mati memakai tiga terminal sebagaimana dijelaskan dalam laporan; launcher `npm start` menghentikan seluruh stack jika satu child keluar.

[Environment Postman Render](docs/postman/lab09-render.postman_environment.json) memakai URL layanan baru yang sebenarnya; nilai `apiKey` sengaja kosong. Isi dengan key deployment khusus Lab 09 dari `gateway/.env.render`, bukan key lokal atau digest server. Skenario mematikan hanya katalog tetap dijalankan lokal.

Verifikasi HTTPS pada deployment menerima pesanan `201` dengan total Rp170.000 dan stok `40 → 38`; checkout browser berikutnya mengurangi stok `38 → 36`. Keduanya eksekusi berurutan yang terpisah. Browser juga memverifikasi penolakan key salah, tampilan seluler 390 px, respons **Try it out** Swagger `200`, serta query di Apollo Sandbox `200`; lihat [log HTTP](docs/evidence/deployment/verification.txt) dan [hasil UI](docs/evidence/deployment/ui-verification.json).

## Laporan dan sumber LaTeX

- [Laporan PDF](output/pdf/laporan-praktikum-sesi-09.pdf): identitas, arsitektur, hasil uji, bukti, dan refleksi.
- [ZIP sumber Overleaf](output/latex/laporan-praktikum-sesi-09-overleaf.zip): `main.tex`, bagian pendukung, dan seluruh gambar dalam satu proyek.
- [Sumber dan kompilasi](docs/latex-lab09/README.md): proyek LaTeX lengkap serta skrip build.

Gateway menyajikan PDF pada `/laporan.pdf` dan ZIP pada `/laporan-latex.zip`. Untuk membangun ulang setelah bukti/sumber diperbarui, siapkan Python dan Tectonic, lalu jalankan:

```sh
python docs/latex-lab09/build-report.py --tectonic tectonic
```

Skrip membaca log/JSON aktual, menyalin gambar, mengompilasi PDF, dan mengemas ZIP. Skrip tidak menjalankan test atau mengambil screenshot. Di Overleaf, unggah ZIP dan pilih `main.tex`; pilihan compiler dijelaskan pada README sumber.

## Deployment dan Docker

[Render Blueprint](render.yaml) memakai layanan **baru khusus Lab 09**, Node.js 22, region Singapore, plan Free, dan tiga proses pada satu host. Hanya gateway dipublikasikan; backend memakai loopback. Pengaturan key, status, URL aktual, dan pemeriksaan publik tersedia dalam [panduan Render](docs/deployment-render.md).

[Dockerfile](Dockerfile) menyediakan alternatif container. Sesudah membuat konfigurasi lokal:

```sh
docker build -t lab09-microservices .
docker run --rm -p 8080:8080 --env-file gateway/.env -e HOST=0.0.0.0 lab09-microservices
```

`.env` tidak dimasukkan ke image; variabel diteruskan saat container dijalankan. Health check memakai `/readyz`.

## Batasan

Data disimpan dalam memori dan direset ketika proses pemiliknya dimulai ulang. Reservasi beberapa produk bersifat atomik dalam satu proses katalog, tetapi belum ada transaksi terdistribusi antara pengurangan stok dan penyimpanan pesanan. Kegagalan setelah reservasi dapat membutuhkan kompensasi atau reservasi dengan masa berlaku pada pengembangan berikutnya.

Demo belum mencakup pembayaran, akun pengguna, database persisten, atau message queue. API key mengontrol akses demo ke gateway. Pada plan Free, proses dapat berhenti saat idle dan perlu waktu untuk aktif kembali; lihat [ketentuan Render Free](https://render.com/docs/free).
