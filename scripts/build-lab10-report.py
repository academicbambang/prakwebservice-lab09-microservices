"""Build the formal Lab 10 PDF with black text and original color figures.

Requires reportlab and Pillow. Original evidence images are never modified.
"""
from __future__ import annotations

import json
import re
from datetime import datetime, timedelta, timezone
from io import BytesIO
from pathlib import Path
from xml.sax.saxutils import escape

from PIL import Image as PILImage
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate, Flowable, Frame, Image, PageBreak, PageTemplate,
    Paragraph, Spacer, Table, TableStyle,
)
from reportlab.platypus.tableofcontents import TableOfContents

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "docs/evidence/lab10"
MANUAL = EVIDENCE / "manual"
OUTPUT = ROOT / "output/pdf/laporan-praktikum-sesi-10.pdf"
PAGE_W, PAGE_H = 210 * mm, 297 * mm
LEFT, RIGHT, TOP, BOTTOM = 40 * mm, 30 * mm, 30 * mm, 30 * mm
WIDTH = PAGE_W - LEFT - RIGHT
HEIGHT = PAGE_H - TOP - BOTTOM


def fonts():
    candidates = [
        (Path("C:/Windows/Fonts"), ("times.ttf", "timesbd.ttf", "timesi.ttf")),
        (Path("/usr/share/fonts/truetype/msttcorefonts"), ("Times_New_Roman.ttf", "Times_New_Roman_Bold.ttf", "Times_New_Roman_Italic.ttf")),
        (Path("/usr/share/fonts/truetype/liberation2"), ("LiberationSerif-Regular.ttf", "LiberationSerif-Bold.ttf", "LiberationSerif-Italic.ttf")),
    ]
    for directory, files in candidates:
        if all((directory / name).exists() for name in files):
            for family, name in zip(("Body", "BodyBold", "BodyItalic"), files):
                pdfmetrics.registerFont(TTFont(family, str(directory / name)))
            pdfmetrics.registerFontFamily("Body", normal="Body", bold="BodyBold", italic="BodyItalic", boldItalic="BodyBold")
            return
    raise RuntimeError("Install Times New Roman or Liberation Serif")


def image_buffer(path):
    # Preserve original image colors while keeping the academic typography black.
    with PILImage.open(path) as source:
        if source.mode == "RGBA":
            white = PILImage.new("RGB", source.size, "white")
            white.paste(source, mask=source.getchannel("A"))
            picture = white
        else:
            picture = source.convert("RGB")
        size = picture.size
        buffer = BytesIO()
        picture.save(buffer, format="PNG")
        buffer.seek(0)
    return buffer, size


def roman(number):
    result = ""
    for value, letters in ((100, "c"), (90, "xc"), (50, "l"), (40, "xl"), (10, "x"), (9, "ix"), (5, "v"), (4, "iv"), (1, "i")):
        while number >= value:
            result += letters
            number -= value
    return result


class FormalDoc(BaseDocTemplate):
    def beforeDocument(self):
        self.body_start = None
        self.heading_pages = []

    def afterFlowable(self, flowable):
        if not hasattr(flowable, "toc_level"):
            return
        if self.body_start is None:
            self.body_start = self.page
        label = self.page - self.body_start + 1
        self.canv.bookmarkPage(flowable.anchor)
        self.canv.addOutlineEntry(flowable.toc_text, flowable.anchor, flowable.toc_level)
        self.notify("TOCEntry", (flowable.toc_level, flowable.toc_text, label, flowable.anchor))
        self.heading_pages.append({"title": flowable.toc_text, "page": label, "physicalPage": self.page})


def footer(canvas, doc):
    if doc.page == 1:
        return
    label = roman(doc.page - 1) if doc.body_start is None else str(doc.page - doc.body_start + 1)
    canvas.saveState()
    canvas.setFillGray(0)
    canvas.setFont("Body", 12)
    canvas.drawCentredString(PAGE_W / 2, 15 * mm, label)
    canvas.restoreState()


