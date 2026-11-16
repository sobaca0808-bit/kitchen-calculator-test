import hashlib
import importlib.util
import io
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.parse import urlsplit

spec = importlib.util.spec_from_file_location('release_verifier', Path(__file__).resolve().parents[1] / 'scripts/verify-release.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
digest = lambda value: hashlib.sha256(value).hexdigest()

class ReleaseVerification(unittest.TestCase):
    def setUp(self):
        self.old = {'index.html': b'old', 'old.js': b'old JS'}
        self.new = {'index.html': b'release', 'app.js': b'approved JS', 'release-version.json': b'correct version'}
        self.raw = {'index.html': b'approved raw main', 'app.js': b'approved JS'}
        self.tests = {'final/index.html': b'final', 'preview/index.html': b'preview'}
        self.proof = {'url': 'https://example.invalid/', 'source_commit': 'a' * 40,
                      'previous_root_https': {k:digest(v) for k,v in self.old.items()},
                      'release_https': {k:digest(v) for k,v in self.new.items()},
                      'approved_source_https': {k:digest(v) for k,v in self.raw.items()},
                      'preserved_test_https': {k:digest(v) for k,v in self.tests.items()}}

    def verify(self, files, phase='before'):
        def read(request, timeout):
            path = urlsplit(request.full_url).path.lstrip('/')
            if path not in files: raise HTTPError(request.full_url, 404, 'missing', {}, None)
            response = io.BytesIO(files[path]);response.status = 200;response.url = request.full_url
            return response
        with patch.object(module, 'urlopen', read):
            return module.verify(self.proof, phase)

    def test_old_complete_site(self):
        self.assertEqual(self.verify({**self.old, **self.tests})['mode'], 'previous-main')

    def test_same_release_can_be_retried(self):
        self.assertEqual(self.verify({**self.new, **self.tests})['mode'], 'same-release')

    def test_known_raw_main_can_restore_absent_sandboxes(self):
        result = self.verify(self.raw)
        self.assertEqual(result['mode'], 'approved-raw-main')
        self.assertEqual(result['missing_test_files'], 2)

    def test_existing_modified_sandbox_is_never_overwritten(self):
        with self.assertRaises(AssertionError):
            self.verify({**self.raw, 'final/index.html': b'unknown changed content'})

    def test_unknown_application_is_rejected(self):
        with self.assertRaises(AssertionError):
            self.verify({'index.html': b'unknown', **self.tests})

    def test_after_release_requires_every_sandbox(self):
        with self.assertRaises(HTTPError): self.verify(self.new, 'after')
        result = self.verify({**self.new, **self.tests}, 'after')
        self.assertEqual(result['verified_https_files'], 5)
        self.assertEqual(result['missing_test_files'], 0)

if __name__ == '__main__': unittest.main()
