"""Add a PR43 route to the verified PR42 Pages publication."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
from concurrent.futures import ThreadPoolExecutor
from urllib.request import Request
from zipfile import ZIP_DEFLATED, ZipFile
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'preview-hosting/sintez-expenses'))
from retry_network import open_retry

URL = 'https://sobaca0808-bit.github.io/kitchen-calculator-test/'
ROUTE = 'sintez-pr43'
SOURCE = 'c769f3e5f79d9385a6653de21bebd0a9cb7c0412'
BASE = 'c24d201f6889a2362be09f138ae683e35b4e3626'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def make_candidate(source_tree, target, archive):
    namespace = 'kitchen-calculator-pr43-'
    # Override only the stand identity in the existing packager, before it
    # renders the manifest and calculates its offline resource checksums.
    script = source_tree / 'scripts/sintez-package.py'
    packager = script.read_text()
    presentation = "replacement='kitchen-calculator-'+('expenses' if target=='expenses' else 'finance')"
    assert packager.count(presentation) == 1
    packager = packager.replace(presentation, "replacement='kitchen-calculator-pr43'")
    scope = {'__file__': str(script)}
    exec(compile(packager, str(script), 'exec'), scope)
    scope['EXPENSES_NAMES'] = {key: name.replace('kitchen-calculator-expenses-', namespace)
                              for key, name in scope['EXPENSES_NAMES'].items()}
    scope['EXPENSES_ID'] = f'/kitchen-calculator-test/{ROUTE}/'
    metadata = scope['package'](target, SOURCE, 'expenses')
    assert metadata['source_commit'] == SOURCE
    assert metadata['manifest_id'] == scope['EXPENSES_ID']
    assert metadata['presentation_key'] == namespace + 'presentation-seen-v1'
    assert all(value.startswith(namespace) for value in metadata['storage_names'].values())
    assert len(metadata['files']) == 79
    for file, expected in metadata['files'].items():
        assert sha((target / file).read_bytes()) == expected
    with ZipFile(archive, 'w', ZIP_DEFLATED) as bundle:
        for item in sorted(target.rglob('*')):
            if item.is_file():
                bundle.write(item, item.relative_to(target).as_posix())


def read_live(name, expected):
    with open_retry(Request(URL + name + '?preserve=tz44', headers={'Cache-Control': 'no-cache'}), timeout=35) as response:
        assert response.status == 200 and response.url.startswith(URL), name
        content = response.read()
    assert sha(content) == expected, name
    return content


def restore(output, last_proof):
    report = json.loads(last_proof.read_text())
    assert report['source_commit'] == BASE and report['url'] == URL
    earlier = report['preserved_https']
    expenses = report['release_https']
    assert len(earlier) == 897 and len(expenses) == 80
    assert all(path.startswith('sintez-expenses/') for path in expenses)
    assert len(report['protected_files']) == 1150
    with tempfile.TemporaryDirectory(prefix='sintez-pr43-base-') as folder:
        previous_proof = Path(folder) / 'previous.json'
        subprocess.run([sys.executable, str(ROOT / 'preview-hosting/sintez-expenses/build.py'),
                        '--pages', str(output), '--proof', str(previous_proof), '--source', BASE], check=True)
        proof = json.loads(previous_proof.read_text())
        assert proof['preserved_https'] == earlier
    def preserve(item):
        name, expected = item
        path = output / name
        assert path.resolve().is_relative_to(output.resolve())
        path.write_bytes(read_live(name, expected))
    with ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(preserve, {**earlier, **expenses}.items()))
    actual = {p.relative_to(output).as_posix(): sha(p.read_bytes()) for p in output.rglob('*') if p.is_file()}
    assert len(actual) == 1230
    assert all(actual[name] == expected for name, expected in report['protected_files'].items())
    assert all(actual[name] == expected for name, expected in expenses.items())
    return {**earlier, **expenses}, actual


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source-tree', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--receipt', type=Path)
    parser.add_argument('--report', type=Path)
    parser.add_argument('--zip', type=Path, required=True)
    args = parser.parse_args()
    assert subprocess.check_output(['git', '-C', args.source_tree, 'rev-parse', 'HEAD'], text=True).strip() == SOURCE
    if not args.receipt:
        make_candidate(args.source_tree, args.output, args.zip)
        return
    previous, protected = restore(args.output, args.receipt)
    candidate = args.output / ROUTE
    make_candidate(args.source_tree, candidate, args.zip)
    published_zip = candidate / 'sintez-mery-c769f3e.zip'
    published_zip.write_bytes(args.zip.read_bytes())
    assert all(sha((args.output / name).read_bytes()) == digest for name, digest in protected.items())
    new = {p.relative_to(args.output).as_posix(): sha(p.read_bytes()) for p in candidate.rglob('*') if p.is_file()}
    assert len(new) == 81
    args.report.write_text(json.dumps({'source_commit': SOURCE, 'url': URL, 'before_https': previous,
        'preserved_https': previous, 'release_https': new, 'previous_files': len(protected)}, indent=2) + '\n')


if __name__ == '__main__':
    main()
