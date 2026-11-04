# Screenshot log aktual competing consumers dan pub/sub

Pengujian tambahan dilakukan pada **4 November 2026**, menggunakan RabbitMQ Docker lokal, gateway, katalog, pesanan, dan consumer aktual dari implementasi Lab 10. Virtual host `lab10-terminal-20261104104010911` memisahkan run ini dari pengujian manual pengguna dan arsip otomatis sebelumnya. Delapan order dikirim melalui gateway pada port uji; seluruhnya memperoleh HTTP `201`.

- [competing-consumers.jpg](competing-consumers.jpg) adalah screenshot aplikasi **VS Code** yang membuka [competing.log](competing.log). Enam event dibagi 3 ke worker-A dan 3 ke worker-B; tidak ada orderId yang tumpang tindih.
- [pubsub.jpg](pubsub.jpg) adalah screenshot aplikasi **VS Code** yang membuka [pubsub.log](pubsub.log). Dua event masing-masing diterima consumer notification dan audit dengan orderId yang sama.

Kedua berkas tampilan log diringkas secara deterministik dari event yang dicatat consumer: hanya timestamp, identitas consumer, jenis event, dan orderId yang ditampilkan. Data asal tersedia dalam [worker-A.jsonl](worker-A.jsonl), [worker-B.jsonl](worker-B.jsonl), [notification.jsonl](notification.jsonl), dan [audit.jsonl](audit.jsonl). Screenshot ini merupakan tampilan editor atas log tersimpan, **bukan** screenshot terminal interaktif dan bukan halaman HTML hasil pengujian.

[results.json](results.json) menyimpan waktu eksekusi, order yang dikirim, status HTTP, dan pencocokan ID. Semua proses serta koneksi pengujian tambahan ditutup setelah selesai; antrean manual pengguna tidak diubah. Email adalah simulasi, bukan SMTP. Screenshot manual pengguna untuk consumer mati/pulih dan crash tetap berada di [folder manual](../manual/README.md).
