"""Build a concise Lab 10 report with explained figures in the main sections.

Requires reportlab and Pillow. Screenshots keep their original colors and bytes.
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
    BaseDocTemplate, Flowable, Frame, Image, KeepTogether, PageBreak, PageTemplate,
    Paragraph, Spacer, Table, TableStyle,
)

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "docs/evidence/lab10"
MANUAL = EVIDENCE / "manual"
TERMINAL = EVIDENCE / "terminal"
OUTPUT = ROOT / "output/pdf/Laporan Praktikum Web Service Sesi 10.pdf"
PAGE_W, PAGE_H = 210 * mm, 297 * mm
LEFT = RIGHT = TOP = BOTTOM = 25 * mm
WIDTH, HEIGHT = PAGE_W - LEFT - RIGHT, PAGE_H - TOP - BOTTOM


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
    with PILImage.open(path) as source:
        picture = PILImage.new("RGB", source.size, "white")
        if source.mode == "RGBA":
            picture.paste(source, mask=source.getchannel("A"))
        else:
            picture.paste(source.convert("RGB"))
        buffer = BytesIO()
        picture.save(buffer, format="PNG")
        buffer.seek(0)
        return buffer, picture.size


class ReportDoc(BaseDocTemplate):
    def afterFlowable(self, flowable):
        if hasattr(flowable, "anchor"):
            self.canv.bookmarkPage(flowable.anchor)
            self.canv.addOutlineEntry(flowable.getPlainText(), flowable.anchor, 0)


def footer(canvas, doc):
    if doc.page > 1:
        canvas.saveState()
        canvas.setFillGray(0)
        canvas.setFont("Body", 12)
        canvas.drawCentredString(PAGE_W / 2, 15 * mm, str(doc.page - 1))
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
        canvas.drawString(20 * mm, self.height - 170 * mm, "Bambang Herlambang")
        canvas.drawRightString(WIDTH - 20 * mm, self.height - 170 * mm, "5803024019")
        line("PROGRAM STUDI INFORMATIKA", 207, 12, True)
        line("FAKULTAS TEKNIK", 215, 12, True)
        line("UNIVERSITAS KATOLIK WIDYA MANDALA", 223, 12, True)
        line("SURABAYA", 231, 12, True)
        line("2026", 239, 12, True)


def local_clock(value):
    stamp = datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone(timedelta(hours=7)))
    return stamp.strftime("%H:%M:%S.") + f"{stamp.microsecond // 1000:03d}"


def build():
    fonts()
    result = json.loads((EVIDENCE / "results.json").read_text(encoding="utf-8"))
    manual = json.loads((MANUAL / "observations.json").read_text(encoding="utf-8"))
    terminal = json.loads((TERMINAL / "results.json").read_text(encoding="utf-8"))
    log = (EVIDENCE / "tests.txt").read_text(encoding="utf-8-sig")
    stats = {name: int(re.search(rf"^# {name} (\d+)\s*$", log, re.MULTILINE).group(1)) for name in ("tests", "pass", "fail")}
    if not result["passed"] or not terminal["passed"] or stats["fail"]:
        raise ValueError("Resolve failed evidence before building the report")

    body = ParagraphStyle("BodyText", fontName="Body", fontSize=12, leading=16,
                          alignment=TA_JUSTIFY, spaceAfter=8, textColor=colors.black)
    heading_style = ParagraphStyle("Heading", parent=body, fontName="BodyBold", fontSize=14,
                                   leading=19, alignment=0, spaceAfter=12, keepWithNext=True)
    sub_style = ParagraphStyle("Sub", parent=body, fontName="BodyBold", fontSize=12,
                               spaceBefore=8, spaceAfter=6, keepWithNext=True)
    caption = ParagraphStyle("Caption", parent=body, fontSize=10, leading=13,
                            alignment=0, spaceBefore=5, spaceAfter=9)
    cell = ParagraphStyle("Cell", parent=body, fontSize=10, leading=13, alignment=0, spaceAfter=0)
    head = ParagraphStyle("CellHead", parent=cell, fontName="BodyBold")
    story, buffers = [Cover()], []
    headings = []
    figure_number = 0

    def add(text, style=body):
        story.append(Paragraph(text, style))

    def section(text):
        story.append(PageBreak())
        heading = Paragraph(text, heading_style)
        heading.anchor = f"section-{len(headings) + 1}"
        headings.append(text)
        story.append(heading)

    def continuation(text):
        story.append(PageBreak())
        add(text, heading_style)

    def image(path, label, explanation, maximum=115 * mm):
        nonlocal figure_number
        figure_number += 1
        buffer, (width, height) = image_buffer(path)
        buffers.append(buffer)
        scale = min(WIDTH / width, maximum / height)
        story.append(KeepTogether([
            Image(buffer, width=width * scale, height=height * scale, hAlign="CENTER"),
            Paragraph(f"Gambar {figure_number}. {label}", caption),
            Paragraph(f"Pada Gambar {figure_number}, {explanation}", body),
        ]))

    def table(headers, rows, widths):
        data = [[Paragraph(escape(str(v)), head) for v in headers]]
        data += [[Paragraph(escape(str(v)), cell) for v in row] for row in rows]
        item = Table(data, colWidths=[WIDTH * part for part in widths], repeatRows=1, hAlign="LEFT")
        item.setStyle(TableStyle([
            ("GRID", (0, 0), (-1, -1), 0.45, colors.HexColor("#888888")),
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#eeeeee")),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (-1, -1), 7), ("RIGHTPADDING", (0, 0), (-1, -1), 7),
            ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ]))
        story.extend([item, Spacer(1, 8)])

    section("1. Implementasi dan arsitektur")
    add("Lab 10 menambahkan RabbitMQ dan Notification Service pada Marketplace UMKM. Alur sinkron dan asinkron disajikan dalam diagram berikut.")
    image(ROOT / "docs/lab10/arsitektur.png", "Arsitektur Lab 10: reservasi stok sinkron dan notifikasi asinkron.",
          "Order Service mereservasi stok melalui HTTP, lalu menerbitkan order.created ke RabbitMQ. Notification Service memproses email simulasi dan memberikan ack.", 100 * mm)
    table(["Komponen", "Tanggung jawab"], [
        ["Catalog Service :3000", "Pemilik produk, harga, dan stok; reserve melalui HTTP."],
        ["Order Service :3001", "Menyimpan pesanan dan snapshot harga; producer order.created."],
        ["RabbitMQ :5672", "Exchange orders fanout; antrean durable dan pesan persistent."],
        ["Notification Service", "Consumer notification-queue; manual ack, prefetch 1, deduplikasi Set di memori."],
    ], [0.32, 0.68])
    add("Menjalankan: npm run broker:up; npm run start:notification; npm start. Pengujian melalui Postman/gateway :8080. Consumer dibuat sebelum order pertama agar antrean sudah terikat.", caption)

    section("2. Consumer mati dan pesan menunggu")
    add("Consumer dihentikan terlebih dahulu, lalu tiga request order dikirim satu per satu melalui gateway. Ketiganya memperoleh HTTP 201 Created.")
    image(MANUAL / manual["recovery"]["orders"][0]["postmanFile"], "Respons Postman untuk pesanan pertama saat consumer mati.",
          "order pertama memperoleh 201 Created meskipun consumer berhenti. ID pesanan dipakai untuk mencocokkan log setelah consumer pulih.", 85 * mm)
    image(MANUAL / manual["recovery"]["orders"][1]["postmanFile"], "Respons Postman untuk pesanan kedua saat consumer mati.",
          "order kedua juga berhasil dibuat dengan ID berbeda. Penerimaan pesanan tidak menunggu Notification Service kembali aktif.", 85 * mm)

    continuation("2. Consumer mati dan pesan menunggu (lanjutan)")
    image(MANUAL / manual["recovery"]["orders"][2]["postmanFile"], "Respons Postman untuk pesanan ketiga saat consumer mati.",
          "order ketiga memperoleh 201 Created. Tiga ID pesanan dari Gambar 2-4 dicocokkan dengan log pemulihan pada pengujian berikutnya.", 85 * mm)
    image(MANUAL / manual["dashboard"]["file"], "Dashboard notification-queue, 4 November 2026 pukul 17:13:11 UTC+7.",
          "Ready=3 menunjukkan tiga pesan menunggu, Unacked=0 berarti tidak ada pesan sedang diproses, dan Consumers=0 memastikan consumer mati. Broker tetap aktif pada vhost /.", 85 * mm)

    section("3. Consumer dinyalakan kembali")
    add("Setelah npm run start:notification dijalankan kembali, consumer-18824 memproses ketiga pesan tertahan. Setiap email simulasi diikuti ack; orderId cocok dengan ketiga respons Postman.")
    image(MANUAL / manual["recovery"]["file"], "Log consumer setelah dinyalakan kembali.",
          "tiga ID pesanan pada Gambar 2-4 diproses satu per satu. Setiap email simulasi diikuti ack, sehingga pesan yang menunggu diselesaikan setelah consumer pulih.")
    table(["OrderId sesuai Postman", "Email / ack UTC+7"], [
        [entry["orderId"], f"{local_clock(entry['emailAt'])} / {local_clock(entry['ackedAt'])}"]
        for entry in manual["recovery"]["orders"]
    ], [0.62, 0.38])

    section("4. Crash sebelum ack dan redelivery")
    crash = manual["crash"]
    add("Consumer dijalankan dengan --crash. Satu request order dikirim melalui Postman untuk menguji crash sesudah email dicetak tetapi sebelum acknowledgement.")
    image(MANUAL / crash["postmanFile"], "Respons Postman untuk satu pesanan uji crash.",
          "hanya satu order dibuat dan mendapat 201 Created. ID pesanan menjadi acuan untuk membuktikan bahwa email kedua berasal dari redelivery, bukan request baru.")
    add("Identitas pesan uji", sub_style)
    table(["Identitas", "Nilai"], [
        ["OrderId", crash["orderId"]],
        ["MessageId", crash["messageId"]],
    ], [0.2, 0.8])
    add("Setelah consumer berhenti otomatis, jalankan npm run start:notification tanpa --crash dan tanpa mengirim request order baru.")

    continuation("4. Crash sebelum ack dan redelivery (lanjutan)")
    image(MANUAL / crash["file"], "Log crash dan pemulihan consumer untuk pesan yang sama.",
          "email pertama diikuti crash sebelum ack. Setelah restart, messageId yang sama mencetak email kedua dengan redelivered:true, lalu di-ack.")
    table(["Tahap", "Waktu UTC+7", "Hasil"], [
        ["Email pertama", local_clock(crash["firstEmailAt"]), "consumer-5556; redelivered:false; crash sebelum ack"],
        ["Email kedua", local_clock(crash["secondEmailAt"]), "consumer-18608; redelivered:true"],
        ["Ack", local_clock(crash["ackedAt"]), "consumer-18608; kind: acked"],
    ], [0.23, 0.26, 0.51])
    add("Set processed hilang saat restart, sehingga duplikat tidak dikenali. Broker mengirim ulang pesan yang belum di-ack; pemrosesan bersifat at-least-once.")

    section("5. Competing consumers")
    add("Pengujian tambahan pukul 17:40 UTC+7 menjalankan dua consumer pada satu notification-queue. Enam order diterima melalui gateway dengan HTTP 201; event dibagi tanpa ID yang tumpang tindih.")
    image(TERMINAL / "competing-consumers.jpg", "Screenshot VS Code atas ringkasan log consumer aktual; sumbernya file JSONL.",
          "worker-A dan worker-B masing-masing memproses tiga event. ID yang berbeda pada kedua worker menunjukkan setiap event dikerjakan oleh satu consumer.")
    competing = next(entry for entry in terminal["cases"] if entry["type"] == "competing")
    table(["Consumer", "Email simulasi", "Ack"], [
        [name, len(ids), len(ids)] for name, ids in competing["workers"].items()
    ], [0.4, 0.3, 0.3])
    add("Prefetch 1 membatasi satu pesan unacked per worker. Pembagian 3+3 adalah hasil run ini, bukan jaminan pembagian selalu seimbang. Pengujian memakai vhost terpisah dari uji manual.")

    section("6. Publish subscribe")
    add("Pada pukul 17:42 UTC+7, consumer notification-queue dan audit-queue terikat ke exchange orders. Dua order baru dikirim; masing-masing antrean menerima kedua event dengan orderId yang sama.")
    image(TERMINAL / "pubsub.jpg", "Screenshot VS Code atas log aktual notification dan audit.",
          "dua orderId yang sama muncul pada consumer notification dan audit. Exchange fanout menyalin setiap event ke kedua antrean, kemudian masing-masing consumer memberi ack.")
    pubsub = next(entry for entry in terminal["cases"] if entry["type"] == "pubsub")
    table(["OrderId", "Penerima"], [
        [entry["order"]["id"], "notification dan audit"] for entry in pubsub["orders"]
    ], [0.65, 0.35])
    add("Competing consumers membagi pekerjaan pada antrean yang sama. Pub/sub memberi salinan event ke antrean berbeda. Consumer audit masih memakai program simulasi yang sama, belum database audit produksi.")

    section("7. Penerapan proyek dan refleksi")
    table(["Aspek", "Marketplace UMKM"], [
        ["Interaksi asinkron", "Notifikasi pesanan baru setelah checkout."],
        ["Event dan isi pesan", "order.created: ID pesanan, snapshot items/harga, quantity, total, status, waktu; messageId stabil."],
        ["Producer / consumer", "Order Service / Notification Service; subscriber audit opsional."],
        ["Alasan", "Email dapat menyusul; reservasi stok tetap sinkron karena menentukan penerimaan order."],
    ], [0.29, 0.71])
    add("Ringkasan pengujian", sub_style)
    add(f"Suite Lab 09 dan Lab 10: <b>{stats['pass']}/{stats['tests']} test lulus</b>, {stats['fail']} gagal; delapan skenario integrasi RabbitMQ asli lulus. Duplikat dalam proses yang sama dilewati; JSON rusak di-nack tanpa requeue. Saat koneksi publisher ditutup, order tetap 201 tetapi event hilang; reconnect hanya memulihkan pengiriman order baru.")
    add("Refleksi (5 kalimat)", sub_style)
    add("Jika RabbitMQ mati saat order dibuat, order tetap tersimpan dan klien menerima HTTP 201, tetapi event dapat hilang sehingga notifikasi tidak konsisten. Penyimpanan order bersama transactional outbox dan relay dengan retry diperlukan untuk mengurangi celah tersebut. Consumer idempotent perlu messageId unik di penyimpanan tahan restart serta transaksi yang mencatat ID dan side effect database sebelum ack. Email eksternal memerlukan outbox pengiriman dan dukungan idempotency key penyedia karena tabel processed saja tidak menjamin email tepat sekali. Panggilan sinkron tetap tepat untuk stok dan harga saat checkout karena hasilnya dibutuhkan segera, sedangkan notifikasi dapat diproses kemudian.")
    add("Batasan dan sumber", sub_style)
    add("Stok, pesanan, dan Set deduplikasi masih in-memory; belum ada transactional outbox atau SMTP. Lab 10 diuji lokal melalui Docker. Bukti manual, run tambahan, dan arsip otomatis memiliki waktu/ID/vhost tersendiri. Berkas lengkap tersedia pada docs/evidence/lab10/.", caption)
    add('<link href="https://github.com/academicbambang/prakwebservice-lab09-microservices/tree/lab10-message-queue" color="blue">Repository pengumpulan Lab 10</link>.', caption)
    for label, url in [
        ("RabbitMQ Work Queues", "https://www.rabbitmq.com/tutorials/tutorial-two-javascript"),
        ("RabbitMQ Publish Subscribe", "https://www.rabbitmq.com/tutorials/tutorial-three-javascript"),
        ("amqplib Channel API", "https://amqp-node.github.io/amqplib/channel_api.html"),
    ]:
        add(f'<link href="{url}" color="blue">{label}</link>', caption)
    add("Panduan Praktikum Web Service Lab 10, Philipus Suryo Subandoro.", caption)

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    doc = ReportDoc(str(OUTPUT), pagesize=(PAGE_W, PAGE_H), leftMargin=LEFT, rightMargin=RIGHT,
                    topMargin=TOP, bottomMargin=BOTTOM, title="Laporan Praktikum Web Service Sesi 10",
                    author="Bambang Herlambang")
    doc.addPageTemplates(PageTemplate(id="Report", frames=[Frame(LEFT, BOTTOM, WIDTH, HEIGHT,
                         leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)], onPageEnd=footer))
    doc.build(story)
    print(OUTPUT)
    print(f"Pages: {doc.page}; figures explained within main sections; no contents page, chapters, or appendix")


if __name__ == "__main__":
    build()
