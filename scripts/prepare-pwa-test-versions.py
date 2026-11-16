"""Deterministic good/update/corrupt shells for real Service Worker lifecycle tests."""
import argparse
import importlib.util
import shutil
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
def module(file,name):
    spec=importlib.util.spec_from_file_location(name,ROOT/'scripts'/file)
    value=importlib.util.module_from_spec(spec);spec.loader.exec_module(value);return value

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--source',default='local');args=parser.parse_args()
    assert not args.output.exists();args.output.mkdir(parents=True)
    preview=module('build-pwa-preview.py','preview');builder=module('build-pwa.py','builder')
    preview.build(args.output/'a',args.source)
    for name in ['b','bad']:
        target=args.output/name;shutil.copytree(args.output/'a',target)
        shutil.copyfile(ROOT/'sw.js',target/'sw.js')
        html=target/'index.html';html.write_text(html.read_text().replace('</body>','<!-- Update '+name+' -->\n</body>'))
        builder.build(target,args.source)
        if name=='bad':(target/'js/pwa.js').write_text('// deliberately corrupt test asset')
