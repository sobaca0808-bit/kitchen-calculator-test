"""Append a runtime-only PR22 sandbox; preserve the existing Pages tree byte for byte."""
import argparse
import hashlib
import json
import re
import subprocess
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[2]
SOURCE = '1a68adffd2046b758b683af3b516adf944081149'
PATH = 'pr-22'
CHANGES = {
    'js/storage.js': ('kitchen-calculator-pr2-browser-test-v1', 'kitchen-calculator-pr22-preview-v1'),
    'js/drafts.js': ('kitchen-calculator-pr2-browser-drafts-v1', 'kitchen-calculator-pr22-drafts-v1'),
    'js/photos.js': ('kitchen-calculator-test-photos-v1', 'kitchen-calculator-pr22-photos-v1'),
    'js/import-transaction.js': ('kitchen-calculator-test-import-backups-v1', 'kitchen-calculator-pr22-import-backups-v1'),
    'js/appearance.js': ('kitchen-calculator-appearance-test-v1', 'kitchen-calculator-pr22-appearance-v1'),
}

def sha(data):
    return hashlib.sha256(data).hexdigest()

def build(pages, old_proof, proof_file):
    def read(name):
        return subprocess.check_output(['git', '-C', str(ROOT), 'show', SOURCE + ':' + name])

    protected = {p.relative_to(pages).as_posix(): sha(p.read_bytes()) for p in pages.rglob('*') if p.is_file()}
    assert protected and not (pages / PATH).exists(), 'Use a fresh combined Pages output.'
    html = read('index.html').decode()
    links = re.findall(r'<(?:script|link)\b[^>]*\b(?:src|href)=["\']([^"\']+)', html, re.I)
    assert all(not urlsplit(link).scheme and not urlsplit(link).netloc and not link.startswith('/') for link in links)
    files = {'index.html', *(urlsplit(link).path for link in links)}
    for css in [name for name in files if name.endswith('.css')]:
        for asset in re.findall(r'url\(["\']?([^"\')]+)', read(css).decode()):
            assert not asset.startswith(('/', 'data:')) and '://' not in asset
            files.add(str(Path(css).parent / asset))
    manifest = {'source_repository': 'sobaca0808-bit/kitchen-calculator-test', 'source_commit': SOURCE,
                'pull_request': 22, 'path': '/' + PATH + '/', 'storage_namespace': [new for _, new in CHANGES.values()], 'files': {}}
    target = pages / PATH
    for name in sorted(files):
        path = Path(name)
        assert not path.is_absolute() and '..' not in path.parts and path.suffix in ['.html', '.css', '.js', '.webp', '.svg']
        original = read(name)
        payload = original
        if name in CHANGES:
            old, new = CHANGES[name]
            assert payload.count(old.encode()) == 1, name
            payload = payload.replace(old.encode(), new.encode())
            assert payload.replace(new.encode(), old.encode()) == original
        if name == 'index.html':
            text = original.decode()
            title = '<title>ТЕСТ PR №2 — Кухонный калькулятор</title>'
            notice = 'ТЕСТ PR №2 · Отдельное хранилище. Рабочие продукты и рецепты здесь не используются.'
            assert text.count(title) == 1 and text.count(notice) == 1 and 'noindex, nofollow' in text
            payload = text.replace(title, '<title>Тест сохранения PR №22 — Кухонный калькулятор</title>').replace(
                notice, 'ТЕСТ · PR №22 · Отдельная тестовая база. Данные /preview/ и основной версии не меняются.').encode()
        output = target / path
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_bytes(payload)
        manifest['files'][name] = {'sha256': sha(payload), 'source_sha256': sha(original)}
    manifest_bytes = (json.dumps(manifest, ensure_ascii=False, indent=2) + '\n').encode()
    (target / 'preview-version.json').write_bytes(manifest_bytes)
    (target / '.nojekyll').touch()
    for name, digest in protected.items():
        assert sha((pages / name).read_bytes()) == digest, name
    old = json.loads(old_proof.read_text())
    protected_https = dict(old['base_runtime'])
    protected_https.update({'preview/' + name: digest for name, digest in old['preview_runtime'].items()})
    protected_https['preview/preview-version.json'] = old['preview_version_sha256']
    candidate_https = {PATH + '/' + name: entry['sha256'] for name, entry in manifest['files'].items()}
    candidate_https[PATH + '/preview-version.json'] = sha(manifest_bytes)
    proof = {'source_commit': SOURCE, 'base_commit': old['base_commit'], 'preview_source_commit': old['source_commit'],
             'url': 'https://sobaca0808-bit.github.io/kitchen-calculator-test/' + PATH + '/',
             'protected_files': protected, 'protected_https': protected_https, 'candidate_https': candidate_https,
             'storage_namespace': manifest['storage_namespace']}
    proof_file.write_text(json.dumps(proof, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'unchanged_existing_files': len(protected), 'protected_https_files': len(protected_https),
                      'candidate_https_files': len(candidate_https), 'url': proof['url']}))

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--pages', type=Path, required=True)
    parser.add_argument('--old-proof', type=Path, required=True)
    parser.add_argument('--proof', type=Path, required=True)
    args = parser.parse_args()
    build(args.pages, args.old_proof, args.proof)
