"""Guard every existing calculation, storage, photo and print byte against main."""
from pathlib import Path
import re,subprocess,hashlib,json
ROOT=Path(__file__).resolve().parents[1];BASE='9f45d0206022d5cfb66352b5a1518b3ff9a50abc'
def read(file):return subprocess.check_output(['git','-C',str(ROOT),'show',BASE+':'+file])
files=subprocess.check_output(['git','-C',str(ROOT),'ls-tree','-r','--name-only',BASE,'js','assets','styles.css'],text=True).splitlines()
unchanged={}
for file in files:
 if file=='js/app.js':continue
 assert (ROOT/file).read_bytes()==read(file),'Protected runtime changed: '+file
 unchanged[file]=hashlib.sha256(read(file)).hexdigest()
s=(ROOT/'js/app.js').read_text();s=re.sub(r'  // UI-only navigation boundary\..*?\n  openSelected\(\);\n  if\(loaded.error\)', '  openSelected();\n  if(loaded.error)',s,flags=re.S)
s=s.replace("if (next === section) return true;\n    if (!canLeave()) return false;\n    section = next; $('#library-search').value = ''; selectedId = collection()[0]?.id || null; openSelected();return true;", "if (next === section || !canLeave()) return;\n    section = next; $('#library-search').value = ''; selectedId = collection()[0]?.id || null; openSelected();")
s=s.replace("  function createItem() {\n    if(!canLeave()) return false;", "  $('#create').addEventListener('click',() => {\n    if(!canLeave()) return;")
s=s.replace("renderLibrary();renderEditor();markDirty();renderDrafts();$('#item-name').focus();return true;\n  }\n  $('#create').addEventListener('click',createItem);", "renderLibrary();renderEditor();markDirty();renderDrafts();$('#item-name').focus();\n  });")
assert s.encode()==read('js/app.js'),'Existing app changed outside the UI navigation boundary'
html=(ROOT/'index.html').read_text().replace(' data-sintez-screen="home"','')
html=re.sub(r'(?ms)^  <!-- SINTEZ:([A-Z]+) -->\n.*?^  <!-- /SINTEZ:\1 -->\n','',html)
assert html.encode()==read('index.html'),'Existing markup changed outside launcher additions'
print(json.dumps({'base':BASE,'protected_runtime_files':len(unchanged),'all_existing_app_logic_unchanged':True,'hashes':unchanged},indent=2))
