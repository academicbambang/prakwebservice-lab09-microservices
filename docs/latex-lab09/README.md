# Sumber LaTeX laporan Lab 09

Dokumen utama: [`main.tex`](main.tex). Folder `images/` memuat seluruh gambar yang dibutuhkan, sedangkan `results.tex` memuat ringkasan hasil aktual dari log test dan JSON smoke test. Bagian frontend, Swagger UI, Apollo Sandbox, serta konfigurasi dan status verifikasi deployment berada pada `features.tex`. Klaim verifikasi publik harus mengikuti bukti eksekusi layanan yang benar-benar aktif.

Identitas laporan: **Bambang Herlambang, NRP 5803024019**, praktikum individu tanggal **28 Oktober 2026**. Cover mengikuti format laporan praktikum sebelumnya, menggunakan program studi Informatika, Fakultas Teknik, Universitas Katolik Widya Mandala Surabaya. Logo yang dipakai ulang tanpa perubahan berasal dari [aset LPPM UKWMS](https://lppm.ukwms.ac.id/ukwms.png).

PDF pengumpulan: [`output/pdf/laporan-praktikum-sesi-09.pdf`](../../output/pdf/laporan-praktikum-sesi-09.pdf). ZIP mandiri untuk Overleaf: [`output/latex/laporan-praktikum-sesi-09-overleaf.zip`](../../output/latex/laporan-praktikum-sesi-09-overleaf.zip).

Versi yang disajikan aplikasi: [PDF publik](https://prakwebservice-lab09-microservices.onrender.com/laporan.pdf) dan [ZIP LaTeX publik](https://prakwebservice-lab09-microservices.onrender.com/laporan-latex.zip). Route aplikasi tersebut menunjuk file keluaran di atas; nama URL ZIP sengaja lebih pendek daripada nama arsip sumber pada repository.

## Kompilasi

PDF dihasilkan dari LaTeX menggunakan **Tectonic 0.17.0**. Dari root repository, setelah Tectonic dan Python tersedia:

```sh
python docs/latex-lab09/build-report.py --tectonic tectonic
```

Skrip menyegarkan gambar lokal dan statistik dari bukti yang sudah direkam, mengompilasi LaTeX, menyalin PDF ke folder keluaran, lalu mengemas sumber Overleaf. Skrip tidak menjalankan ulang test atau mengambil screenshot. Perbarui screenshot agar cocok dengan JSON sebelum membangun laporan dari eksekusi demo baru.

Untuk mengompilasi sumber yang sudah mandiri, jalankan dari folder ini:

```sh
tectonic main.tex
```

Alternatif: jalankan `xelatex main.tex` dua kali. Di Overleaf, unggah ZIP, pilih `main.tex` sebagai dokumen utama, dan gunakan XeLaTeX atau pdfLaTeX. Seluruh path gambar relatif terhadap proyek; tidak diperlukan file di luar ZIP.

## Bukti dan tata letak

Diagram berasal dari `docs/lab09/arsitektur.png`. Empat screenshot lokal disalin tanpa mengubah isi dari `docs/evidence/lab09/`; screenshot tersebut adalah tangkapan browser halaman hasil HTTP otomatis, bukan screenshot Postman. Screenshot frontend, Swagger, dan Apollo lokal berasal dari `docs/evidence/ui/`. Bukti publik berasal dari `docs/evidence/deployment/` dan disalin ke `images/` dengan awalan `public-` agar tidak tertukar dengan bukti lokal. Potongan gambar mobile ditampilkan berurutan, sedangkan gambar Swagger dipotong pada bagian respons aktual; sumber lengkap tetap disertakan dalam `images/`. Header API key tidak tercakup dalam bukti. Halaman cover tanpa nomor; isi memakai nomor halaman di tengah bawah, tanpa header dan garis header.

Status Render live pada laporan mengacu pada rekaman deployment awal commit `0e40b71`, selesai pada 28 Oktober 2026 pukul 17:02:02 UTC+7. Hasil verifier HTTPS dan UI publik dicatat sesudahnya. Rekaman tersebut tidak dimaksudkan sebagai klaim bahwa commit awal selalu merupakan revisi terbaru yang disajikan setelah pembaruan laporan.
