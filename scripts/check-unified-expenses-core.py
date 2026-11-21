"""Protect all existing non-expense behavior; task42 explicitly extends overhead."""
from pathlib import Path
import subprocess,json,hashlib
ROOT=Path(__file__).resolve().parents[1];BASE='4cc596363f37b99b8341a822e959fe9a4b28e950'
ALLOWED={'js/financial-journal.js','js/financial-journal-ui.js','js/establishment-expenses.js','js/establishment-expenses-ui.js','assets/financial-journal.css'}
def old(n):return subprocess.check_output(['git','-C',str(ROOT),'show',BASE+':'+n])
def protected(n):
 current=(ROOT/n).read_bytes();previous=old(n)
 if n=='js/app.js' and current!=previous:
  def search_body(source):
   search=source.split(b'  function setupSearch(row, container) {',1)[1]
   return search.split(b"      const term = input.value.trim().toLocaleLowerCase('ru');\n",1)[1].split(b'      active = -1;\n',1)[0]
  optimized=search_body(current)
  # Permit precisely this lookup-only change. Every byte outside that block,
  # including saved data, formulas and editor handlers, remains protected.
  assert hashlib.sha256(optimized).hexdigest()=='e76c1a7f50fc553eff3ed09975d80d0e3705561ba13bd02509e1c37dfbc2476e','Unexpected ingredient search edit'
  current=current.replace(optimized,search_body(previous),1)
 return current==previous
files=subprocess.check_output(['git','-C',str(ROOT),'ls-tree','-r','--name-only',BASE,'js','assets','styles.css','welcome.html','pwa','icons'],text=True).splitlines()
for n in files:
 if n not in ALLOWED:assert protected(n),'Protected file changed: '+n
html=(ROOT/'index.html').read_text().replace('  <script defer src="js/expense-allocation.js"></script>\n','')
assert html==old('index.html').decode(),'Unrelated HTML, logo or presentation edit'
current=(ROOT/'js/establishment-expenses.js').read_text();previous=old('js/establishment-expenses.js').decode()
assert current.split('  function allocation(config){')[1].split('  function calculate(')[0]==previous.split('  function allocation(config){')[1].split('  function calculate(')[0],'Legacy portion formula changed'
for f in ['js/financial-journal.js','js/expense-allocation.js']:
 s=(ROOT/f).read_text()
 for word in ['localStorage','indexedDB','fetch(']:assert word not in s
print(json.dumps({'base':BASE,'protected_files':len(files)-len(ALLOWED),'old_recipe_math_storage_photos_drafts_print_PWA_classic_exact':True,'legacy_portion_formula_exact':True}))
