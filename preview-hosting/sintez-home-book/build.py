"""Append the Home book only; retain the exact previous static publication."""
import argparse,hashlib,json,subprocess,tempfile,concurrent.futures
from pathlib import Path
from urllib.request import urlopen,Request
ROOT=Path(__file__).resolve().parents[2]
HOST='637de8aa8cfaeed92b21e14976795b033a00e152'
PARENT='cbf42009a0001bc3e91c6d305ebe302bcc2f3382'
CARD='a71c0bf0f285d82e315b9146224bb8250d564268'
MAIN='9f45d0206022d5cfb66352b5a1518b3ff9a50abc'
URL='https://sobaca0808-bit.github.io/kitchen-calculator-test/'
def run(*args):subprocess.run(args,check=True)
def digest(data):return hashlib.sha256(data).hexdigest()
def sha(p):return digest(p.read_bytes())
def get(name):
    assert not name.startswith('/') and '..' not in Path(name).parts
    with urlopen(Request(URL+name,headers={'User-Agent':'Kitchen-home-preview-verifier'}),timeout=45) as response:
        assert response.status==200
        return response.read()
def build(output,proof,source):
    with tempfile.TemporaryDirectory(prefix='sintez-home-publication-') as folder:
        temp=Path(folder);host=temp/'previous';candidate=temp/'candidate'
        run('git','-C',str(ROOT),'worktree','add','--detach',str(host),HOST)
        # The earlier 847 files have no generated build metadata and can be
        # reproduced exactly. The workspace adds truthful build-time metadata:
        # preserve its published bytes, never regenerate a different timestamp.
        try:run('python3',str(host/'preview-hosting/sintez-card/build.py'),'--pages',str(output),'--proof',str(temp/'prior.json'),'--source',CARD)
        finally:run('git','-C',str(ROOT),'worktree','remove','--force',str(host))
        old=json.loads((temp/'prior.json').read_text());before={**old['preserved_https'],**old['release_https']};assert len(before)==594
        raw=get('sintez-workspace/pwa-version.json');prior=json.loads(raw)
        assert prior['source_commit']==PARENT and prior['manifest_id']=='/kitchen-calculator-test/sintez-workspace/'
        def retain(item):
            name,expected=item;data=get('sintez-workspace/'+name);assert digest(data)==expected,name
            dest=output/'sintez-workspace'/name;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(data)
            return 'sintez-workspace/'+name,expected
        with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:before.update(dict(pool.map(retain,prior['files'].items())))
        (output/'sintez-workspace/pwa-version.json').write_bytes(raw);before['sintez-workspace/pwa-version.json']=digest(raw);assert len(before)==668
        protected={p.relative_to(output).as_posix():sha(p) for p in output.rglob('*') if p.is_file()};assert len(protected)==921
        run('git','-C',str(ROOT),'worktree','add','--detach',str(candidate),source)
        try:
            run('python3',str(candidate/'scripts/check-home-cookbook-core.py'))
            run('python3',str(candidate/'scripts/build-sintez-release-candidate.py'),'--output',str(output/'sintez-home-book'),'--target','homebook','--source',source)
        finally:run('git','-C',str(ROOT),'worktree','remove','--force',str(candidate))
        version=json.loads((output/'sintez-home-book/pwa-version.json').read_text());manifest=json.loads((output/'sintez-home-book/manifest.webmanifest').read_text())
        assert version['storage_names']==old['storage_names']==prior['storage_names']
        assert manifest['id']=='/kitchen-calculator-test/sintez-home-book/' and manifest['scope']=='./' and manifest['start_url']=='./?source=pwa'
        for name,expected in protected.items():assert sha(output/name)==expected,name
        current={'sintez-home-book/'+name:expected for name,expected in version['files'].items()};current['sintez-home-book/pwa-version.json']=sha(output/'sintez-home-book/pwa-version.json');assert len(current)==74
        result={'source_commit':source,'parent_commit':PARENT,'main_commit':MAIN,'previous_hosting':HOST,'url':URL,'preview_url':URL+'sintez-home-book/','before_https':before,'preserved_https':before,'release_https':current,'protected_files':protected,'storage_names':version['storage_names'],'manifest_id':manifest['id'],'all_existing_sites_and_pwa_preserved':True,'no_new_calculator_database':True}
        proof.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'unchanged_files':len(protected),'before_https':len(before),'new_https':len(current),'after_https':len(before)+len(current),'preview_url':result['preview_url']}))
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--pages',type=Path,required=True);p.add_argument('--proof',type=Path,required=True);p.add_argument('--source',required=True);a=p.parse_args();build(a.pages,a.proof,a.source)
