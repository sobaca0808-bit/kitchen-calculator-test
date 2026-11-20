"""Protect all existing non-expense behavior; task42 explicitly extends overhead."""
from pathlib import Path
import subprocess,json
ROOT=Path(__file__).resolve().parents[1];BASE='4cc596363f37b99b8341a822e959fe9a4b28e950'
ALLOWED={'js/financial-journal.js','js/financial-journal-ui.js','js/establishment-expenses.js','js/establishment-expenses-ui.js','assets/financial-journal.css'}
def old(n):return subprocess.check_output(['git','-C',str(ROOT),'show',BASE+':'+n])
files=subprocess.check_output(['git','-C',str(ROOT),'ls-tree','-r','--name-only',BASE,'js','assets','styles.css','welcome.html','pwa','icons'],text=True).splitlines()
for n in files:
 if n not in ALLOWED:assert (ROOT/n).read_bytes()==old(n),'Protected file changed: '+n
html=(ROOT/'index.html').read_text().replace('  <script defer src="js/expense-allocation.js"></script>\n','')
assert html==old('index.html').decode(),'Unrelated HTML, logo or presentation edit'
current=(ROOT/'js/establishment-expenses.js').read_text();previous=old('js/establishment-expenses.js').decode()
assert current.split('  function allocation(config){')[1].split('  function calculate(')[0]==previous.split('  function allocation(config){')[1].split('  function calculate(')[0],'Legacy portion formula changed'
for f in ['js/financial-journal.js','js/expense-allocation.js']:
 s=(ROOT/f).read_text()
 for word in ['localStorage','indexedDB','fetch(']:assert word not in s
print(json.dumps({'base':BASE,'protected_files':len(files)-len(ALLOWED),'old_recipe_math_storage_photos_drafts_print_PWA_classic_exact':True,'legacy_portion_formula_exact':True}))
