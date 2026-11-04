"""Build a PDF from the actual Lab 10 integration records and screenshots.

Requires Python with reportlab and Pillow. Does not run tests or recreate evidence.
"""
from __future__ import annotations

import json
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from xml.sax.saxutils import escape

from PIL import Image as PILImage
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Image, Table, TableStyle, PageBreak,
)

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "docs/evidence/lab10"
OUTPUT = ROOT / "output/pdf/laporan-praktikum-sesi-10.pdf"
INK = colors.HexColor("#163546")
GREEN = colors.HexColor("#177b67")
MUTED = colors.HexColor("#526b7a")
LIGHT = colors.HexColor("#eaf1f5")
WIDTH = 174 * mm


def configure_fonts():
    candidates = [
        (Path("C:/Windows/Fonts/segoeui.ttf"), Path("C:/Windows/Fonts/segoeuib.ttf")),
        (Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"), Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf")),
    ]
    for regular, bold in candidates:
        if regular.exists() and bold.exists():
            pdfmetrics.registerFont(TTFont("Body", str(regular)))
            pdfmetrics.registerFont(TTFont("BodyBold", str(bold)))
            pdfmetrics.registerFontFamily("Body", normal="Body", bold="BodyBold", italic="Body", boldItalic="BodyBold")
            return
    raise RuntimeError("Install Segoe UI or DejaVu Sans for the PDF report")


