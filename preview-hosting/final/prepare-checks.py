"""Run existing expense regressions on the final URL, with no app response overrides."""
import argparse
import json
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('source')
    args = parser.parse_args()
    output = Path(tempfile.mkdtemp(prefix='final-published-checks-'))
    for file in ['tests/establishment-expenses.browser.test.js', 'tests/helpers/runtime-server.js']:
        target = output / file
        target.parent.mkdir(parents=True, exist_ok=True)
        content = subprocess.check_output(['git', '-C', str(ROOT), 'show', args.source + ':' + file]).decode()
        if file.endswith('establishment-expenses.browser.test.js'):
            old = "url==='https://sobaca0808-bit.github.io/kitchen-calculator-test/expense-toggle/'"
            assert content.count(old) == 1
            content = content.replace(old, old + "||url==='https://sobaca0808-bit.github.io/kitchen-calculator-test/final/'")
        target.write_text(content)
    print(json.dumps({'directory': str(output), 'source_commit': args.source,
                      'test_edits': 'Add only the final HTTPS URL to the test safety allowlist.'}))
