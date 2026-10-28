# Baseline monolit Lab 09

Jalankan dari root repository setelah `npm install`:

```sh
node monolith/monolith.js
```

Server memakai `http://127.0.0.1:3000`. Sebelum menjalankan versi microservices, hentikan monolit dengan `Ctrl+C` agar port katalog tidak bentrok. Untuk membandingkan keduanya secara bersamaan, atur `MONOLITH_PORT` ke port lain pada terminal monolit.

1. `GET /products`: terdapat tiga produk; stok awal `prod-001` adalah `40`.
2. `POST /orders` dengan body berikut: respons `201`, total `170000`.
3. `GET /products/prod-001`: stok menjadi `38`.
4. `GET /orders`: pesanan tersimpan di proses yang sama.

```json
{
  "customerName": "Bambang",
  "items": [{ "productId": "prod-001", "quantity": 2 }]
}
```

Perhatikan baris pengurangan `stock` di `POST /orders`: handler pesanan membaca dan mengubah array produk secara langsung. Ketika proses monolit berhenti, endpoint produk dan pesanan berhenti bersama. Pada versi microservices, pengubahan stok dipindahkan ke API reservasi milik `catalog-service`, sedangkan riwayat pesanan dimiliki `order-service`.
