"""Build an isolated launcher preview. Never read a browser profile or alter source keys."""
import argparse,hashlib,json,re,shutil,subprocess
from pathlib import Path
from urllib.parse import urlsplit
ROOT=Path(__file__).resolve().parents[1]
CHANGES={'js/storage.js':('kitchen-calculator-pr2-browser-test-v1','kitchen-calculator-sintez-preview-v1'),'js/drafts.js':('kitchen-calculator-pr2-browser-drafts-v1','kitchen-calculator-sintez-drafts-v1'),'js/photos.js':('kitchen-calculator-test-photos-v1','kitchen-calculator-sintez-photos-v1'),'js/import-transaction.js':('kitchen-calculator-test-import-backups-v1','kitchen-calculator-sintez-import-backups-v1'),'js/appearance.js':('kitchen-calculator-appearance-test-v1','kitchen-calculator-sintez-appearance-v1')}
def build(output,source):
 assert not output.exists();html=(ROOT/'index.html').read_text()
 files={'index.html',*(urlsplit(x).path for x in re.findall(r'<(?:script|link|img)\b[^>]*\b(?:src|href)=["\']([^"\']+)',html,re.I))}
 for name in list(files):
  if name.endswith('.css'):
   for asset in re.findall(r'url\(["\']?([^"\')]+)',(ROOT/name).read_text()):files.add(str(Path(name).parent/asset))
 for name in sorted(files):
  assert not Path(name).is_absolute() and '..' not in Path(name).parts and '://' not in name
  target=output/name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(ROOT/name,target)
  if name in CHANGES:
   old,new=CHANGES[name];text=target.read_text();assert text.count(old)==1;target.write_text(text.replace(old,new))
 html=(output/'index.html').read_text().replace('ТЕСТ PR №2 · Отдельное хранилище. Рабочие продукты и рецепты здесь не используются.','ТЕСТ СИНТЕЗ МЕРЫ · Отдельная база. Рабочая версия и прежние стенды не изменены.')
 html=re.sub(r'((?:src|href)=["\'])([^"\']+\.(?:js|css))(?:\?[^"\']*)?(["\'])',lambda m:m[1]+m[2]+'?v=sintez-'+source[:12]+m[3],html)
 (output/'index.html').write_text(html)
 result={'source_commit':source,'files':{name:hashlib.sha256((output/name).read_bytes()).hexdigest() for name in sorted(files)},'storage_names':dict(zip(['book','drafts','photos','backups','appearance'],[x[1] for x in CHANGES.values()]))}
 (output/'sintez-version.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'files':len(files),'source':source,'separate_storage':True}));return result
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--output',type=Path,required=True);p.add_argument('--source',default='HEAD');a=p.parse_args();build(a.output,subprocess.check_output(['git','-C',str(ROOT),'rev-parse',a.source],text=True).strip())
