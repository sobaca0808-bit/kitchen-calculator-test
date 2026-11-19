"""Classic Dark Glass changes presentation only; all existing runtime JS is exact."""
from pathlib import Path
import subprocess,hashlib,json
ROOT=Path(__file__).resolve().parents[1]
BASE='471c60944ffe9988f8c9e0a4a4ad2f50a907a9a8'
def old(name):return subprocess.check_output(['git','-C',str(ROOT),'show',BASE+':'+name])
files=subprocess.check_output(['git','-C',str(ROOT),'ls-tree','-r','--name-only',BASE,'js','assets','styles.css','welcome.html','pwa','icons'],text=True).splitlines()
for name in files:assert (ROOT/name).read_bytes()==old(name),'Protected runtime changed: '+name
html=(ROOT/'index.html').read_text();restored=html.replace('data-sintez-unified data-classic-glass data-default','data-sintez-unified data-default').replace('  <link rel="stylesheet" href="assets/classic-dark-glass.css" media="screen">\n','').replace('<p class="classic-theme-label">Оформление: Classic Dark Glass</p>\n        ','')
assert restored==old('index.html').decode(),'Unapproved HTML, data or intro edit'
css=(ROOT/'assets/classic-dark-glass.css').read_text();assert '@media print' not in css;assert 'url(' not in css
assert (ROOT/'assets/classic-dark-glass.css').stat().st_size<18000
print(json.dumps({'base':BASE,'protected_files':len(files),'all_existing_JS_and_data_engines_exact':True,'four_slides_original_logo_background_and_A4_styles_unchanged':True},indent=2))
