"""Prepare the isolated PWA test shell; source storage constants stay unchanged."""
import argparse
import importlib.util
import json
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NAMES = {'book': 'kitchen-calculator-pwa-preview-v1', 'drafts': 'kitchen-calculator-pwa-drafts-v1',
         'photos': 'kitchen-calculator-pwa-photos-v1', 'backups': 'kitchen-calculator-pwa-import-backups-v1',
         'appearance': 'kitchen-calculator-pwa-appearance-v1'}
CHANGES = {'js/storage.js': ('kitchen-calculator-pr2-browser-test-v1', NAMES['book']),
           'js/drafts.js': ('kitchen-calculator-pr2-browser-drafts-v1', NAMES['drafts']),
           'js/photos.js': ('kitchen-calculator-test-photos-v1', NAMES['photos']),
           'js/import-transaction.js': ('kitchen-calculator-test-import-backups-v1', NAMES['backups']),
           'js/appearance.js': ('kitchen-calculator-appearance-test-v1', NAMES['appearance'])}

def build(output, source, root=ROOT):
    assert not output.exists(), 'Use a fresh preview directory'
    spec = importlib.util.spec_from_file_location('pwa_builder', root / 'scripts/build-pwa.py')
    module = importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    output.mkdir(parents=True)
    for file in module.runtime(root) + ['sw.js']:
        target = output / file;target.parent.mkdir(parents=True, exist_ok=True)
        data = (root / file).read_bytes()
        if file in CHANGES:
            old, new = CHANGES[file];assert data.count(old.encode()) == 1
            data = data.replace(old.encode(), new.encode())
        target.write_bytes(data)
    html = (output / 'index.html').read_text()
    html = html.replace('<title>ТЕСТ PR №2 — Кухонный калькулятор</title>', '<title>PWA · Кухонный калькулятор</title>')
    html = html.replace('ТЕСТ PR №2 · Отдельное хранилище. Рабочие продукты и рецепты здесь не используются.', 'ТЕСТ PWA · Отдельная база. Рабочая версия и прежние стенды не меняются.')
    html = re.sub(r'((?:src|href)=["\'])([^"\']+\.(?:js|css))(?:\?[^"\']*)?(["\'])', lambda m:m[1]+m[2]+'?v=pwa-'+source[:12]+m[3], html)
    (output / 'index.html').write_text(html)
    manifest = json.loads((output / 'manifest.webmanifest').read_text());manifest['short_name'] = 'Кухня · тест'
    (output / 'manifest.webmanifest').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    result = module.build(output, source);result['storage_names'] = NAMES
    (output / 'pwa-version.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    return result

if __name__ == '__main__':
    parser = argparse.ArgumentParser();parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--source', default='local');args = parser.parse_args()
    build(args.output, args.source)