class Cover(Flowable):
    def __init__(self):
        super().__init__()
        self.width, self.height = WIDTH, HEIGHT - 1

    def draw(self):
        canvas = self.canv
        canvas.setFillGray(0)

        def line(text, from_top, size=12, bold=False):
            canvas.setFont("BodyBold" if bold else "Body", size)
            canvas.drawCentredString(WIDTH / 2, self.height - from_top * mm, text)

        line("LAPORAN PRAKTIKUM SESI 10", 5, 14, True)
        line("KOMUNIKASI ANTARSERVICE", 17, 14, True)
        line("VIA MESSAGE QUEUE", 25, 14, True)
        line("Penerapan RabbitMQ pada Marketplace UMKM", 38, 13, True)
        line("Mata Kuliah Web Service", 48)
        logo, (width, height) = image_buffer(ROOT / "docs/lab10/assets/logo-ukwms.png")
        logo_height = 65 * mm
        logo_width = logo_height * width / height
        canvas.drawImage(ImageReader(logo), (WIDTH - logo_width) / 2,
                         self.height - 121 * mm, logo_width, logo_height)
        line("Dosen Pengampu", 134)
        line("Philipus Suryo Subandoro", 142)
        line("Disusun oleh", 158, 12, True)
        canvas.setFont("Body", 12)
        canvas.drawString(10 * mm, self.height - 170 * mm, "Bambang Herlambang")
        canvas.drawRightString(WIDTH - 10 * mm, self.height - 170 * mm, "5803024019")
        line("PROGRAM STUDI INFORMATIKA", 207, 13, True)
        line("FAKULTAS TEKNIK", 215, 13, True)
        line("UNIVERSITAS KATOLIK WIDYA MANDALA SURABAYA", 223, 12, True)
        line("2026", 231, 13, True)


def local_clock(value):
    stamp = datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone(timedelta(hours=7)))
    return stamp.strftime("%H:%M:%S.") + f"{stamp.microsecond // 1000:03d}"


