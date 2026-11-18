"""Build only disposable complete/incomplete caches; no browser data is read."""
import argparse,importlib.util,json,re,shutil,subprocess,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--output',type=Path,required=True);p.add_argument('--target',choices=['modes','glass','showcase'],default='modes');a=p.parse_args();assert not a.output.exists();a.output.mkdir(parents=True)
    spec=importlib.util.spec_from_file_location('modes_package',ROOT/'scripts/sintez-package.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
    source=subprocess.check_output(['git','-C',str(ROOT),'rev-parse','HEAD'],text=True).strip()
    m.package(a.output/'one',source,a.target);m.package(a.output/'two','0'*40,a.target)
    shutil.copytree(a.output/'two',a.output/'bad');worker=a.output/'bad/sw.js';text=worker.read_text();match=re.search(r'const BUILD = (.*); // PWA_BUILD',text);config=json.loads(match[1]);config['revision']=hashlib.sha256(b'modes corrupt test fixture').hexdigest();worker.write_text(text[:match.start(1)]+json.dumps(config,separators=(',',':'))+text[match.end(1):]);app=a.output/'bad/js/app.js';app.write_text(app.read_text()+'\n/* intentional test-only checksum mismatch */\n')
    print(json.dumps({'source':source,'fixtures':['one','two','bad'],'artificial_second_version_only_for_worker_tests':True,'user_data_read':False}))
