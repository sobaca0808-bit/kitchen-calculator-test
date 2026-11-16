"""Serialize our artifact deployment after GitHub's automatic legacy publisher."""
import argparse
import json
import os
import subprocess
import time

REPOSITORY = 'sobaca0808-bit/kitchen-calculator-test'

def api(path):
    return json.loads(subprocess.check_output(['gh', 'api', path], text=True))

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--sha', required=True)
    args = parser.parse_args()
    assert os.environ.get('GITHUB_REPOSITORY') == REPOSITORY
    mode = api('repos/' + REPOSITORY + '/pages')['build_type']
    print('Pages build type:', mode, flush=True)
    if mode == 'legacy':
        for attempt in range(40):
            runs = api('repos/' + REPOSITORY + '/actions/runs?head_sha=' + args.sha + '&per_page=100')['workflow_runs']
            publishers = [run for run in runs if run['head_sha'] == args.sha and
                          (run.get('path', '').startswith('dynamic/pages/') or run['name'] == 'pages build and deployment')]
            if publishers and all(run['status'] == 'completed' for run in publishers):
                print(json.dumps({'legacy_publishers_finished': [run['id'] for run in publishers],
                                  'sha': args.sha}), flush=True)
                break
            print('Waiting for the legacy publisher of this exact commit to finish.', flush=True)
            time.sleep(15)
        else:
            raise RuntimeError('The legacy publisher did not finish; our deployment was not started.')
    else:
        assert mode == 'workflow', 'Unknown Pages build type'
        print('Only the explicit Pages workflow is enabled.', flush=True)
