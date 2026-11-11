# Lab 11 — Dokumentasi API Otomatis

Sumber tugas: [Lab 11 Web Service](https://webservice.philipus.my.id/praktikum/lab-11). Implementasi melanjutkan repository Lab 09, termasuk perubahan Lab 10 yang sudah ada. Lab 10 bukan prasyarat menjalankan dokumentasi.

## Implementasi dan arsitektur

```text
Browser -> gateway :8080/docs/
              GET /openapi.json (diambil ulang setiap request)
                |-> catalog-service :3000/openapi.json + /docs/
                `-> order-service   :3001/openapi.json + /docs/
```

`catalog-service/app.js` dan `order-service/app.js` memuat anotasi YAML `@openapi` yang dibaca `swagger-jsdoc` dengan `apis: [__filename]` dan `failOnErrors: true`. Setiap service menyediakan spesifikasi dan Swagger UI sendiri sebelum fallback 404. Restart service setelah mengubah anotasi. `gateway/api-docs.js` mengambil spesifikasi dengan timeout 2 detik per sumber, secara paralel, setiap kali diminta; salinan JSON ekspor tidak digunakan sebagai sumber runtime. Rute dokumentasi didaftarkan sebelum proxy dan rate limiter.

Gateway menambahkan prefix `/product-service` dan `/order-service`, memakai server `/`, serta menambahkan kontrak API key/401, kuota/429, dan kegagalan proxy/502. Semua kelompok komponen, termasuk `schemas` dan `responses`, digabung dengan namespace `catalog_` dan `order_`; seluruh referensi lokal ditulis ulang sehingga nama `Error` dari service berbeda tidak saling menimpa. Saat sumber mati, service lain tetap didokumentasikan dan `x-documentation-sources` menyatakan sumber yang gagal. Ini spesifikasi parsial, bukan bukti sistem lengkap sedang sehat.

## Penyesuaian terhadap contoh panduan

| Contoh panduan | Implementasi repo |
| --- | --- |
| Folder product-service | `catalog-service` dengan fungsi yang sama |
| ID integer `1` | ID string `prod-001` |
| Body `{productId,qty}` | `{customerName,items:[{productId,quantity}]}` |
| qty 999 untuk stok habis | quantity 100 untuk 409; 999 ditolak 400 oleh validasi 1–100 |
| Respons produk/array langsung | Envelope `{data:...}` dan `service` pada daftar |
| Tambah category ke data | category sudah ada pada fixture Lab 09; drift direkonstruksi dengan anotasi salinan terisolasi tanpa category, lalu restart dengan anotasi lengkap |

Tidak ada perubahan perilaku bisnis hanya agar cocok dengan contoh panduan. Skema, contoh, dan respons mengikuti implementasi yang diuji.

## Hasil aktual

Lihat [rekaman JSON](../evidence/lab11/results.json) untuk waktu eksekusi dan respons lengkap. Request pesanan dijalankan menggunakan tombol **Try it out / Execute** pada Swagger gateway.

| Skenario | Aktual | Verifikasi |
| --- | --- | --- |
| quantity 2, prod-001 | 201 | Pesanan tersimpan; stok 40 menjadi 38 |
| quantity 100, prod-001 | 409 | Stok tidak cukup; didokumentasikan pada endpoint |
| quantity 2, prod-099 | 404 | Produk tidak ditemukan |
| quantity 999 | 400 | Melanggar batas input 1–100 |
| Katalog dihentikan, order tetap berjalan | 503 | Kegagalan dependensi sesuai kontrak |

Semua respons pesanan yang direkam lolos validasi skema AJV terhadap spesifikasi gabungan yang sudah di-dereference. OpenAPI gabungan lolos `@apidevtools/swagger-parser`. **78/78 tes lulus** pada verifikasi lokal final. Tiga tes regresi tambahan memeriksa kelengkapan field produk, konflik nama komponen, pengambilan ulang spesifikasi, dan sumber dokumentasi yang tidak tersedia. Workflow GitHub Actions menjalankan `npm ci` dan `npm test` pada push/PR. Audit runtime `npm audit --omit=dev` melaporkan 0 kerentanan pada sesi ini.

## Drift sebelum dan sesudah

Demo membuat salinan sementara kode katalog dengan properti `category` di anotasi Product dihapus, sementara data produk tetap memuat `category`. Service salinan benar-benar dijalankan, dan GET produk dieksekusi melalui Swagger; spesifikasi saat itu tidak mendeskripsikan field yang muncul di respons. Demo lalu menghentikan katalog tersebut dan memulai kode asli yang anotasinya telah lengkap pada port yang sama. Gateway mengambil spesifikasi baru tanpa menyimpan salinan lama; `category` kini tercantum. File sementara dibersihkan dan diabaikan Git bila eksekusi terhenti.

- [Sebelum](../evidence/lab11/03-drift-before.png) dan [JSON sebelum](../evidence/lab11/drift-before.json).
- [Sesudah](../evidence/lab11/04-drift-after.png) dan [JSON sesudah](../evidence/lab11/drift-after.json).

Drift ini adalah eksperimen yang sengaja direkonstruksi untuk tugas, bukan klaim penemuan bug category pada kode awal. OpenAPI secara default mengizinkan properti tambahan; validasi skema biasa belum tentu mendeteksi field respons yang tidak dideskripsikan. Untuk mencegahnya, tim perlu meninjau perubahan field dan menambahkan pengujian kelengkapan properti/kontrak, atau memakai skema validasi bersama sebagai sumber kontrak.

## Validasi dan Postman

`openapi.json` di root dan `gateway/openapi.json` adalah hasil ekspor gateway yang sama. Konverter resmi paket `openapi-to-postmanv2` berhasil menghasilkan [koleksi Lab 11](../postman/lab11.postman_collection.json). Metode dan path GET produk dari koleksi hasil konversi dipakai untuk request HTTP lokal dengan hasil 200. Ini verifikasi konversi dan request, belum merupakan impor melalui aplikasi Postman. Izin kontrol aplikasi Postman dan akses browser ke `editor.swagger.io` ditolak pada sesi ini; keduanya tetap dicatat sebagai pemeriksaan manual yang belum selesai.

Konverter Postman hanya devDependency untuk ekspor lokal. Audit dependensi pengembangan masih melaporkan temuan transitif pada konverter; pembaruan kompatibel sudah diterapkan dan alat ini hanya dijalankan pada spesifikasi milik repo sendiri. Jangan memakainya untuk mengonversi spesifikasi tidak tepercaya tanpa menilai temuan audit terbaru.

Langkah melengkapinya:

1. Jalankan stack, buka `http://127.0.0.1:8080/openapi.json`, simpan ekspor terbaru.
2. Tempel spesifikasi ke `https://editor.swagger.io`; pastikan tidak ada error. Peringatan boleh sesuai panduan.
3. Postman → Import → pilih **openapi.json** agar membuktikan impor OpenAPI langsung. Alternatif koleksi JSON sudah disediakan, tetapi bukan pengganti bukti impor OpenAPI langsung.
4. Atur `baseUrl` menjadi `http://127.0.0.1:8080`, nonaktifkan query filter opsional yang berisi placeholder, lalu GET `/product-service/products` dan pastikan 200.
5. Simpan bukti hasilnya. Untuk endpoint terlindungi, isi key lokal pada auth header tanpa memasukkannya ke repository atau screenshot.

## Penerapan ke proyek dan cakupan endpoint

Implementasi ini menggunakan domain marketplace UMKM sehingga kontrak produk/pesanan langsung dapat menjadi referensi dokumentasi service proyek. Katalog mendokumentasikan minimal tiga endpoint REST: GET `/products`, GET `/products/{id}`, POST `/products/{id}/reserve` (ditambah reservasi batch dan GraphQL). Pesanan juga memiliki tiga endpoint: POST `/orders`, GET `/orders`, GET `/orders/{id}`. Skema request, response, parameter path, dan kode error ada pada anotasi service. Ini bukti implementasi pada repo praktikum; perubahan atau deployment pada repository proyek kelompok terpisah tidak diklaim. Masing-masing anggota tetap perlu memetakan dan memverifikasi kontrak pada service proyek yang menjadi tanggung jawabnya untuk dokumen individual UAS.

## Refleksi (5 kalimat)

Pendekatan code-first memudahkan pengembang menjaga dokumentasi dekat dengan handler dan menghasilkan Swagger UI dari kode yang sudah berjalan. Dibanding contract-first pada Lab 03, pendekatan ini lebih cepat diterapkan pada service lama, tetapi kontrak baru diketahui setelah implementasi dan anotasi masih dapat tertinggal. Eksperimen category menunjukkan bahwa generator membaca anotasi, bukan memahami seluruh perubahan objek respons, sehingga code-first mengurangi tetapi tidak menghilangkan drift. Tim dapat mencegah drift melalui tinjauan perubahan skema, pengujian kontrak pada CI, pemeriksaan field respons, dan aturan bahwa perubahan endpoint harus disertai perubahan dokumentasi. Event `order.created` dari Lab 10 sebaiknya didokumentasikan dengan AsyncAPI yang menjelaskan broker RabbitMQ, exchange/channel, payload, producer, consumer, serta perilaku ack/redelivery, karena OpenAPI mendeskripsikan kontrak HTTP dan tidak mencakup alur event tersebut.

## Paket pengumpulan

- Repository branch `lab11-openapi`: kode, README root, `openapi.json`, koleksi, dan bukti.
- Screenshot gateway dua grup endpoint, respons 409 beserta dokumentasinya, serta drift sebelum/sesudah: [daftar bukti](../evidence/lab11/README.md).
- Commit mengecualikan node_modules, file .env, dan API key.
- Sisa pemeriksaan manual: impor Swagger Editor dan Postman; penerapan tiap anggota ke service repo proyek masing-masing.
