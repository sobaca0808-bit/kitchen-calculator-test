"""Protect the approved calculator, presentation, storage and installed PWA."""
from pathlib import Path
import json,re,hashlib,subprocess
ROOT=Path(__file__).resolve().parents[1]
BASE='9787f93bd83ea19e45a4a376003b33fed3b493c5'
def old(name):return subprocess.check_output(['git','-C',str(ROOT),'show',BASE+':'+name])
files=subprocess.check_output(['git','-C',str(ROOT),'ls-tree','-r','--name-only',BASE,'js','assets','styles.css','welcome.html','pwa','icons'],text=True).splitlines()
allowed={'js/sintez-home.js','assets/sintez-home.css','pwa/placement.js','pwa/placement.css'}
protected={}
for name in files:
    if name in allowed:continue
    data=(ROOT/name).read_bytes();assert data==old(name),'Protected behavior/asset changed: '+name
    protected[name]=hashlib.sha256(data).hexdigest()
def outside_home(data):return re.sub(rb'(?ms)^  <!-- SINTEZ:HOME -->\n.*?^  <!-- /SINTEZ:HOME -->\n',b'',data)
assert outside_home((ROOT/'index.html').read_bytes())==outside_home(old('index.html')),'Existing forms/presentation changed'
assert not re.search(r'localStorage|indexedDB|deleteDatabase|skipWaiting|clients\.claim', (ROOT/'js/sintez-home.js').read_text())
assert not re.search(r'localStorage|indexedDB|deleteDatabase|skipWaiting|clients\.claim', (ROOT/'pwa/placement.js').read_text())
print(json.dumps({'base':BASE,'unchanged_files':len(protected),'protected_hashes':protected,'approved_ui_only':sorted(allowed|{'index.html HOME block','assets/sintez-matte.svg'}),'same_calculations_storage_photos_json_print_pwa_client_and_worker':True},indent=2))
