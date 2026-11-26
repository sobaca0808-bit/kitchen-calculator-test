"""Run the source browser suite against a uniquely named PR43 stand."""
import argparse
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

parser = argparse.ArgumentParser()
parser.add_argument('source', type=Path)
parser.add_argument('--runtime', type=Path, required=True)
parser.add_argument('--live', action='store_true')
parser.add_argument('--report', type=Path, required=True)
args = parser.parse_args()

with tempfile.TemporaryDirectory(prefix='sintez-pr43-browser-') as temp:
    work = Path(temp)
    for directory in ('js', 'tests'):
        shutil.copytree(args.source / directory, work / directory)
    test_file = work / 'tests/ingredient-search.browser.test.js'
    test = test_file.read_text().replace('kitchen-calculator-expenses-', 'kitchen-calculator-pr43-')
    test = test.replace("localStorage.setItem('kitchen-calculator-v1','PROTECTED production marker');",
        """localStorage.setItem('kitchen-calculator-v1','PROTECTED production marker');
    localStorage.setItem('kitchen-calculator-expenses-preview-v1','PROTECTED previous review marker');""")
    check = "      assert.equal(await page.evaluate(()=>localStorage.getItem('kitchen-calculator-v1')),'PROTECTED production marker');"
    assert test.count(check) == 1
    test = test.replace(check, check + """
      assert.equal(await page.evaluate(()=>localStorage.getItem('kitchen-calculator-expenses-preview-v1')),'PROTECTED previous review marker');
      assert.equal(await page.evaluate(()=>KitchenBuildInfo.source), 'c769f3e5f79d9385a6653de21bebd0a9cb7c0412');
      await page.reload();
      await ready(page);
      assert.equal(await page.evaluate(()=>KitchenStorage.load().data.recipes.find(r=>r.id==='bowl').ingredients[0].refId),'rice');
""")
    if args.live:
        start = 'const server=await start(root,{home:true});'
        assert test.count(start) == 1
        test = test.replace(start, "const server={url:'https://sobaca0808-bit.github.io/kitchen-calculator-test/sintez-pr43/',close:async()=>{}};")
        test = test.replace("      assert.deepEqual(errors,[]);passed++;", """      await page.screenshot({path:require('node:path').join(require('node:path').dirname(process.env.INGREDIENT_SEARCH_REPORT), width+'-'+mode+'.png')});
      assert.deepEqual(errors,[]);passed++;""")
    test_file.write_text(test)
    subprocess.run(['node', test_file], check=True, env={**os.environ,
        'INGREDIENT_SEARCH_RUNTIME_ROOT': str(args.runtime), 'INGREDIENT_SEARCH_REPORT': str(args.report)})
