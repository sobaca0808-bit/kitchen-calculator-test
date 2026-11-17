"""Keep the glass change outside calculator behavior, records and A4."""
from pathlib import Path
import subprocess,re,json,hashlib
ROOT=Path(__file__).resolve().parents[1]
BASE='b44c1f59dc363adb68270dad75056aa0565d78dd'
def old(name):return subprocess.check_output(['git','-C',str(ROOT),'show',BASE+':'+name])
allowed={'js/appearance.js','js/sintez-home.js'}
files=subprocess.check_output(['git','-C',str(ROOT),'ls-tree','-r','--name-only',BASE,'js','assets','styles.css','welcome.html','pwa','icons'],text=True).splitlines()
protected={}
for name in files:
    if name in allowed:continue
    data=(ROOT/name).read_bytes();assert data==old(name),'Protected behavior or print changed: '+name
    protected[name]=hashlib.sha256(data).hexdigest()
def normalize(html):
    html=html.replace(' data-sintez-glass data-default-kitchen-theme="graphite"','')
    html=re.sub(r'^    <!-- /?SINTEZ:WORKBRAND -->\n','',html,flags=re.M)
    html=re.sub(r'<a class="brand"[^>]*>.*?</a>','<a class="brand">VISUAL BRAND</a>',html)
    return re.sub(r'(?ms)^  <!-- SINTEZ:(?:HOME|GLASS) -->\n.*?^  <!-- /SINTEZ:(?:HOME|GLASS) -->\n','',html)
assert normalize((ROOT/'index.html').read_text())==normalize(old('index.html').decode()),'Existing forms or presentation changed'
assert not re.search(r'localStorage|indexedDB|deleteDatabase|skipWaiting|clients\.claim',(ROOT/'js/sintez-home.js').read_text())
assert (ROOT/'assets/sintez-glass.css').stat().st_size<35000
assert sum((ROOT/'assets'/name).stat().st_size for name in ['sintez-glass-kitchen.webp','sintez-glass-kitchen-mobile.webp'])<160000
print(json.dumps({'base':BASE,'unchanged_files':len(protected),'protected_hashes':protected,'only_appearance_default_and_navigation_labels_are_allowed_js_changes':True,'existing_forms_presentation_photos_json_calculations_print_and_worker_unchanged':True},indent=2))
