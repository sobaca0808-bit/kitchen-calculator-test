"""One calculator runtime, explicitly bound to an existing web/PWA namespace.

This module never opens browser storage. The live PWA identity is fixed, and
the review stand keeps the already-existing SINTEZ test data, never PWA data.
"""
import hashlib,json,re,shutil
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
LIVE_PWA_ID = '/kitchen-calculator-test/pwa/'
PREVIEW_ID = '/kitchen-calculator-test/sintez-release/'
MODES_ID = '/kitchen-calculator-test/sintez-modes/'
GLASS_ID = '/kitchen-calculator-test/sintez-glass/'
SHOWCASE_ID = '/kitchen-calculator-test/sintez-card/'
FILES = {'book':('js/storage.js','kitchen-calculator-pr2-browser-test-v1'),
         'drafts':('js/drafts.js','kitchen-calculator-pr2-browser-drafts-v1'),
         'photos':('js/photos.js','kitchen-calculator-test-photos-v1'),
         'backups':('js/import-transaction.js','kitchen-calculator-test-import-backups-v1'),
         'appearance':('js/appearance.js','kitchen-calculator-appearance-test-v1')}
PWA_NAMES = dict(zip(FILES,['kitchen-calculator-pwa-preview-v1','kitchen-calculator-pwa-drafts-v1','kitchen-calculator-pwa-photos-v1','kitchen-calculator-pwa-import-backups-v1','kitchen-calculator-pwa-appearance-v1']))
SINTEZ_NAMES = dict(zip(FILES,['kitchen-calculator-sintez-preview-v1','kitchen-calculator-sintez-drafts-v1','kitchen-calculator-sintez-photos-v1','kitchen-calculator-sintez-import-backups-v1','kitchen-calculator-sintez-appearance-v1']))
def sha(data): return hashlib.sha256(data).hexdigest()
def clean(value):
    url=urlsplit(value);path=Path(url.path)
    if url.scheme or url.netloc or path.is_absolute() or '..' in path.parts or not url.path:
        raise ValueError('Unsafe static resource: '+value)
    return path.as_posix()
def runtime(root):
    html=(root/'index.html').read_text()
    files={'index.html',*(clean(x) for x in re.findall(r'<(?:script|link|img)\b[^>]*\b(?:src|href)=["\']([^"\']+)',html,re.I))}
    for css in [x for x in files if x.endswith('.css')]:
        for asset in re.findall(r'url\(["\']?([^"\')]+)',(root/css).read_text()):files.add(clean(str(Path(css).parent/clean(asset))))
    if 'manifest.webmanifest' in files:
        for icon in json.loads((root/'manifest.webmanifest').read_text())['icons']:files.add(clean(icon['src']))
    assert all((root/x).is_file() and (root/x).stat().st_size for x in files)
    assert sum((root/x).stat().st_size for x in files)<10*1024*1024
    return sorted(files)
