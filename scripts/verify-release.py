"""Verify the previous root before release and the new root after; all tests stay fixed."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import time
from urllib.error import HTTPError
from urllib.request import Request, urlopen

def check_files(proof, expected, allow_missing=False):
    def check(item):
        file, digest = item
        request = Request(proof['url'] + file + '?release-check=' + proof['source_commit'],
                          headers={'Cache-Control': 'no-cache', 'User-Agent': 'Kitchen-Release-Verification'})
        try:
            with urlopen(request, timeout=30) as response:
                assert response.status == 200 and response.url.startswith(proof['url']), file
                assert hashlib.sha256(response.read()).hexdigest() == digest, 'Unexpected HTTPS bytes: ' + file
                return 1
        except HTTPError as error:
            if allow_missing and error.code == 404: return 0
            raise
    with ThreadPoolExecutor(max_workers=8) as pool:
        found = sum(pool.map(check, expected.items()))
    return found, len(expected) - found

def verify(proof, phase):
    protected = proof['preserved_test_https']
    pwa = proof['restored_pwa_https']
    if phase == 'after':
        found, missing = check_files(proof, {**protected, **pwa, **proof['release_https']})
        return {'verified_https_files': found, 'missing_test_files': missing,
                'missing_pwa_files': missing, 'mode': 'published-release'}
    # GitHub's legacy branch publisher may already have exposed the exact approved
    # raw main and removed sandbox directories. Recognize only those known bytes;
    # never accept changed existing sandbox files or an unknown root application.
    for mode, expected, allow_missing in [
        ('previous-main', proof['previous_root_https'], False),
        ('same-release', proof['release_https'], False),
        ('approved-raw-main', proof['approved_source_https'], True),
    ]:
        try:
            root_found, _ = check_files(proof, expected)
        except (HTTPError, AssertionError):
            continue
        found, missing = check_files(proof, protected, allow_missing=allow_missing)
        # The previous release may have removed the PWA entirely. Accept either
        # the complete pinned build or an entirely absent build, never a partial
        # or altered set of PWA files.
        pwa_found, pwa_missing = check_files(proof, pwa, allow_missing=True)
        assert pwa_found == 0 or pwa_missing == 0, 'Partial PWA publication'
        return {'verified_https_files': root_found + found + pwa_found,
                'missing_test_files': missing, 'missing_pwa_files': pwa_missing,
                'mode': mode}
    raise AssertionError('The current root does not match a known approved release; publication stopped.')

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('proof')
    parser.add_argument('--phase', choices=['before', 'after'], required=True)
    args = parser.parse_args()
    proof = json.load(open(args.proof))
    for attempt in range(1 if args.phase == 'before' else 8):
        try:
            result = verify(proof, args.phase)
            print(json.dumps({'phase': args.phase, **result,
                              'old_test_sites_unchanged': result['missing_test_files'] == 0,
                              'pwa_complete': result['missing_pwa_files'] == 0, 'url': proof['url']}))
            break
        except Exception:
            if args.phase == 'before' or attempt == 7: raise
            time.sleep(8)
