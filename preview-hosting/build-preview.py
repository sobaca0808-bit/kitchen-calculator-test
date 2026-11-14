"""Build runtime-only preview files from an exact public Git commit.

No browser profile, exported recipe JSON, credentials or untracked file is read.
The storage namespace stays constant when future previews replace this one.
"""
import argparse
import hashlib
import json
import re
import subprocess
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent
NAMESPACE = {
    'kitchen-calculator-pr2-browser-test-v1': 'kitchen-calculator-preview-v1',
    'kitchen-calculator-pr2-browser-drafts-v1': 'kitchen-calculator-preview-drafts-v1',
    'kitchen-calculator-test-photos-v1': 'kitchen-calculator-preview-photos-v1',
    'kitchen-calculator-test-import-backups-v1': 'kitchen-calculator-preview-import-backups-v1',
}
CHANGES = dict(zip(
    ['js/storage.js', 'js/drafts.js', 'js/photos.js', 'js/import-transaction.js'],
    NAMESPACE.items(),
))

def build(repository, commit, pr):
    def read(file):
        return subprocess.check_output(['git', '-C', str(repository), 'show', commit + ':' + file])
    resolved = subprocess.check_output(['git', '-C', str(repository), 'rev-parse', commit + '^{commit}'], text=True).strip()
    if resolved != commit or not re.fullmatch('[0-9a-f]{40}', commit):
        raise ValueError('Use an exact full Git commit SHA.')
    html = read('index.html').decode()
    linked = re.findall(r'<(?:script|link)\b[^>]*\b(?:src|href)=["\']([^"\']+)', html, re.I)
    if any(urlsplit(reference).scheme or urlsplit(reference).netloc or reference.startswith('/') for reference in linked):
        raise ValueError('Runtime dependencies must remain local relative files.')
    files = {'index.html', *(urlsplit(reference).path for reference in linked)}
    for css in [file for file in files if file.endswith('.css')]:
        for asset in re.findall(r'url\(["\']?([^"\')]+)', read(css).decode()):
            if '://' in asset or asset.startswith(('data:', '/')):
                raise ValueError('Unexpected external or absolute CSS dependency.')
            files.add(str(Path(css).parent / asset))
    out = ROOT / 'dist'
    out.mkdir(exist_ok=True)
    metadata = {
        'source_repository': 'sobaca0808-bit/kitchen-calculator-test',
        'source_commit': commit, 'pull_request': pr,
        'storage_namespace': list(NAMESPACE.values()), 'files': {},
    }
    for file in sorted(files):
        path = Path(file)
        if path.is_absolute() or '..' in path.parts or path.suffix not in ['.html', '.css', '.js', '.svg', '.webp']:
            raise ValueError('Unexpected runtime file: ' + file)
        original = read(file)
        payload = original
        if file in CHANGES:
            old, new = CHANGES[file]
            if original.count(old.encode()) != 1:
                raise ValueError('Storage constant changed; inspect before publishing: ' + file)
            payload = original.replace(old.encode(), new.encode())
            assert payload.replace(new.encode(), old.encode()) == original
        if file == 'index.html':
            updated = original.decode().replace(
                '<title>ТЕСТ PR №2 — Кухонный калькулятор</title>',
                f'<title>Предпросмотр PR №{pr} — Кухонный калькулятор</title>',
            ).replace(
                'ТЕСТ PR №2 · Отдельное хранилище. Рабочие продукты и рецепты здесь не используются.',
                f'ТЕСТ · PR №{pr} · Отдельные данные предпросмотра. Основная версия не изменяется.',
            )
            if updated == original.decode() or 'noindex, nofollow' not in updated:
                raise ValueError('Review preview labels and indexing restrictions.')
            payload = updated.encode()
        target = out / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(payload)
        metadata['files'][file] = {
            'sha256': hashlib.sha256(payload).hexdigest(),
            'source_sha256': hashlib.sha256(original).hexdigest(),
            'storage_name_only': file in CHANGES,
        }
    (out / 'preview-version.json').write_text(json.dumps(metadata, indent=2, ensure_ascii=False) + '\n')
    (out / '.nojekyll').touch()
    print(json.dumps({'source_commit': commit, 'runtime_files': len(files), 'output': str(out)}))

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('repository', type=Path)
    parser.add_argument('commit')
    parser.add_argument('--pr', type=int, required=True)
    args = parser.parse_args()
    build(args.repository, args.commit, args.pr)
