# Bukti pengujian antarmuka lokal

Pengujian dilakukan terhadap aplikasi lokal `http://127.0.0.1:8080` pada 28 Oktober 2026. Berkas pada folder ini terpisah dari demo kegagalan di `../lab09/` dan pemeriksaan layanan publik di `../deployment/`.

- `frontend.png`, `frontend-orders.png`, dan `frontend-mobile.png` adalah screenshot browser aplikasi yang menjalankan JavaScript dan berkomunikasi dengan service sebenarnya.
- Checkout dua kopi pada eksekusi ini menurunkan stok dari **38 ke 36** dan menghasilkan pesanan pada riwayat. Angka awal berbeda dari smoke test karena proses katalog lokal sudah melayani transaksi sebelumnya.
- `swagger.png` dan `swagger-response.png` merekam Swagger UI dengan Try it out yang menerima respons `200` dan tiga produk.
- `apollo-sandbox.png` merekam query `KatalogUMKM` yang dijalankan melalui Apollo Sandbox. Respons HTTP `200` beserta tiga produknya tersimpan pada `apollo-query.json`.
- `ui-verification.json` merangkum checkout, penolakan API key yang salah, tampilan mobile 390 piksel tanpa overflow, Swagger, dan Apollo Sandbox.

API key hanya dipakai di memori halaman. Nilainya tidak dimasukkan ke screenshot, hasil JSON, atau penyimpanan browser. Status kosong pada panel key adalah perilaku aplikasi setelah aktivasi, bukan penyuntingan screenshot.
