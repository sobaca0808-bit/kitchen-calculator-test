"""Compact only successful public review screenshots; never edit application files."""
import argparse,json,shutil
from pathlib import Path
from PIL import Image
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--input',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--publication',type=Path,required=True);a=p.parse_args()
    a.output.mkdir(parents=True,exist_ok=False)
    proof=json.loads((a.input/'card-proof.json').read_text());assert proof['passed']==22 and len(proof['printComparisons'])==24
    for source in a.input.iterdir():
        if source.suffix=='.png':
            with Image.open(source) as image:image.save(a.output/(source.stem+'.webp'),'WEBP',quality=85,method=6)
        elif source.suffix in ['.pdf','.json']:shutil.copyfile(source,a.output/source.name)
    shutil.copyfile(a.publication,a.output/'publication-proof.json')
    for folder,name in [('glass-live-proof','glass-proof.json'),('modes-live-proof','modes-proof.json')]:shutil.copyfile(a.input.parent/folder/name,a.output/name)
    (a.output/'collection.json').write_text(json.dumps({'screenshots_resized':False,'webp_quality':85,'from_actual_https':proof['url'],'application_files_changed':False},indent=2)+'\n')
    size=sum(f.stat().st_size for f in a.output.iterdir());assert size<30*1024*1024,size
    print(json.dumps({'files':len(list(a.output.iterdir())),'bytes':size,'screenshots_resized':False}))
