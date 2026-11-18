"""Collect checked CI evidence without changing or publishing any application file."""
import json,os,subprocess,tempfile,time,zipfile
from pathlib import Path
REPO='sobaca0808-bit/kitchen-calculator-test'
SOURCE='d2ebdea871bf9dfa019d3a2660d96e5bed9453ad'
CHECK_RUN=44208250019
PUBLIC_RUN=44208509925
def api(path):return json.loads(subprocess.check_output(['gh','api','repos/'+REPO+'/'+path]))
def wait(run,sha):
    for attempt in range(150):
        data=api('actions/runs/'+str(run));assert data['head_sha']==sha
        if data['status']=='completed':
            assert data['conclusion']=='success',(run,data['conclusion']);return
        print('Waiting for checked evidence',run,attempt+1,flush=True);time.sleep(12)
    raise TimeoutError('Checked run is not complete')
def collect(run,output,select):
    for item in api('actions/runs/'+str(run)+'/artifacts')['artifacts']:
        name=item['name']
        if not select(name,None):continue
        with tempfile.TemporaryDirectory(prefix='glass-evidence-') as folder:
            archive=Path(folder)/'artifact.zip'
            with archive.open('wb') as stream:subprocess.run(['gh','api','repos/'+REPO+'/actions/artifacts/'+str(item['id'])+'/zip'],stdout=stream,check=True)
            with zipfile.ZipFile(archive) as z:
                for entry in z.infolist():
                    file=Path(entry.filename)
                    assert not file.is_absolute() and '..' not in file.parts
                    if entry.is_dir() or not select(name,file.as_posix()):continue
                    dest=output/name/file;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(z.read(entry))
                    if dest.suffix=='.png':
                        subprocess.run(['convert',str(dest),'-strip','-quality','82',str(dest.with_suffix('.webp'))],check=True);dest.unlink()
def source_artifacts(name,file):
    if name=='sintez-glass-ui':return file is None or file.endswith('.json')
    if name=='sintez-glass-regressions':return file is None or file.endswith('.log')
    if name in ['sintez-glass-native-windows','sintez-glass-native-linux']:return file is None or file in ['modes-pwa-proof.json','native-modes-window.png']
    return False
def public_artifacts(name,file):
    if name!='sintez-glass-publication-proof':return False
    if file is None or file.endswith('.json'):return True
    base=Path(file).name
    screenshots={f'{theme}-{width}-{page}.png' for theme in ['graphite','berry','sage'] for width in [1366,390] for page in ['home','recipe','products','editor','expenses','settings','import']}
    pdfs={f'graphite-{mode}-{photos}-a4.pdf' for mode in ['calculation','chef'] for photos in ['none','both']}
    return base in screenshots|pdfs
if __name__=='__main__':
    output=Path(os.environ['EVIDENCE_OUTPUT']);output.mkdir(parents=True,exist_ok=True)
    wait(CHECK_RUN,SOURCE);wait(PUBLIC_RUN,'909bd2eeb8cc159b2739100231c00f678876c004')
    collect(CHECK_RUN,output,source_artifacts);collect(PUBLIC_RUN,output,public_artifacts)
    files=[p for p in output.rglob('*') if p.is_file()];size=sum(p.stat().st_size for p in files)
    assert size<30*1024*1024,('Evidence must remain easily downloadable',size)
    (output/'collection.json').write_text(json.dumps({'source':SOURCE,'checked_run':CHECK_RUN,'publication_run':PUBLIC_RUN,'files':len(files),'bytes':size,'screenshots_resized':False,'screenshots_webp_quality':82,'application_files_changed':False},indent=2)+'\n')
    print('Compact evidence ready',len(files),size)
