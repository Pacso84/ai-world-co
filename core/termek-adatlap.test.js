// TESZT — termék-adatlap homlokzat (core/termek-adatlap.js). Ingyenes, hálózat nélküli.
import assert from 'assert/strict';
import { adatlap } from './termek-adatlap.js';

let pass = 0, hiba = 0;
const t = (n, f) => { try { f(); pass++; console.log('  ✅ ' + n); } catch (e) { hiba++; console.log('  ❌ ' + n + '\n     ' + String(e.message).split('\n')[0]); } };
console.log('🧪 termék-adatlap homlokzat\n');

t('teljes szintű eszköz: kulcs van, horgony kell', () => {
  const a = adatlap({ tool: 'ChatGPT', company: 'OpenAI', title: 'How to summarize a PDF with ChatGPT' });
  assert.equal(a.nev, 'ChatGPT'); assert.equal(a.szint, 'teljes'); assert.deepEqual(a.kulcsok, ['openai']);
  assert.equal(a.megszunt, null); assert.equal(a.horgonyKell, true);
});

t('csak cégből is megtalálja az eszközt', () => {
  const a = adatlap({ tool: '', company: 'Google', title: 'x' });
  assert.equal(a.nev, 'Gemini'); assert.equal(a.horgonyKell, true);
});

t('cégfüggetlen téma: nincs név, nincs horgony', () => {
  const a = adatlap({ tool: '', company: '', title: 'How to write a follow-up email with AI' });
  assert.equal(a.szint, 'cegfuggetlen'); assert.equal(a.nev, null); assert.deepEqual(a.kulcsok, []); assert.equal(a.horgonyKell, false);
});

t('nincs szintű eszköz: a fék dolga, horgony nem kell', () => {
  const a = adatlap({ tool: 'Meta AI', company: 'Meta', title: 'x' });
  assert.equal(a.szint, 'nincs'); assert.equal(a.horgonyKell, false);
});

t('kivezetés alatt álló eszköz: megszunt kitöltve, nincs horgony', () => {
  const a = adatlap({ tool: 'ChatGPT', company: 'OpenAI', title: 'How to build a custom GPT for weekly tasks' });
  assert.ok(a.megszunt); assert.equal(a.horgonyKell, false, 'kivezetés alatt álló eszközről nincs új útmutató');
  assert.deepEqual(Object.keys(a.megszunt).sort(), ['datum', 'forras', 'nev']);
  assert.ok(!('minta' in a.megszunt), 'a regex nem kerül ki');
});

t('teljes szint, de még nincs cikklista: kulcs nélkül nincs horgony', () => {
  const a = adatlap({ tool: 'Apple Intelligence', company: 'Apple', title: 'x' });
  assert.equal(a.szint, 'teljes'); assert.deepEqual(a.kulcsok, []); assert.equal(a.horgonyKell, false);
});

t('részleges szintnél is kell horgony, ha van kulcs', () => {
  const a = adatlap({ tool: 'DeepSeek', company: 'DeepSeek', title: 'x' });
  assert.equal(a.szint, 'reszleges');
  assert.equal(a.horgonyKell, a.kulcsok.length > 0);
});

t('hibás bemenet nem dob, cégfüggetlen választ ad', () => {
  for (const bad of [null, undefined, 'szöveg', 42, {}]) {
    let a;
    assert.doesNotThrow(() => { a = adatlap(bad); });
    assert.equal(a.szint, 'cegfuggetlen'); assert.equal(a.nev, null);
    assert.deepEqual(a.kulcsok, []); assert.equal(a.megszunt, null); assert.equal(a.horgonyKell, false);
  }
});

t('a visszaadott kulcslista másolat (nem írja át a táblát)', () => {
  const a = adatlap({ tool: 'ChatGPT', company: 'OpenAI' });
  a.kulcsok.push('hamis');
  assert.deepEqual(adatlap({ tool: 'ChatGPT', company: 'OpenAI' }).kulcsok, ['openai']);
});

console.log(`\n${hiba ? '❌' : '✅'} termék-adatlap: ${pass} sikeres, ${hiba} hibás`);
process.exit(hiba ? 1 : 0);
