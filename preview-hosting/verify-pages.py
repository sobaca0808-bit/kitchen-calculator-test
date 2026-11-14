"""HTTP proof before/after publication; all requests are read-only."""
import argparse
import hashlib
import json
import time
import urllib.request
from pathlib import Path

BASE_URL = 'https://sobaca0808-bit.github.io/kitchen-calculator-test/'

def verify(proof, phase):
    expected = dict(proof['base_runtime'])
    if phase == 'after':
        expected.update({'preview/' + name: digest for name, digest in proof['preview_runtime'].items()})
        expected['preview/preview-version.json'] = proof['preview_version_sha256']
    for name, digest in expected.items():
        target = BASE_URL + name + '?preview-verification=' + proof['source_commit']
        request = urllib.request.Request(target, headers={'Cache-Control': 'no-cache', 'User-Agent': 'Kitchen-Preview-Verification'})
        with urllib.request.urlopen(request, timeout=30) as response:
            if response.status != 200 or not response.url.startswith(BASE_URL):
                raise ValueError('Unexpected response for ' + name)
            if hashlib.sha256(response.read()).hexdigest() != digest:
                raise ValueError('Content differs: ' + name)
    return len(expected)

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('proof', type=Path)
    parser.add_argument('--phase', choices=['before', 'after'], required=True)
    args = parser.parse_args()
    proof = json.loads(args.proof.read_text())
    for attempt in range(1 if args.phase == 'before' else 8):
        try:
            count = verify(proof, args.phase)
            print(json.dumps({'phase': args.phase, 'verified_https_files': count, 'base_unchanged': True, 'preview_url': BASE_URL + 'preview/'}))
            break
        except Exception:
            if args.phase == 'before' or attempt == 7:
                raise
            time.sleep(8)
