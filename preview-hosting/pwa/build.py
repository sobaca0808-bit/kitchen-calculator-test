"""Preserve the released b7e391d site and append only the isolated /pwa/ shell."""
import argparse
import hashlib
import json
import subprocess
import tempfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
MAIN='b7e391d2273c7a412fb8506da8d15133773fc355'
def sha(file):return hashlib.sha256(file.read_bytes()).hexdigest()
def run(*args):subprocess.run(args,check=True)

def build(pages,proof,source,pr):
    with tempfile.TemporaryDirectory(prefix='pwa-publication-') as folder:
        temp=Path(folder);checkout=temp/'candidate'
        run('git','-C',str(ROOT),'worktree','add','--detach',str(checkout),source)
        try:
            baseline=temp/'main-proof.json'
            run('python3',str(checkout/'scripts/release-pages.py'),'--source',MAIN,'--output',str(pages),'--proof',str(baseline),'--legacy-runtime',str(temp/'legacy.json'))
            old=json.loads(baseline.read_text());protected={p.relative_to(pages).as_posix():sha(p) for p in pages.rglob('*') if p.is_file()}
            protected_http={**old['preserved_test_https'],**old['release_https']};assert len(protected_http)==212
            run('python3',str(checkout/'scripts/build-pwa-preview.py'),'--output',str(pages/'pwa'),'--source',source)
            version=json.loads((pages/'pwa/pwa-version.json').read_text())
            for file,digest in protected.items():assert sha(pages/file)==digest,file
            manifest=json.loads((pages/'pwa/manifest.webmanifest').read_text());assert manifest['id']=='/kitchen-calculator-test/pwa/'
            candidate={'pwa/'+file:digest for file,digest in version['files'].items()}
            candidate['pwa/pwa-version.json']=sha(pages/'pwa/pwa-version.json')
            result={'main_commit':MAIN,'source_commit':source,'pr':pr,'url':'https://sobaca0808-bit.github.io/kitchen-calculator-test/pwa/',
                    'scope':'/kitchen-calculator-test/pwa/','protected_files':protected,'protected_https':protected_http,
                    'candidate_https':candidate,'revision':version['revision'],'storage_names':version['storage_names']}
            proof.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
            print(json.dumps({'main_commit':MAIN,'unchanged_previous_files':len(protected),'protected_https':len(protected_http),
                              'new_pwa_https':len(candidate),'scope':result['scope'],'url':result['url']}))
        finally:run('git','-C',str(ROOT),'worktree','remove','--force',str(checkout))

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--pages',type=Path,required=True)
    parser.add_argument('--proof',type=Path,required=True);parser.add_argument('--source',required=True)
    parser.add_argument('--pr',type=int,required=True);args=parser.parse_args()
    build(args.pages,args.proof,args.source,args.pr)
