"""Run the existing strict checksum/HTTPS verifier from the checked source."""
import os,re,subprocess,sys,tempfile
from pathlib import Path
source=os.environ['EXPENSES_SOURCE'];assert re.fullmatch('[a-f0-9]{40}',source)
root=Path(__file__).resolve().parents[2]
with tempfile.TemporaryDirectory(prefix='sintez-financial-verifier-') as folder:
    script=Path(folder)/'verify.py';script.write_bytes(subprocess.check_output(['git','-C',str(root),'show',source+':scripts/verify-sintez-release.py']))
    subprocess.run([sys.executable,str(Path(__file__).with_name('retry_network.py')),str(script),*sys.argv[1:]],check=True)
