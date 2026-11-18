"""Compact successful actual HTTPS evidence; no image resizing or application edits."""
import argparse,json,shutil
from pathlib import Path
from PIL import Image
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--input',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--publication',type=Path,required=True);a=p.parse_args()
    a.output.mkdir(parents=True,exist_ok=False)
    proof=json.loads((a.input/'unified-proof.json').read_text());assert proof['passed']>=25 and len(proof['printProof'])==8
    assert all(x['exactPixels'] and x['exactWordsAndCoordinates'] for x in proof['printProof'])
    assert proof['url']=='https://sobaca0808-bit.github.io/kitchen-calculator-test/sintez-workspace/'
    for source in a.input.iterdir():
        if source.suffix=='.png' and source.name!='failure.png':
            with Image.open(source) as image:image.save(a.output/(source.stem+'.webp'),'WEBP',quality=85,method=6)
        elif source.suffix in ['.pdf','.json']:shutil.copyfile(source,a.output/source.name)
    shutil.copyfile(a.publication,a.output/'publication-proof.json')
    (a.output/'collection.json').write_text(json.dumps({'screenshots_resized':False,'webp_quality':85,'from_actual_https':proof['url'],'application_files_changed':False},indent=2)+'\n')
    size=sum(f.stat().st_size for f in a.output.iterdir());assert size<30*1024*1024,size
    print(json.dumps({'files':len(list(a.output.iterdir())),'bytes':size,'screenshots_resized':False}))
