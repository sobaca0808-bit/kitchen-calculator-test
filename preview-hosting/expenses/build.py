"""Reuse the verified runtime packager for one additional, fully isolated sandbox."""
import argparse
import importlib.util
import json
import re
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

def build(pages, previous, proof, source, pr, *, path='expenses', names=None, title=None, notice=None):
    assert re.fullmatch('[0-9a-f]{40}', source) and pr > 0
    spec = importlib.util.spec_from_file_location('sandbox_builder', ROOT / 'preview-hosting/pr22/build.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.SOURCE = source
    module.PATH = path
    module.PR = pr
    module.TITLE = title or '<title>Расходы заведения — отдельный тест кухонного калькулятора</title>'
    module.NOTICE = notice or 'ТЕСТ · Расходы заведения · Отдельная база. Данные /preview/ и PR №22 не меняются.'
    names = names or ['kitchen-calculator-expenses-preview-v1', 'kitchen-calculator-expenses-drafts-v1',
             'kitchen-calculator-expenses-photos-v1', 'kitchen-calculator-expenses-import-backups-v1',
             'kitchen-calculator-expenses-appearance-v1']
    module.CHANGES = {file: (old, new) for (file, (old, _)), new in zip(module.CHANGES.items(), names)}
    existing = json.loads(previous.read_text())
    protected = {**existing['protected_https'], **existing['candidate_https']}
    compatible = {'base_runtime': protected, 'preview_runtime': {},
                  'preview_version_sha256': protected['preview/preview-version.json'],
                  'base_commit': existing['base_commit'], 'source_commit': existing['preview_source_commit']}
    with tempfile.TemporaryDirectory(prefix='expenses-packaging-') as directory:
        path = Path(directory) / 'previous-proof.json'
        path.write_text(json.dumps(compatible))
        module.build(pages, path, proof)

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--pages', type=Path, required=True)
    parser.add_argument('--previous-proof', type=Path, required=True)
    parser.add_argument('--proof', type=Path, required=True)
    parser.add_argument('--source', required=True)
    parser.add_argument('--pr', type=int, required=True)
    args = parser.parse_args()
    build(args.pages, args.previous_proof, args.proof, args.source, args.pr)
