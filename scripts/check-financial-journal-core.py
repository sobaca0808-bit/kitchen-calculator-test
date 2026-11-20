"""Task41 changes the journal only; protect PR38/40 math, images, print and PWA."""
from pathlib import Path
import subprocess,json
ROOT=Path(__file__).resolve().parents[1]
BASE='16fb5b490eb57b13254ebefe49f15808793e89f0'
ALLOWED={'js/app.js','js/storage.js','js/json-merge.js','js/import-ui.js','js/workspace-policy.js','js/establishment-expenses-ui.js'}
files=subprocess.check_output(['git','-C',str(ROOT),'ls-tree','-r','--name-only',BASE,'js','assets','styles.css','welcome.html','pwa','icons'],text=True).splitlines()
def old(n):return subprocess.check_output(['git','-C',str(ROOT),'show',BASE+':'+n])
for name in files:
    if name not in ALLOWED:assert (ROOT/name).read_bytes()==old(name),'Protected runtime changed: '+name
html=(ROOT/'index.html').read_text()
for line in ['  <script defer src="js/financial-journal.js"></script>\n','  <script defer src="js/financial-journal-ui.js"></script>\n','  <link rel="stylesheet" href="assets/financial-journal.css">\n']:html=html.replace(line,'')
assert html==old('index.html').decode(),'Unrelated HTML, presentation or logo change'
model=(ROOT/'js/financial-journal.js').read_text()
for forbidden in ['localStorage','indexedDB','KitchenCalc','KitchenExpenses.calculate','fetch(']:assert forbidden not in model
print(json.dumps({'base':BASE,'protected_files':len(files)-len(ALLOWED),'existing_math_packaging_photos_print_PWA_and_classic_styles_exact':True,'no_automatic_journal_allocation_to_dishes':True}))
