"""Append only /sintez-modes/ to the exact verified publication of PR 33."""
import argparse,hashlib,json,subprocess,tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
HOST='46885d6d70880beaacc1c3ff3c33e9d15a88110e'
PARENT='9787f93bd83ea19e45a4a376003b33fed3b493c5'
MAIN='9f45d0206022d5cfb66352b5a1518b3ff9a50abc'
def run(*args):subprocess.run(args,check=True)
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def build(output,proof,source):
    with tempfile.TemporaryDirectory(prefix='sintez-modes-publication-') as folder:
        temp=Path(folder);host=temp/'previous';candidate=temp/'candidate'
        run('git','-C',str(ROOT),'worktree','add','--detach',str(host),HOST)
        try:run('python3',str(host/'preview-hosting/sintez-release/build.py'),'--pages',str(output),'--proof',str(temp/'prior.json'),'--source',PARENT)
        finally:run('git','-C',str(ROOT),'worktree','remove','--force',str(host))
        old=json.loads((temp/'prior.json').read_text());before={**old['preserved_https'],**old['release_https']};assert len(before)==403
        protected={p.relative_to(output).as_posix():sha(p) for p in output.rglob('*') if p.is_file()}
        run('git','-C',str(ROOT),'worktree','add','--detach',str(candidate),source)
        try:
            run('python3',str(candidate/'scripts/check-sintez-modes.py'))
            run('python3',str(candidate/'scripts/build-sintez-release-candidate.py'),'--output',str(output/'sintez-modes'),'--target','modes','--source',source)
        finally:run('git','-C',str(ROOT),'worktree','remove','--force',str(candidate))
        version=json.loads((output/'sintez-modes/pwa-version.json').read_text());manifest=json.loads((output/'sintez-modes/manifest.webmanifest').read_text())
        assert version['storage_names']==old['storage_names'],'The same SINTEZ data must be retained'
        assert manifest['id']=='/kitchen-calculator-test/sintez-modes/' and manifest['scope']=='./' and manifest['start_url']=='./?source=pwa'
        for name,digest in protected.items():assert sha(output/name)==digest,name
        current={'sintez-modes/'+name:digest for name,digest in version['files'].items()};current['sintez-modes/pwa-version.json']=sha(output/'sintez-modes/pwa-version.json')
        result={'source_commit':source,'parent_commit':PARENT,'main_commit':MAIN,'previous_hosting':HOST,'url':'https://sobaca0808-bit.github.io/kitchen-calculator-test/','preview_url':'https://sobaca0808-bit.github.io/kitchen-calculator-test/sintez-modes/','before_https':before,'preserved_https':before,'release_https':current,'protected_files':protected,'storage_names':version['storage_names'],'manifest_id':manifest['id'],'all_existing_sites_and_pwa_preserved':True,'no_new_calculator_database':True}
        proof.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'unchanged_files':len(protected),'before_https':len(before),'new_https':len(current),'after_https':len(before)+len(current),'preview_url':result['preview_url']}))
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--pages',type=Path,required=True);p.add_argument('--proof',type=Path,required=True);p.add_argument('--source',required=True);a=p.parse_args();build(a.pages,a.proof,a.source)
