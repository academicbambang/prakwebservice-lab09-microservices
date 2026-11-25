# Lab 13 — Deployment Microservices dengan Docker Compose

Bambang Herlambang · NRP 5803024019 · Praktikum individu

Stack Compose menjalankan gateway, katalog, pesanan, RabbitMQ, dan consumer notifikasi. Folder produk tetap bernama `catalog-service`, sedangkan nama servicenya di jaringan Compose adalah `product-service`. Gateway memakai spesifikasi OpenAPI dan suite pengujian yang sudah ada di `main`. Cara menjalankan stack dan menguji API tersedia di [README repository](../../README.md#menjalankan-dengan-docker-compose).

## Bukti pengumpulan

Tangkapan berikut menampilkan output asli dari eksekusi Docker Compose di WSL 2. Gambar dirender dari log terminal, dengan cuplikan tes HTTP dan ringkasan pada tangkapan `npm test`.

| Pemeriksaan | Hasil | Bukti |
| --- | --- | --- |
| `docker compose ps` | Kelima service `healthy`. Hanya gateway dan dashboard RabbitMQ memiliki port yang dipublikasikan ke host | [Tangkapan](evidence/compose-ps.png) · [Log](evidence/compose-ps.txt) |
| `npm test` | 77 lulus, 0 gagal. Sepuluh tes HTTP Lab 12 mengakses gateway Compose di `:8080` | [Tangkapan](evidence/npm-test.png) · [Log](evidence/npm-test.txt) |
| Katalog dihentikan dan dinyalakan kembali | Order mendapat `503` selama katalog berhenti, sedangkan gateway dan order-service tetap `healthy`. Setelah katalog pulih, order mendapat `201`. ID permintaan yang sama muncul di log katalog, pesanan, dan simulasi email | [Tangkapan](evidence/failure-recovery.png) · [Log](evidence/failure-recovery.txt) |
| Rebuild dan reset | Pesan sementara terlihat setelah image order dibangun ulang. Setelah `down` dan `up`, stok produk uji kembali dari 39 ke 40 dan daftar pesanan kembali kosong | [Log](evidence/rebuild-reset.txt) |
| GitHub Actions | Workflow menjalankan Compose dan menguji stack yang dibangun | [Riwayat CI pada main](https://github.com/academicbambang/prakwebservice-lab09-microservices/actions/workflows/ci.yml?query=branch%3Amain) |

## Refleksi

Order Service memakai `http://product-service:3000` karena `localhost` di dalam container merujuk pada container Order Service sendiri. DNS internal Docker menerjemahkan nama `product-service` ke alamat container produk di jaringan Compose. Stok dan pesanan disimpan dalam memori, sehingga menjalankan kembali stack setelah `down` mengembalikan data ke kondisi awal. Untuk sistem nyata, data bisnis perlu disimpan di database persisten seperti PostgreSQL terkelola, atau di database lokal dengan volume. Kredensial bawaan yang tersimpan di Git dapat diketahui pembaca repository, jadi pada produksi kredensial perlu dibuat khusus per layanan dan diberikan saat runtime melalui pengelola rahasia.

## Penerapan ke proyek kelompok

Lihat [bukti demo Docker Compose Marketplace UMKM Kelompok D](penerapan-proyek-kelompok.md) untuk hasil status container, frontend, dan alur pembayaran simulasi.
