# Penerapan Lab 11 ke Proyek: Auth + Gateway

**Nama:** Bambang Herlambang · **NRP:** 5803024019 · **Proyek:** Marketplace UMKM Lokal.

Komponen Auth + Gateway tercatat atas nama Bambang pada dokumen serah-terima proyek. Paket ini mendokumentasikan tiga endpoint **Auth Service** yang tersedia dalam kode proyek, lengkap dengan masukan, respons, dan kode error. Gateway menjadi jalur akses dan kontrol trafik; aturan identitas serta data akun tetap diperiksa Auth.

Spesifikasi mandiri untuk Swagger Editor/Postman: [proyek-auth-service.openapi.yaml](../proyek-auth-service.openapi.yaml). Tiga kontrak yang dipilih sama dengan kontrak pada commit proyek `4a69c545400b1e6631ddb888f7ab9e6e12b8edac`; kode lokal juga diperiksa. [Catatan sumber dan hash](proyek-auth-source.json) menyimpan provenance pembacaan. Dokumen ini tidak menyatakan seluruh perubahan lokal proyek sudah di-commit, diterapkan ke produksi, atau diuji online.

## 1. Endpoint dan kelengkapan kontrak

| Method dan path | Masukan | Respons sukses | Kode error Auth |
| --- | --- | --- | --- |
| POST `/auth/token` | Form `ClientCredentialsRequest`: grant_type, client_id, client_secret; scope opsional | 200 `ClientTokenResponse`: access_token, token_type, expires_in, scope | 400, 401, 413, 415, 500 |
| GET `/.well-known/jwks.json` | Tidak memerlukan body atau query; header X-Correlation-ID opsional | 200 `PublicJwks`: array public RSA JWK | 500 |
| GET `/auth/me` | Header Authorization Bearer JWT pengguna; X-Correlation-ID opsional; tanpa body/query | 200 `OwnProfile`: id, email, displayName, role, status | 400, 401, 403, 500, 503 |

Header request, form, dan respons telah diberi skema dalam OpenAPI. GET tidak diberi request body buatan: masukan yang relevan adalah header. Identitas pada `/auth/me` diambil dari JWT yang terverifikasi, bukan dari userId yang dikirim klien. Query tambahan pada endpoint tersebut ditolak 400.

## 2. Penerbitan token layanan

`POST /auth/token` memakai **application/x-www-form-urlencoded**, bukan JSON. Grant yang didukung adalah `client_credentials`; endpoint ini untuk client layanan yang terdaftar, bukan login email/password pengguna. Login pengguna memakai alur Google OIDC yang sudah dimiliki Auth.

Contoh body form berikut menggunakan placeholder, bukan secret nyata:

```text
grant_type=client_credentials
client_id=order-service
client_secret=GANTI_DENGAN_SECRET_CLIENT_LOKAL
scope=read:catalog
```

Scope harus dikenal dan diizinkan registry server. Default ketika scope tidak dikirim adalah `read:catalog`; scope reservasi seperti `reserve:stock`, `commit:stock`, dan `release:stock` hanya boleh untuk client order-service yang secara eksplisit diberi izin. Respons sukses membawa JWT RS256 role service, token_type Bearer, expires_in 900 detik, dan scope hasil normalisasi. Secret diverifikasi terhadap hash server dan tidak dikembalikan.

- 400: parameter duplikat (`INVALID_REQUEST`), grant selain client_credentials (`UNSUPPORTED_GRANT_TYPE`), atau scope tidak diizinkan (`INVALID_SCOPE`).
- 401 `INVALID_CLIENT`: client tidak dikenal atau secret tidak valid.
- 413 `BODY_TOO_LARGE`: body melebihi 4096 byte.
- 415 `UNSUPPORTED_MEDIA_TYPE`: Content-Type bukan form URL-encoded.
- 500 `INTERNAL_ERROR`: konfigurasi/key atau kesalahan internal lain; tanpa stack trace dan secret.

## 3. JWKS publik

`GET /.well-known/jwks.json` mengembalikan `keys` yang masing-masing mendeskripsikan public RSA key: `kty`, `kid`, `n`, `e`, `alg: RS256`, dan `use: sig`. Parameter private RSA seperti `d`, `p`, dan `q` tidak dikembalikan. Respons 500 digunakan bila konfigurasi public key tidak dapat dibaca dengan benar.

Endpoint proyek yang benar adalah **`/.well-known/jwks.json`**, bukan mengganti namanya menjadi `/auth/jwks` hanya untuk menyamakan contoh pemetaan lab.

## 4. Profil akun sendiri

`GET /auth/me` menerima JWT pengguna role buyer, seller, atau admin dengan scope `read:catalog`. Auth memverifikasi signature, issuer, audience, masa berlaku, role dan scope, lalu memeriksa akun aktif pada database Auth. Token layanan role service tidak diperbolehkan untuk membaca profil pengguna.

Respons 200 hanya berisi id, email, displayName, role dan status ACTIVE. Google subject, password, client secret, dan private signing key tidak dikembalikan. ID contoh dalam YAML adalah data ilustrasi, bukan akun produksi.

