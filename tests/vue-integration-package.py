"""Verify the assembled ZIP, isolation and runtime parity with the approved Vue build."""
import argparse
import hashlib
import json
from pathlib import Path
from zipfile import ZipFile


def verify(reference, candidate):
    old, new = [json.loads((root / 'pwa-version.json').read_bytes()) for root in (reference, candidate)]
    assert old['target'] == 'vue' and new['target'] == 'vue-integration'
    assert new['manifest_id'] == '/kitchen-calculator-test/sintez-vue3/'
    assert old['files'].keys() == new['files'].keys()
    old_names = [old['presentation_key'], *old['storage_names'].values()]
    new_names = [new['presentation_key'], *new['storage_names'].values()]
    assert len(set(new_names)) == 6 and set(new_names).isdisjoint(old_names)
    assert all(name.startswith('kitchen-calculator-vue-integration-') for name in new_names)
    with ZipFile(candidate / 'sintez-mery-vue3.zip') as archive:
        expected = set(new['files']) | {'pwa-version.json'}
        assert len(archive.namelist()) == len(expected) and set(archive.namelist()) == expected
        for name in sorted(expected):
            data = (candidate / name).read_bytes()
            assert archive.read(name) == data, name
            if name in new['files']:
                assert new['files'][name] == hashlib.sha256(data).hexdigest(), name
            if name in {'pwa-version.json', 'js/build-info.js', 'index.html', 'presentation.html',
                        'sw.js', 'manifest.webmanifest'}:
                continue  # generated metadata, scope and cache manifest differ
            assert data.replace(b'-vue-integration-', b'-vue-experiment-') == (reference / name).read_bytes(), name
    print(f"{len(expected)} files verified in ZIP; separate PWA and six storage names; runtime matches PR45")


if __name__ == '__main__':
    args = argparse.ArgumentParser(description=__doc__)
    args.add_argument('reference', type=Path)
    args.add_argument('candidate', type=Path)
    opts = args.parse_args()
    verify(opts.reference, opts.candidate)
