# Bukti manual Lab 10 - 4 November 2026

Screenshot berikut dikirim oleh Bambang Herlambang setelah menjalankan prosedur manual memakai Postman, RabbitMQ Management UI, dan terminal VS Code. Berkas disalin utuh dari lampiran chat, tanpa penyuntingan gambar. Daftar hash SHA-256 ada pada [SHA256SUMS.txt](SHA256SUMS.txt).

## Bukti utama untuk pengumpulan

| Butir tugas | Screenshot | Pengamatan yang terlihat |
| --- | --- | --- |
| (2) Dashboard saat consumer mati | [dashboard-ready-3.png](dashboard-ready-3.png) | Queue `notification-queue` pada vhost `/`; Ready=3, Unacked=0, Consumers=0; refresh 4 November 2026 pukul 17:13:11 UTC+7 |
| (2) Log setelah consumer dinyalakan kembali | [consumer-recovered.png](consumer-recovered.png) | `npm run start:notification`; consumer-18824 mencetak tiga email simulasi, masing-masing diikuti `acked` |
| (3) Log crash dan pengiriman ulang | [crash-redelivery.png](crash-redelivery.png) | `--crash`, email pertama, `Crash sebelum ack!`, restart biasa, email kedua untuk messageId yang sama dengan `redelivered:true`, kemudian `acked` |

Dropdown global dashboard masih menampilkan **All**, tetapi judul halaman dan URL menunjuk detail `notification-queue` pada **virtual host `/`**. Statistik Ready=3 pada screenshot ini adalah statistik antrean tersebut.

## Pencocokan pesanan dengan log pemulihan

Ketiga request dikirim sekali saat consumer berhenti. Semua memperoleh HTTP `201 Created`; consumer kemudian memproses pesanan yang sama.

| Pesanan | ID yang terlihat di Postman dan terminal | Screenshot Postman | Email / ack (UTC+7) |
| --- | --- | --- | --- |
| 1 | `ord-bd26a0b2-c7cb-46af-ad4d-01b98781f94c` | [postman-order-1.png](postman-order-1.png) | 17:14:08.914 / 17:14:08.915 |
| 2 | `ord-6719eaac-ba69-42f9-8db5-f9abebf2ccea` | [postman-order-2.png](postman-order-2.png) | 17:14:09.929 / 17:14:09.929 |
| 3 | `ord-4d7c4a99-27bb-4202-80fc-d05d3e6e0c4c` | [postman-order-3.png](postman-order-3.png) | 17:14:10.939 / 17:14:10.940 |

Timestamp log berakhiran `Z` memakai UTC; tabel menambahkan 7 jam agar cocok dengan waktu lokal pada screenshot. Screenshot dashboard setelah pemulihan tidak disertakan; bukti manual pemulihan adalah tiga email dan tiga ack pada terminal.

## Pencocokan crash dan redelivery

Request crash memperoleh `201 Created`, seperti terlihat pada [postman-crash-order.png](postman-crash-order.png). Hanya satu order dibuat, dengan ID `ord-be4655b1-d9ce-439c-8849-f709e063c999` dan messageId `order-ord-be4655b1-d9ce-439c-8849-f709e063c999`.

| Tahap | Consumer | Waktu lokal UTC+7 | Hasil |
| --- | --- | --- | --- |
| Email pertama | consumer-5556 | 17:18:05.452 | `redelivered:false`, lalu crash sebelum ack |
| Email kedua setelah restart | consumer-18608 | 17:18:51.502 | MessageId sama, `redelivered:true` |
| Selesai | consumer-18608 | 17:18:51.503 | `acked` |

Ini menunjukkan satu pesan diproses ulang sesudah crash karena broker belum menerima acknowledgement pertama dan Set `processed` tidak bertahan setelah restart. Email adalah simulasi pada log, bukan pengiriman SMTP.

[observations.json](observations.json) berisi transkripsi nilai yang terlihat pada screenshot untuk membangun laporan. File itu **bukan** hasil ekspor Postman atau log JSON asli. Bukti otomatis sebelumnya tetap berada di folder induk dengan timestamp, orderId, dan vhost tersendiri; hasil manual tidak digabung seolah-olah berasal dari run otomatis yang sama.
