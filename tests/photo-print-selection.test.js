'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Photos=require('../js/photos.js');

test('print selection addresses the requested photo positions without substituting another slot',()=>{
  assert.deepEqual(Photos.printSlots('none'),[]);
  assert.deepEqual(Photos.printSlots('first'),[0]);
  assert.deepEqual(Photos.printSlots('second'),[1]);
  assert.deepEqual(Photos.printSlots('both'),[0,1]);
});

test('invalid print selections fail explicitly, including inherited property names and coerced values',()=>{
  for(const selection of [undefined,null,true,0,1,'','all','FIRST','__proto__','constructor',[],{},new String('first')]) {
    assert.throws(()=>Photos.printSlots(selection),/фотографии для печати/);
  }
});

test('print selection does not retain mutable choices or modify saved photo references',()=>{
  const recipe={id:'dish',photoIds:['photo-first','photo-second']};
  const before=JSON.stringify(recipe);
  const chosen=Photos.printSlots('both');
  chosen.reverse();chosen.push(2);
  assert.deepEqual(Photos.printSlots('both'),[0,1]);
  assert.deepEqual(Photos.ids(recipe),['photo-first','photo-second']);
  assert.equal(JSON.stringify(recipe),before);
});
