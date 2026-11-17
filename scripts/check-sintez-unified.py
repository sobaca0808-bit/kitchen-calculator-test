"""Explicit release approval: only brand links plus existing PWA shell support."""
from pathlib import Path
import hashlib,json,re,subprocess
ROOT=Path(__file__).resolve().parents[1]
BASE='59fce080ea4e8dd90dc8cd86e2361323bc81cd3a'
PWA='11784f16e932dded4ca2e962a3bd7e38622328aa'
def read(ref,name):return subprocess.check_output(['git','-C',str(ROOT),'show',ref+':'+name])
files=subprocess.check_output(['git','-C',str(ROOT),'ls-tree','-r','--name-only',BASE,'js','assets','styles.css','welcome.html'],text=True).splitlines()
entry=json.loads((ROOT/'pwa/entry-hashes.json').read_text())
assert set(entry)=={'index.html','js/sintez-intro.js','assets/sintez-intro.css'}
for name,digest in entry.items():assert hashlib.sha256((ROOT/name).read_bytes()).hexdigest()==digest,'Unapproved entry UI: '+name
for name in files:
    if name in entry:continue
    data=(ROOT/name).read_bytes()
    assert data==read(BASE,name),'Existing calculator changed: '+name
for current,original in [('worker-template.js','sw.js'),('client.js','js/pwa.js'),('base.css','assets/pwa.css')]:
    assert (ROOT/'pwa'/current).read_bytes()==read(PWA,original),'Existing PWA algorithm changed: '+current
hashes=json.loads((ROOT/'pwa/brand-hashes.json').read_text())
for name,digest in hashes.items():assert hashlib.sha256((ROOT/'icons/sintez'/name).read_bytes()).hexdigest()==digest,name
print(json.dumps({'merged_base':BASE,'pwa_source':PWA,'unchanged_runtime_files':len(files)-2,'approved_entry_ui':entry,'approved_brand_files':hashes,'pwa_worker_and_client_unchanged':True,'no_calculator_data_changes':True},indent=2))
