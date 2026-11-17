"""Run the verifier from the exact checked source, without extra dependencies."""
import os, re, subprocess, sys, tempfile
from pathlib import Path
source = os.environ['UNIFIED_SOURCE']
assert re.fullmatch('[a-f0-9]{40}', source), 'An exact checked SHA is required'
root = Path(__file__).resolve().parents[2]
with tempfile.TemporaryDirectory(prefix='sintez-public-verifier-') as folder:
    verifier = Path(folder) / 'verify.py'
    verifier.write_bytes(subprocess.check_output(['git', '-C', str(root), 'show', source + ':scripts/verify-sintez-release.py']))
    subprocess.run([sys.executable, str(verifier), *sys.argv[1:]], check=True)
