"""Use the unchanged strict release verifier from the exact checked candidate."""
import os,re,subprocess,sys,tempfile
from pathlib import Path
source=os.environ['GLASS_SOURCE'];assert re.fullmatch('[a-f0-9]{40}',source)
root=Path(__file__).resolve().parents[2]
with tempfile.TemporaryDirectory(prefix='sintez-modes-verifier-') as folder:
    script=Path(folder)/'verify.py';script.write_bytes(subprocess.check_output(['git','-C',str(root),'show',source+':scripts/verify-sintez-release.py']))
    subprocess.run([sys.executable,str(script),*sys.argv[1:]],check=True)
