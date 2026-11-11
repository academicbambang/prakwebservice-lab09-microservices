# Revisi laporan dengan penerapan Auth + Gateway

`main.tex` adalah sumber kompilasi laporan terbaru. Karena sumber LaTeX revisi pengguna 16 halaman tidak tersedia, halaman 1-14 dipertahankan melalui `base-report-16p.pdf`. Halaman penerapan proyek dibuat ulang untuk menjelaskan bagian individual Auth + Gateway, lalu ditambahkan kontrak tiga endpoint beserta skema dan kode error. Refleksi lima kalimat diketik ulang dengan isi yang sama dan nomor halaman baru; lokasi dokumen Auth ditambahkan pada daftar sumber. Screenshot dan uraian pada halaman awal tetap dipertahankan.

## Overleaf

Unggah ZIP `output/latex/laporan-praktikum-sesi-11-overleaf.zip` sebagai proyek baru. Pilih `main.tex` dan compiler pdfLaTeX. Semua input sudah berada dalam ZIP: PDF dasar, screenshot Postman, dan salinan kontrak Auth. Jangan menghapus `base-report-16p.pdf`; file ini merupakan sumber halaman laporan pengguna yang dipertahankan, bukan output final.

ZIP merupakan sumber komposisi mandiri, bukan rekonstruksi teks LaTeX seluruh halaman dasar. Halaman tambahan dapat diedit melalui `main.tex`; untuk menyunting teks halaman dasar secara menyeluruh diperlukan sumber asli PDF 16 halaman.

## Kompilasi lokal dari repository

```sh
python docs/latex-lab11/revision/build-report.py
```

Membutuhkan Python, pypdf, dan Tectonic; gunakan `--tectonic /path/to/tectonic` bila executable tidak ada pada PATH. Script mengambil snapshot PDF dasar hanya pada pemanggilan pertama; pada build berikutnya file dasar yang sama dipakai sehingga halaman tambahan tidak terduplikasi.

Output final tetap memakai `output/pdf/Laporan Praktikum Web Service Sesi 11.pdf`. File YAML mandiri proyek terdapat pada `docs/proyek-auth-service.openapi.yaml`. Tidak ada deployment atau perubahan data produksi dalam proses build.
