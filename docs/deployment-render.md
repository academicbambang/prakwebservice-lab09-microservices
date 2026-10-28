# Deployment Render khusus Lab 09

**Bambang Herlambang — NRP 5803024019**

Deployment sesi ini ditujukan untuk layanan baru `prakwebservice-lab09-microservices`, bersumber dari [repository Lab 09](https://github.com/academicbambang/prakwebservice-lab09-microservices). Lab 08 memiliki repository dan deployment tersendiri.

## Status

**Live dan terverifikasi.** Layanan baru dibuat pada **28 Oktober 2026 pukul 17:01:09 UTC+7**. Render mencatat deploy awal berstatus `live` pada **17:02:02 UTC+7**; verifikasi HTTP publik selesai pada **17:02:52 UTC+7**, kemudian pengujian browser selesai pada **17:03:29 UTC+7**.

| Identitas | Nilai aktual |
| --- | --- |
| URL layanan baru | [prakwebservice-lab09-microservices.onrender.com](https://prakwebservice-lab09-microservices.onrender.com) |
| Render service ID | `srv-dbgsfp6gekts738pdq4g` |
| Dashboard | [Layanan Lab 09](https://dashboard.render.com/web/srv-dbgsfp6gekts738pdq4g) |
| Commit awal | `0e40b71e730bb091bbb1cedd56c4596d2249a87f` |
| Metadata resource | [service.json](evidence/deployment/service.json) |
| Deploy awal | `dep-dbgsfpmgekts738pdrg0`, status `live` pada [hasil CLI Render](evidence/deployment/deploy-status.json) |
| Verifikasi HTTPS | `passed: true` pada [verification.json](evidence/deployment/verification.json) dan [log teks](evidence/deployment/verification.txt) |
| Verifikasi browser | Seluruh skenario lulus, tanpa page error; [ui-verification.json](evidence/deployment/ui-verification.json) |

Layanan Lab 08 memakai ID berbeda, `srv-dbc65fbncjis738gmhlg`. Deployment baru ini ditujukan untuk Lab 09 dan tidak memakai resource Lab 08.

## Topologi dan konfigurasi

```text
Browser / Postman
       |
       v
Render HTTPS -> gateway :PORT
                 |-- /product-service/* -> 127.0.0.1:3000 (Catalog Service)
                 `-- /order-service/*   -> 127.0.0.1:3001 (Order Service)
                                                       |
                                                       `-- HTTP reserve -> Catalog Service
```

`npm start` meluncurkan tiga proses Node.js terpisah pada satu host Free. Katalog memiliki produk/stok, pesanan memiliki transaksi, dan hanya gateway menerima koneksi publik. Ini memisahkan proses dan data untuk praktikum; setiap service belum ditempatkan pada instance/host tersendiri.

| Pengaturan | Nilai |
| --- | --- |
| Jenis | Web Service baru |
| Nama | `prakwebservice-lab09-microservices` |
| Runtime | Node.js 22 |
| Plan / region | Free / Singapore |
| Repository | `academicbambang/prakwebservice-lab09-microservices` |
| Branch | `main` |
| Build | `npm ci --omit=dev` |
| Start | `npm start` |
| Health check | `/readyz` |
| `NODE_ENV` | `production` |
| `HOST` | `0.0.0.0` pada gateway; backend dipaksa loopback oleh launcher |
| `TRUST_PROXY` | `1`, sesuai satu reverse proxy platform |
| `CATALOG_PORT` / `ORDER_PORT` | `3000` / `3001` |
| `API_KEY_SHA256` | Digest key deployment khusus Lab 09; diisi pada environment Render |

Blueprint: [`render.yaml`](../render.yaml). `PORT` publik mengikuti nilai Render; backend menggunakan port terpisah. Launcher menghubungkan gateway/Order Service ke katalog melalui loopback.

## Key deployment

Dari root repository:

```sh
npm run setup:render
```

Skrip membuat `gateway/.env.render` berisi key asli `API_KEY` dan digest `API_KEY_SHA256`, tanpa mencetak nilainya. File yang sudah ada tidak ditimpa; file ini diabaikan Git dan dikecualikan dari image Docker.

- **Render** hanya menyimpan `API_KEY_SHA256`; `API_KEY` tidak diperlukan pada environment server.
- **Klien/frontend/Postman** memakai key asli sebagai `X-API-Key`, bukan digest.
- Isi key pada panel akses aplikasi atau **Authorize** Swagger. Key frontend hanya berada dalam memori halaman; Swagger tidak mempertahankannya sesudah reload.
- Jangan masukkan nilai key ke URL, repository, screenshot, laporan, atau bukti verifikasi.

## Pemeriksaan publik

Untuk mengulang pemeriksaan pada URL HTTPS layanan baru, jalankan dari PowerShell:

```powershell
$env:BASE_URL = 'https://prakwebservice-lab09-microservices.onrender.com'
npm run verify:deployment
Remove-Item Env:BASE_URL
```

Key dibaca dari `gateway/.env.render`; alternatifnya sediakan `DEPLOY_API_KEY` pada environment proses. Jika metadata publik sudah ada dalam `docs/evidence/deployment/service.json`, skrip dapat memakai field `url` di metadata tanpa `BASE_URL`.

Import [environment Postman Render](postman/lab09-render.postman_environment.json) bersama collection Lab 09 untuk pengujian manual. `apiKey` pada file tersebut kosong; isi dengan key deployment asli secara lokal. Folder kegagalan/pemulihan satu layanan tetap dijalankan pada stack lokal.

| Rute / alur | Hasil aktual verifikasi awal |
| --- | --- |
| `/readyz` | `200`, kedua backend sehat |
| `/`, `/app.js`, `/styles.css` | `200`, aset frontend tersedia |
| `/docs/`, `/openapi.json` | Swagger tersedia; OpenAPI `3.0.3` |
| `/sandbox` | Halaman Apollo Sandbox tersedia |
| `/laporan.pdf` | `200`, magic bytes `%PDF` |
| `/laporan-latex.zip` | `200`, magic bytes `PK` |
| `POST /product-service/graphql` | `200`, query tiga produk berhasil |
| Riwayat tanpa key | `401` |
| Pesanan dengan key benar | `201`, total Rp170.000 dari katalog, stok `40 → 38` |
| Riwayat sesudah pesanan | `200`, memuat ID transaksi baru |

Sesudah seluruh pemeriksaan lulus, skrip menulis `docs/evidence/deployment/verification.json` dan `verification.txt`. Log tidak memuat nilai key. Verifikasi membuat pesanan sungguhan dan mengubah stok. Tunggu kuota gateway pulih sebelum mengulang atau menjalankan request lain dari IP yang sama.

Pemeriksaan browser tambahan juga berhasil: checkout frontend mengurangi stok `38 → 36`, key salah ditolak, tampilan 390 px tidak meluap horizontal, Swagger **Try it out** menghasilkan `200`, iframe SDK Apollo dimuat, dan query Sandbox menghasilkan `200`. Hasil serta screenshot ada pada [catatan asal bukti](evidence/deployment/README.md). Stok `36` pada query Apollo merupakan hasil setelah checkout browser, bukan seed pengujian HTTP sebelumnya.

Swagger memakai aset lokal `swagger-ui-dist`; Sandbox memakai [SDK resmi Apollo](https://www.apollographql.com/docs/graphos/platform/sandbox) dari CDN. Endpoint keduanya mengikuti origin deployment. Status Render dibuktikan oleh JSON CLI; screenshot yang dilampirkan adalah screenshot aplikasi publik, bukan dashboard Render.

## Perilaku demo di plan Free

Render Free dapat menghentikan layanan idle dan mengaktifkannya pada request berikutnya, sehingga request pertama dapat lebih lama. Data praktikum ada di memori dan kembali ke seed saat proses restart. Batasan platform dijelaskan dalam [dokumentasi Render Free](https://render.com/docs/free).

Frontend/aset, Swagger, OpenAPI, Sandbox, unduhan laporan, dan `/readyz` tidak memakai kuota. Request API dari semua klien pada satu IP tetap berbagi batas 20 request per 10 detik.

Jika satu child process keluar, launcher menghentikan seluruh stack supaya platform dapat memulai ulang layanan. Demonstrasi mematikan **hanya katalog** dilakukan pada tiga terminal lokal atau `npm run test:lab09`, bukan dengan menghentikan child di deployment.

## Berkas dan referensi

- [`render.yaml`](../render.yaml): konfigurasi layanan baru.
- [`scripts/setup-render.js`](../scripts/setup-render.js): pembuatan key dan digest.
- [`scripts/verify-deployment.js`](../scripts/verify-deployment.js): verifikasi HTTP URL publik aktual.
- [`Dockerfile`](../Dockerfile): alternatif container dengan health check `/readyz`.
- [Node/Express di Render](https://render.com/docs/deploy-node-express-app) dan [referensi Blueprint](https://render.com/docs/blueprint-spec): konfigurasi platform.
