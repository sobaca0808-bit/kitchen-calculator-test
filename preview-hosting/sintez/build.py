"""Append only /sintez/ to the exact current release, preserving every older URL."""
import argparse,hashlib,json,subprocess,tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];MAIN='9f45d0206022d5cfb66352b5a1518b3ff9a50abc'
def sha(file):return hashlib.sha256(file.read_bytes()).hexdigest()
def run(*args):subprocess.run(args,check=True)
def build(pages,proof,source):
 with tempfile.TemporaryDirectory(prefix='sintez-publication-') as folder:
  temp=Path(folder);baseline=temp/'baseline';candidate=temp/'candidate'
  run('git','-C',str(ROOT),'worktree','add','--detach',str(baseline),MAIN)
  try:
   run('python3',str(baseline/'scripts/release-pages.py'),'--source',MAIN,'--output',str(pages),'--proof',str(temp/'baseline.json'),'--legacy-runtime',str(temp/'legacy.json'))
   old=json.loads((temp/'baseline.json').read_text());protected={p.relative_to(pages).as_posix():sha(p) for p in pages.rglob('*') if p.is_file()}
   protected_http={**old['preserved_test_https'],**old['release_https'],**old['restored_pwa_https'],'welcome.html':sha(pages/'welcome.html')};assert len(protected_http)==257
   run('git','-C',str(ROOT),'worktree','add','--detach',str(candidate),source)
   try:run('python3',str(candidate/'scripts/build-sintez-preview.py'),'--output',str(pages/'sintez'),'--source',source)
   finally:run('git','-C',str(ROOT),'worktree','remove','--force',str(candidate))
   version=json.loads((pages/'sintez/sintez-version.json').read_text())
   for name,digest in protected.items():assert sha(pages/name)==digest,name
   new={'sintez/'+name:digest for name,digest in version['files'].items()};new['sintez/sintez-version.json']=sha(pages/'sintez/sintez-version.json')
   assert all(n.startswith('kitchen-calculator-sintez-') for n in version['storage_names'].values())
   data={'main_commit':MAIN,'source_commit':source,'pr':30,'url':'https://sobaca0808-bit.github.io/kitchen-calculator-test/sintez/','protected_files':protected,'protected_https':protected_http,'candidate_https':new,'storage_names':version['storage_names']}
   proof.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'preserved_files':len(protected),'preserved_https':len(protected_http),'new_https':len(new),'main':MAIN,'url':data['url']}))
  finally:run('git','-C',str(ROOT),'worktree','remove','--force',str(baseline))
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--pages',type=Path,required=True);p.add_argument('--proof',type=Path,required=True);p.add_argument('--source',required=True);a=p.parse_args();build(a.pages,a.proof,a.source)
