"""Build the standalone Lab 09 LaTeX report and its Overleaf source ZIP."""

from __future__ import annotations

import argparse
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import re
import shutil
import subprocess
import zipfile


PROJECT = Path(__file__).resolve().parent
REPO = PROJECT.parent.parent


def update_sources() -> None:
    images = PROJECT / "images"
    images.mkdir(exist_ok=True)
    sources = {"arsitektur.png": REPO / "docs/lab09/arsitektur.png"}
    for name in ("smoke-test", "product-down-post", "product-down-get", "product-recovered-post"):
        sources[f"{name}.png"] = REPO / f"docs/evidence/lab09/{name}.png"
    for source in (REPO / "docs/evidence/ui").glob("*.png"):
        sources[source.name] = source
    for name, source in sources.items():
        shutil.copy2(source, images / name)
    if not (images / "logo-ukwms.png").exists():
        raise FileNotFoundError("images/logo-ukwms.png must be included in the LaTeX project")

    evidence = REPO / "docs/evidence/lab09"
    smoke = json.loads((evidence / "smoke-test.json").read_text(encoding="utf-8"))
    tests = (evidence / "tests.txt").read_text(encoding="utf-8")
    stats = {}
    for key in ("tests", "pass", "fail"):
        found = re.search(rf"^# {key} (\d+)\s*$", tests, re.MULTILINE)
        if not found:
            raise ValueError(f"Test log does not contain a final '# {key}' summary")
        stats[key] = found.group(1)
    executed = datetime.fromisoformat(smoke["executedAt"].replace("Z", "+00:00"))
    local = executed.astimezone(timezone(timedelta(hours=7)))
    months = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"]
    local_time = f"{local.day} {months[local.month - 1]} {local.year} pukul {local:%H:%M:%S}"
    summary = smoke["summary"]
    values = {
        "LocalTestCount": stats["tests"],
        "LocalPassCount": stats["pass"],
        "LocalFailCount": stats["fail"],
        "DemoTimestamp": smoke["executedAt"],
        "DemoLocalTime": local_time,
        "SmokeProductCount": summary["productCount"],
        "SmokeOrderStatus": summary["orderStatus"],
        "SmokeStockBefore": summary["stockBefore"],
        "SmokeStockAfter": summary["stockAfter"],
        "SmokeTotal": f"{summary['total']:,}".replace(",", "."),
    }
    lines = ["% Generated from the actual local test log and smoke-test JSON."]
    lines += [f"\\newcommand{{\\{name}}}{{{value}}}" for name, value in values.items()]
    (PROJECT / "results.tex").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--tectonic", default=shutil.which("tectonic"))
    args = parser.parse_args()
    if not args.tectonic:
        parser.error("Install Tectonic or supply --tectonic /absolute/path/to/tectonic")
    update_sources()
    build = REPO / "tmp/pdfs/lab09-report"
    build.mkdir(parents=True, exist_ok=True)
    subprocess.run([args.tectonic, "--keep-logs", "--outdir", str(build), "main.tex"], cwd=PROJECT, check=True)
    pdf = REPO / "output/pdf/laporan-praktikum-sesi-09.pdf"
    pdf.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(build / "main.pdf", pdf)
    archive = REPO / "output/latex/laporan-praktikum-sesi-09-overleaf.zip"
    archive.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as output:
        for name in ("main.tex", "results.tex", "features.tex", "README.md"):
            output.write(PROJECT / name, name)
        for image in sorted((PROJECT / "images").glob("*")):
            if image.is_file():
                output.write(image, f"images/{image.name}")
    print(f"PDF: {pdf}")
    print(f"Overleaf ZIP: {archive}")


if __name__ == "__main__":
    main()
