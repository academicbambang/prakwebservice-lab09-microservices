# LaTeX laporan Praktikum Web Service Sesi 11

**Versi terbaru:** [PDF 19 halaman](<../../output/pdf/Laporan Praktikum Web Service Sesi 11.pdf>) memuat Bagian 6 Auth + Gateway. Gunakan [sumber revisi dan petunjuk build](revision/README.md) atau [ZIP Overleaf terbaru](../../output/latex/laporan-praktikum-sesi-11-overleaf.zip). Sumber revisi mempertahankan halaman awal melalui PDF dasar revisi pengguna dan menyusun ulang halaman akhir dengan LaTeX.

**Arsip versi awal:** `main.tex` dan instruksi di bawah menghasilkan versi awal 14 halaman, bukan PDF terbaru. Build lama memakai nama output berbeda agar tidak menimpa PDF revisi.

Sumber utama: `main.tex`. Laporan memuat implementasi OpenAPI, langkah menjalankan, hasil pengujian, drift, validasi/impor, refleksi lima kalimat, serta sembilan screenshot manual. Lampiran menggunakan halaman landscape agar screenshot lebih mudah dibaca. Tidak ada API key pada gambar yang disertakan.

## Kompilasi

Dari root repository dengan Python dan Tectonic tersedia:

```sh
python docs/latex-lab11/build-report.py
```

Jika executable belum berada pada PATH:

```sh
python docs/latex-lab11/build-report.py --tectonic /path/to/tectonic
```

Script memeriksa SHA-256 screenshot, menyalin gambar asli dari `docs/evidence/lab11/manual/`, mengambil logo dari sumber laporan Lab 09, mengompilasi LaTeX, dan membuat ZIP sumber mandiri. Output:

- `output/pdf/laporan-praktikum-sesi-11.pdf`
- `output/latex/laporan-praktikum-sesi-11-overleaf.zip`

## Overleaf atau pdfLaTeX

Unggah ZIP ke Overleaf sebagai proyek baru dan pilih `main.tex` sebagai dokumen utama. Compiler: **pdfLaTeX**. Alternatif lokal, jalankan `pdflatex main.tex` dua kali dari folder sumber. Folder `images/` dan `evidence-manifest.json` sudah ikut dalam ZIP sehingga tidak memerlukan path di luar proyek.

Sumber narasi: `docs/lab11/README.md`; bukti utama: `docs/evidence/lab11/manual/README.md`. Angka stok manual 40 dan otomatis 38 berasal dari sesi berbeda. Screenshot Swagger Editor membuktikan impor/tampilan tanpa panel error yang terlihat; validasi menyeluruh didukung Swagger Parser lokal. Penerapan ke repository proyek kelompok terpisah dan deployment publik tidak diklaim oleh laporan ini.
