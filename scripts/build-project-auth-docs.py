"""Export the Lab 11 individual Auth contract from the actual project specification."""
from pathlib import Path
import argparse
import copy
import hashlib
import json
import subprocess
import yaml

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--project', type=Path, default=ROOT.parent / 'umkm-marketplace')
    args = parser.parse_args()
    source = args.project.resolve()
    contract = yaml.safe_load((source / 'services/auth/openapi.yaml').read_text(encoding='utf-8'))
    selected = ['/auth/token', '/.well-known/jwks.json', '/auth/me']
    paths = {route: copy.deepcopy(contract['paths'][route]) for route in selected}
    spec = {
        'openapi': '3.0.3',
        'info': {
            'title': 'Auth Service - Marketplace UMKM Lokal - Bambang Herlambang',
            'version': '0.3.0',
            'description': (
                'Penerapan Lab 11 untuk komponen Auth + Gateway milik Bambang Herlambang '
                '(5803024019). Dokumentasi tiga endpoint Auth diturunkan dari kontrak dan '
                'kode proyek, bukan rancangan endpoint register/login password baru. '
                'Server pada file ini adalah Auth lokal langsung, terpisah dari port '
                'praktikum toko. Routing gateway proyek dijelaskan pada dokumen pendamping. '
                'Validasi OpenAPI tidak sama dengan bukti deployment atau pengujian online. '
                'Jangan memasukkan secret client, JWT aktif, atau private signing key ke file ini.'
            ),
        },
        'servers': [{'url': 'http://127.0.0.1:3001', 'description': 'Auth proyek lokal langsung; bukan order-service praktikum toko'}],
        'tags': [{'name': 'Identity', 'description': 'Token layanan, JWKS publik, dan profil akun terverifikasi'}],
        'x-owner': {'name': 'Bambang Herlambang', 'studentId': '5803024019', 'component': 'Auth + Gateway'},
        'paths': paths,
        'components': {},
    }
    def collect(value):
        if isinstance(value, list):
            for child in value: collect(child)
        elif isinstance(value, dict):
            ref = value.get('$ref')
            if ref:
                _, _, kind, name = ref.split('/')
                entries = spec['components'].setdefault(kind, {})
                if name not in entries:
                    entries[name] = copy.deepcopy(contract['components'][kind][name])
                    collect(entries[name])
            for child in value.values(): collect(child)
    collect(paths)
    spec['components']['securitySchemes'] = copy.deepcopy(contract['components']['securitySchemes'])
    spec['components']['schemas']['ClientCredentialsRequest'] = paths['/auth/token']['post']['requestBody']['content']['application/x-www-form-urlencoded']['schema']
    paths['/auth/token']['post']['requestBody']['content']['application/x-www-form-urlencoded']['schema'] = {'$ref': '#/components/schemas/ClientCredentialsRequest'}
    paths['/auth/token']['post']['requestBody']['content']['application/x-www-form-urlencoded']['example'] = {
        'grant_type': 'client_credentials', 'client_id': 'order-service',
        'client_secret': 'GANTI_DENGAN_SECRET_CLIENT_LOKAL', 'scope': 'read:catalog',
    }
    spec['components']['schemas']['OwnProfile'] = paths['/auth/me']['get']['responses']['200']['content']['application/json']['schema']
    paths['/auth/me']['get']['responses']['200']['content']['application/json']['schema'] = {'$ref': '#/components/schemas/OwnProfile'}
    paths['/auth/me']['get']['responses']['200']['content']['application/json']['example'] = {
        'id': '00000000-0000-4000-8000-000000000001', 'email': 'buyer@example.test',
        'displayName': 'Pengguna Contoh', 'role': 'buyer', 'status': 'ACTIVE',
    }
    spec['components']['schemas']['PublicJwks'] = paths['/.well-known/jwks.json']['get']['responses']['200']['content']['application/json']['schema']
    paths['/.well-known/jwks.json']['get']['responses']['200']['content']['application/json']['schema'] = {'$ref': '#/components/schemas/PublicJwks'}
    paths['/auth/token']['post']['security'] = []
    paths['/.well-known/jwks.json']['get']['security'] = []
    paths['/auth/me']['get']['x-required-scope'] = 'read:catalog'
    paths['/auth/me']['get']['x-storage-required'] = 'postgres'
    paths['/auth/me']['get']['description'] += ' Tidak menerima query parameter apa pun; query tambahan mendapat 400 BAD_REQUEST. Token role service tidak boleh membaca profil pengguna.'
    for route, item in paths.items():
        for operation in item.values():
            operation['parameters'] = [{
                'in': 'header', 'name': 'X-Correlation-ID', 'required': False,
                'description': 'UUID valid diteruskan; nilai tidak valid diganti server dengan UUID baru.',
                'schema': {'type': 'string', 'format': 'uuid'},
            }]
            operation['responses'].setdefault('500', {'$ref': '#/components/responses/InternalError'})
            for status, response in operation['responses'].items():
                if '$ref' in response:
                    name = response['$ref'].split('/')[-1]
                    response = copy.deepcopy(contract['components']['responses'][name])
                    operation['responses'][status] = response
                if route == '/auth/me':
                    response['description'] = {
                        '400': 'Query parameter tidak didukung; BAD_REQUEST.',
                        '401': 'JWT pengguna tidak ada, invalid atau expired; UNAUTHENTICATED.',
                        '403': 'Role/scope tidak sesuai atau akun tidak ACTIVE/tidak ditemukan; FORBIDDEN.',
                        '503': 'AUTH_STORAGE bukan postgres atau penyimpanan Auth belum tersedia; SERVICE_UNAVAILABLE.',
                    }.get(status, response['description'])
                response['headers'] = {
                    'Cache-Control': {'schema': {'type': 'string', 'enum': ['no-store']}},
                    'X-Correlation-ID': {'schema': {'type': 'string', 'format': 'uuid'}},
                }
                if int(status) >= 400:
                    codes = {'400': 'BAD_REQUEST', '401': 'UNAUTHENTICATED', '403': 'FORBIDDEN',
                             '413': 'BODY_TOO_LARGE', '415': 'UNSUPPORTED_MEDIA_TYPE',
                             '500': 'INTERNAL_ERROR', '503': 'SERVICE_UNAVAILABLE'}
                    code = codes[status]
                    if route == '/auth/token':
                        code = {'400': 'INVALID_SCOPE', '401': 'INVALID_CLIENT'}.get(status, code)
                    response['content']['application/json']['example'] = {'error': {
                        'code': code, 'message': response['description'],
                        'correlationId': '00000000-0000-4000-8000-000000000002',
                    }}
    spec['components']['schemas']['ErrorResponse']['example'] = {
        'error': {'code': 'UNAUTHENTICATED', 'message': 'Token tidak valid atau kedaluwarsa',
                  'correlationId': '00000000-0000-4000-8000-000000000002'},
    }
    destination = ROOT / 'docs/proyek-auth-service.openapi.yaml'
    destination.write_text(yaml.safe_dump(spec, sort_keys=False, allow_unicode=True, width=105), encoding='utf-8')
    files = ['services/auth/openapi.yaml', 'services/auth/src/index.ts', 'services/auth/src/onboarding.ts',
             'services/auth/src/accounts.ts', 'packages/security/src/index.ts', 'gateway/src/index.ts']
    committed = yaml.safe_load(subprocess.check_output(['git', 'show', 'HEAD:services/auth/openapi.yaml'], cwd=source).decode())
    record = {
        'project': 'umkm-marketplace',
        'projectHead': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=source).decode().strip(),
        'selectedRoutesMatchCommittedContract': {r: contract['paths'][r] == committed['paths'].get(r) for r in selected},
        'scope': 'Documentation snapshot of three existing Auth endpoints; no production request or deployment performed',
        'sources': [{'path': f, 'sha256': hashlib.sha256((source / f).read_bytes()).hexdigest()} for f in files],
    }
    (ROOT / 'docs/lab11/proyek-auth-source.json').write_text(json.dumps(record, indent=2) + '\n', encoding='utf-8')
    print(f'Exported {len(paths)} Auth endpoints: {destination}')


if __name__ == '__main__':
    main()
