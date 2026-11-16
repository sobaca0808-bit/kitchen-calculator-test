const test=require('node:test');
const assert=require('node:assert/strict');
const A=require('../js/appearance.js');

test('approved berry stylesheet and watercolor are byte-for-byte unchanged',()=>{
  const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
  for(const [file,hash]of [['assets/warm-kitchen.css','f3e073c418d12c81619dc09130ecba0c6cdad46cf6214b23ae9e6466a7739002'],['assets/watercolor-kitchen.webp','2ae2b7c5b48a90554f687e1d3f3326ff7fc22b6cce23861ab31762345711e6ec']])assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'..',file))).digest('hex'),hash);
});

test('appearance has three fixed safe choices and berry is the default',()=>{
  assert.deepEqual(Object.keys(A.THEMES),['berry','graphite','sage']);assert.equal(A.read({getItem:()=>null}).theme,'berry');
  for(const value of ['graphite','sage','berry'])assert(A.valid(value));
  for(const value of ['__proto__','constructor','<script>','dark',{},null,4])assert(!A.valid(value));
});
test('appearance reads only its own preference, leaving recipes and drafts alone',()=>{
  const calls=[];const storage={getItem(key){calls.push(key);return 'sage';}};
  assert.deepEqual(A.read(storage),{theme:'sage',error:null});assert.deepEqual(calls,[A.KEY]);
});
test('unknown persisted appearance falls back without deleting or rewriting it',()=>{
  let writes=0;const storage={getItem:()=>'{broken preference',setItem(){writes++;},removeItem(){throw Error('Must not delete');}};
  assert.equal(A.read(storage).theme,'berry');assert.equal(writes,0);
});
test('denied preference access remains a recoverable berry default',()=>{
  const r=A.read({getItem(){throw Error('Denied');}});assert.equal(r.theme,'berry');assert(r.error);
});
test('all three preferences save independently of the recipe database',()=>{
  const entries=new Map([['kitchen-calculator-pr2-browser-test-v1','protected recipes'],['kitchen-calculator-pr2-browser-drafts-v1','protected drafts']]);
  const storage={getItem:key=>entries.get(key),setItem:(key,value)=>entries.set(key,value)};
  for(const theme of Object.keys(A.THEMES)){assert(A.save(theme,storage).ok);assert.equal(A.read(storage).theme,theme);}
  assert.equal(entries.get('kitchen-calculator-pr2-browser-test-v1'),'protected recipes');assert.equal(entries.get('kitchen-calculator-pr2-browser-drafts-v1'),'protected drafts');assert.equal(entries.size,3);
});
test('invalid choices never write to storage',()=>{
  assert.equal(A.save('__proto__',{setItem(){throw Error('Must not write');}}).ok,false);
});
test('quota failures preserve the previous saved choice and every database entry',()=>{
  const entries=new Map([[A.KEY,'berry'],['kitchen-calculator-v1','protected']]);
  const storage={getItem:key=>entries.get(key),setItem(){throw Error('Quota');}};
  assert.equal(A.save('graphite',storage).ok,false);assert.equal(entries.get(A.KEY),'berry');assert.equal(entries.get('kitchen-calculator-v1'),'protected');
});
test('appearance is not part of the recipe JSON format',()=>{
  const S=require('../js/storage.js'),Seed=require('../js/seed.js');const data=S.stringify(Seed.create());assert(!data.includes(A.KEY));assert(!data.includes('kitchen-appearance'));
});
