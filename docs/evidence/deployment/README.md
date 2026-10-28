# Bukti deployment publik Lab 09

**Bambang Herlambang — NRP 5803024019 — 28 Oktober 2026**

Target: [https://prakwebservice-lab09-microservices.onrender.com](https://prakwebservice-lab09-microservices.onrender.com). Resource baru bernama `prakwebservice-lab09-microservices`, ID `srv-dbgsfp6gekts738pdq4g`, plan Free, region Singapore. Resource Lab 08 memiliki ID berbeda, `srv-dbc65fbncjis738gmhlg`.

## Asal rekaman

| Berkas | Asal dan fungsi |
| --- | --- |
| [service.json](service.json) | Metadata layanan baru dari pembuatan layanan melalui CLI Render: ID, URL, repository, region, plan, dan waktu pembuatan. |
| [deploy-status.json](deploy-status.json) | Hasil pemeriksaan deploy melalui CLI Render; deploy awal `dep-dbgsfpmgekts738pdrg0` berstatus `live` pada commit `0e40b71e730bb091bbb1cedd56c4596d2249a87f`. |
| [verification.json](verification.json) | Respons HTTP aktual dan smoke test melalui `npm run verify:deployment` pada URL HTTPS publik. |
| [verification.txt](verification.txt) | Transkrip pemeriksaan HTTP, termasuk status aset frontend, dokumentasi, PDF/ZIP, GraphQL, API key, pesanan, dan stok. |
| [ui-verification.json](ui-verification.json) | Pemeriksaan browser otomatis terhadap aplikasi publik: checkout, key salah, tampilan seluler, Swagger, dan Apollo Sandbox. |
| [apollo-query.json](apollo-query.json) | Respons GraphQL aktual dari query katalog yang dijalankan di Apollo Sandbox. |

Waktu pada JSON menggunakan UTC (`Z`). Metadata pembuatan tercatat pukul 10:01:09 UTC atau 17:01:09 UTC+7. Deploy awal selesai 17:02:02 UTC+7, verifikasi HTTPS selesai 17:02:52 UTC+7, dan pemeriksaan browser selesai 17:03:29 UTC+7.

## Screenshot aplikasi publik

Screenshot berikut merupakan tangkapan browser dari layanan HTTPS yang benar-benar berjalan. Screenshot ini bukan gambar rancangan, bukan screenshot Postman, dan bukan screenshot dashboard Render. Status platform berasal dari `deploy-status.json`.

| Screenshot | Isi |
| --- | --- |
| [frontend.png](frontend.png) | Tampilan katalog, keranjang, dan panel akses frontend. |
| [frontend-orders.png](frontend-orders.png) | Riwayat pesanan setelah checkout berhasil. |
| [frontend-mobile.png](frontend-mobile.png) | Tampilan seluler pada lebar 390 px; tidak ada luapan horizontal. |
| [swagger.png](swagger.png) | Swagger UI yang memuat spesifikasi layanan yang sama. |
| [swagger-response.png](swagger-response.png) | Hasil **Try it out** berupa respons HTTP `200`. |
| [apollo-sandbox.png](apollo-sandbox.png) | SDK Apollo Sandbox dan hasil query katalog pada endpoint deployment. |

## Hubungan antarbukti

Verifikasi HTTP awal membuat pesanan dua kopi dengan total **Rp170.000**, respons **201**, dan stok **40 → 38**. Riwayat merespons **200** dan memuat ID transaksi baru; akses pesanan tanpa key mendapat **401**. Readiness, frontend/aset, dokumentasi, Sandbox, PDF, dan ZIP merespons **200**, sedangkan query GraphQL mengembalikan tiga produk.

Pengujian checkout browser kemudian memakai keadaan layanan yang sama dan mengurangi stok **38 → 36**. Karena itu, stok pada query Apollo dan screenshot UI dapat berbeda dari smoke test awal. Hasil browser menunjukkan dua pesanan tersimpan, key tidak disimpan dalam storage browser, key salah ditolak, seluruh skenario UI lulus, dan `pageErrors` kosong.

Header/nilai API key tidak disertakan pada bukti. Key klien tetap berada dalam `gateway/.env.render` yang diabaikan Git; environment server menggunakan digest. Data aplikasi disimpan dalam memori dan kembali ke seed setelah restart/redeploy, termasuk saat layanan Free berhenti lalu aktif kembali. Mengulangi verifikasi atau checkout akan mengubah stok lagi.

Panduan konfigurasi dan cara mengulang pemeriksaan tersedia dalam [deployment Render](../../deployment-render.md). Bukti ini mencatat hasil eksekusi pada waktu tersebut; URL publik tetap mengikuti kondisi layanan dan kuota platform sesudahnya.
