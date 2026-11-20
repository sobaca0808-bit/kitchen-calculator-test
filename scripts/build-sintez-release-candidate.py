"""Build a review stand or exact future root/PWA bundle without publication."""
import argparse,importlib.util,json,subprocess
from pathlib import Path
spec=importlib.util.spec_from_file_location('sintez_package',Path(__file__).with_name('sintez-package.py'))
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--output',type=Path,required=True);p.add_argument('--source',default='HEAD');p.add_argument('--target',choices=['web','pwa','preview','modes','glass','showcase','workspace','homebook','classic'],default='preview');a=p.parse_args()
    source=subprocess.check_output(['git','-C',str(module.ROOT),'rev-parse',a.source],text=True).strip()
    result=module.package(a.output,source,a.target);print(json.dumps({k:v for k,v in result.items() if k!='files'},ensure_ascii=False))
