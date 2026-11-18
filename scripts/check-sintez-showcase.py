"""The stage-1 presentation may use existing results, never replace behavior."""
from pathlib import Path
import subprocess,json,hashlib,re
ROOT=Path(__file__).resolve().parents[1]
BASE='bc61c94cee52cf363ff9e0c750f53bdca68e7f87'
def old(name):return subprocess.check_output(['git','-C',str(ROOT),'show',BASE+':'+name])
deltas=json.loads((ROOT/'tests/fixtures/recipe-showcase-ui-delta.json').read_text())
files=subprocess.check_output(['git','-C',str(ROOT),'ls-tree','-r','--name-only',BASE,'js','assets','styles.css','welcome.html','pwa','icons','index.html'],text=True).splitlines()
protected={}
for name in files:
    prior=old(name);current=(ROOT/name).read_bytes()
    if name in deltas:
        projected=current.decode()
        for edit in reversed(deltas[name]):
            assert edit['new'] and projected.count(edit['new'])==1,name
            projected=projected.replace(edit['new'],edit['old'],1)
        assert projected.encode()==prior,'Unexpected change outside reviewed UI delta: '+name
    else:
        assert current==prior,'Protected calculator/data/theme/A4/PWA changed: '+name
        protected[name]=hashlib.sha256(current).hexdigest()
projection=(ROOT/'js/recipe-showcase.js').read_text()
assert not re.search(r'localStorage|indexedDB|\.save\(|\.setItem\(|deleteDatabase|calcRecipe\(|\.calculate\(',projection)
assert (ROOT/'assets/recipe-showcase.css').stat().st_size<12000
print(json.dumps({'base':BASE,'unchanged_files':len(protected),'protected_hashes':protected,'reviewed_ui_delta':list(deltas),'no_new_database_fields_or_formula_changes':True,'themes_navigation_print_styles_storage_and_worker_unchanged':True},indent=2))
