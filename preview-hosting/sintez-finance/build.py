"""Append one isolated finance stand; preserve every previously published byte."""
import argparse,hashlib,json,subprocess,tempfile,concurrent.futures
from pathlib import Path
from urllib.request import urlopen,Request
ROOT=Path(__file__).resolve().parents[2]
HOST='a99fe49763667df075c24683f64e7a6c1d0dace1'
CLASSIC='16fb5b490eb57b13254ebefe49f15808793e89f0'
MAIN='9f45d0206022d5cfb66352b5a1518b3ff9a50abc'
URL='https://sobaca0808-bit.github.io/kitchen-calculator-test/'
def run(*args):subprocess.run(args,check=True)
def digest(data):return hashlib.sha256(data).hexdigest()
def sha(p):return digest(p.read_bytes())
def get(name):
    assert not name.startswith('/') and '..' not in Path(name).parts
    with urlopen(Request(URL+name,headers={'User-Agent':'Kitchen-financial-review-verifier'}),timeout=45) as response:
        assert response.status==200
        return response.read()
def build(output,proof,source):
    with tempfile.TemporaryDirectory(prefix='sintez-financial-publication-') as folder:
        temp=Path(folder);host=temp/'previous';candidate=temp/'candidate'
        run('git','-C',str(ROOT),'worktree','add','--detach',str(host),HOST)
        try:run('python3',str(host/'preview-hosting/sintez-classic/build.py'),'--pages',str(output),'--proof',str(temp/'prior.json'),'--source',CLASSIC)
        finally:run('git','-C',str(ROOT),'worktree','remove','--force',str(host))
        old=json.loads((temp/'prior.json').read_text());before=dict(old['preserved_https']);assert len(before)==742
        # Classic build time is truthful metadata: keep its published bytes,
        # never replace them with the temporary reconstruction's new timestamp.
        raw=get('sintez-classic/pwa-version.json');prior=json.loads(raw)
        assert prior['source_commit']==CLASSIC and prior['manifest_id']=='/kitchen-calculator-test/sintez-classic/'
        assert len(prior['files'])==75
        def retain(item):
            name,expected=item;data=get('sintez-classic/'+name);assert digest(data)==expected,name
            dest=output/'sintez-classic'/name;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(data)
            return 'sintez-classic/'+name,expected
        with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:before.update(dict(pool.map(retain,prior['files'].items())))
        (output/'sintez-classic/pwa-version.json').write_bytes(raw);before['sintez-classic/pwa-version.json']=digest(raw)
        assert len(before)==818
        protected={p.relative_to(output).as_posix():sha(p) for p in output.rglob('*') if p.is_file()};assert len(protected)==1071
        run('git','-C',str(ROOT),'worktree','add','--detach',str(candidate),source)
        try:
            run('python3',str(candidate/'scripts/check-financial-journal-core.py'))
            run('python3',str(candidate/'scripts/build-sintez-release-candidate.py'),'--output',str(output/'sintez-finance'),'--target','finance','--source',source)
        finally:run('git','-C',str(ROOT),'worktree','remove','--force',str(candidate))
        version=json.loads((output/'sintez-finance/pwa-version.json').read_text());manifest=json.loads((output/'sintez-finance/manifest.webmanifest').read_text())
        assert version['source_commit']==source and version['offline_assets']==77
        assert set(version['storage_names'].values()).isdisjoint(prior['storage_names'].values())
        assert all(name.startswith('kitchen-calculator-finance-') for name in version['storage_names'].values())
        assert version['presentation_key']=='kitchen-calculator-finance-presentation-seen-v1'
        assert manifest['id']=='/kitchen-calculator-test/sintez-finance/' and manifest['scope']=='./' and manifest['start_url']=='./?source=pwa'
        for name,expected in protected.items():assert sha(output/name)==expected,name
        current={'sintez-finance/'+name:expected for name,expected in version['files'].items()};current['sintez-finance/pwa-version.json']=sha(output/'sintez-finance/pwa-version.json');assert len(current)==79
        result={'source_commit':source,'parent_commit':CLASSIC,'main_commit':MAIN,'previous_hosting':HOST,'url':URL,'preview_url':URL+'sintez-finance/','before_https':before,'preserved_https':before,'release_https':current,'protected_files':protected,'storage_names':version['storage_names'],'manifest_id':manifest['id'],'all_existing_sites_and_pwa_preserved':True,'isolated_review_data':True,'automatic_data_transfer':False}
        proof.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'unchanged_files':len(protected),'before_https':len(before),'new_https':len(current),'after_https':len(before)+len(current),'preview_url':result['preview_url']}))
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--pages',type=Path,required=True);p.add_argument('--proof',type=Path,required=True);p.add_argument('--source',required=True);a=p.parse_args();build(a.pages,a.proof,a.source)