def package(output,source,target='preview',root=ROOT):
    assert target in ['web','pwa','preview','modes','glass','showcase'] and not output.exists()
    names=PWA_NAMES if target=='pwa' else SINTEZ_NAMES if target in ['preview','modes','glass','showcase'] else {k:v[1] for k,v in FILES.items()}
    for file in runtime(root):
        dest=output/file;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(root/file,dest)
    for kind,(file,old) in FILES.items():
        p=output/file;text=p.read_text();assert text.count(old)==1;p.write_text(text.replace(old,names[kind]))
    html=(output/'index.html').read_text()
    notice='ТЕСТ PR №2 · Отдельное хранилище. Рабочие продукты и рецепты здесь не используются.'
    assert html.count(notice)==1
    html=html.replace(notice,'СИНТЕЗ МЕРЫ · Проверка стеклянного оформления. Общая тестовая база /sintez/.' if target in ['glass','showcase'] else 'СИНТЕЗ МЕРЫ · Проверка главного экрана. Общая тестовая база /sintez/.' if target=='modes' else 'СИНТЕЗ МЕРЫ · Проверка единого выпуска. Общая тестовая база /sintez/.' if target=='preview' else 'СИНТЕЗ МЕРЫ · Рабочая версия')
    html=html.replace('<title>ТЕСТ PR №2 — Кухонный калькулятор</title>','<title>СИНТЕЗ МЕРЫ — кухонный калькулятор</title>')
    if target!='preview':html=html.replace('>ПРЕДПРОСМОТР</span>','>СИНТЕЗ МЕРЫ</span>')
    seen='kitchen-calculator-sintez-presentation-seen-v1'
    if target not in ['preview','modes','glass','showcase']:
        path=output/'js/sintez-intro.js';text=path.read_text();assert text.count(seen)==1
        seen='kitchen-calculator-pwa-presentation-seen-v1' if target=='pwa' else 'kitchen-calculator-presentation-seen-v1'
        path.write_text(text.replace('kitchen-calculator-sintez-presentation-seen-v1',seen))
    if target!='web':
        additions=[('pwa/client.js','js/pwa.js'),('pwa/base.css','assets/pwa.css'),('pwa/placement.js','js/sintez-pwa.js'),('pwa/placement.css','assets/sintez-pwa.css'),('pwa/worker-template.js','sw.js')]
        for src,dst in additions:
            dest=output/dst;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(root/src,dest)
        manifest=json.loads((root/'pwa/manifest-template.json').read_text());manifest['id']=LIVE_PWA_ID if target=='pwa' else MODES_ID if target=='modes' else GLASS_ID if target=='glass' else SHOWCASE_ID if target=='showcase' else PREVIEW_ID
        assert manifest['start_url']=='./?source=pwa' and manifest['scope']=='./'
        (output/'manifest.webmanifest').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
        for icon in manifest['icons']:
            dest=output/icon['src'];dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(root/icon['src'],dest)
        html=html.replace('</head>','  <link rel="manifest" href="manifest.webmanifest">\n  <link rel="stylesheet" href="assets/pwa.css">\n  <link rel="stylesheet" href="assets/sintez-pwa.css">\n  <script defer src="js/sintez-pwa.js"></script>\n  <script defer src="js/pwa.js"></script>\n</head>')
        html=html.replace('</body>',(root/'pwa/control.html').read_text()+(root/'pwa/notice.html').read_text()+'</body>')
    html=re.sub(r'((?:src|href)=["\'])([^"\']+\.(?:js|css))(?:\?[^"\']*)?(["\'])',lambda m:m[1]+m[2]+'?v=sintez-release-'+source[:12]+m[3],html)
    # Old workers match resource PATHS even when a version query changes. New
    # presentation URLs and entry-only filenames must also work while the old
    # installed shell is still open; never force its controller to activate.
    for old,new in [('js/sintez-intro.js','js/sintez-entry-v2.js'),('assets/sintez-intro.css','assets/sintez-entry-v2.css')]:
        html=html.replace(old,new);shutil.copyfile(output/old,output/new);(output/old).unlink()
    (output/'index.html').write_text(html)
    (output/'presentation.html').write_text(html)
    files=runtime(output)+['presentation.html']
    if target!='web':
        worker=(output/'sw.js').read_text();assert worker.count('const BUILD = null; // PWA_BUILD')==1
        revision=sha(json.dumps({'assets':{f:sha((output/f).read_bytes()) for f in files},'worker':sha(worker.encode()),'format':1},sort_keys=True).encode())
        html=html.replace('<html lang="ru"','<html lang="ru" data-pwa-build="'+revision+'"',1);(output/'index.html').write_text(html)
        (output/'presentation.html').write_text(html)
        config={'revision':revision,'assets':[{'url':f,'sha256':sha((output/f).read_bytes())} for f in files]}
        (output/'sw.js').write_text(worker.replace('const BUILD = null; // PWA_BUILD','const BUILD = '+json.dumps(config,separators=(',',':'))+'; // PWA_BUILD'))
        files.append('sw.js')
    else:revision=None
    result={'source_commit':source,'target':target,'revision':revision,'files':{f:sha((output/f).read_bytes()) for f in sorted(files)},'storage_names':names,'presentation_key':seen,'manifest_id':None if target=='web' else manifest['id'],'offline_assets':len(files)-1 if revision else 0,'data_policy':'Existing namespaces only; never open, clear, migrate or seed browser data'}
    (output/'pwa-version.json' if revision else output/'release-version.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    return result
