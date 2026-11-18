import hashlib,importlib.util,json,re,tempfile,unittest
from pathlib import Path
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('sintez_package',ROOT/'scripts/sintez-package.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class UnifiedBuild(unittest.TestCase):
    def build(self,target='preview',suffix='a'):
        path=Path(self.temp.name)/suffix
        return path,module.package(path,'a'*40,target)
    def setUp(self):self.temp=tempfile.TemporaryDirectory()
    def tearDown(self):self.temp.cleanup()
    def test_live_pwa_identity_and_all_five_names_are_preserved(self):
        root,version=self.build('pwa');manifest=json.loads((root/'manifest.webmanifest').read_text())
        self.assertEqual({k:manifest[k] for k in ['id','start_url','scope','display']},{'id':'/kitchen-calculator-test/pwa/','start_url':'./?source=pwa','scope':'./','display':'standalone'})
        self.assertEqual(version['storage_names'],module.PWA_NAMES)
        self.assertEqual(manifest['name'],'СИНТЕЗ МЕРЫ');self.assertEqual(manifest['short_name'],'Синтез меры')
        self.assertEqual(version['presentation_key'],'kitchen-calculator-pwa-presentation-seen-v1')
    def test_review_stand_reuses_sintez_data_but_never_live_pwa_data(self):
        root,version=self.build();manifest=json.loads((root/'manifest.webmanifest').read_text())
        self.assertEqual(version['storage_names'],module.SINTEZ_NAMES)
        self.assertTrue(set(version['storage_names'].values()).isdisjoint(module.PWA_NAMES.values()))
        self.assertEqual(manifest['id'],'/kitchen-calculator-test/sintez-release/')
    def test_web_root_keeps_existing_root_names_and_does_not_register_a_worker(self):
        root,version=self.build('web');self.assertEqual(version['storage_names'],{k:v[1] for k,v in module.FILES.items()})
        self.assertFalse((root/'sw.js').exists());self.assertNotIn('manifest.webmanifest',(root/'index.html').read_text())
    def test_all_approved_icons_are_exact_originals_at_their_declared_sizes(self):
        hashes=json.loads((ROOT/'pwa/brand-hashes.json').read_text())
        for name,digest in hashes.items():self.assertEqual(hashlib.sha256((ROOT/'icons/sintez'/name).read_bytes()).hexdigest(),digest)
        root,_=self.build();manifest=json.loads((root/'manifest.webmanifest').read_text())
        self.assertEqual(len(manifest['icons']),4)
        for icon in manifest['icons']:
            with Image.open(root/icon['src']) as im:self.assertEqual(im.size,tuple(map(int,icon['sizes'].split('x'))))
        html=(root/'index.html').read_text();self.assertIn('apple-touch-icon',html);self.assertIn('favicon.ico',html)
    def test_complete_cache_is_reproducible_and_contains_no_user_backup(self):
        a,first=self.build(suffix='a');b,second=self.build(suffix='b');self.assertEqual(first,second)
        self.assertEqual((a/'sw.js').read_bytes(),(b/'sw.js').read_bytes())
        config=json.loads(re.search(r'const BUILD = (.*); // PWA_BUILD',(a/'sw.js').read_text())[1])
        self.assertEqual(config['revision'],first['revision'])
        self.assertEqual(len(config['assets']),66)
        self.assertIn('assets/sintez-matte.svg',first['files'])
        self.assertIn('presentation.html',first['files'])
        self.assertIn('js/sintez-entry-v2.js',first['files']);self.assertIn('assets/sintez-entry-v2.css',first['files'])
        self.assertEqual((a/'presentation.html').read_bytes(),(a/'index.html').read_bytes())
        self.assertTrue(all(not f['url'].endswith('.json') for f in config['assets']))
        for asset in config['assets']:self.assertEqual(hashlib.sha256((a/asset['url']).read_bytes()).hexdigest(),asset['sha256'])
        self.assertTrue(all('assets/sintez-intro/'+n+'.jpg' in first['files'] for n in ['01_intro','02_home','03_chef','04_business']))
    def test_namespace_binding_is_the_only_change_in_data_modules(self):
        for target in ['pwa','preview','web','modes','glass','showcase','domestic']:
            root,version=self.build(target,target)
            for kind,(file,old) in module.FILES.items():self.assertEqual((root/file).read_text().replace(version['storage_names'][kind],old),(ROOT/file).read_text())
            for file in ['js/app.js','js/calculations.js','js/photos.js','js/recipe-card-templates.js']:
                if file not in [x[0] for x in module.FILES.values()]:self.assertEqual((root/file).read_bytes(),(ROOT/file).read_bytes())
    def test_unsafe_external_and_parent_asset_paths_are_rejected(self):
        for path in ['../secret','/js/app.js','https://evil.invalid/x','//evil.invalid/x']:
            with self.assertRaises(ValueError):module.clean(path)
    def test_existing_worker_algorithm_has_no_forced_activation_or_database_deletion(self):
        worker=(ROOT/'pwa/worker-template.js').read_text()
        self.assertNotRegex(worker,r'\b(?:self\.)?skipWaiting\s*\(');self.assertNotRegex(worker,r'clients\.claim\s*\(')
        self.assertNotIn('deleteDatabase(',worker);self.assertNotIn('localStorage.clear',worker)
    def test_new_modes_stand_has_own_identity_and_the_same_existing_data(self):
        root,version=self.build('modes');manifest=json.loads((root/'manifest.webmanifest').read_text())
        self.assertEqual(manifest['id'],'/kitchen-calculator-test/sintez-modes/')
        self.assertEqual(version['storage_names'],module.SINTEZ_NAMES)
        self.assertEqual(version['presentation_key'],'kitchen-calculator-sintez-presentation-seen-v1')
        self.assertEqual(manifest['start_url'],'./?source=pwa');self.assertEqual(manifest['scope'],'./')

    def test_glass_stand_retains_data_identity_and_caches_lightweight_backgrounds(self):
        root,version=self.build('glass');manifest=json.loads((root/'manifest.webmanifest').read_text())
        self.assertEqual(manifest['id'],'/kitchen-calculator-test/sintez-glass/')
        self.assertEqual(version['storage_names'],module.SINTEZ_NAMES)
        self.assertEqual(version['presentation_key'],'kitchen-calculator-sintez-presentation-seen-v1')
        for file,budget in [('assets/sintez-glass-kitchen.webp',110000),('assets/sintez-glass-kitchen-mobile.webp',40000)]:
            self.assertIn(file,version['files']);self.assertLess((root/file).stat().st_size,budget)
        self.assertIn('data-default-kitchen-theme="graphite"',(root/'index.html').read_text())

    def test_card_stand_has_own_identity_and_reuses_the_same_test_data(self):
        root,version=self.build('showcase');manifest=json.loads((root/'manifest.webmanifest').read_text())
        self.assertEqual(manifest['id'],'/kitchen-calculator-test/sintez-card/')
        self.assertEqual(version['storage_names'],module.SINTEZ_NAMES)
        self.assertEqual(version['presentation_key'],'kitchen-calculator-sintez-presentation-seen-v1')
        self.assertIn('assets/recipe-showcase.css',version['files']);self.assertIn('js/recipe-showcase.js',version['files'])

    def test_domestic_stand_uses_one_existing_database_and_separate_pwa_identity(self):
        root,version=self.build('domestic');manifest=json.loads((root/'manifest.webmanifest').read_text())
        self.assertEqual(manifest['id'],'/kitchen-calculator-test/sintez-home-work/')
        self.assertEqual(version['storage_names'],module.SINTEZ_NAMES)
        self.assertEqual(version['presentation_key'],'kitchen-calculator-sintez-presentation-seen-v1')
        self.assertIn('js/home-workspace.js',version['files']);self.assertIn('assets/home-workspace.css',version['files'])

if __name__=='__main__':unittest.main()
