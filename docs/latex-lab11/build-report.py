"""Build the standalone LaTeX report and an Overleaf-ready source archive."""
from pathlib import Path
import argparse
import hashlib
import json
import shutil
import subprocess
import zipfile

PROJECT = Path(__file__).resolve().parent
REPO = PROJECT.parent.parent


def main():
    parser = argparse.ArgumentParser()
    default = shutil.which('tectonic')
    cached = Path.home() / '.cache/codex-tools/tectonic/0.17.0/tectonic.exe'
    parser.add_argument('--tectonic', default=default or (str(cached) if cached.exists() else None))
    args = parser.parse_args()
    if not args.tectonic:
        parser.error('Install Tectonic or pass --tectonic /path/to/tectonic')
    manual = REPO / 'docs/evidence/lab11/manual'
    manifest = json.loads((manual / 'verification.json').read_text(encoding='utf-8'))
    images = PROJECT / 'images'
    images.mkdir(exist_ok=True)
    for item in manifest['files']:
        source = manual / item['file']
        if hashlib.sha256(source.read_bytes()).hexdigest() != item['sha256']:
            raise ValueError(f'Screenshot integrity mismatch: {source.name}')
        shutil.copy2(source, images / source.name)
    shutil.copy2(REPO / 'docs/latex-lab09/images/logo-ukwms.png', images / 'logo-ukwms.png')
    shutil.copy2(manual / 'verification.json', PROJECT / 'evidence-manifest.json')
    build = REPO / 'tmp/pdfs/lab11-report'
    build.mkdir(parents=True, exist_ok=True)
    subprocess.run([args.tectonic, '--keep-logs', '--outdir', str(build), 'main.tex'], cwd=PROJECT, check=True)
    pdf = REPO / 'output/pdf/laporan-praktikum-sesi-11.pdf'
    pdf.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(build / 'main.pdf', pdf)
    archive = REPO / 'output/latex/laporan-praktikum-sesi-11-overleaf.zip'
    archive.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED) as bundle:
        for name in ['main.tex', 'README.md', 'evidence-manifest.json']:
            bundle.write(PROJECT / name, name)
        for image in sorted(images.glob('*.png')):
            bundle.write(image, f'images/{image.name}')
    print(f'PDF: {pdf}')
    print(f'Overleaf ZIP: {archive}')


if __name__ == '__main__':
    main()
