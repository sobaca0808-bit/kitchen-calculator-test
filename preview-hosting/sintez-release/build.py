"""Append only the unified review PWA. Preserve all 341 current HTTPS resources."""
import argparse,hashlib,importlib.util,json,subprocess,tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
MAIN='9f45d0206022d5cfb66352b5a1518b3ff9a50abc'
HOST='08f80c5385d0d52163cbb3593062cb458f54a1c3'
INTRO='b0e1b3340dc2e376e53a1fcbfa0834edda3265fb'
def run(*args):subprocess.run(args,check=True)
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def build(output,proof,source):
    with tempfile.TemporaryDirectory(prefix='sintez-unified-publish-') as folder:
        temp=Path(folder);host=temp/'host';candidate=temp/'candidate'
        run('git','-C',str(ROOT),'worktree','add','--detach',str(host),HOST)
        try:run('python3',str(host/'preview-hosting/sintez-intro/build.py'),'--pages',str(output),'--proof',str(temp/'before.json'),'--source',INTRO)
        finally:run('git','-C',str(ROOT),'worktree','remove','--force',str(host))
        old=json.loads((temp/'before.json').read_text());protected={**old['protected_https'],**old['candidate_https']};assert len(protected)==341
        protected_files={p.relative_to(output).as_posix():sha(p) for p in output.rglob('*') if p.is_file()}
        run('git','-C',str(ROOT),'worktree','add','--detach',str(candidate),source)
        try:
            run('python3',str(candidate/'scripts/check-sintez-unified.py'))
            run('python3',str(candidate/'scripts/build-sintez-release-candidate.py'),'--output',str(output/'sintez-release'),'--target','preview','--source',source)
        finally:run('git','-C',str(ROOT),'worktree','remove','--force',str(candidate))
        version=json.loads((output/'sintez-release/pwa-version.json').read_text())
        assert version['storage_names']==old['storage_names'],'Only existing SINTEZ test data may be used'
        manifest=json.loads((output/'sintez-release/manifest.webmanifest').read_text());assert manifest['id']=='/kitchen-calculator-test/sintez-release/'
        assert manifest['id']!='/kitchen-calculator-test/pwa/' and manifest['scope']=='./' and manifest['start_url']=='./?source=pwa'
        for name,digest in protected_files.items():assert sha(output/name)==digest,name
        new={'sintez-release/'+name:digest for name,digest in version['files'].items()};new['sintez-release/pwa-version.json']=sha(output/'sintez-release/pwa-version.json')
        result={'source_commit':source,'main_commit':MAIN,'baseline_hosting':HOST,'url':'https://sobaca0808-bit.github.io/kitchen-calculator-test/','preview_url':'https://sobaca0808-bit.github.io/kitchen-calculator-test/sintez-release/','before_https':protected,'preserved_https':protected,'release_https':new,'protected_files':protected_files,'storage_names':version['storage_names'],'presentation_key':version['presentation_key'],'manifest_id':manifest['id'],'live_pwa_not_changed':True,'no_user_data_migration':True}
        proof.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
        print(json.dumps({'unchanged_files':len(protected_files),'unchanged_https':len(protected),'new_https':len(new),'live_pwa_unchanged':True,'url':result['preview_url']}))
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--pages',type=Path,required=True);p.add_argument('--proof',type=Path,required=True);p.add_argument('--source',required=True);a=p.parse_args();build(a.pages,a.proof,a.source)
