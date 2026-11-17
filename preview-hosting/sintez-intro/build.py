"""Append /sintez-intro/ without changing main, /sintez/, PWA or old stands."""
import argparse, hashlib, json, subprocess, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MAIN = '9f45d0206022d5cfb66352b5a1518b3ff9a50abc'
HOME = '871155948134353c4219e6c1aa4dcb039848ea68'
def run(*args): subprocess.run(args, check=True)
def sha(file): return hashlib.sha256(file.read_bytes()).hexdigest()

def build(pages, proof, source):
    with tempfile.TemporaryDirectory(prefix='sintez-intro-publication-') as folder:
        temp = Path(folder)
        # Use the exact prior publisher and PR 30 source: never rebuild /sintez/
        # from the introduction branch or substitute current main automatically.
        run('python3', str(ROOT / 'preview-hosting/sintez/build.py'), '--pages', str(pages),
            '--proof', str(temp / 'prior.json'), '--source', HOME)
        old = json.loads((temp / 'prior.json').read_text())
        protected = {p.relative_to(pages).as_posix(): sha(p) for p in pages.rglob('*') if p.is_file()}
        protected_http = {**old['protected_https'], **old['candidate_https']}
        assert len(protected_http) == 296
        candidate = temp / 'candidate'
        run('git', '-C', str(ROOT), 'worktree', 'add', '--detach', str(candidate), source)
        try:
            run('python3', str(candidate / 'scripts/check-sintez-intro.py'))
            run('python3', str(candidate / 'scripts/build-sintez-preview.py'), '--output', str(pages / 'sintez-intro'), '--source', source)
        finally:
            run('git', '-C', str(ROOT), 'worktree', 'remove', '--force', str(candidate))
        version = json.loads((pages / 'sintez-intro/sintez-version.json').read_text())
        assert version['storage_names'] == old['storage_names'], 'A second SINTEZ database is forbidden'
        for name, digest in protected.items(): assert sha(pages / name) == digest, name
        new = {'sintez-intro/' + name: digest for name, digest in version['files'].items()}
        new['sintez-intro/sintez-version.json'] = sha(pages / 'sintez-intro/sintez-version.json')
        data = {'main_commit': MAIN, 'source_commit': source, 'home_commit': HOME,
                'url': 'https://sobaca0808-bit.github.io/kitchen-calculator-test/sintez-intro/',
                'protected_files': protected, 'protected_https': protected_http,
                'candidate_https': new, 'storage_names': version['storage_names'],
                'presentation_key': 'kitchen-calculator-sintez-presentation-seen-v1'}
        proof.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
        print(json.dumps({'unchanged_files':len(protected), 'unchanged_https':len(protected_http),
                          'new_https':len(new), 'same_sintez_database':True, 'url':data['url']}))

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--pages',type=Path,required=True)
    parser.add_argument('--proof',type=Path,required=True)
    parser.add_argument('--source',required=True)
    args = parser.parse_args()
    build(args.pages,args.proof,args.source)
