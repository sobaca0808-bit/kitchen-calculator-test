import importlib.util
import json
import re
import shutil
import tempfile
import unittest
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('pwa_builder', ROOT/'scripts/build-pwa.py')
module = importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class PWABuild(unittest.TestCase):
    def copy(self, root):
        for file in module.runtime(ROOT)+['sw.js']:
            target=root/file;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(ROOT/file,target)

    def test_scope_and_maskable_icons(self):
        manifest=json.loads((ROOT/'manifest.webmanifest').read_text())
        self.assertEqual(manifest['id'],'./');self.assertEqual(manifest['scope'],'./')
        for icon in manifest['icons']:
            image=Image.open(ROOT/icon['src']);self.assertEqual(image.size,tuple(map(int,icon['sizes'].split('x'))))
            if icon['purpose']=='maskable':
                self.assertEqual(image.convert('RGB').getpixel((0,0)),(166,91,119))
                for y in range(image.height):
                    for x in range(image.width):
                        r,g,b=image.getpixel((x,y))[:3]
                        if min(r,g,b)>230:self.assertLessEqual((x-256)**2+(y-256)**2,(512*.4)**2)

    def test_rejects_parent_absolute_and_external_assets(self):
        for value in ['../js/app.js','/js/app.js','https://example.com/a.js','//example.com/a.js']:
            with self.assertRaises(ValueError):module.clean_path(value)

    def test_complete_static_shell_is_reproducible(self):
        with tempfile.TemporaryDirectory() as folder:
            a,b=Path(folder)/'a',Path(folder)/'b';a.mkdir();b.mkdir();self.copy(a);self.copy(b)
            first,second=module.build(a),module.build(b)
            self.assertEqual(first,second);self.assertEqual((a/'sw.js').read_bytes(),(b/'sw.js').read_bytes())
            self.assertEqual(first['offline_assets'],42)
            self.assertIn('data-pwa-build="'+first['revision']+'"',(a/'index.html').read_text())
            self.assertNotIn('sw.js',[item['url'] for item in json.loads(re.search(r'const BUILD = (.*); // PWA_BUILD',(a/'sw.js').read_text())[1])['assets']])

    def test_missing_asset_aborts_packaging(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);self.copy(root);(root/'icons/icon-512.png').unlink()
            with self.assertRaises(AssertionError):module.build(root)

    def test_changed_shell_changes_revision(self):
        with tempfile.TemporaryDirectory() as folder:
            a,b=Path(folder)/'a',Path(folder)/'b';a.mkdir();b.mkdir();self.copy(a);self.copy(b)
            (b/'assets/pwa.css').write_text((b/'assets/pwa.css').read_text()+'\n/* changed */\n')
            self.assertNotEqual(module.build(a)['revision'],module.build(b)['revision'])

    def test_all_offline_hashes_match_final_files_and_no_user_data_is_collected(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);self.copy(root);result=module.build(root)
            for file,digest in result['files'].items():self.assertEqual(module.sha((root/file).read_bytes()),digest)
            self.assertFalse(any(file.endswith('.json') for file in result['files']))
            for file in ['js/storage.js','js/drafts.js','js/photos.js','js/import-transaction.js','js/appearance.js']:
                self.assertEqual((root/file).read_bytes(),(ROOT/file).read_bytes())

if __name__=='__main__':unittest.main()
