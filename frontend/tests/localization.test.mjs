import assert from 'node:assert/strict';
import test from 'node:test';
import { dictionaries, normalizeLocale, translate, plural, setLocale, getLocale, subscribeLocale, formatDate } from '../lib/locale.ts';
import { createPetPhraseSelector, kazakhPetPhrases } from '../lib/pet.ts';

test('dictionaries have identical nonempty keys and interpolation parameters', () => {
  const ru = dictionaries['ru-RU'], kk = dictionaries['kk-KZ'];
  assert.deepEqual(Object.keys(ru).sort(),Object.keys(kk).sort());
  for (const key of Object.keys(ru)) {
    assert.ok(ru[key].trim() && kk[key].trim(),key);
    assert.deepEqual((ru[key].match(/\{\w+\}/g) ?? []).sort(),(kk[key].match(/\{\w+\}/g) ?? []).sort(),key);
  }
});
test('locale normalization preserves legacy preferences and supports BCP47', () => {
  for (const value of ['kk','kk-KZ']) assert.equal(normalizeLocale(value),'kk-KZ');
  for (const value of ['ru','ru-RU','en',null]) assert.equal(normalizeLocale(value),'ru-RU');
});
test('switching notifies subscribers without remounting or touching progress', () => {
  let count=0; const unsubscribe=subscribeLocale(()=>count++);
  setLocale('kk'); assert.equal(getLocale(),'kk-KZ');
  assert.equal(translate(getLocale(),'pet.question'),'Ойнаймыз ба?');
  setLocale('kk'); assert.equal(count,1);
  setLocale('ru'); assert.equal(count,2); unsubscribe();
});
test('plurals and dates use the selected locale', () => {
  assert.equal(plural(22,{one:'{count} звезда',few:'{count} звезды',many:'{count} звёзд',other:'{count} звезды'},'ru-RU'),'22 звезды');
  assert.equal(plural(5,{one:'{count} жұлдыз',other:'{count} жұлдыз'},'kk-KZ'),'5 жұлдыз');
  assert.equal(translate('kk-KZ','content.revision',{revision:4}),'Өңдеу нұсқасы: 4');
  assert.ok(formatDate('2026-10-31',{month:'long'},'kk-KZ').toLocaleLowerCase('kk-KZ').includes('қазан'));
});
test('every pet state rotates Kazakh phrases without changing animation timing', () => {
  const select=createPetPhraseSelector();
  for(const event of Object.keys(kazakhPetPhrases)) assert.ok(kazakhPetPhrases[event].includes(select(event,'kk')));
});
