"""Home presentation changes must not alter data, formulas, photos, intro or PWA."""
from pathlib import Path
import subprocess,re,json,hashlib
ROOT=Path(__file__).resolve().parents[1]
BASE='cbf42009a0001bc3e91c6d305ebe302bcc2f3382'
def old(name):return subprocess.check_output(['git','-C',str(ROOT),'show',BASE+':'+name])
allowed={'js/app.js','js/recipe-card-templates.js','js/workspace-policy.js','js/unified-workspace.js','js/import-ui.js','assets/unified-workspace.css'}
files=subprocess.check_output(['git','-C',str(ROOT),'ls-tree','-r','--name-only',BASE,'js','assets','styles.css','welcome.html','pwa','icons','index.html'],text=True).splitlines()
protected={}
for name in files:
    if name in allowed:continue
    content=(ROOT/name).read_bytes();assert content==old(name),'Protected runtime changed: '+name
    protected[name]=hashlib.sha256(content).hexdigest()
before=old('js/app.js').decode();after=(ROOT/'js/app.js').read_text()
handlers=['persist','persistFolders','currentState','flushDraft','restoreDraft','discardDraft','canLeave','markDirty','numeric','numericInput','openSelected','renderPackaging','bindCommon','bindRow','saveDraft','deleteItem','createItem']
for name in handlers:
    pattern=r'(?ms)^  function '+name+r'\(.*?^  }(?=\n)'
    a=re.search(pattern,before);b=re.search(pattern,after);assert a and b,name
    current=b[0]
    if name=='saveDraft':current=current.replace("isHomeMode()?'Сохранено ✓.':'Сохранено ✓. Связанные калькуляции пересчитаны.'","'Сохранено ✓. Связанные калькуляции пересчитаны.'")
    assert a[0]==current,'Existing save/draft handler changed: '+name
# The importer transaction/planner are protected above. Its application UI
# (including the apply/rollback path) is also byte-identical after openCandidate.
name='js/import-ui.js';marker='    async function draw()'
assert old(name).decode().split(marker,1)[1]==(ROOT/name).read_text().split(marker,1)[1]
for name in ['js/workspace-policy.js','js/unified-workspace.js']:
    assert not re.search(r'localStorage|indexedDB|deleteDatabase|\.clear\(|skipWaiting|clients\.claim',(ROOT/name).read_text()),name
print(json.dumps({'base':BASE,'protected_files':len(protected),'unchanged_handlers':handlers,'hashes':protected,'four_intro_frames_and_PWA_unchanged':True,'data_and_formulas_unchanged':True},indent=2))
