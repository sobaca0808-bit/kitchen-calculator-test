"""Add just the Vue review directory to the last complete Pages publication."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import shutil
import sys
import tarfile
from zipfile import ZipFile, ZIP_DEFLATED

BASE_SHA = '5cac84953c47713cc8e1396be9fbf880ea933c71'
URL = 'https://sobaca0808-bit.github.io/kitchen-calculator-test/'
ROUTE = 'sintez-vue'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def tree(root):
    return {p.relative_to(root).as_posix(): sha(p) for p in root.rglob('*') if p.is_file()}


def safe_path(root, name):
    path = root / name
    if not path.resolve().is_relative_to(root.resolve()) or Path(name).is_absolute():
        raise ValueError('Illegal archive path: ' + name)
    return path


def restore_archive(path, site):
    # Extract static files only. Pages archives do not need symlinks, devices or ownership.
    site.mkdir()
    with tarfile.open(path, 'r:*') as archive:
        for member in archive:
            out = safe_path(site, member.name)
            if member.isdir():
                out.mkdir(parents=True, exist_ok=True)
            elif member.isfile():
                out.parent.mkdir(parents=True, exist_ok=True)
                with archive.extractfile(member) as source, out.open('xb') as dest:
                    shutil.copyfileobj(source, dest)
            else:
                raise ValueError('Unexpected Pages archive entry: ' + member.name)


def restore_expired_archive(earlier_receipt, preserved, site):
    # The upload-pages-artifact tar expires after a day. The PR42 packager also
    # reconstructs platform files which are outside the public HTTPS inventory.
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'sintez-pr43'))
    from build import restore, read_live
    prior, _ = restore(site, earlier_receipt)
    if any(preserved.get(name) != digest for name, digest in prior.items()):
        raise ValueError('PR42 inventory is not part of the pinned PR44 deployment')

    def restore_public(item):
        name, expected = item
        path = safe_path(site, name)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(read_live(name, expected))

    with ThreadPoolExecutor(max_workers=6) as pool:
        list(pool.map(restore_public, ((n, h) for n, h in preserved.items() if n not in prior)))


def assemble(args):
    receipt = json.loads(args.receipt.read_text())
    if receipt['source_commit'] != BASE_SHA or receipt['url'] != URL:
        raise ValueError('Unrecognized base publication')
    preserved = {**receipt['preserved_https'], **receipt['release_https']}
    if len(preserved) != 1140 or not any(name.startswith('sintez-workspace-review/') for name in preserved):
        raise ValueError('The base inventory is incomplete')

    if args.archive:
        restore_archive(args.archive, args.site)
    else:
        restore_expired_archive(args.pr42, preserved, args.site)
    original = tree(args.site)
    for name, digest in preserved.items():
        if original.get(name) != digest:
            raise ValueError('Previous Pages bytes differ: ' + name)

    release = args.site / ROUTE
    before = preserved.copy()
    if args.previous:
        previous = json.loads(args.previous.read_text())
        previous_files = previous['release_https']
        archived = {n: h for n, h in original.items() if n.startswith(ROUTE + '/')}
        if (previous['url'] != URL or previous['preserved_https'] != preserved
                or not archived or archived != previous_files):
            raise ValueError('Current Vue preview differs from the previous verified publication')
        before.update(archived)
        shutil.rmtree(release)
    elif release.exists():
        raise FileExistsError(release)
    version = json.loads((args.candidate / 'pwa-version.json').read_text())
    if (version['source_commit'] != args.source or version['target'] != 'vue'
            or version['manifest_id'] != '/kitchen-calculator-test/sintez-vue/'
            or any(not name.startswith('kitchen-calculator-vue-experiment-') for name in
                   [version['presentation_key'], *version['storage_names'].values()])):
        raise ValueError('Vue build identity or storage namespace is incorrect')

    actual = tree(args.candidate)
    if set(actual) != set(version['files']) | {'pwa-version.json'}:
        raise ValueError('Unexpected or missing files in the standalone build')
    for name, digest in version['files'].items():
        if actual[name] != digest:
            raise ValueError('Candidate checksum differs: ' + name)

    shutil.copytree(args.candidate, release)
    with ZipFile(args.zip, 'x', ZIP_DEFLATED) as archive:
        for name in sorted(actual):
            archive.write(release / name, name)
    shutil.copyfile(args.zip, release / args.zip.name)
    all_files = tree(args.site)
    fresh = {n: h for n, h in all_files.items() if n.startswith(ROUTE + '/')}
    protected = {n: h for n, h in original.items() if not n.startswith(ROUTE + '/')}
    if all_files != {**protected, **fresh}:
        raise ValueError('An unrelated file changed during assembly')
    args.report.write_text(json.dumps({
        'source_commit': args.source, 'url': URL, 'before_https': before,
        'preserved_https': preserved, 'release_https': fresh, 'archive_files': len(original),
        'zip_sha256': sha(args.zip),
    }, indent=2) + '\n')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    src = parser.add_mutually_exclusive_group(required=True)
    src.add_argument('--archive', type=Path)
    src.add_argument('--pr42', type=Path)
    for arg in ['receipt', 'site', 'candidate', 'zip', 'report']:
        parser.add_argument('--' + arg, type=Path, required=True)
    parser.add_argument('--source', required=True)
    parser.add_argument('--previous', type=Path)
    assemble(parser.parse_args())
