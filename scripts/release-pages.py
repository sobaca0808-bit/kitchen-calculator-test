"""Build the approved main at its existing URL and preserve every published sandbox.

No browser data is available to this build. Existing namespace literals stay intact.
"""
import argparse
import base64
import hashlib
import io
import json
import re
import shutil
import subprocess
import tarfile
import tempfile
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
SITE = 'https://sobaca0808-bit.github.io/kitchen-calculator-test/'
PREVIOUS = '63443c53d2c7a99060584d54eae0e9c779475405'
APPROVED = '662a12af04b3f446470a8405e6ec9cd2062fd5b7'
HOST = 'f9e1df36c53b0817680f50fd9fd8ac5ab0d3254a'
# Pinned, independently checked source of the installable PWA (PR #27).
PWA_SOURCE = '11784f16e932dded4ca2e962a3bd7e38622328aa'
PATHS = ['preview', 'pr-22', 'expenses', 'expense-toggle', 'final']

def sha(payload):
    return hashlib.sha256(payload).hexdigest()

def run(*args):
    subprocess.run(args, check=True)

def read(ref, file):
    return subprocess.check_output(['git', '-C', str(ROOT), 'show', ref + ':' + file])

def runtime(read_file):
    html = read_file('index.html').decode()
    links = re.findall(r'<(?:script|link)\b[^>]*\b(?:src|href)=["\']([^"\']+)', html, re.I)
    assert all(not urlsplit(link).scheme and not urlsplit(link).netloc and not link.startswith('/') for link in links)
    files = {'index.html', *(urlsplit(link).path for link in links)}
    for name in [file for file in files if file.endswith('.css')]:
        for asset in re.findall(r'url\(["\']?([^"\')]+)', read_file(name).decode()):
            assert not asset.startswith(('/', 'data:')) and '://' not in asset
            files.add(str(Path(name).parent / asset))
    return sorted(files)

def release_html(html, source):
    title = '<title>ТЕСТ PR №2 — Кухонный калькулятор</title>'
    notice = 'ТЕСТ PR №2 · Отдельное хранилище. Рабочие продукты и рецепты здесь не используются.'
    assert html.count(title) == 1 and html.count(notice) == 1
    html = html.replace(title, '<title>Кухонный калькулятор себестоимости</title>')
    html = html.replace(notice, 'Кухонный калькулятор · Рабочая версия')
    # One release token prevents a cached older JS/CSS file from joining the new app.
    def version(match):
        return match[1] + urlsplit(match[2]).path + '?v=release-' + source[:12] + match[3]
    return re.sub(r'((?:src|href)=["\'])([^"\']+\.(?:js|css)(?:\?[^"\']*)?)(["\'])', version, html)

def namespaces(read_file):
    files = {'book': ('js/storage.js', 'KEY'), 'drafts': ('js/drafts.js', 'KEY'),
             'photos': ('js/photos.js', 'DB_NAME'), 'backups': ('js/import-transaction.js', 'DB_NAME'),
             'appearance': ('js/appearance.js', 'KEY')}
    return {key: re.search(r'const ' + constant + r" = '([^']+)'", read_file(file).decode())[1]
            for key, (file, constant) in files.items()}

