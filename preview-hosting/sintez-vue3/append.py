"""Append the tested integration ZIP to the complete, verified prior Pages tree."""
import importlib.util
import json
from pathlib import Path
import shutil
import sys
from zipfile import ZipFile

spec = importlib.util.spec_from_file_location('vue_archive', Path(__file__).parents[1] / 'sintez-vue/assemble.py')
archive_tools = importlib.util.module_from_spec(spec)
spec.loader.exec_module(archive_tools)

folder = 'sintez-vue3'
zipname = 'sintez-mery-vue3.zip'


def append(previous_tar, previous_report, zip_path, site, report, source):
    previous = json.loads(previous_report.read_bytes())
    assert previous['source_commit'] == '75452956611dc18c627a48a422fb03a12eb83127'
    assert previous['url'] == archive_tools.URL
    preserved = {**previous['preserved_https'], **previous['release_https']}
    assert 'sintez-vue/sintez-mery-vue.zip' in preserved and len(preserved) == 1223
    archive_tools.restore_archive(previous_tar, site)
    before = archive_tools.tree(site)
    assert all(before.get(name) == digest for name, digest in preserved.items())
    target = site / folder
    target.mkdir()  # refuse to update any existing route
    with ZipFile(zip_path) as package:
        version = json.loads(package.read('pwa-version.json'))
        assert version['source_commit'] == source and version['target'] == 'vue-integration'
        assert version['manifest_id'] == '/kitchen-calculator-test/sintez-vue3/'
        assert all(key.startswith('kitchen-calculator-vue-integration-') for key in
                   [*version['storage_names'].values(), version['presentation_key']])
        expected = set(version['files']) | {'pwa-version.json'}
        assert zipname not in expected and len(package.namelist()) == len(expected)
        assert set(package.namelist()) == expected
        for name in sorted(expected):
            path = archive_tools.safe_path(target, name)
            path.parent.mkdir(parents=True, exist_ok=True)
            with package.open(name) as src, path.open('xb') as dest:
                shutil.copyfileobj(src, dest)
            if name != 'pwa-version.json':
                assert archive_tools.sha(path) == version['files'][name], name
    shutil.copyfile(zip_path, target / zipname)
    added = {folder + '/' + n: h for n, h in archive_tools.tree(target).items()}
    assert not before.keys() & added.keys()
    assert archive_tools.tree(site) == {**before, **added}
    report.write_text(json.dumps(dict(source_commit=source, url=previous['url'], before_https=preserved,
        preserved_https=preserved, release_https=added, zip_sha256=archive_tools.sha(zip_path)), indent=2))


if __name__ == '__main__':
    append(*(Path(arg) for arg in sys.argv[1:6]), sys.argv[6])
