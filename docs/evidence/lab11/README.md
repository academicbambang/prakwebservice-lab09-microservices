# Bukti aktual Lab 11

## Bukti manual utama

[Galeri screenshot manual pengguna](manual/README.md) memuat gateway Products/Orders, respons aktual 409 dan dokumentasinya, drift sebelum/sesudah, Swagger Editor, dialog impor OpenAPI, dan hasil Postman 200 OK. Diambil pada **11 November 2026** dan disalin dari PNG asli tanpa perubahan piksel. [Manifest SHA-256 dan status verifikasi](manual/verification.json) mencatat nama screenshot asal dan integritas setiap gambar.

Screenshot manual menjadi bukti utama pengumpulan. Gambar yang memuat API key tidak disertakan. Sesi manual menunjukkan stok 40 ketika order ditolak dengan 409; demo otomatis di bawah menunjukkan stok 38 setelah membuat satu order quantity 2. Keduanya berasal dari sesi berbeda.

## Bukti otomatis pendukung

Direkam ulang dengan `npm run test:lab11`. Browser Chromium headless membuka Swagger UI gateway lokal port 8080 dan menggunakan tombol Try it out/Execute. Backend demo terisolasi memakai port yang tersedia, tanpa broker RabbitMQ. Ini bukti eksekusi lokal, bukan deployment publik.

| File | Isi |
| --- | --- |
| [01-swagger-groups.png](01-swagger-groups.png) | Gateway menampilkan Products dan Orders |
| [02-swagger-409.png](02-swagger-409.png) | Respons nyata 409 dan daftar respons yang mendokumentasikan 409 |
| [03-drift-before.png](03-drift-before.png) | Respons nyata berisi category; anotasi Product salinan belum mendeskripsikannya |
| [04-drift-after.png](04-drift-after.png) | Setelah restart dengan anotasi lengkap, Product mendeskripsikan category |
| [drift-before.json](drift-before.json) | Spesifikasi aktual sebelum perbaikan dan penanda category |
| [drift-after.json](drift-after.json) | Spesifikasi aktual sesudah perbaikan |
| [results.json](results.json) | Timestamp, request/response 201/409/404/400/503, validasi, dan status impor manual |

Drift direkonstruksi menggunakan salinan kode dengan anotasi category dihapus karena field ini sudah ada di data Lab 09. Kode asli kemudian dijalankan kembali pada port sama. Screenshot adalah halaman Swagger aktual; sebelum merekam 409, otorisasi dihapus dari state UI dan bagian curl yang memuat key disembunyikan. Status dan payload respons tidak diubah. Key tidak disimpan dalam bukti.

Validasi Swagger Parser dan validasi respons AJV telah dijalankan. Koleksi Postman telah dikonversi dari OpenAPI dan satu metode/path koleksi telah diuji lewat HTTP. Saat demo otomatis direkam, impor UI belum dilakukan; nilai `Not yet verified` pada `results.json` merupakan status historis eksekusi tersebut. Pengguna kemudian menyelesaikan kedua pemeriksaan melalui UI secara manual. Lihat [Swagger Editor](manual/05-swagger-editor.png) dan [Postman 200 OK](manual/07-postman-200.png) untuk bukti terbarunya; screenshot otomatis tidak menggantikan bukti UI tersebut.
