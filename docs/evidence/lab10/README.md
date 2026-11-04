# Bukti aktual Lab 10

## Bukti manual utama

Laporan PDF sekarang memakai [screenshot manual pengguna](manual/README.md) untuk butir (2) dan (3): [dashboard Ready=3](manual/dashboard-ready-3.png), [log pemulihan consumer](manual/consumer-recovered.png), serta [crash dan email dua kali](manual/crash-redelivery.png). Keempat screenshot Postman pendukung, pencocokan orderId, waktu lokal, dan hash berkas tersedia di folder `manual/`.

Bukti manual diambil 4 November 2026 pada vhost `/`, sekitar pukul 17:13-17:18 UTC+7. Bukti otomatis di bawah memakai vhost `lab10-...` dan eksekusi tersendiri. Screenshot manual adalah dashboard/terminal/Postman asli; screenshot log otomatis merupakan halaman browser atas rekaman skrip.

PDF terbaru juga memakai [screenshot VS Code atas log aktual competing consumers dan pub/sub](terminal/README.md), yang diambil dari run tambahan pukul 17:40-17:42 UTC+7. Gambar halaman HTML pada bagian tersebut telah diganti di PDF. Empat screenshot Postman asli pengguna ditambahkan pada lampiran PDF. Teks laporan tetap hitam putih, sedangkan logo, diagram, dan screenshot berwarna.

## Arsip pengujian otomatis

Seluruh hasil berasal dari RabbitMQ Docker asli dan proses katalog, pesanan, gateway, serta consumer Node.js terpisah. Demo dijalankan dengan `npm run test:lab10:evidence`. Run final, timestamp, versi broker, vhost, dan delapan hasil skenario dicatat pada [`results.json`](results.json); status akhir harus `passed: true`.

## Berkas pengumpulan

| Bukti | Isi |
| --- | --- |
| [`dashboard-ready-3.png`](dashboard-ready-3.png) | Screenshot **RabbitMQ Management UI asli** saat notification-queue Ready=3, Unacked=0, Consumers=0 |
| [`consumer-recovered.png`](consumer-recovered.png) | Log aktual consumer sesudah dinyalakan kembali; ketiga ID order diproses dan di-ack |
| [`crash-redelivery.png`](crash-redelivery.png) | Log dua proses: email pertama sebelum crash tanpa ack, kemudian email kedua dengan messageId sama dan redelivered=true |
| [`competing-consumers.png`](competing-consumers.png) | Enam event dibagi di antrean sama; kedua worker masing-masing memproses tiga |
| [`pub-sub.png`](pub-sub.png) | Dua event dikirim ke setiap antrean; notification dan audit masing-masing memproses dua |
| [`normal-flow.png`](normal-flow.png) | HTTP 201 diterima sebelum email simulasi selesai |
| [`duplicate-and-invalid.png`](duplicate-and-invalid.png) | Duplikat pada proses yang sama dilewati dan pesan rusak dibuang tanpa requeue |
| [`publisher-disconnected.png`](publisher-disconnected.png) | Koneksi publisher ditutup melalui Management API, order tetap 201 tetapi event hilang; publisher reconnect dan order berikutnya kembali menerbitkan event |
| [`tests.txt`](tests.txt) | Output suite `npm test` setelah penambahan Lab 10 |
| [`execution.txt`](execution.txt) / [`results.json`](results.json) | Rekaman lengkap skenario aktual, status HTTP, statistik antrean, dan log |
| [`index.html`](index.html) | Halaman hasil yang merender rekaman aktual di atas |

Screenshot log adalah tangkapan browser atas halaman rekaman `index.html`, **bukan** screenshot terminal/Postman. Tidak ada respons HTTP, angka Ready, atau log email yang dikarang. Berkas `*.log.txt` adalah stdout/stderr aktual tiap proses demo; semua identitas consumer dan messageId dapat dicocokkan dengan JSON. Email bersifat simulasi, tidak ada SMTP.

## Isolasi dan reproduksi

```sh
npm ci
npm run broker:up
npm test
npx playwright install chromium
npm run test:lab10:evidence
```

Simpan output `npm test` ke `docs/evidence/lab10/tests.txt` bila memperbarui log suite. Demo menggunakan port HTTP bebas, API key sementara, dan vhost RabbitMQ baru `lab10-<timestamp>-<acak>`. Nama exchange dan queue tetap `orders`, `notification-queue`, dan `audit-queue`; screenshot memilih vhost run tersebut. Tidak ada antrean pengguna yang dipurge/dihapus. Run sebelumnya dipertahankan sebagai vhost terpisah; vhost run yang selesai berisi antrean kosong dan tanpa consumer.

`npm run test:lab10` menjalankan skenario yang sama tanpa browser. Perintah ini memperbarui JSON/TXT/HTML, **tidak PNG**; gunakan `:evidence` untuk satu set screenshot yang konsisten. Opsional `LAB10_CHROMIUM_PATH` menunjuk executable Chromium jika menggunakan instalasi browser yang sudah tersedia. Screenshot dashboard ditangkap sebelum consumer pemulihan dijalankan, jadi keadaan Ready=3 benar-benar diamati pada broker saat itu.

Broker Docker tetap berjalan sesudah demo, tetapi seluruh proses anak dan koneksi AMQP demonya ditutup. `npm run broker:stop` menghentikan broker tanpa menghapus volume. Tidak ada cloud deployment Lab 10 dalam bukti ini. Jangan masukkan kredensial cloud `AMQP_URL` atau API key ke Git; demo tidak merekam header autentikasi.

Diagram ada di [`docs/lab10/arsitektur.png`](../../lab10/arsitektur.png), laporan dan refleksi di [`docs/lab10/README.md`](../../lab10/README.md), PDF di [`output/pdf/laporan-praktikum-sesi-10.pdf`](../../../output/pdf/laporan-praktikum-sesi-10.pdf).