def build():
    fonts()
    result = json.loads((EVIDENCE / "results.json").read_text(encoding="utf-8"))
    manual = json.loads((MANUAL / "observations.json").read_text(encoding="utf-8"))
    terminal_dir = EVIDENCE / "terminal"
    terminal = json.loads((terminal_dir / "results.json").read_text(encoding="utf-8"))
    if not terminal.get("passed") or len(terminal["cases"]) != 2:
        raise ValueError("Complete the additional consumer log evidence before building")
    log = (EVIDENCE / "tests.txt").read_text(encoding="utf-8-sig")
    stats = {name: int(re.search(rf"^# {name} (\d+)\s*$", log, re.MULTILINE).group(1)) for name in ("tests", "pass", "fail")}
    if not result["passed"] or len(result["scenarios"]) != 8 or stats["fail"]:
        raise ValueError("Complete the integration scenarios and resolve test failures before building")

    body = ParagraphStyle("BodyText", fontName="Body", fontSize=12, leading=18,
                          alignment=TA_JUSTIFY, spaceAfter=8, textColor=colors.black)
    chapter_style = ParagraphStyle("Chapter", parent=body, fontName="BodyBold", fontSize=14,
                                   leading=21, alignment=TA_CENTER, spaceAfter=20, keepWithNext=True)
    sub_style = ParagraphStyle("Sub", parent=body, fontName="BodyBold", fontSize=12,
                              leading=17, spaceBefore=10, spaceAfter=8, alignment=0, keepWithNext=True)
    caption = ParagraphStyle("Caption", parent=body, fontSize=10, leading=13,
                            alignment=0, spaceBefore=5, spaceAfter=9)
    cell = ParagraphStyle("Cell", parent=body, fontSize=10, leading=13, alignment=0, spaceAfter=0)
    head = ParagraphStyle("CellHead", parent=cell, fontName="BodyBold")
    story = [Cover(), PageBreak(), Paragraph("DAFTAR ISI", chapter_style)]
    toc = TableOfContents()
    toc.dotsMinLevel = 0
    toc.tableStyle = TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ])
    toc.levelStyles = [
        ParagraphStyle("TOCChapter", fontName="BodyBold", fontSize=11, leading=15,
                       leftIndent=0, firstLineIndent=0, spaceBefore=5, rightIndent=16, textColor=colors.black),
        ParagraphStyle("TOCSection", fontName="Body", fontSize=11, leading=14,
                       leftIndent=12, firstLineIndent=0, spaceBefore=0, rightIndent=16, textColor=colors.black),
    ]
    story.append(toc)
    image_buffers = []

    def add(text, style=body):
        story.append(Paragraph(text, style))

    def heading(text, level=1, title=None):
        item = Paragraph(text, sub_style if level else chapter_style)
        item.toc_level = level
        item.toc_text = title or re.sub("<[^>]+>", " ", text)
        item.anchor = f"section-{sum(hasattr(v, 'toc_level') for v in story)}"
        story.append(item)

    def chapter(number, title):
        story.append(PageBreak())
        heading(f"BAB {number}<br/>{title}", 0, f"BAB {number} {title}")

    def image(path, label, maximum=100 * mm):
        buffer, (width, height) = image_buffer(path)
        image_buffers.append(buffer)
        scale = min(WIDTH / width, maximum / height)
        story.append(Image(buffer, width=width * scale, height=height * scale, hAlign="CENTER"))
        add(label, caption)

    def table(headers, rows, widths):
        data = [[Paragraph(escape(str(v)), head) for v in headers]]
        data += [[Paragraph(escape(str(v)), cell) for v in row] for row in rows]
        item = Table(data, colWidths=[WIDTH * part for part in widths], repeatRows=1, hAlign="LEFT")
        item.setStyle(TableStyle([
            ("GRID", (0, 0), (-1, -1), 0.45, colors.HexColor("#888888")),
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#eeeeee")),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (-1, -1), 7), ("RIGHTPADDING", (0, 0), (-1, -1), 7),
            ("TOPPADDING", (0, 0), (-1, -1), 7), ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ]))
        story.extend([item, Spacer(1, 9)])

    chapter("I", "PENDAHULUAN")
    heading("1.1 Latar Belakang")
    add("Praktikum sesi 10 melanjutkan pemisahan aplikasi Marketplace UMKM pada Lab 09 dengan menambahkan komunikasi asinkron melalui RabbitMQ. Reservasi stok tetap dilakukan melalui HTTP karena hasilnya dibutuhkan sebelum pesanan diterima. Pekerjaan notifikasi dipindahkan ke consumer terpisah agar pesanan tidak perlu menunggu pengiriman email.")
    add("Hasil pengujian menunjukkan bahwa pesanan tetap diterima ketika consumer berhenti, sedangkan pesan menunggu di antrean dan diproses setelah consumer pulih. Pengujian crash juga menunjukkan bahwa pesan dapat diproses dua kali apabila consumer berhenti sebelum memberikan acknowledgement.")
    heading("1.2 Tujuan Praktikum")
    add("Praktikum bertujuan menjalankan RabbitMQ dan mengamati status antreannya, membangun producer dan consumer terpisah, membuktikan penahanan pesan saat consumer mati, serta menjelaskan acknowledgement, redelivery, competing consumers, pub/sub, dan kebutuhan idempotensi.")
    heading("1.3 Ruang Lingkup")
    add("Implementasi mencakup gateway, Catalog Service, Order Service, RabbitMQ, dan Notification Service. Pesanan serta stok tetap disimpan dalam memori. Email yang ditampilkan merupakan simulasi log; aplikasi belum terhubung ke SMTP, database persisten, atau transactional outbox.")
    add("Bukti utama butir consumer mati dan crash berasal dari pengujian manual pada 4 November 2026. Pengujian otomatis melengkapi pembuktian competing consumers, pub/sub, serta penanganan kegagalan. Keduanya menggunakan ID, waktu, dan virtual host yang berbeda.")

    chapter("II", "DASAR TEORI")
    heading("2.1 Komunikasi Sinkron dan Asinkron")
    add("Pada komunikasi sinkron, pemanggil menunggu respons service tujuan. Pola ini sesuai untuk pemeriksaan stok dan harga saat checkout. Pada komunikasi asinkron, producer menerbitkan event ke broker dan consumer memprosesnya kemudian. Balasan HTTP tidak menunggu pekerjaan consumer selesai.")
    heading("2.2 RabbitMQ dan Exchange Fanout")
    add("RabbitMQ menyalurkan pesan melalui exchange ke antrean yang terikat. Exchange fanout mengirim salinan pesan ke setiap antrean terikat. Pada praktikum ini, exchange orders menghubungkan notification-queue dan, pada eksperimen pub/sub, audit-queue. Dua consumer pada antrean yang sama berbagi pekerjaan, sedangkan consumer pada antrean berbeda menerima salinan masing-masing.")
    add("Exchange dan antrean menggunakan durable=true; pesan memakai persistent=true. Volume Docker mempertahankan data broker. Konfigurasi ini melindungi pesan yang sudah diterima broker, tetapi tidak menyatukan penyimpanan pesanan dan publikasi event menjadi satu transaksi. Exchange sendiri tidak menahan event tanpa antrean tujuan.")
    heading("2.3 Acknowledgement dan Idempotensi")
    add("Consumer memberikan ack setelah pekerjaan selesai. Jika koneksi terputus sebelum ack, broker dapat mengirim ulang pesan yang belum diakui. Inilah perilaku at-least-once pada pesan yang telah diantrekan, bukan jaminan side effect terjadi tepat sekali.")
    add("Consumer idempotent harus mencegah side effect berulang untuk messageId yang sama. Set dalam memori hanya mengenali duplikat selama proses hidup. Penyimpanan tahan restart dengan unique constraint dan transaksi diperlukan untuk side effect database; email eksternal memerlukan dukungan idempotency key dari penyedia atau rancangan pengiriman yang sesuai.")

    chapter("III", "IMPLEMENTASI SISTEM")
    heading("3.1 Arsitektur dan Kepemilikan Data")
    add("Gateway meneruskan request ke katalog atau pesanan. Catalog Service menjadi pemilik tunggal stok dan harga. Order Service meminta reservasi melalui HTTP dengan timeout dua detik, menyimpan pesanan beserta snapshot harga, lalu menerbitkan order.created. Notification Service menerima pesan melalui RabbitMQ dan memberikan ack setelah email simulasi dicetak.")
    image(ROOT / "docs/lab10/arsitektur.png", "Gambar 3.1 Arsitektur Lab 10 dengan alur reservasi sinkron dan notifikasi asinkron.")
    table(["Komponen", "Data dan tanggung jawab"], [
        ["Catalog Service :3000", "Produk, harga, dan stok; satu-satunya pengubah stok."],
        ["Order Service :3001", "Pesanan dan snapshot harga; producer order.created."],
        ["RabbitMQ :5672", "Exchange orders dan antrean durable; dashboard :15672."],
        ["Notification Service", "Consumer, email simulasi, Set messageId, manual ack, prefetch 1."],
    ], [0.32, 0.68])
    heading("3.2 Kontrak Event dan Penanganan Pesan")
    add("Payload memuat type=order.created dan data pesanan: id, customerName, items, total, status, serta createdAt. Setiap item berisi productId, name, quantity, unitPrice, dan subtotal. AMQP properties menggunakan messageId=order-${order.id}, contentType=application/json, dan persistent=true.")
    add("Publisher menggunakan confirm channel secara asinkron dan mandatory=true. Confirm menunjukkan penerimaan publikasi oleh broker, bukan selesainya email. Event tanpa antrean tujuan dicatat sebagai unroutable. Nilai false dari channel.publish berarti buffer menahan backpressure, bukan pesan saat itu ditolak.")
    add("Publisher mencoba reconnect setiap tiga detik ketika broker tidak tersedia. Order tetap dapat menerima HTTP 201, tetapi event yang tidak terkirim tidak direplay otomatis. Consumer melakukan manual ack; event atau JSON tidak valid di-nack tanpa requeue. Consumer perlu dijalankan kembali jika koneksi brokernya terputus.")
    heading("3.3 Lingkungan dan Prosedur Menjalankan")
    add("Lingkungan lokal menggunakan Node.js 22 atau lebih baru dan Docker Desktop dengan Linux engine. Persiapan dari root repository adalah npm ci, npm run setup, dan npm run broker:up. Consumer dijalankan dengan npm run start:notification sebelum order pertama diterbitkan agar antrean dan binding sudah terbentuk.")
    add("Service HTTP dijalankan melalui npm start. Setelah publisher mencetak ready, request dapat dikirim melalui Postman atau npm run test:smoke. Gateway memakai alamat http://127.0.0.1:8080 dan header X-API-Key dari konfigurasi lokal. Dashboard RabbitMQ tersedia di http://127.0.0.1:15672. Kredensial cloud hanya disimpan melalui environment AMQP_URL.")
    add("Pengujian otomatis memakai npm test dan npm run test:lab10:evidence. Demo memilih port HTTP bebas dan vhost baru agar tidak mengubah antrean pengguna. Screenshot otomatis memerlukan instalasi browser melalui npx playwright install chromium.")

    chapter("IV", "HASIL PENGUJIAN DAN PEMBAHASAN")
    heading("4.1 Sumber Bukti Pengujian")
    add("Pengujian manual menggunakan Postman, RabbitMQ Management UI, dan terminal VS Code pada virtual host /. Screenshot disalin utuh ke repository. Tabel waktu berikut merupakan transkripsi tampilan, dengan timestamp UTC pada log dikonversi ke UTC+7. Run otomatis sebelumnya memakai vhost terisolasi dan diperlakukan sebagai sumber bukti tersendiri.")
    heading("4.2 Consumer Mati dan Pesan Menunggu")
    add("Setelah consumer dihentikan, tiga request pada folder Postman 02 Consumer mati masing-masing mendapat 201 Created. Ketiga event menunggu di notification-queue ketika jumlah consumer nol. Pengirim dan penerima tidak harus aktif bersamaan jika broker aktif dan antrean sudah terikat.")
    image(MANUAL / manual["dashboard"]["file"], "Gambar 4.1 Dashboard manual pada 4 November 2026 pukul 17:13:11 UTC+7. Judul halaman menunjukkan notification-queue pada vhost /.")
    table(["Pengamatan", "Hasil manual"], [
        ["Ready / Unacked / Consumers", "3 / 0 / 0"],
        ["Respons tiga request Postman", "Masing-masing 201 Created"],
    ], [0.52, 0.48])

    story.append(PageBreak())
    heading("4.3 Consumer Dinyalakan Kembali")
    add("Consumer dijalankan kembali melalui npm run start:notification. Consumer-18824 memproses ketiga pesan tertahan. Setiap email simulasi diikuti ack dan orderId-nya cocok dengan respons Postman sebelumnya.")
    image(MANUAL / manual["recovery"]["file"], "Gambar 4.2 Terminal manual setelah consumer kembali berjalan dan memproses tiga pesan.")
    table(["OrderId sesuai Postman", "Email / ack UTC+7"], [
        [entry["orderId"], f"{local_clock(entry['emailAt'])} / {local_clock(entry['ackedAt'])}"]
        for entry in manual["recovery"]["orders"]
    ], [0.62, 0.38])
    add("Bukti manual pemulihan memperlihatkan tiga email dan tiga acknowledgement. Hal ini melengkapi screenshot Ready=3 sebelumnya dan membuktikan bahwa pesan yang tertahan dapat diproses setelah consumer pulih.")

    story.append(PageBreak())
    heading("4.4 Crash Sebelum Ack dan Redelivery")
    crash = manual["crash"]
    add("Consumer dimulai dengan --crash, lalu satu request pada folder Postman 05 Crash dikirim dan mendapat 201 Created. Consumer-5556 mencetak email simulasi, menampilkan Crash sebelum ack!, lalu berhenti. Tanpa mengirim request baru, consumer biasa dijalankan kembali dan memproses pesan yang sama.")
    image(MANUAL / crash["file"], "Gambar 4.3 Terminal manual menunjukkan email pertama sebelum crash dan email kedua sesudah restart.")
    add("MessageId kedua pemrosesan adalah " + escape(crash["messageId"]) + ".", caption)
    table(["Tahap", "Waktu UTC+7", "Hasil"], [
        ["Email pertama", local_clock(crash["firstEmailAt"]), "consumer-5556; redelivered:false; crash sebelum ack"],
        ["Email kedua", local_clock(crash["secondEmailAt"]), "consumer-18608; redelivered:true"],
        ["Ack", local_clock(crash["ackedAt"]), "consumer-18608; kind: acked"],
    ], [0.23, 0.26, 0.51])
    add("Email tercetak dua kali untuk messageId yang sama karena broker belum menerima ack pertama dan Set processed hilang saat restart. Hasil ini menunjukkan perlunya idempotensi tahan restart.")

    story.append(PageBreak())
    heading("4.5 Competing Consumers")
    add("Pengujian tambahan pada 4 November 2026 pukul 17:40 UTC+7 menjalankan dua consumer pada notification-queue yang sama. Enam order dikirim melalui gateway dan seluruhnya mendapat HTTP 201. Event dibagi antara worker-A dan worker-B, tanpa ID yang diproses oleh kedua worker.")
    image(terminal_dir / "competing-consumers.jpg", "Gambar 4.4 Screenshot VS Code yang menampilkan log consumer aktual. Tampilan ringkas mempertahankan timestamp, nama worker, jenis event, dan orderId dari file JSONL asli; bukan halaman hasil HTML.", 105 * mm)
    competing = next(entry for entry in terminal["cases"] if entry["type"] == "competing")
    table(["Consumer", "Email simulasi", "Acknowledgement"], [
        [name, len(ids), len(ids)] for name, ids in competing["workers"].items()
    ], [0.4, 0.3, 0.3])
    add("Prefetch 1 membatasi satu pesan unacked per worker. Pembagian 3+3 adalah hasil run ini, bukan jaminan pembagian selalu seimbang. Bukti ini memakai virtual host tambahan yang terpisah dari antrean manual pengguna.")

    story.append(PageBreak())
    heading("4.6 Publish Subscribe")
    add("Pada pukul 17:42 UTC+7, satu consumer membaca notification-queue dan satu consumer lain membaca audit-queue. Kedua antrean terikat ke exchange orders. Dua order baru dikirim; setiap antrean menerima salinan kedua event dengan orderId yang sama.")
    image(terminal_dir / "pubsub.jpg", "Gambar 4.5 Screenshot VS Code atas log consumer aktual pada dua antrean. Setiap orderId terlihat pada consumer notification dan audit, masing-masing diikuti ack.", 105 * mm)
    pubsub = next(entry for entry in terminal["cases"] if entry["type"] == "pubsub")
    table(["OrderId yang diterbitkan", "Penerima"], [
        [entry["order"]["id"], "notification dan audit"] for entry in pubsub["orders"]
    ], [0.65, 0.35])
    add("Fanout mengirim satu salinan ke setiap antrean terikat. Pola ini berbeda dari pembagian pekerjaan pada satu antrean. Consumer audit memakai program simulasi yang sama dengan nama antrean berbeda; belum ada database audit produksi.")

    story.append(PageBreak())
    heading("4.7 Pengujian Tambahan dan Konsistensi")
    table(["Pengujian", "Hasil"], [
        ["Alur normal", "HTTP 201 diterima sebelum email simulasi selesai."],
        ["Duplikat pada proses sama", "ID lama di-ack dan dilewati tanpa email baru."],
        ["Pesan rusak", "JSON tidak valid di-nack tanpa requeue."],
        ["Publisher terputus", "Order tetap 201; event tidak terkirim. Setelah reconnect, event order baru terkirim."],
        ["Suite Lab 09 dan Lab 10", f"{stats['pass']} dari {stats['tests']} test lulus; {stats['fail']} gagal."],
    ], [0.36, 0.64])
    add("Skenario gangguan publisher menutup hanya koneksi AMQP publisher melalui Management API, bukan seluruh broker. Unit test juga memeriksa kegagalan koneksi awal, channel error, backpressure, dan ack/nack. Delapan skenario integrasi RabbitMQ asli lulus pada run otomatis.")
    add("Penyimpanan order dan publikasi event belum atomik. Jika RabbitMQ tidak tersedia, order dapat tersimpan tanpa notifikasi. Durable queue, persistent message, dan publisher confirms tidak menutup celah sebelum publikasi; pengembangan lanjutan memerlukan transactional outbox dan consumer idempotent.")

    chapter("V", "PENUTUP")
    heading("5.1 Penerapan pada Proyek Marketplace UMKM")
    add("Pemberitahuan pesanan baru dijadikan asinkron. Order Service menerbitkan order.created dan Notification Service membacanya melalui notification-queue; audit dapat memakai antrean terpisah. Event memuat ID pesanan, snapshot produk dan harga, jumlah, total, status, serta waktu. Notifikasi dapat menyusul tanpa menahan checkout, sedangkan reservasi stok tetap sinkron karena hasilnya menentukan penerimaan pesanan.")
    heading("5.2 Refleksi")
    add("Jika RabbitMQ mati saat order dibuat, publisher mencatat bahwa event tidak terkirim, sementara order tetap tersimpan dan klien tetap menerima HTTP 201. Hal itu dapat membuat data pesanan dan notifikasi tidak konsisten, sehingga pengembangan selanjutnya memerlukan penyimpanan order bersama outbox dalam satu transaksi serta relay yang mencoba ulang. Consumer yang idempotent harus memakai messageId unik di penyimpanan tahan restart dan mencatat ID beserta side effect database secara atomik sebelum ack, bukan hanya menggunakan Set dalam memori. Untuk email eksternal, diperlukan outbox pengiriman dan dukungan idempotency key dari penyedia karena transaksi database sendiri tidak menjamin email terkirim tepat sekali. Panggilan sinkron tetap lebih tepat untuk reservasi stok dan pengambilan harga saat checkout karena Order Service harus mengetahui hasilnya sebelum menerima pesanan, sedangkan notifikasi dapat diproses kemudian.")
    heading("5.3 Kesimpulan dan Batasan")
    add("Bukti manual menunjukkan tiga pesan tertahan saat consumer mati, pemrosesan setelah pulih, dan email dua kali akibat crash sebelum ack. Suite otomatis melengkapi verifikasi dengan 75 test dan delapan skenario integrasi yang lulus. Stok, order, dan deduplikasi masih in-memory; transaksi outbox dan idempotensi tahan restart belum diimplementasikan. Pengujian Lab 10 berlangsung lokal melalui Docker; deployment Render yang sudah ada merupakan arsip Lab 09.")

    story.append(PageBreak())
    heading("DAFTAR PUSTAKA", 0)
    for label, url in [
        ("RabbitMQ. Work Queues Tutorial JavaScript.", "https://www.rabbitmq.com/tutorials/tutorial-two-javascript"),
        ("RabbitMQ. Publish Subscribe Tutorial JavaScript.", "https://www.rabbitmq.com/tutorials/tutorial-three-javascript"),
        ("amqplib. Channel API Reference.", "https://amqp-node.github.io/amqplib/channel_api.html"),
    ]:
        add(f'<link href="{url}" color="black">{label}</link>')
    add("Subandoro, Philipus Suryo. Panduan Praktikum Web Service Lab 10 Komunikasi Antar Service via Message Queue. Bahan tugas praktikum.")

    story.append(PageBreak())
    heading("LAMPIRAN SUMBER DAN REPRODUKSI", 0)
    add("Repository pengumpulan tetap menggunakan repository Lab 09 dengan branch lab10-message-queue. Tautan berikut membuka versi Lab 10 beserta sumber laporan dan bukti:")
    add('<link href="https://github.com/academicbambang/prakwebservice-lab09-microservices/tree/lab10-message-queue" color="black">Repository Lab 10 Marketplace UMKM</link>.')
    add("Bukti manual utama berada pada docs/evidence/lab10/manual/, terdiri atas tujuh screenshot asli, observations.json sebagai transkripsi, dan SHA256SUMS.txt untuk pemeriksaan keutuhan. Gambar dan logo pada PDF mempertahankan warna aslinya, sedangkan teks, judul, dan tabel tetap hitam putih. Berkas screenshot asli di repository tidak diubah.")
    add("Bukti tambahan pada docs/evidence/lab10/terminal/ memuat screenshot VS Code atas tampilan ringkas log aktual competing consumers dan pub/sub, file JSONL asli, serta hasil HTTP pengujian pada virtual host terpisah. Waktu dan ID run tambahan ini tidak digabung dengan run manual sebelumnya.")
    add("Bukti otomatis pelengkap terdapat pada docs/evidence/lab10/results.json, execution.txt, tests.txt, dan log tiap proses. Dokumen lengkap serta prosedur manual tersedia pada docs/lab10/README.md; collection Postman berada pada docs/postman/lab10.postman_collection.json.")
    add("Untuk membangun ulang laporan, jalankan python scripts/build-lab10-report.py menggunakan Python yang memiliki reportlab dan Pillow. Builder membaca bukti yang sudah tersimpan, tidak menjalankan ulang pengujian dan tidak mengubah antrean yang sedang digunakan.")

    story.append(PageBreak())
    heading("LAMPIRAN BUKTI REQUEST POSTMAN", 0)
    add("Screenshot Postman berikut adalah lampiran asli pengguna. Masing-masing menunjukkan HTTP 201 Created dan orderId yang dapat dicocokkan dengan log pemulihan pada Subbab 4.3.", caption)
    for index in (0, 1):
        image(MANUAL / manual["recovery"]["orders"][index]["postmanFile"], f"Gambar L.{index + 1} Respons Postman pesanan {index + 1} saat consumer mati.", 82 * mm)
    story.append(PageBreak())
    for path, label in [
        (MANUAL / manual["recovery"]["orders"][2]["postmanFile"], "Gambar L.3 Respons Postman pesanan ketiga saat consumer mati."),
        (MANUAL / crash["postmanFile"], "Gambar L.4 Respons Postman untuk satu pesanan pada uji crash. OrderId yang sama diproses ulang setelah consumer kembali berjalan."),
    ]:
        image(path, label, 82 * mm)

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    doc = FormalDoc(str(OUTPUT), pagesize=(PAGE_W, PAGE_H), leftMargin=LEFT, rightMargin=RIGHT,
                    topMargin=TOP, bottomMargin=BOTTOM, title="Laporan Praktikum Web Service Sesi 10",
                    author="Bambang Herlambang")
    doc.addPageTemplates(PageTemplate(id="Formal", frames=[Frame(LEFT, BOTTOM, WIDTH, HEIGHT,
                         leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)], onPageEnd=footer))
    doc.multiBuild(story)
    review = ROOT / "tmp/pdfs/lab10-formal"
    review.mkdir(parents=True, exist_ok=True)
    (review / "contents-map.json").write_text(json.dumps(doc.heading_pages, indent=2), encoding="utf-8")
    print(OUTPUT)
    print(f"Pages: {doc.page}; body starts on physical page {doc.body_start}")


if __name__ == "__main__":
    build()
