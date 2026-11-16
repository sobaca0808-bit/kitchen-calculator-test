"""Package only the static application; never inspect or migrate browser data."""
import argparse
import hashlib
import json
import re
from pathlib import Path
from urllib.parse import urlsplit

def sha(data):
    return hashlib.sha256(data).hexdigest()

def clean_path(value):
    url = urlsplit(value)
    path = Path(url.path)
    if url.scheme or url.netloc or path.is_absolute() or '..' in path.parts or not url.path:
        raise ValueError('Only relative application assets are allowed: ' + value)
    return path.as_posix()

def runtime(root):
    html = (root / 'index.html').read_text()
    files = {'index.html'}
    files.update(clean_path(link) for link in re.findall(r'<(?:script|link)\b[^>]*\b(?:src|href)=["\']([^"\']+)', html, re.I))
    for css in [file for file in files if file.endswith('.css')]:
        for asset in re.findall(r'url\(["\']?([^"\')]+)', (root / css).read_text()):
            files.add(clean_path(str(Path(css).parent / clean_path(asset))))
    manifest = json.loads((root / 'manifest.webmanifest').read_text())
    assert manifest['name'] == 'Кухонный калькулятор' and manifest['display'] == 'standalone'
    assert manifest['scope'] == './' and manifest['id'] in ['/kitchen-calculator-test/', '/kitchen-calculator-test/pwa/'] and manifest['start_url'] == './?source=pwa'
    assert any(icon.get('purpose') == 'maskable' for icon in manifest['icons'])
    assert {'192x192', '512x512'}.issubset({icon['sizes'] for icon in manifest['icons']})
    for icon in manifest['icons']: files.add(clean_path(icon['src']))
    assert all((root / file).is_file() and (root / file).stat().st_size for file in files)
    assert sum((root / file).stat().st_size for file in files) < 10 * 1024 * 1024, 'Unexpectedly large offline shell'
    return sorted(files)

def build(root, source='local'):
    html_path = root / 'index.html'
    html = re.sub(r' data-pwa-build="[a-f0-9]{64}"', '', html_path.read_text())
    html_path.write_text(html)
    worker = (root / 'sw.js').read_text()
    # Rebuilds use the committed template, never an earlier generated worker.
    assert worker.count('const BUILD = null; // PWA_BUILD') == 1, 'Use a fresh source tree for packaging'
    files = runtime(root)
    normalized = {file: sha((root / file).read_bytes()) for file in files}
    revision = sha(json.dumps({'assets': normalized, 'worker': sha(worker.encode()), 'format': 1}, sort_keys=True).encode())
    assert html.count('<html lang="ru">') == 1
    html_path.write_text(html.replace('<html lang="ru">', '<html lang="ru" data-pwa-build="' + revision + '">', 1))
    assets = [{'url': file, 'sha256': sha((root / file).read_bytes())} for file in files]
    config = json.dumps({'revision': revision, 'assets': assets}, separators=(',', ':'))
    (root / 'sw.js').write_text(worker.replace('const BUILD = null; // PWA_BUILD', 'const BUILD = ' + config + '; // PWA_BUILD'))
    hashes = {**{asset['url']: asset['sha256'] for asset in assets}, 'sw.js': sha((root / 'sw.js').read_bytes())}
    result = {'revision': revision, 'source_commit': source, 'files': hashes, 'offline_assets': len(assets),
              'data_policy': 'Only static shell files; localStorage and IndexedDB are untouched'}
    (root / 'pwa-version.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'revision': revision, 'offline_assets': len(assets), 'bytes': sum((root / asset['url']).stat().st_size for asset in assets)}))
    return result

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', type=Path, required=True)
    parser.add_argument('--source', default='local')
    args = parser.parse_args()
    build(args.root, args.source)
