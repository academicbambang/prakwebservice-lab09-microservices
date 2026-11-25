# Lab 13 | Demo Docker Compose Marketplace UMKM Kelompok D

Paket peninjauan untuk demo lokal ZENTA yang berangkat dari tag `v1.0-freeze` proyek Kelompok D.

## Meninjau kode di GitHub

- [Konfigurasi Docker Compose](kode-demo/docker-compose.yml)
- [Dockerfile Auth](kode-demo/services/auth/Dockerfile), [Gateway](kode-demo/gateway/Dockerfile), [Catalog](kode-demo/services/catalog/Dockerfile), [Order](kode-demo/services/order/Dockerfile), [Payment](kode-demo/services/payment/Dockerfile), dan [frontend](kode-demo/frontend/Dockerfile)
- [Konfigurasi dan skrip demo](kode-demo/infra/compose)
- [Patch untuk baseline freeze](lab13-zenta-compose.patch)

## Menjalankan demo

Git, Docker Compose v2, dan Docker BuildKit diperlukan. Gunakan salinan lokal dari repo privat Kelompok D yang bisa Anda akses:

```sh
git clone https://github.com/MelvynFaith/umkm-marketplace.git zenta-compose-review
cd zenta-compose-review
git switch --detach v1.0-freeze
git rev-parse HEAD
```

Commit yang digunakan adalah `afa26f1ca860d030dce1969663882425aefdb2a6`. Ambil file `lab13-zenta-compose.patch` dari branch ini, lalu gunakan path absolut file tersebut pada kedua perintah berikut.

```sh
git apply --check "PATH_KE_PATCH"
git apply "PATH_KE_PATCH"
docker compose up --build
```

Buka [frontend lokal](http://127.0.0.1:5173/). Dari terminal lain di folder salinan yang sama, periksa status container lalu jalankan uji checkout dan pembayaran:

```sh
docker compose ps
docker compose exec -T gateway node --import tsx infra/compose/demo.ts
```

Empat container berstatus `healthy`. Skenario demo membaca katalog, membuat order dengan HTTP `201`, memproses pembayaran melalui simulator, lalu memverifikasi bahwa status order berubah menjadi `PAID`. Skenario ini menggunakan PostgreSQL lokal dan identitas demo.

Set `POSTGRES_PASSWORD` di shell atau file `.env` lokal untuk mengganti kata sandi contoh sebelum volume PostgreSQL dibuat. Nilai baru dipakai saat volume demo baru diinisialisasi.

Matikan stack dengan `docker compose down`. Semua perintah perubahan kode pada petunjuk ini dijalankan di salinan lokal.
