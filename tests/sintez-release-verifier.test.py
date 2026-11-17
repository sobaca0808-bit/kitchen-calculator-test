import importlib.util,hashlib,io,unittest
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError
spec=importlib.util.spec_from_file_location('v',Path(__file__).resolve().parents[1]/'scripts/verify-sintez-release.py');v=importlib.util.module_from_spec(spec);spec.loader.exec_module(v)
class StrictRelease(unittest.TestCase):
    def setUp(self):
        h=lambda b:hashlib.sha256(b).hexdigest()
        self.before={'index.html':b'old','pwa/index.html':b'old pwa','sintez/index.html':b'test','sintez-intro/index.html':b'intro','sintez-release/index.html':b'candidate'}
        self.after={**self.before,'index.html':b'new','pwa/index.html':b'new pwa'}
        self.proof={'url':'https://example.invalid/','source_commit':'a'*40,'before_https':{k:h(b) for k,b in self.before.items()},'preserved_https':{k:h(b) for k,b in self.before.items() if k not in ['index.html','pwa/index.html']},'release_https':{k:h(self.after[k]) for k in ['index.html','pwa/index.html']}}
    def check(self,files,phase):
        def read(request,timeout):
            name=request.full_url.split('example.invalid/')[1].split('?')[0]
            if name not in files:raise HTTPError(request.full_url,404,'missing',{},None)
            r=io.BytesIO(files[name]);r.status=200;r.url=request.full_url;return r
        with patch.object(v,'urlopen',read):return v.verify(self.proof,phase)
    def test_complete_before_and_after(self):self.assertEqual(self.check(self.before,'before'),5);self.assertEqual(self.check(self.after,'after'),5)
    def test_changed_existing_pwa_stops_publication(self):
        with self.assertRaises(RuntimeError):self.check({**self.before,'pwa/index.html':b'unknown'},'before')
    def test_unknown_root_stops_publication(self):
        with self.assertRaises(RuntimeError):self.check({**self.before,'index.html':b'unknown'},'before')
    def test_missing_old_stand_is_never_accepted(self):
        with self.assertRaises(RuntimeError):self.check({k:b for k,b in self.before.items() if k!='sintez-intro/index.html'},'before')
    def test_every_old_link_required_after_release(self):
        with self.assertRaises(RuntimeError):self.check({k:b for k,b in self.after.items() if k!='sintez/index.html'},'after')
    def test_changed_frozen_preview_is_never_overwritten(self):
        with self.assertRaises(RuntimeError):self.check({**self.before,'sintez-release/index.html':b'unknown'},'before')
if __name__=='__main__':unittest.main()