- 400 `BAD_REQUEST`: query parameter yang tidak didukung.
- 401 `UNAUTHENTICATED`: token tidak ada, invalid, atau kedaluwarsa.
- 403 `FORBIDDEN`: role/scope tidak sesuai, akun tidak aktif, atau akun tidak ditemukan setelah pemeriksaan akses.
- 503 `SERVICE_UNAVAILABLE`: AUTH_STORAGE bukan postgres atau penyimpanan Auth belum tersedia.
- 500 `INTERNAL_ERROR`: penanganan kesalahan global Auth.

## 5. Format error dan header

```json
{
  "error": {
    "code": "UNAUTHENTICATED",
    "message": "Token tidak valid atau kedaluwarsa",
    "correlationId": "00000000-0000-4000-8000-000000000002"
  }
}
```

Ini format proyek, bukan `{ "error": "pesan" }` dari praktikum toko. Setiap respons Auth diberi Cache-Control no-store dan X-Correlation-ID. UUID request yang valid diteruskan; nilai yang tidak valid diganti UUID baru. Contoh pada OpenAPI adalah ilustrasi kontrak, bukan bukti request produksi.

## 6. Akses melalui Gateway

Server di YAML adalah Auth langsung: `http://127.0.0.1:3001`. Gateway proyek lokal adalah `http://127.0.0.1:3000`, dan ketiga path di atas diteruskan **tanpa prefix product-service/order-service**. Port ini milik proyek UMKM dan berbeda dari gateway praktikum toko port 8080. Jalankan kedua stack pada waktu terpisah jika port backend bertabrakan.

Untuk mencoba melalui gateway, ubah server pada salinan impor Postman menjadi origin gateway proyek; jangan mengubah root `openapi.json` praktikum toko dengan file Auth ini. Gateway tidak memerlukan private signing key untuk memverifikasi JWT; public key diperoleh melalui binding Auth.

Lapisan gateway dapat menambahkan error di luar kontrak Auth langsung:

| HTTP | Kode/contoh | Penyebab |
| --- | --- | --- |
| 401 | UNAUTHENTICATED | Authorization yang dikirim gagal diverifikasi gateway |
| 405 | METHOD_NOT_ALLOWED | Path dikenal tetapi metode tidak diizinkan; disertai Allow |
| 413 | BODY_TOO_LARGE | Request melampaui 64 KiB; Auth token tetap lebih ketat pada 4096 byte |
| 415 | ENCODING_NOT_SUPPORTED | Encoding request tidak didukung gateway |
| 429 | RATE_LIMITED | Kuota 20 request per 10 detik pada konfigurasi default; Retry-After menunjukkan waktu tunggu |
| 502 | UPSTREAM_UNAVAILABLE / UPSTREAM_RESPONSE_TOO_LARGE | Gangguan upstream atau respons melampaui 1 MiB |
| 503 | SERVICE_NOT_CONFIGURED / RATE_LIMIT_UNAVAILABLE / JWKS_UNAVAILABLE | Binding, limiter, atau verifikasi identitas belum tersedia |
| 504 | UPSTREAM_TIMEOUT | Deadline upstream gateway, default 5 detik, terlampaui |

File YAML sengaja mendeskripsikan Auth langsung; tabel ini menjelaskan error lapisan gateway dan tidak mengklaim server gateway sudah diuji melalui file YAML tersebut.

## 7. Validasi dan batas bukti

- OpenAPI divalidasi secara lokal menggunakan Swagger Parser; semua referensi skema dapat di-resolve.
- Rute, form token, limit body, error envelope, public JWKS, dan profil dicocokkan dengan kode Auth, onboarding, security, dan gateway.
- Empat tes proyek terpilih dijalankan ulang dan lulus: JWKS publik tanpa parameter RSA privat, validasi client_credentials, akses profil sendiri/penolakan akun suspended, serta penerusan profil oleh gateway. Tes memakai key/data uji dan penyimpanan terisolasi; bukan request produksi.
- Tiga rute sumber sama dengan kontrak Auth pada commit proyek yang dicatat di manifest. File proyek lain memiliki perubahan lokal; paket dokumentasi ini tidak mengubah atau mempublikasikan perubahan tersebut.
- Tidak dilakukan login Google, penerbitan token produksi, migrasi database produksi, atau deployment dalam pembuatan dokumen ini.
- Dokumentasi ini memenuhi cakupan tiga endpoint untuk komponen Auth; bukan pengganti dokumen individual seluruh anggota atau bukti bahwa checkout/payment end-to-end sudah selesai.

Untuk membuat ulang snapshot dari checkout proyek:

```sh
python scripts/build-project-auth-docs.py --project ../umkm-marketplace
```

Generator membutuhkan Python dan PyYAML. Impor `docs/proyek-auth-service.openapi.yaml` ke Swagger Editor atau Postman untuk membaca kontraknya. Pengujian online memerlukan konfigurasi/key, client registry, JWT pengguna sah dan database Auth yang sesuai; jangan menggunakan token role service untuk `/auth/me`.
