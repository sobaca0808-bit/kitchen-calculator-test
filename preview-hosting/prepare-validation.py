"""Reuse the PR checks against the packaged preview without editing the PR."""
import json
import shutil
import subprocess
import tempfile
from pathlib import Path

project = Path(__file__).resolve().parent
source = project.parent
sha = json.loads((project / 'dist/preview-version.json').read_text())['source_commit']
mapping = {
    'kitchen-calculator-pr2-browser-test-v1': 'kitchen-calculator-preview-v1',
    'kitchen-calculator-pr2-browser-drafts-v1': 'kitchen-calculator-preview-drafts-v1',
    'kitchen-calculator-test-photos-v1': 'kitchen-calculator-preview-photos-v1',
    'kitchen-calculator-test-import-backups-v1': 'kitchen-calculator-preview-import-backups-v1',
    'kitchen-calculator-appearance-test-v1': 'kitchen-calculator-appearance-preview-v1',
}
out = Path(tempfile.mkdtemp(prefix='kitchen-pr20-preview-check-'))
shutil.copytree(project / 'dist', out, dirs_exist_ok=True)
files = subprocess.check_output(['git', '-C', str(source), 'ls-tree', '-r', '--name-only', sha, '--', 'tests', 'scripts/check-preview.mjs'], text=True).splitlines()
for name in files:
    target = out / name
    target.parent.mkdir(parents=True, exist_ok=True)
    content = subprocess.check_output(['git', '-C', str(source), 'show', sha + ':' + name])
    if target.suffix in ['.js', '.mjs']:
        text = content.decode()
        for old, new in mapping.items():
            text = text.replace(old, new)
        content = text.encode()
    target.write_bytes(content)
print(json.dumps({'validation_directory': str(out), 'source_commit': sha, 'test_edits': 'Only five storage-name substitutions in disposable test copies.'}))
