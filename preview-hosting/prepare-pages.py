"""Add /preview/ to an exact unchanged snapshot of the currently published main."""
import argparse
import hashlib
import io
import json
import re
import shutil
import subprocess
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BASE = '63443c53d2c7a99060584d54eae0e9c779475405'
SOURCE = '19afef52c9fb0b80488fbd1352a3c5c430ab7601'

def read(ref, name):
    return subprocess.check_output(['git', '-C', str(ROOT), 'show', ref + ':' + name])

def main(output, proof):
    if output.exists():
        raise ValueError('Use a fresh output directory.')
    subprocess.run(['python3', str(ROOT / 'preview-hosting/build-preview.py'), str(ROOT), SOURCE, '--pr', '20'], check=True)
    archive = subprocess.check_output(['git', '-C', str(ROOT), 'archive', BASE])
    output.mkdir(parents=True)
    expected = {}
    with tarfile.open(fileobj=io.BytesIO(archive), mode='r:') as tar:
        for entry in tar:
            path = Path(entry.name)
            if path.is_absolute() or '..' in path.parts or not (entry.isdir() or entry.isfile()):
                raise ValueError('Unexpected base-tree entry.')
            target = output / path
            if entry.isdir():
                target.mkdir(parents=True, exist_ok=True)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                payload = tar.extractfile(entry).read()
                target.write_bytes(payload)
                expected[entry.name] = hashlib.sha256(payload).hexdigest()
    if (output / 'preview').exists():
        raise ValueError('The base already has a preview directory; inspect it first.')
    shutil.copytree(ROOT / 'preview-hosting/dist', output / 'preview')
    for name, digest in expected.items():
        assert hashlib.sha256((output / name).read_bytes()).hexdigest() == digest, name
    assert all(path.is_relative_to(output / 'preview') or path.relative_to(output).as_posix() in expected
               for path in output.rglob('*') if path.is_file())
    html = read(BASE, 'index.html').decode()
    runtime = {'index.html', *re.findall(r'<(?:script|link)\b[^>]*\b(?:src|href)=["\']([^"\']+)', html, re.I)}
    for css in [name for name in runtime if name.endswith('.css')]:
        runtime.update(str(Path(css).parent / asset) for asset in re.findall(r'url\(["\']?([^"\')]+)', read(BASE, css).decode()))
    manifest = json.loads((output / 'preview/preview-version.json').read_text())
    proof.write_text(json.dumps({
        'base_commit': BASE, 'source_commit': SOURCE,
        'unchanged_base_files': len(expected),
        'base_runtime': {name: expected[name] for name in sorted(runtime)},
        'preview_runtime': {name: record['sha256'] for name, record in manifest['files'].items()},
        'preview_version_sha256': hashlib.sha256((output / 'preview/preview-version.json').read_bytes()).hexdigest(),
    }, indent=2) + '\n')
    print(json.dumps({'base_files_preserved': len(expected), 'base_runtime_files': len(runtime), 'preview_runtime_files': len(manifest['files']), 'output': str(output)}))

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--proof', type=Path, required=True)
    args = parser.parse_args()
    main(args.output, args.proof)
