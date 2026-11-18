"""Append only /sintez-card/ to the exact verified PR35 publication."""
import argparse,hashlib,json,subprocess,tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
HOST='bf379cfee1ddf35c41d544efa8a84b368868a4cf'
PARENT='bc61c94cee52cf363ff9e0c750f53bdca68e7f87'
MAIN='9f45d0206022d5cfb66352b5a1518b3ff9a50abc'
def run(*args):subprocess.run(args,check=True)
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def build(output,proof,source):
    with tempfile.TemporaryDirectory(prefix='sintez-card-publication-') as folder:
        temp=Path(folder);host=temp/'previous';candidate=temp/'candidate'
        run('git','-C',str(ROOT),'worktree','add','--detach',str(host),HOST)
        try:run('python3',str(host/'preview-hosting/sintez-glass/build.py'),'--pages',str(output),'--proof',str(temp/'prior.json'),'--source',PARENT)
        finally:run('git','-C',str(ROOT),'worktree','remove','--force',str(host))
        old=json.loads((temp/'prior.json').read_text());before={**old['preserved_https'],**old['release_https']};assert len(before)==528
        protected={p.relative_to(output).as_posix():sha(p) for p in output.rglob('*') if p.is_file()}
        run('git','-C',str(ROOT),'worktree','add','--detach',str(candidate),source)
        try:
            run('python3',str(candidate/'scripts/check-sintez-showcase.py'))
            run('python3',str(candidate/'scripts/build-sintez-release-candidate.py'),'--output',str(output/'sintez-card'),'--target','showcase','--source',source)
        finally:run('git','-C',str(ROOT),'worktree','remove','--force',str(candidate))
        version=json.loads((output/'sintez-card/pwa-version.json').read_text());manifest=json.loads((output/'sintez-card/manifest.webmanifest').read_text())
        assert version['storage_names']==old['storage_names'],'The same SINTEZ data must be retained'
        assert manifest['id']=='/kitchen-calculator-test/sintez-card/' and manifest['scope']=='./' and manifest['start_url']=='./?source=pwa'
        for name,digest in protected.items():assert sha(output/name)==digest,name
        current={'sintez-card/'+name:digest for name,digest in version['files'].items()};current['sintez-card/pwa-version.json']=sha(output/'sintez-card/pwa-version.json')
        result={'source_commit':source,'parent_commit':PARENT,'main_commit':MAIN,'previous_hosting':HOST,'url':'https://sobaca0808-bit.github.io/kitchen-calculator-test/','preview_url':'https://sobaca0808-bit.github.io/kitchen-calculator-test/sintez-card/','before_https':before,'preserved_https':before,'release_https':current,'protected_files':protected,'storage_names':version['storage_names'],'manifest_id':manifest['id'],'all_existing_sites_and_pwa_preserved':True,'no_new_calculator_database':True}
        proof.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'unchanged_files':len(protected),'before_https':len(before),'new_https':len(current),'after_https':len(before)+len(current),'preview_url':result['preview_url']}))
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--pages',type=Path,required=True);p.add_argument('--proof',type=Path,required=True);p.add_argument('--source',required=True);a=p.parse_args();build(a.pages,a.proof,a.source)
