"""Prepare the complete future main release. Does not publish or access user data.

The currently published sites are rebuilt from an immutable backup; only root
and /pwa/ are deliberately replaced in the proposed release. A frozen review
stand remains independent of their namespaces and of later main commits.
"""
import argparse,importlib.util,json,shutil,subprocess,tempfile,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
HOST='08f80c5385d0d52163cbb3593062cb458f54a1c3'
MAIN='9f45d0206022d5cfb66352b5a1518b3ff9a50abc'
INTRO='b0e1b3340dc2e376e53a1fcbfa0834edda3265fb'
CANDIDATE_TAG='release/sintez-unified-candidate-v1'
URL='https://sobaca0808-bit.github.io/kitchen-calculator-test/'
def run(*args):subprocess.run(args,check=True)
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def module(root):
    spec=importlib.util.spec_from_file_location('sintez_package',root/'scripts/sintez-package.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
def baseline(output,proof):
    with tempfile.TemporaryDirectory(prefix='sintez-baseline-') as folder:
        host=Path(folder)/'hosting';run('git','-C',str(ROOT),'worktree','add','--detach',str(host),HOST)
        try:run('python3',str(host/'preview-hosting/sintez-intro/build.py'),'--pages',str(output),'--proof',str(proof),'--source',INTRO)
        finally:run('git','-C',str(ROOT),'worktree','remove','--force',str(host))
    old=json.loads(proof.read_text());expected={**old['protected_https'],**old['candidate_https']};assert len(expected)==341
    return expected
def build(output,proof,source,preview_source):
    assert not output.exists()
    run('git','-C',str(ROOT),'merge-base','--is-ancestor',MAIN,source)
    run('python3',str(ROOT/'scripts/check-sintez-unified.py'))
    with tempfile.TemporaryDirectory(prefix='sintez-release-') as folder:
        temp=Path(folder);before=baseline(output,temp/'baseline.json')
        original_files={p.relative_to(output).as_posix():sha(p) for p in output.rglob('*') if p.is_file()}
        candidate=temp/'candidate';run('git','-C',str(ROOT),'worktree','add','--detach',str(candidate),preview_source)
        try:preview=module(candidate).package(output/'sintez-release',preview_source,'preview',candidate)
        finally:run('git','-C',str(ROOT),'worktree','remove','--force',str(candidate))
        preview_http={'sintez-release/'+name:digest for name,digest in preview['files'].items()};preview_http['sintez-release/pwa-version.json']=sha(output/'sintez-release/pwa-version.json')
        before.update(preview_http)
        pack=module(ROOT);web=pack.package(temp/'web',source,'web');pwa=pack.package(temp/'pwa',source,'pwa')
        old_manifest=json.loads((output/'pwa/manifest.webmanifest').read_text());new_manifest=json.loads((temp/'pwa/manifest.webmanifest').read_text())
        for field in ['id','start_url','scope','display']:assert old_manifest[field]==new_manifest[field],field
        old_pwa=json.loads((output/'pwa/pwa-version.json').read_text());assert old_pwa['storage_names']==pwa['storage_names']
        old_web=json.loads((output/'release-version.json').read_text());assert old_web['storage_names']==web['storage_names']
        for src,dst in [(temp/'web',output),(temp/'pwa',output/'pwa')]:
            shutil.copytree(src,dst,dirs_exist_ok=True)
        changed={**web['files'],'release-version.json':sha(output/'release-version.json'),**{'pwa/'+name:digest for name,digest in pwa['files'].items()},'pwa/pwa-version.json':sha(output/'pwa/pwa-version.json')}
        protected={name:digest for name,digest in before.items() if name not in changed}
        for name,digest in protected.items():assert sha(output/name)==digest,name
        for name,digest in original_files.items():
            if name not in changed:assert sha(output/name)==digest,name
        result={'source_commit':source,'preview_source':preview_source,'baseline_main':MAIN,'rollback_hosting':HOST,'url':URL,'before_https':before,'preserved_https':protected,'release_https':changed,'root_storage_names':web['storage_names'],'pwa_storage_names':pwa['storage_names'],'preview_storage_names':preview['storage_names'],'pwa_identity':{k:new_manifest[k] for k in ['id','start_url','scope','display']},'brand':{k:new_manifest[k] for k in ['name','short_name','icons']},'requires_owner_approval_before_main_or_live_pwa':True}
        proof.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
        print(json.dumps({'prepared_release':source,'before_https':len(before),'preserved_https':len(protected),'new_root_and_pwa_https':len(changed),'pwa_identity_unchanged':True,'all_storage_names_unchanged':True,'not_published':True}))
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--output',type=Path,required=True);p.add_argument('--proof',type=Path,required=True);p.add_argument('--source',default='HEAD');p.add_argument('--preview-source',default=CANDIDATE_TAG);a=p.parse_args()
    resolve=lambda ref:subprocess.check_output(['git','-C',str(ROOT),'rev-parse',ref+'^{commit}'],text=True).strip()
    build(a.output,a.proof,resolve(a.source),resolve(a.preview_source))