def build():
    configure_fonts()
    result = json.loads((EVIDENCE / "results.json").read_text(encoding="utf-8"))
    if not result["passed"] or len(result["scenarios"]) != 8:
        raise ValueError("Complete all 8 integration scenarios before building the report")
    log = (EVIDENCE / "tests.txt").read_text(encoding="utf-8-sig")
    stats = {}
    for key in ("tests", "pass", "fail"):
        match = re.search(rf"^# {key} (\d+)\s*$", log, re.MULTILINE)
        if not match:
            raise ValueError(f"Missing suite summary: {key}")
        stats[key] = int(match.group(1))
    if stats["fail"]:
        raise ValueError("Test failures must be resolved before the report is built")

    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="BodyText10", fontName="Body", fontSize=10, leading=15,
                              textColor=INK, spaceAfter=9))
    styles.add(ParagraphStyle(name="Title10", fontName="BodyBold", fontSize=29, leading=36,
                              textColor=INK, spaceAfter=17))
    styles.add(ParagraphStyle(name="Heading10", fontName="BodyBold", fontSize=17, leading=23,
                              textColor=GREEN, spaceBefore=4, spaceAfter=13))
    styles.add(ParagraphStyle(name="Sub10", fontName="BodyBold", fontSize=11, leading=16,
                              textColor=INK, spaceBefore=9, spaceAfter=7))
    styles.add(ParagraphStyle(name="Caption10", fontName="Body", fontSize=8, leading=11.5,
                              textColor=MUTED, spaceAfter=9))
    styles.add(ParagraphStyle(name="Cell10", fontName="Body", fontSize=9, leading=13, textColor=INK))
    styles.add(ParagraphStyle(name="TableHead10", fontName="BodyBold", fontSize=9, leading=13, textColor=colors.white))
    story = []

    def p(text, style="BodyText10"):
        return Paragraph(text, styles[style])

    def add(text, style="BodyText10"):
        story.append(p(text, style))

    def page(title):
        story.append(PageBreak())
        add(title, "Heading10")

    def image(path, max_height=155 * mm, caption=None):
        path = Path(path)
        if not path.exists():
            raise FileNotFoundError(path)
        with PILImage.open(path) as source:
            width, height = source.size
        scale = min(WIDTH / width, max_height / height)
        story.append(Image(str(path), width=width * scale, height=height * scale, hAlign="CENTER"))
        if caption:
            story.append(Spacer(1, 3 * mm))
            add(caption, "Caption10")

    def table(headers, rows, widths):
        data = [[p(escape(str(cell)), "TableHead10") for cell in headers]]
        data += [[p(escape(str(cell)), "Cell10") for cell in row] for row in rows]
        block = Table(data, colWidths=widths, repeatRows=1, hAlign="LEFT")
        block.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), GREEN),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT]),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 9), ("RIGHTPADDING", (0, 0), (-1, -1), 9),
            ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ("LINEBELOW", (0, 0), (-1, 0), 0.5, GREEN),
        ]))
        story.append(block)
        story.append(Spacer(1, 5 * mm))

    local = datetime.fromisoformat(result["executedAt"].replace("Z", "+00:00")).astimezone(timezone(timedelta(hours=7)))
    add("PRAKTIKUM WEB SERVICE / SESI 10", "Caption10")
    story.append(Spacer(1, 15 * mm))
    add("Komunikasi Antarservice<br/>via Message Queue", "Title10")
    add("Marketplace UMKM - kelanjutan Lab 09", "Heading10")
    add("<b>Bambang Herlambang</b><br/>NRP 5803024019<br/>Proyek Marketplace UMKM (Kelompok D)")
    add("Panduan menetapkan praktikum berkelompok. Identitas di atas adalah pemilik repository; identitas anggota lain belum diberikan.", "Caption10")
    story.append(Spacer(1, 8 * mm))
    table(["Verifikasi", "Hasil aktual"], [
        ["Suite otomatis Lab 09 + Lab 10", f"{stats['pass']}/{stats['tests']} lulus, {stats['fail']} gagal"],
        ["Integrasi RabbitMQ asli", "8 skenario lulus; seluruh proses demo sudah ditutup"],
        ["Broker", f"RabbitMQ {result['broker']['rabbitmqVersion']}; Docker, volume persisten"],
        ["Waktu awal run", local.strftime("%d-%m-%Y %H:%M:%S") + " UTC+7"],
    ], [65 * mm, 109 * mm])
    add("Repository yang sama dengan Lab 09:")
    add('<link href="https://github.com/academicbambang/prakwebservice-lab09-microservices" color="#177b67">github.com/academicbambang/prakwebservice-lab09-microservices</link>', "Caption10")
    add('<link href="https://github.com/academicbambang/prakwebservice-lab09-microservices/tree/codex/lab10-message-queue" color="#177b67">Versi pengumpulan: branch codex/lab10-message-queue</link>', "Caption10")
    add("Ringkasan", "Sub10")
    add("Order Service tetap memastikan stok melalui HTTP, lalu menerbitkan order.created ke RabbitMQ. Consumer memproses email simulasi secara terpisah. Pengujian membuktikan antrean menahan pesan ketika consumer mati, membagi beban antarkerja, menyebarkan salinan melalui fanout, serta mengirim ulang pesan yang belum di-ack.")
    add("Bukti lokal ini tidak menyatakan bahwa Lab 10 sudah dideploy ke Render. URL dan bukti deployment lama di repository adalah arsip Lab 09.", "Caption10")

    page("1. Arsitektur dan batas service")
    image(ROOT / "docs/lab10/arsitektur.png", max_height=142 * mm,
          caption="Diagram diperbarui dengan RabbitMQ, exchange orders, antrean notification/audit, dan consumer terpisah.")
    table(["Komponen", "Data dan tanggung jawab"], [
        ["Catalog Service", "Produk, harga, stok di memori; hanya service ini yang mengubah stok."],
        ["Order Service", "Pesanan dan snapshot harga; reserve HTTP dengan timeout 2 detik; publish sesudah order disimpan."],
        ["RabbitMQ", "Exchange orders fanout dan antrean durable; pesan persistent; dashboard :15672."],
        ["Notification Service", "Email simulasi; manual ack, prefetch 1; Set messageId hanya selama proses hidup."],
    ], [48 * mm, 126 * mm])

    page("2. Menjalankan dan kontrak event")
    add("Persiapan dan terminal", "Sub10")
    add("Gunakan Node.js 22+ dan Docker Desktop Linux. Dari root repository: <b>npm ci</b>, <b>npm run setup</b>, lalu <b>npm run broker:up</b>. Dashboard lokal http://127.0.0.1:15672 memakai akun demo bawaan RabbitMQ sesuai panduan; kredensial cloud hanya dalam environment AMQP_URL.")
    add("Terminal 1 menjalankan <b>npm run start:notification</b> terlebih dahulu untuk membuat queue dan binding. Terminal 2 menjalankan <b>npm start</b>; tunggu log publisher ready. Terminal 3 menjalankan <b>npm run test:smoke</b> atau memakai collection Postman Lab 10 dengan API key lokal.")
    add("Jalankan <b>npm test</b> dan <b>npm run test:lab10:evidence</b> untuk suite dan demo terisolasi. Screenshot otomatis memerlukan <b>npx playwright install chromium</b> sekali. Demo memilih port HTTP bebas dan virtual host RabbitMQ baru; tidak menghapus antrean pengguna.")
    table(["Bagian", "Isi"], [
        ["Exchange dan event", "orders / fanout / durable; type order.created"],
        ["Payload data", "id, customerName, items (productId, name, quantity, unitPrice, subtotal), total, status, createdAt"],
        ["Properties AMQP", "messageId = order-${order.id}; persistent=true; contentType=application/json"],
        ["HTTP input", 'customerName dan items [{productId: "prod-001", quantity: 1}] sesuai API Lab 09'],
        ["Ack", "Setelah email simulasi; JSON/event invalid di-nack tanpa requeue"],
    ], [46 * mm, 128 * mm])
    add("Confirm callback memeriksa penerimaan publikasi oleh broker tanpa menunggu consumer. mandatory=true mendeteksi event tanpa queue tujuan. Nilai false dari channel.publish berarti buffer penuh, bukan pesan ditolak. Reconnect publisher tiap 3 detik; tidak ada replay otomatis untuk event hilang.")
    add("Data katalog, order, dan Set processed masih in-memory. Consumer tidak terhubung ke SMTP. Detail perintah eksperimen dan konfigurasi terdapat pada docs/lab10/README.md.", "Caption10")

    page("3. Consumer mati: Ready = 3")
    add("Setelah queue terikat, hanya Notification Service dihentikan. Tiga order quantity 1 tetap menerima HTTP 201. Statistik broker menunjukkan Ready=3, Unacked=0, Consumers=0; publisher, order, gateway, dan katalog tetap berjalan.")
    image(EVIDENCE / "dashboard-ready-3.png", max_height=164 * mm,
          caption="Screenshot RabbitMQ Management UI asli saat consumer mati. Virtual host terisolasi run ini ditampilkan di dashboard.")
    add("Virtual host run: " + escape(result["vhost"]), "Caption10")
    add("Pada prosedur manual, dashboard memakai vhost /; demo otomatis memakai vhost baru agar tidak mencampur data dengan pengujian pengguna. Screenshot diambil sebelum consumer pemulihan dijalankan.")

    page("4. Consumer kembali: pesan tertahan diproses")
    add("Consumer dinyalakan kembali dan menerima tiga event yang tertahan. Ketiganya diproses dan di-ack, dengan ID yang sama seperti tiga order ketika consumer mati. Setelah selesai, Ready=0 dan Unacked=0.")
    image(EVIDENCE / "consumer-recovered.png", max_height=177 * mm,
          caption="Tangkapan halaman rekaman log proses aktual; bukan screenshot terminal. Setiap email simulasi diikuti ack.")
    add("Pengirim dan penerima tidak harus aktif bersamaan jika broker aktif dan queue/binding telah dibuat. Exchange sendiri bukan tempat penyimpanan: tanpa antrean terikat, pesan fanout tidak dapat ditahan.")

    page("5. Competing consumers dan publish/subscribe")
    table(["Eksperimen", "Pengamatan aktual", "Makna"], [
        ["Antrean sama", "6 event dibagi 3 ke worker-A dan 3 ke worker-B; ID tidak tumpang tindih", "Berbagi beban; satu salinan diproses satu worker pada satu waktu"],
        ["Antrean berbeda", "2 event diterima notification-queue dan audit-queue; masing-masing memproses 2", "Fanout mengirim satu salinan ke setiap antrean terikat"],
    ], [39 * mm, 69 * mm, 66 * mm])
    image(EVIDENCE / "competing-consumers.png", max_height=108 * mm,
          caption="Pembagian enam event pada dua consumer, satu antrean. Screenshot penuh dan log mentah tersedia di folder bukti.")
    add("prefetch(1) membatasi satu pesan unacked per worker. Pembagian persis 3+3 adalah hasil run ini, bukan jaminan keseimbangan untuk semua waktu pemrosesan. Pada crash, pesan dapat berpindah worker melalui redelivery.")
    add("Consumer audit memakai program simulasi yang sama dengan argumen audit-queue, bukan database audit produksi.", "Caption10")

    page("6. Crash sebelum ack dan email dua kali")
    crash = next(entry for entry in result["scenarios"] if entry["id"] == "crash-redelivery")["data"]
    add("Semua consumer notification-queue dihentikan, lalu satu consumer dimulai dengan --crash. Satu order dibuat; consumer mencetak email simulasi lalu keluar dengan kode 1 sebelum ack. Ketika consumer biasa dimulai kembali, pesan yang sama dikirim ulang.")
    image(EVIDENCE / "crash-redelivery.png", max_height=170 * mm,
          caption="Dua log email memiliki messageId dan orderId sama. Pemrosesan kedua menunjukkan redelivered=true dan kemudian ack.")
    add("MessageId: " + escape(crash["messageId"]), "Caption10")
    add("Set processed hilang saat proses mati sehingga duplikat tidak terdeteksi setelah restart. Broker memberi redelivery untuk pesan yang belum di-ack: at-least-once, bukan jaminan email tepat sekali.")

    page("7. Verifikasi tambahan dan batas konsistensi")
    table(["Pengujian", "Hasil aktual"], [
        ["Alur normal", "HTTP 201 diterima sebelum email simulasi selesai."],
        ["Duplikat dalam proses sama", "MessageId lama di-ack dan dilewati; tidak ada email baru."],
        ["JSON rusak", "nack(requeue=false); pesan tidak berputar tanpa batas."],
        ["Publisher terputus", "Management API menutup hanya koneksi AMQP publisher; order tetap 201, event tidak terkirim."],
        ["Publisher pulih", "Reconnect otomatis; event untuk order baru terkirim, event order saat putus tidak direplay."],
        ["Suite Lab 09 + Lab 10", f"{stats['tests']} test, {stats['pass']} lulus, {stats['fail']} gagal."],
    ], [52 * mm, 122 * mm])
    add("Skenario gangguan publisher tidak mematikan seluruh broker. Unit test juga memeriksa kegagalan koneksi awal, channel error, backpressure, ack/nack, dan struktur event. Test Lab 09 yang tetap lulus mencakup stok, timeout, isolasi kegagalan, API key, gateway, dan frontend.")
    add("Durable queue dan persistent message melindungi pesan yang sudah diantrekan dengan konfigurasi yang sesuai; keduanya tidak membuat penyimpanan order dan publish menjadi satu transaksi. Kegagalan sebelum publish dapat meninggalkan order tanpa notifikasi. Publisher confirms tidak berarti email sudah terkirim dan tidak menutup celah ini.")
    add("Untuk produksi: simpan order dan transactional outbox dalam satu transaksi database, relay dengan retry dan confirms, lalu gunakan consumer idempotent. Untuk side effect database, unique (consumer_name, message_id) dan perubahan bisnis harus berada dalam transaksi yang sama, commit sebelum ack. Email eksternal membutuhkan outbox pengiriman dan idempotency key penyedia; tabel processed saja tidak menjamin exactly-once.")
    add("Perbaikan produksi tersebut adalah rancangan lanjutan, belum fitur implementasi praktikum ini. Consumer sengaja memakai Set di memori untuk memperlihatkan eksperimen crash sesuai panduan.", "Caption10")

    page("8. Penerapan proyek dan refleksi")
    table(["Aspek", "Marketplace UMKM"], [
        ["Interaksi", "Pemberitahuan pesanan baru setelah checkout."],
        ["Event", "order.created; ID order, snapshot items/harga, quantity, total, status, waktu."],
        ["Producer", "Order Service, setelah stok direservasi dan order disimpan."],
        ["Consumer", "Notification Service; subscriber audit opsional pada antrean berbeda."],
        ["Alasan asinkron", "Email bisa menyusul; consumer email mati tidak perlu membuat checkout gagal. Stok tetap sinkron karena hasilnya dibutuhkan untuk menerima order."],
    ], [42 * mm, 132 * mm])
    add("Refleksi (5 kalimat)", "Sub10")
    add("Jika RabbitMQ mati saat order dibuat, publisher mencatat bahwa event tidak terkirim, sementara order tetap tersimpan dan klien tetap menerima HTTP 201. Hal itu dapat membuat data pesanan dan notifikasi tidak konsisten, sehingga pengembangan selanjutnya memerlukan penyimpanan order bersama outbox dalam satu transaksi serta relay yang mencoba ulang. Consumer yang idempotent harus memakai messageId unik di penyimpanan tahan restart dan mencatat ID beserta side effect database secara atomik sebelum ack, bukan hanya menggunakan Set dalam memori. Untuk email eksternal, diperlukan outbox pengiriman dan dukungan idempotency key dari penyedia karena transaksi database sendiri tidak menjamin email terkirim tepat sekali. Panggilan sinkron tetap lebih tepat untuk reservasi stok dan pengambilan harga saat checkout karena Order Service harus mengetahui hasilnya sebelum menerima pesanan, sedangkan notifikasi dapat diproses kemudian.")
    add("Sumber dan pengumpulan", "Sub10")
    add("Laporan lengkap: docs/lab10/README.md. Bukti aktual: docs/evidence/lab10/results.json, execution.txt, tests.txt, screenshot, dan log tiap proses. Collection manual: docs/postman/lab10.postman_collection.json. Pengumpulan mengikuti panduan sebelum Lab 11.")
    for label, url in [
        ("RabbitMQ - Work Queues", "https://www.rabbitmq.com/tutorials/tutorial-two-javascript"),
        ("RabbitMQ - Publish/Subscribe", "https://www.rabbitmq.com/tutorials/tutorial-three-javascript"),
        ("amqplib - Channel API", "https://amqp-node.github.io/amqplib/channel_api.html"),
    ]:
        add(f'<link href="{url}" color="#177b67">{label}</link>', "Caption10")
    add("Panduan Praktikum Web Service Lab 10 - Philipus Suryo Subandoro, bahan tugas yang diberikan.", "Caption10")

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)

    def chrome(canvas, doc):
        canvas.saveState()
        canvas.setStrokeColor(colors.HexColor("#d1dee6"))
        canvas.line(18 * mm, 18 * mm, 192 * mm, 18 * mm)
        canvas.setFont("Body", 8)
        canvas.setFillColor(MUTED)
        canvas.drawString(18 * mm, 12 * mm, "LAB 10 | Bambang Herlambang - 5803024019 | Bukti lokal RabbitMQ")
        canvas.drawRightString(192 * mm, 12 * mm, str(doc.page))
        canvas.restoreState()

    doc = SimpleDocTemplate(str(OUTPUT), pagesize=(210 * mm, 297 * mm),
                            rightMargin=18 * mm, leftMargin=18 * mm,
                            topMargin=19 * mm, bottomMargin=25 * mm,
                            title="Laporan Praktikum Web Service Sesi 10 - RabbitMQ",
                            author="Bambang Herlambang")
    doc.build(story, onFirstPage=chrome, onLaterPages=chrome)
    print(OUTPUT)


if __name__ == "__main__":
    build()
