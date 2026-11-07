const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

test('Page assets resolve within the GitHub Pages project path and exist in the root checkout',()=>{
  const root=path.resolve(__dirname,'..');
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const base=new URL('https://sobaca0808-bit.github.io/kitchen-calculator-test/');
  const references=[...html.matchAll(/<(?:script|link|a)\b[^>]*\b(?:src|href)=["']([^"']+)["']/gi)].map(match=>match[1]);
  assert(references.length>0,'The entry page has linked assets');
  for(const reference of references){
    assert(!reference.startsWith('/'),'Paths must be relative to the project folder: '+reference);
    const resolved=new URL(reference,base);
    assert.equal(resolved.origin,base.origin,'No external runtime dependency: '+reference);
    assert(resolved.pathname.startsWith(base.pathname),'Asset stays in the test site: '+reference);
    const relative=decodeURIComponent(resolved.pathname.slice(base.pathname.length));
    const file=path.resolve(root,relative);
    assert(file.startsWith(root+path.sep));
    assert(fs.statSync(file).isFile(),'Runtime asset exists: '+relative);
    assert(fs.statSync(file).size>0,'Runtime asset is not empty: '+relative);
  }
});
