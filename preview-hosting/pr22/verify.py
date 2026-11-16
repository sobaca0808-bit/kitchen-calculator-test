"""Verify actual HTTPS bytes, including the unchanged root and approved /preview/."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import time
from urllib.request import Request, urlopen

BASE = 'https://sobaca0808-bit.github.io/kitchen-calculator-test/'

def verify(proof, phase):
    expected = dict(proof['protected_https'])
    if phase == 'after':
        expected.update(proof['candidate_https'])
    def check(item):
        name, digest = item
        request = Request(BASE + name + '?pr22-check=' + proof['source_commit'], headers={'Cache-Control': 'no-cache', 'User-Agent': 'Kitchen-PR22-Verification'})
        with urlopen(request, timeout=30) as response:
            assert response.status == 200 and response.url.startswith(BASE), name
            assert hashlib.sha256(response.read()).hexdigest() == digest, 'Unexpected HTTPS bytes: ' + name
    with ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(check, expected.items()))
    return len(expected)

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('proof')
    parser.add_argument('--phase', choices=['before', 'after'], required=True)
    args = parser.parse_args()
    proof = json.load(open(args.proof))
    for attempt in range(1 if args.phase == 'before' else 8):
        try:
            count = verify(proof, args.phase)
            print(json.dumps({'phase': args.phase, 'verified_https_files': count, 'root_and_preview_unchanged': True, 'test_url': proof['url']}))
            break
        except Exception:
            if args.phase == 'before' or attempt == 7:
                raise
            time.sleep(8)
