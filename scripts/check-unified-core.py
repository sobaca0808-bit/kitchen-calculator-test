"""Protect existing kitchen data engines while replacing their presentation."""
from pathlib import Path
import subprocess,re,json,hashlib
ROOT=Path(__file__).resolve().parents[1]
BASE='a71c0bf0f285d82e315b9146224bb8250d564268'
def old(file):return subprocess.check_output(['git','-C',str(ROOT),'show',BASE+':'+file])
allowed={'index.html','js/app.js','js/sintez-home.js','js/recipe-card-templates.js'}
files=subprocess.check_output(['git','-C',str(ROOT),'ls-tree','-r','--name-only',BASE,'js','assets','styles.css','welcome.html','pwa','icons','index.html'],text=True).splitlines();protected={}
for name in files:
    if name in allowed:continue
    content=(ROOT/name).read_bytes();assert content==old(name),'Protected calculator/data/PWA file changed: '+name
    protected[name]=hashlib.sha256(content).hexdigest()
before=old('js/app.js').decode();after=(ROOT/'js/app.js').read_text()
functions=['persist','persistFolders','currentState','flushDraft','restoreDraft','discardDraft','canLeave','markDirty','numeric','numericInput','openSelected','renderProduct','renderPackaging','bindCommon','bindRow','saveDraft','deleteItem','createItem']
for name in functions:
    pattern=r'(?ms)^  function '+name+r'\(.*?^  }(?=\n)'
    a=re.search(pattern,before);b=re.search(pattern,after);assert a and b and a[0]==b[0],'Existing save/draft/calculation handler changed: '+name
assert (ROOT/'icons/sintez/original-logo.png').read_bytes()==old('icons/sintez/original-logo.png')
for name in ['js/workspace-policy.js','js/unified-card.js','js/unified-workspace.js']:
    assert not re.search(r'localStorage|indexedDB|deleteDatabase|\.clear\(|skipWaiting|clients\.claim',(ROOT/name).read_text()),name
assert (ROOT/'assets/unified-workspace.css').stat().st_size<32000
assert sum((ROOT/'assets'/f).stat().st_size for f in ['unified-kitchen.webp','unified-kitchen-mobile.webp'])<180000
print(json.dumps({'base':BASE,'protected_files':len(protected),'protected_hashes':protected,'unchanged_handlers':functions,'no_new_storage_names_or_formula_changes':True,'original_logo_unchanged':True},indent=2))
