"""Verify the previous root before release and the new root after; all tests stay fixed."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import time
from urllib.request import Request, urlopen

def verify(proof, phase):
    expected = {**proof['preserved_test_https'], **proof['previous_root_https' if phase == 'before' else 'release_https']}
    def check(item):
        file, digest = item
        request = Request(proof['url'] + file + '?release-check=' + proof['source_commit'],
                          headers={'Cache-Control': 'no-cache', 'User-Agent': 'Kitchen-Release-Verification'})
        with urlopen(request, timeout=30) as response:
            assert response.status == 200 and response.url.startswith(proof['url']), file
            assert hashlib.sha256(response.read()).hexdigest() == digest, 'Unexpected HTTPS bytes: ' + file
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
            print(json.dumps({'phase': args.phase, 'verified_https_files': count,
                              'old_test_sites_unchanged': True, 'url': proof['url']}))
            break
        except Exception:
            if args.phase == 'before' or attempt == 7: raise
            time.sleep(8)
