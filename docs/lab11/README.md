# Lab 11 — Dokumentasi API Otomatis

Versi siap dibaca/dicetak: [PDF laporan terbaru, 16 halaman](<../../output/pdf/Laporan Praktikum Web Service Sesi 11.pdf>). PDF revisi pengguna menempatkan screenshot beserta penjelasan pada bagian pembahasan dan menambahkan screenshot akhir Swagger Editor. [main.tex](../latex-lab11/main.tex) dan [ZIP Overleaf](../../output/latex/laporan-praktikum-sesi-11-overleaf.zip), dengan [petunjuk kompilasi](../latex-lab11/README.md), masih merupakan sumber versi awal 14 halaman dengan lampiran landscape; keduanya belum disinkronkan dengan revisi PDF terbaru.

Sumber tugas: [Lab 11 Web Service](https://webservice.philipus.my.id/praktikum/lab-11). Implementasi melanjutkan repository Lab 09, termasuk perubahan Lab 10 yang sudah ada. Lab 10 bukan prasyarat menjalankan dokumentasi.

**Pembaruan bukti: 11 November 2026.** Pengguna telah menyelesaikan pengambilan screenshot manual gateway, respons 409 beserta dokumentasinya, drift sebelum/sesudah, impor Swagger Editor, dan impor OpenAPI ke Postman dengan GET produk 200 OK. [Galeri bukti manual](../evidence/lab11/manual/README.md) menjadi bukti utama pengumpulan; [manifest SHA-256](../evidence/lab11/manual/verification.json) mencatat asal file dan integritas gambar. Semua PNG disalin utuh tanpa perubahan piksel.

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
| Tambah category ke data | category sudah ada pada fixture Lab 09; pada eksperimen manual anotasi category dihapus sementara, lalu dikembalikan setelah bukti sebelum perbaikan diambil |

Tidak ada perubahan perilaku bisnis hanya agar cocok dengan contoh panduan. Skema, contoh, dan respons mengikuti implementasi yang diuji.

## Hasil aktual

Lihat [rekaman JSON demo otomatis](../evidence/lab11/results.json) untuk waktu eksekusi dan respons lengkap. Request pesanan dijalankan menggunakan tombol **Try it out / Execute** pada Swagger gateway. Tabel berikut merangkum eksekusi otomatis tersebut; pengambilan bukti manual merupakan sesi terpisah.

| Skenario | Aktual | Verifikasi |
| --- | --- | --- |
| quantity 2, prod-001 | 201 | Pesanan tersimpan; stok 40 menjadi 38 |
| quantity 100, prod-001 | 409 | Stok tidak cukup; didokumentasikan pada endpoint |
| quantity 2, prod-099 | 404 | Produk tidak ditemukan |
| quantity 999 | 400 | Melanggar batas input 1–100 |
| Katalog dihentikan, order tetap berjalan | 503 | Kegagalan dependensi sesuai kontrak |

Pada sesi manual, [respons 409](../evidence/lab11/manual/02-swagger-409-response.png) menyatakan stok tersedia **40**, sedangkan pada demo otomatis stok tersedia **38** setelah pesanan sukses quantity 2. Keduanya hasil aktual dari sesi berbeda; angka ini tidak disamakan. [Dokumentasi 409](../evidence/lab11/manual/02-swagger-409-documentation.png) ditampilkan terpisah dari respons aktual sehingga contoh dokumentasi tidak dianggap sebagai hasil request.

Semua respons pesanan yang direkam lolos validasi skema AJV terhadap spesifikasi gabungan yang sudah di-dereference. OpenAPI gabungan lolos `@apidevtools/swagger-parser`. **78/78 tes lulus** pada verifikasi lokal final. Tiga tes regresi tambahan memeriksa kelengkapan field produk, konflik nama komponen, pengambilan ulang spesifikasi, dan sumber dokumentasi yang tidak tersedia. Workflow GitHub Actions menjalankan `npm ci` dan `npm test` pada push/PR. Audit runtime `npm audit --omit=dev` melaporkan 0 kerentanan pada sesi ini.

## Drift sebelum dan sesudah

Pengguna menghapus sementara `category` dari daftar `required`, `properties`, dan `example` skema Product pada `catalog-service/app.js`, menyimpan file, lalu me-restart aplikasi. Data produk tetap memuat category. GET `/product-service/products` melalui Try it out menghasilkan 200 dengan `category: kuliner`, sedangkan skema `catalog_Product` hanya menampilkan id, name, price, stock, dan seller. Setelah ketiga bagian anotasi dikembalikan, aplikasi di-restart dan Swagger di-refresh; skema kembali menampilkan `category` bertipe string dan contoh category. Kode final telah diperiksa: property, required, dan example category sudah lengkap.

- [Respons aktual sebelum perbaikan](../evidence/lab11/manual/03-drift-before-response.png).
- [Skema sebelum perbaikan: category tidak ada](../evidence/lab11/manual/03-drift-before-schema.png).
- [Skema sesudah perbaikan: category sudah ada](../evidence/lab11/manual/04-drift-after-schema.png).

Demo otomatis sebelumnya merekonstruksi drift dengan salinan kode terisolasi, lalu memulai kode asli pada port sama. Bukti pendukungnya tetap tersedia: [screenshot sebelum](../evidence/lab11/03-drift-before.png), [JSON sebelum](../evidence/lab11/drift-before.json), [screenshot sesudah](../evidence/lab11/04-drift-after.png), dan [JSON sesudah](../evidence/lab11/drift-after.json). Bukti otomatis ini terpisah dari perubahan anotasi dan screenshot yang dilakukan pengguna secara manual.

Drift ini adalah eksperimen yang sengaja direkonstruksi untuk tugas, bukan klaim penemuan bug category pada kode awal. OpenAPI secara default mengizinkan properti tambahan; validasi skema biasa belum tentu mendeteksi field respons yang tidak dideskripsikan. Untuk mencegahnya, tim perlu meninjau perubahan field dan menambahkan pengujian kelengkapan properti/kontrak, atau memakai skema validasi bersama sebagai sumber kontrak.

## Validasi dan Postman

`openapi.json` di root disimpan pengguna dari gateway setelah anotasi category dikembalikan. Isinya telah dibandingkan secara struktural dan sama dengan `gateway/openapi.json`; format JSON dirapikan agar mudah dibaca. Validasi lokal OpenAPI dilakukan dengan `@apidevtools/swagger-parser`.

Pengguna mengimpor ekspor tersebut ke Swagger Editor. [Screenshot editor](../evidence/lab11/manual/05-swagger-editor.png) menunjukkan judul Lab 11, spesifikasi OpenAPI 3.0.3 dan endpoint yang berhasil dirender, tanpa panel error yang terlihat pada gambar. Screenshot ini membuktikan impor dan tampilan; hasil validator lokal menjadi bukti tambahan validitas spesifikasi secara menyeluruh.

Pada Postman, [dialog impor](../evidence/lab11/manual/06-postman-import.png) mengenali **OpenAPI 3.0 Specification with a Postman Collection** dan nama **Lab 11 - Toko API (via Gateway)**. Setelah impor selesai, pengguna membuka request **Daftar dan cari produk** dari koleksi hasil impor, memakai baseUrl `http://127.0.0.1:8080`, menonaktifkan query category/search, dan menekan Send. [Hasil aktual Postman](../evidence/lab11/manual/07-postman-200.png) menunjukkan **200 OK** dan JSON daftar produk, termasuk category. Pemeriksaan impor manual Swagger Editor dan Postman kini sudah dilengkapi oleh pengguna.

Konverter paket `openapi-to-postmanv2` juga menghasilkan [koleksi JSON tambahan](../postman/lab11.postman_collection.json), tetapi bukti manual di atas berasal dari impor **openapi.json** langsung, bukan impor koleksi tambahan tersebut. Status `Not yet verified` di `results.json` dipertahankan sebagai rekaman historis saat demo otomatis dijalankan; status manual terbaru tercatat pada [verification.json](../evidence/lab11/manual/verification.json).

Konverter Postman hanya devDependency untuk ekspor lokal. Audit dependensi pengembangan masih melaporkan temuan transitif pada konverter; pembaruan kompatibel sudah diterapkan dan alat ini hanya dijalankan pada spesifikasi milik repo sendiri. Jangan memakainya untuk mengonversi spesifikasi tidak tepercaya tanpa menilai temuan audit terbaru.

Langkah reproduksi impor manual:

1. Jalankan stack, buka `http://127.0.0.1:8080/openapi.json`, simpan ekspor terbaru.
2. Tempel spesifikasi ke `https://editor.swagger.io`; pastikan tidak ada error. Peringatan boleh sesuai panduan.
3. Postman → Import → pilih **openapi.json** agar membuktikan impor OpenAPI langsung. Alternatif koleksi JSON sudah disediakan, tetapi bukan pengganti bukti impor OpenAPI langsung.
4. Atur `baseUrl` menjadi `http://127.0.0.1:8080`, nonaktifkan query filter opsional yang berisi placeholder, lalu GET `/product-service/products` dan pastikan 200.
5. Simpan bukti hasilnya. Untuk endpoint terlindungi, isi key lokal pada auth header tanpa memasukkannya ke repository atau screenshot.

## Penerapan ke proyek dan cakupan endpoint

Bagian individual Bambang adalah **Auth + Gateway**, berdasarkan dokumen serah-terima proyek. [OpenAPI khusus proyek](../proyek-auth-service.openapi.yaml) kini mendokumentasikan tiga endpoint Auth yang sudah ada di kode proyek: POST `/auth/token`, GET `/.well-known/jwks.json`, dan GET `/auth/me`. Skema form token, header/JWT, respons sukses, error envelope dan kode error disertakan. [Dokumen pendamping](penerapan-proyek-auth-gateway.md) menjelaskan scope, database akun, routing gateway, perbedaan port dengan praktikum toko, dan batas verifikasi. Tiga rute sama dengan kontrak proyek pada commit yang dicatat dalam [manifest sumber](proyek-auth-source.json).

Dokumen Auth ini terpisah dari kontrak produk/pesanan praktikum dan tidak mengganti root `openapi.json` toko. Validasi spesifikasi dan empat tes Auth/Gateway terpilih lulus lokal; tidak ada deployment atau perubahan kode proyek kelompok dalam pekerjaan dokumentasi ini. Dokumen baru melengkapi bagian proyek pada PDF 16 halaman yang sudah ada; PDF dan ZIP LaTeX tidak dikompilasi ulang pada pembaruan dokumentasi Auth ini. Anggota lain tetap menyiapkan dokumentasi service masing-masing.

## Refleksi (5 kalimat)

Pendekatan code-first memudahkan pengembang menjaga dokumentasi dekat dengan handler dan menghasilkan Swagger UI dari kode yang sudah berjalan. Dibanding contract-first pada Lab 03, pendekatan ini lebih cepat diterapkan pada service lama, tetapi kontrak baru diketahui setelah implementasi dan anotasi masih dapat tertinggal. Eksperimen category menunjukkan bahwa generator membaca anotasi, bukan memahami seluruh perubahan objek respons, sehingga code-first mengurangi tetapi tidak menghilangkan drift. Tim dapat mencegah drift melalui tinjauan perubahan skema, pengujian kontrak pada CI, pemeriksaan field respons, dan aturan bahwa perubahan endpoint harus disertai perubahan dokumentasi. Event `order.created` dari Lab 10 sebaiknya didokumentasikan dengan AsyncAPI yang menjelaskan broker RabbitMQ, exchange/channel, payload, producer, consumer, serta perilaku ack/redelivery, karena OpenAPI mendeskripsikan kontrak HTTP dan tidak mencakup alur event tersebut.

## Paket pengumpulan

- Repository branch `lab11-openapi`: kode, README root, `openapi.json`, koleksi, dan bukti.
- Screenshot gateway dua grup endpoint, respons 409 beserta dokumentasinya, serta drift sebelum/sesudah: [daftar bukti](../evidence/lab11/README.md).
- Commit mengecualikan node_modules, file .env, dan API key.
- Impor manual Swagger Editor dan Postman telah dilengkapi; bukti utama tersedia di [folder manual](../evidence/lab11/manual/README.md).
- Dokumentasi minimal tiga endpoint Auth untuk bagian Bambang tersedia pada [penerapan Auth + Gateway](penerapan-proyek-auth-gateway.md). Publikasi ke repository proyek terpisah dan deployment tidak dilakukan oleh pembaruan ini.
