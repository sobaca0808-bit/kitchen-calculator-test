"""Strict verification for the proposed release; unknown/partial sites stop it."""
import argparse,hashlib,json,time
from concurrent.futures import ThreadPoolExecutor
from urllib.request import Request,urlopen
def verify(proof,phase):
    expected=proof['before_https'] if phase=='before' else {**proof['preserved_https'],**proof['release_https']}
    def check(item):
        path,digest=item
        try:
            with urlopen(Request(proof['url']+path+'?sintez-release-check='+proof['source_commit'],headers={'Cache-Control':'no-cache'}),timeout=30) as response:
                assert response.status==200 and response.url.startswith(proof['url']),path
                assert hashlib.sha256(response.read()).hexdigest()==digest,'Changed resource: '+path
        except Exception as error:raise RuntimeError(path+': '+str(error)) from error
    with ThreadPoolExecutor(max_workers=8) as pool:list(pool.map(check,expected.items()))
    return len(expected)
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('proof');p.add_argument('--phase',choices=['before','after'],required=True);a=p.parse_args();proof=json.load(open(a.proof))
    for attempt in range(3 if a.phase=='before' else 8):
        try:print(json.dumps({'phase':a.phase,'verified_https':verify(proof,a.phase),'no_unknown_or_missing_sites_accepted':True}));break
        except Exception:
            if attempt==(2 if a.phase=='before' else 7):raise
            time.sleep(8)
