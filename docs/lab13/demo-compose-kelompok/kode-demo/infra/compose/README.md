# Demo Compose lokal untuk ZENTA

Salinan demo berangkat dari tag `v1.0-freeze` (`afa26f1`). Dockerfile Auth, Catalog, Order, dan Payment membangun image masing-masing. Image Gateway mengambil empat worker tersebut dan menjalankan kelimanya dalam satu sesi Wrangler lokal. Dengan demikian, service bindings, Durable Object gateway, dan antrean Order–Payment tetap bisa digunakan. Frontend Vite, PostgreSQL demo, dan simulator Xendit berjalan di container tersendiri.

## Mulai

Gunakan Docker Engine dengan BuildKit dan Docker Compose v2 dari root salinan demo.

```sh
docker compose up --build
```

Setelah container siap, buka terminal lain pada folder yang sama.

```sh
docker compose ps
docker compose exec -T gateway node --import tsx infra/compose/demo.ts
```

| Alamat | Fungsi |
| --- | --- |
| `http://127.0.0.1:5173/` | Frontend dan katalog |
| `http://127.0.0.1:5173/api-docs/` | Dokumentasi API lokal |
| `http://127.0.0.1:3000/health` | API Gateway |
| `http://127.0.0.1:3000/auth/health`, `/catalog/health`, `/orders/health`, `/payments/health` | Status empat worker melalui Gateway |
| `http://127.0.0.1:3100/health` | Simulator invoice lokal |

Skrip demo membuat identitas buyer lokal, membaca katalog, checkout melalui Gateway, menunggu event `order.created` menghasilkan invoice, mengirim callback simulasi, lalu memeriksa perubahan order menjadi `PAID` melalui event `payment.succeeded`.

Auth dan katalog memakai konfigurasi development lokal. Order dan Payment memakai database PostgreSQL demo yang terpisah di container yang sama. Skrip memakai JWT demo dan simulator Xendit, sehingga login Google, Neon, dan API Xendit produksi berada di luar cakupan pengujian ini. Port aplikasi dipublikasikan ke loopback host.

Compose memakai kata sandi contoh khusus demo lokal. Untuk menggantinya, set `POSTGRES_PASSWORD` di shell atau di file `.env` lokal sebelum membuat volume PostgreSQL. Jika volume sudah diinisialisasi, nilai baru berlaku pada volume baru.

```sh
docker compose down
```

Untuk memulai ulang dengan database demo yang kosong, gunakan `docker compose down -v`, lalu jalankan kembali Compose. PostgreSQL menjalankan migrasi Order dan Payment ketika volume demo baru diinisialisasi.
