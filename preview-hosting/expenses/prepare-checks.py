"""Only source tests go into the disposable validation directory; no browser data."""
import argparse
import json
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('source')
    args = parser.parse_args()
    output = Path(tempfile.mkdtemp(prefix='expenses-published-checks-'))
    for file in ['tests/establishment-expenses.browser.test.js', 'tests/helpers/runtime-server.js']:
        target = output / file
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(subprocess.check_output(['git', '-C', str(ROOT), 'show', args.source + ':' + file]))
    print(json.dumps({'directory': str(output), 'source_commit': args.source}))
