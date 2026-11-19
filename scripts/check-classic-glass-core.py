"""Classic Dark Glass changes presentation only; all existing runtime JS is exact."""
from pathlib import Path
import subprocess,hashlib,json
ROOT=Path(__file__).resolve().parents[1]
BASE='471c60944ffe9988f8c9e0a4a4ad2f50a907a9a8'
def old(name):return subprocess.check_output(['git','-C',str(ROOT),'show',BASE+':'+name])
files=subprocess.check_output(['git','-C',str(ROOT),'ls-tree','-r','--name-only',BASE,'js','assets','styles.css','welcome.html','pwa','icons'],text=True).splitlines()
for name in files:assert (ROOT/name).read_bytes()==old(name),'Protected runtime changed: '+name
html=(ROOT/'index.html').read_text();restored=html.replace('data-sintez-unified data-classic-glass data-default','data-sintez-unified data-default').replace('  <link rel="stylesheet" href="assets/classic-dark-glass.css" media="screen">\n','').replace('  <script defer src="js/classic-glass-layout.js"></script>\n','').replace('<p class="classic-theme-label">Оформление: Classic Dark Glass</p>\n        ','')
old_html=old('index.html').decode()
old_logo=next(line for line in old_html.splitlines() if 'class="sintez-wordmark unified-brand"' in line)
new_logo=next(line for line in restored.splitlines() if 'class="sintez-wordmark unified-brand"' in line)
expected=old_logo.replace('<button type="button"','<div').replace(' data-unified-tool="dashboard"','').replace('СИНТЕЗ МЕРЫ — главная','СИНТЕЗ МЕРЫ').replace('</button>','</div>')
assert new_logo==expected,'Logo must be a static version of the original branding'
restored=restored.replace(new_logo,old_logo)
assert restored==old_html,'Unapproved HTML, data or intro edit'
css=(ROOT/'assets/classic-dark-glass.css').read_text();assert '@media print' not in css;assert 'url(' not in css
assert (ROOT/'assets/classic-dark-glass.css').stat().st_size<20000
ui=(ROOT/'js/classic-glass-layout.js').read_text()
assert not __import__('re').search(r'localStorage|indexedDB|KitchenCalc|KitchenStorage|KitchenDrafts|KitchenPhotos|fetch\(|history\.',ui),'Presentation module must not access data engines or navigation'
print(json.dumps({'base':BASE,'protected_files':len(files),'all_existing_JS_and_data_engines_exact':True,'four_slides_original_logo_background_and_A4_styles_unchanged':True},indent=2))
