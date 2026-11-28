"""Build the standalone Vue site and its downloadable ZIP from the same files."""
import importlib.util
import json
from pathlib import Path
import subprocess
from tempfile import TemporaryDirectory
from zipfile import ZipFile, ZIP_DEFLATED

spec = importlib.util.spec_from_file_location('sintez_package', Path(__file__).with_name('sintez-package.py'))
package = importlib.util.module_from_spec(spec)
spec.loader.exec_module(package)
ZIP_NAME = 'sintez-mery-vue3.zip'


def build():
    root = package.ROOT
    destination = root / 'dist'
    if destination.exists():
        # Replace only a previous result of this command. Keep unrelated files safe.
        version = json.loads((destination / 'pwa-version.json').read_text())
        expected = set(version['files']) | {'pwa-version.json', ZIP_NAME}
        actual = {p.relative_to(destination).as_posix() for p in destination.rglob('*') if p.is_file()}
        if version['target'] != 'vue-integration' or actual != expected:
            raise ValueError('dist contains other files; choose an empty checkout or move dist first.')
    source = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip()
    with TemporaryDirectory(dir=root) as temporary:
        new = Path(temporary) / 'site'
        previous = Path(temporary) / 'previous'
        version = package.package(new, source, 'vue-integration')
        with ZipFile(new / ZIP_NAME, 'x', ZIP_DEFLATED) as archive:
            for name in sorted(set(version['files']) | {'pwa-version.json'}):
                archive.write(new / name, name)
        if destination.exists():
            destination.rename(previous)
        try:
            new.rename(destination)
        except OSError:
            if previous.exists():
                previous.rename(destination)
            raise
    print(f"Vue 3 {source}: {destination / ZIP_NAME}")


if __name__ == '__main__':
    build()
