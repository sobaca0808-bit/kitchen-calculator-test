"""Keep every PR 30 runtime byte and all four supplied JPEG originals intact."""
from pathlib import Path
import hashlib, json, re, subprocess

ROOT = Path(__file__).resolve().parents[1]
BASE = '871155948134353c4219e6c1aa4dcb039848ea68'
def original(name):
    return subprocess.check_output(['git', '-C', str(ROOT), 'show', BASE + ':' + name])

files = subprocess.check_output(['git', '-C', str(ROOT), 'ls-tree', '-r', '--name-only', BASE,
                                 'js', 'assets', 'styles.css', 'welcome.html'], text=True).splitlines()
for name in files:
    assert (ROOT / name).read_bytes() == original(name), 'PR 30 runtime changed: ' + name
html = (ROOT / 'index.html').read_text()
html = html.replace('  <link rel="stylesheet" href="assets/sintez-intro.css">\n', '')
html = html.replace('  <script defer src="js/sintez-intro.js"></script>\n', '')
html = re.sub(r'(?m)^        <section class="sintez-setting"><h2>Знакомство с приложением</h2>.*?</section>\n', '', html)
html = re.sub(r'(?ms)^  <!-- SINTEZ:PRESENTATION -->\n.*?^  <!-- /SINTEZ:PRESENTATION -->\n', '', html)
assert html.encode() == original('index.html'), 'Unexpected changes outside presentation additions'
photos = {
    '01_intro.jpg': 'f416cef58b53f3d8773b2e43b690f06a2254adfe5270c707440d07a55369e19f',
    '02_home.jpg': 'bfb18646af9e617e6c7f41aad1ac470a716cb5aed1eec5a0163a2fc22681bcfe',
    '03_chef.jpg': '1b9ac9a6a7d8d00a482528fe70618004fdab77b8d88c167776f094ea520c86a0',
    '04_business.jpg': 'dd8ca30fc7599da340ad42c561032e1da5383eeea9dc85da1cc1456dac40cf8a',
}
for name, digest in photos.items():
    assert hashlib.sha256((ROOT / 'assets/sintez-intro' / name).read_bytes()).hexdigest() == digest, name
print(json.dumps({'base': BASE, 'unchanged_runtime_files': len(files), 'approved_photos': photos,
                  'existing_storage_schemas_keys_calculations_and_print_unchanged': True}, indent=2))
