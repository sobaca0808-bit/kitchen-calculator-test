"""Disposable old/new/corrupt PWA fixtures; never reuse a user's browser profile."""
import argparse,hashlib,importlib.util,io,json,re,shutil,subprocess,tarfile,tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];OLD='11784f16e932dded4ca2e962a3bd7e38622328aa'
def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--output',type=Path,required=True);p.add_argument('--source',default='HEAD');a=p.parse_args();assert not a.output.exists();a.output.mkdir(parents=True)
    source=subprocess.check_output(['git','-C',str(ROOT),'rev-parse',a.source],text=True).strip()
    with tempfile.TemporaryDirectory(prefix='sintez-old-pwa-') as folder:
        old=Path(folder);archive=subprocess.check_output(['git','-C',str(ROOT),'archive',OLD])
        with tarfile.open(fileobj=io.BytesIO(archive),mode='r:') as tar:
            for entry in tar:
                name=Path(entry.name);assert not name.is_absolute() and '..' not in name.parts and (entry.isdir() or entry.isfile())
                target=old/name
                if entry.isdir():target.mkdir(parents=True,exist_ok=True)
                else:target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(tar.extractfile(entry).read())
        load('old_pwa_builder',old/'scripts/build-pwa-preview.py').build(a.output/'old',OLD,root=old)
    pack=load('new_sintez_package',ROOT/'scripts/sintez-package.py')
    pack.package(a.output/'new',source,'pwa');pack.package(a.output/'preview',source,'preview')
    shutil.copytree(a.output/'new',a.output/'bad')
    file=a.output/'bad/sw.js';text=file.read_text();match=re.search(r'const BUILD = (.*); // PWA_BUILD',text);config=json.loads(match[1]);config['revision']=hashlib.sha256(b'corrupt fixture only').hexdigest();file.write_text(text[:match.start(1)]+json.dumps(config,separators=(',',':'))+text[match.end(1):])
    file=a.output/'bad/js/app.js';file.write_text(file.read_text()+'\n/* intentional test-only digest mismatch */\n')
    print(json.dumps({'old_source':OLD,'new_source':source,'fixtures':['old','new','preview','bad'],'real_user_data_used':False}))