def build(output, proof, legacy_runtime, source):
    assert re.fullmatch('[0-9a-f]{40}', source) and not output.exists()
    for parent in [PREVIOUS, APPROVED]:
        run('git', '-C', str(ROOT), 'merge-base', '--is-ancestor', parent, source)
    run('git', '-C', str(ROOT), 'diff', '--exit-code', APPROVED, source, '--', 'index.html', 'styles.css', 'js', 'assets')
    current_names = namespaces(lambda file: read(source, file))
    assert current_names == namespaces(lambda file: read(APPROVED, file))
    for key, file, constant in [('book', 'js/storage.js', 'KEY'), ('drafts', 'js/drafts.js', 'KEY'),
                               ('photos', 'js/photos.js', 'DB_NAME'), ('backups', 'js/import-transaction.js', 'DB_NAME')]:
        assert current_names[key] == re.search(r'const ' + constant + r" = '([^']+)'", read(PREVIOUS, file).decode())[1]
    with tempfile.TemporaryDirectory(prefix='kitchen-release-') as directory:
        temp = Path(directory)
        host = temp / 'old-host'
        run('git', '-C', str(ROOT), 'worktree', 'add', '--detach', str(host), HOST)
        try:
            old = temp / 'previous-pages'
            def script(name, *args):
                run('python3', str(host / 'preview-hosting' / name), *map(str, args))
            p0, p1, p2, p3, p4 = [temp / (str(i) + '.json') for i in range(5)]
            script('prepare-pages.py', '--output', old, '--proof', p0)
            script('pr22/build.py', '--pages', old, '--old-proof', p0, '--proof', p1)
            script('expenses/build.py', '--pages', old, '--previous-proof', p1, '--proof', p2,
                   '--source', '1c1fcc057370f04a0451bf62ef6241a1edeb7587', '--pr', 23)
            script('expense-toggle/build.py', '--pages', old, '--previous-proof', p2, '--proof', p3,
                   '--source', '6cf49ce304b9ddf0e3c6de2d780537f12cbf8e7b', '--pr', 24)
            script('final/build.py', '--pages', old, '--previous-proof', p3, '--proof', p4,
                   '--source', APPROVED, '--pr', 25)
            old_proof = json.loads(p4.read_text())
            all_old_http = {**old_proof['protected_https'], **old_proof['candidate_https']}
            protected_http = {file: digest for file, digest in all_old_http.items() if file.split('/')[0] in PATHS}
            before_root = {file: digest for file, digest in all_old_http.items() if file not in protected_http}
            assert len(protected_http) == 175 and len(before_root) == 25
            output.mkdir(parents=True)
            archive = subprocess.check_output(['git', '-C', str(ROOT), 'archive', source])
            with tarfile.open(fileobj=io.BytesIO(archive), mode='r:') as tar:
                for entry in tar:
                    path = Path(entry.name)
                    assert not path.is_absolute() and '..' not in path.parts and (entry.isdir() or entry.isfile())
                    target = output / path
                    if entry.isdir(): target.mkdir(parents=True, exist_ok=True)
                    else:
                        target.parent.mkdir(parents=True, exist_ok=True)
                        target.write_bytes(tar.extractfile(entry).read())
            protected_files = {}
            for path in PATHS:
                assert not (output / path).exists()
                shutil.copytree(old / path, output / path)
                for file in (old / path).rglob('*'):
                    if file.is_file():
                        relative = file.relative_to(old).as_posix()
                        protected_files[relative] = sha(file.read_bytes())
                        assert sha((output / relative).read_bytes()) == protected_files[relative]
            # The PWA was published after the five legacy sandboxes. Rebuild it
            # from its pinned source as part of EVERY subsequent main release;
            # otherwise deploying main silently deletes /pwa/ from Pages.
            pwa_checkout = temp / 'pwa-source'
            run('git', '-C', str(ROOT), 'worktree', 'add', '--detach', str(pwa_checkout), PWA_SOURCE)
            try:
                assert not (output / 'pwa').exists()
                run('python3', str(pwa_checkout / 'scripts/build-pwa-preview.py'),
                    '--output', str(output / 'pwa'), '--source', PWA_SOURCE)
            finally:
                run('git', '-C', str(ROOT), 'worktree', 'remove', '--force', str(pwa_checkout))
            pwa_version = json.loads((output / 'pwa/pwa-version.json').read_text())
            pwa_manifest = json.loads((output / 'pwa/manifest.webmanifest').read_text())
            assert pwa_manifest['id'] == '/kitchen-calculator-test/pwa/'
            assert pwa_manifest['start_url'] == './?source=pwa'
            assert all(name.startswith('kitchen-calculator-pwa-')
                       for name in pwa_version['storage_names'].values())
            pwa_https = {file.relative_to(output).as_posix(): sha(file.read_bytes())
                         for file in (output / 'pwa').rglob('*') if file.is_file()}
            assert len(pwa_https) == 44
            assert set(pwa_https) == ({'pwa/' + name for name in pwa_version['files']}
                                     | {'pwa/pwa-version.json'})
            files = runtime(lambda file: read(source, file))
            assert len(files) == 36
            html = release_html(read(source, 'index.html').decode(), source)
            (output / 'index.html').write_text(html)
            source_hashes = {file: sha(read(source, file)) for file in files}
            released = {file: sha((output / file).read_bytes()) for file in files}
            assert all(released[file] == source_hashes[file] for file in files if file != 'index.html')
            version = {'repository': 'sobaca0808-bit/kitchen-calculator-test', 'source_commit': source,
                       'approved_runtime_commit': APPROVED, 'url': SITE, 'storage_names': current_names,
                       'source_runtime': source_hashes, 'runtime': released}
            (output / 'release-version.json').write_text(json.dumps(version, ensure_ascii=False, indent=2) + '\n')
            released['release-version.json'] = sha((output / 'release-version.json').read_bytes())
            result = {'source_commit': source, 'url': SITE, 'previous_main': PREVIOUS, 'preservation_commit': HOST,
                      'storage_names': current_names, 'previous_root_https': before_root,
                      'approved_source_https': source_hashes,
                      'preserved_test_https': protected_http, 'preserved_test_files': protected_files,
                      'restored_pwa_https': pwa_https, 'release_https': released}
            proof.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
            legacy_runtime.write_text(json.dumps({'files': {file: base64.b64encode((old / file).read_bytes()).decode()
                                                          for file in before_root}, 'keys': current_names}) + '\n')
            print(json.dumps({'source_commit': source, 'url': SITE, 'root_runtime_files': 36,
                              'preserved_test_files': len(protected_files), 'preserved_test_https': len(protected_http),
                              'release_https': len(released), 'restored_pwa_https': len(pwa_https),
                              'original_storage_names_preserved': True}))
        finally:
            run('git', '-C', str(ROOT), 'worktree', 'remove', '--force', str(host))

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--proof', type=Path, required=True)
    parser.add_argument('--legacy-runtime', type=Path, required=True)
    parser.add_argument('--source', default='HEAD')
    args = parser.parse_args()
    source = subprocess.check_output(['git', '-C', str(ROOT), 'rev-parse', args.source], text=True).strip()
    build(args.output, args.proof, args.legacy_runtime, source)
