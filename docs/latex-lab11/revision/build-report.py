"""Update the revised report while preserving the user's existing PDF pages."""
from pathlib import Path
import argparse
import shutil
import subprocess
import zipfile
from pypdf import PdfReader

PROJECT = Path(__file__).resolve().parent
ROOT = PROJECT.parents[2]


def main():
    parser = argparse.ArgumentParser()
    cached = Path.home() / '.cache/codex-tools/tectonic/0.17.0/tectonic.exe'
    parser.add_argument('--tectonic', default=shutil.which('tectonic') or str(cached))
    args = parser.parse_args()
    output = ROOT / 'output/pdf/Laporan Praktikum Web Service Sesi 11.pdf'
    base = PROJECT / 'base-report-16p.pdf'
    if not base.exists():
        if len(PdfReader(output).pages) != 16:
            raise ValueError('The initial baseline must be the user-revised 16-page PDF')
        shutil.copy2(output, base)
    images = PROJECT / 'images'
    images.mkdir(exist_ok=True)
    shutil.copy2(ROOT / 'docs/evidence/lab11/manual/07-postman-200.png', images / 'postman-200.png')
    shutil.copy2(ROOT / 'docs/proyek-auth-service.openapi.yaml', PROJECT / 'auth-contract.yaml')
    build = ROOT / 'tmp/pdfs/lab11-auth-revision'
    build.mkdir(parents=True, exist_ok=True)
    subprocess.run([args.tectonic, '--keep-logs', '--outdir', str(build), 'main.tex'], cwd=PROJECT, check=True)
    reader = PdfReader(build / 'main.pdf')
    text = '\n'.join(p.extract_text() or '' for p in reader.pages)
    for route in ['/auth/token', '/.well-known/jwks.json', '/auth/me']:
        if route not in text:
            raise ValueError(f'Missing documented route: {route}')
    shutil.copy2(build / 'main.pdf', output)
    archive = ROOT / 'output/latex/laporan-praktikum-sesi-11-overleaf.zip'
    with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED) as bundle:
        for name in ['main.tex', 'README.md', 'base-report-16p.pdf', 'auth-contract.yaml']:
            bundle.write(PROJECT / name, name)
        bundle.write(images / 'postman-200.png', 'images/postman-200.png')
    print(f'PDF ({len(reader.pages)} pages): {output}')
    print(f'Overleaf source: {archive}')


if __name__ == '__main__':
    main()
