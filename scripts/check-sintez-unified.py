"""Explicit release approval: only brand links plus existing PWA shell support."""
from pathlib import Path
import hashlib,json,re,subprocess
ROOT=Path(__file__).resolve().parents[1]
BASE='59fce080ea4e8dd90dc8cd86e2361323bc81cd3a'
PWA='11784f16e932dded4ca2e962a3bd7e38622328aa'
def read(ref,name):return subprocess.check_output(['git','-C',str(ROOT),'show',ref+':'+name])
files=subprocess.check_output(['git','-C',str(ROOT),'ls-tree','-r','--name-only',BASE,'js','assets','styles.css','welcome.html'],text=True).splitlines()
for name in files:
    data=(ROOT/name).read_bytes()
    if name=='js/sintez-intro.js':
        data=re.sub(rb'(?ms)^  // RELEASE_HISTORY:.*?^  // /RELEASE_HISTORY\n',b'',data)
    assert data==read(BASE,name),'Existing calculator changed: '+name
html=(ROOT/'index.html').read_text()
html=re.sub(r'(?m)^  <link rel="(?:icon|apple-touch-icon)"[^\n]*href="icons/sintez/[^\n]*\n','',html)
assert html.encode()==read(BASE,'index.html'),'Unexpected integration markup'
for current,original in [('worker-template.js','sw.js'),('client.js','js/pwa.js'),('base.css','assets/pwa.css')]:
    assert (ROOT/'pwa'/current).read_bytes()==read(PWA,original),'Existing PWA algorithm changed: '+current
hashes=json.loads((ROOT/'pwa/brand-hashes.json').read_text())
for name,digest in hashes.items():assert hashlib.sha256((ROOT/'icons/sintez'/name).read_bytes()).hexdigest()==digest,name
print(json.dumps({'merged_base':BASE,'pwa_source':PWA,'unchanged_runtime_files':len(files)-1,'presentation_history_fix_only':True,'approved_brand_files':hashes,'pwa_worker_and_client_unchanged':True,'no_calculator_data_changes':True},indent=2))
