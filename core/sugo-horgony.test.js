// TESZT — súgó-horgony: téma → egy hivatalos súgócikk (core/sugo-horgony.js, tiszta függvények). Ingyenes, hálózat nélküli.
// A tesztszövegek kitaláltak (kiadói szöveg nem kerülhet a nyilvános repóba).
import assert from 'assert/strict';
import {
  HORGONY_BE, FUTAS_MAX_PROBA, UJRAPROBA_NAP,
  indexSzukites, valasztoPromptTema, valasztoValasz, ellenorzoPromptTema, ellenorzoValaszTema
} from './sugo-horgony.js';
import { valasztoValasz as parositoValasz } from './sugo-parositas.js';

let pass = 0, hiba = 0;
const t = (n, f) => { try { f(); pass++; console.log('  ✅ ' + n); } catch (e) { hiba++; console.log('  ❌ ' + n + '\n     ' + String(e.message).split('\n')[0]); } };
console.log('🧪 súgó-horgony\n');

const tema = { title: 'How to use Perplexity Spaces to keep research in one place', tool: 'Perplexity', company: 'Perplexity', angle: 'organize sources' };
const nagy = Array.from({ length: 400 }, (_, i) => ({ url: `https://www.perplexity.ai/help-center/en/articles/${i}-x`, cim: `Unrelated article ${i}` }));
nagy.push({ url: 'https://www.perplexity.ai/help-center/en/articles/9999-spaces', cim: 'What are Spaces?' });

t('🔌 kapcsoló és korlátok rögzítve', () => {
  assert.equal(HORGONY_BE, true); assert.equal(FUTAS_MAX_PROBA, 6); assert.equal(UJRAPROBA_NAP, 14);
});

t('indexSzukites: a témához illő cikk előre kerül, a lista max hosszú', () => {
  const sz = indexSzukites(tema, nagy, 50);
  assert.equal(sz.length, 50); assert.equal(sz[0].cim, 'What are Spaces?', 'a témához illő cikk előre kerül');
});

t('indexSzukites: kis listát nem rendez át, másolatot ad', () => {
  const kicsi = nagy.slice(0, 3);
  assert.deepEqual(indexSzukites(tema, kicsi), kicsi, 'kis listát nem rendez át');
  assert.notEqual(indexSzukites(tema, kicsi), kicsi, 'másolat, nem ugyanaz a tömb');
});

t('indexSzukites: egyenlő pontnál az eredeti sorrend marad, az eszköz-/cégnév nem számít', () => {
  const l = [
    { url: 'u1', cim: 'Perplexity overview' }, { url: 'u2', cim: 'Perplexity pricing' }, { url: 'u3', cim: 'Sources and research' },
    { url: 'u4', cim: 'Perplexity news' }
  ];
  const sz = indexSzukites(tema, l, 3);
  assert.equal(sz[0].url, 'u3', 'a „research”/„sources” szó pontot ér, a „Perplexity” nem');
  assert.deepEqual(sz.slice(1).map(x => x.url), ['u1', 'u2'], 'egyenlőségnél eredeti sorrend');
});

t('valasztoPromptTema: számozott lista + a szabályok', () => {
  const sz = indexSzukites(tema, nagy, 50);
  const p = valasztoPromptTema(tema, sz);
  assert.match(p.felhasznalo, /1\. What are Spaces\?/); assert.match(p.rendszer, /developer/i);
  assert.match(p.rendszer, /admin/i); assert.match(p.rendszer, /billing/i); assert.match(p.rendszer, /getting started/i);
  assert.match(p.rendszer, /pick 0/i);
  assert.match(p.felhasznalo, /Perplexity Spaces/, 'a téma címe a promptban');
});

t('valasztoValasz (újrahasznált): sorszám → cikk, 0 / szemét → null', () => {
  const sz = indexSzukites(tema, nagy, 50);
  assert.equal(parositoValasz('{"pick": 1}', sz).cim, 'What are Spaces?');
  assert.equal(parositoValasz('{"pick": 0}', sz), null);
  assert.equal(parositoValasz('nem json', sz), null);
});

t('valasztoValasz: a horgony-modul is kiadja (ugyanaz a függvény)', () => {
  const sz = indexSzukites(tema, nagy, 50);
  assert.equal(valasztoValasz('{"pick": 1}', sz).cim, 'What are Spaces?');
  assert.equal(valasztoValasz('{"pick": 0}', sz), null);
});

t('ellenorzoValaszTema: ugyanaz a téma → ok', () => {
  const v = ellenorzoValaszTema('{"ok": true, "title": "How to use Perplexity Spaces to keep research in one place", "reason": "r"}', tema);
  assert.equal(v.ok, true); assert.match(v.title, /^How to use Perplexity Spaces/);
});

t('ellenorzoValaszTema: szűkebb cím, közös tartalmi szóval → ok', () => {
  const v = ellenorzoValaszTema('{"ok": true, "title": "How to create Spaces in Perplexity", "reason": "r"}', tema);
  assert.equal(v.ok, true, v.reason);
});

t('ellenorzoValaszTema: csendes témaváltás → elutasít', () => {
  const v = ellenorzoValaszTema('{"ok": true, "title": "How to cancel your subscription", "reason": "r"}', tema);
  assert.equal(v.ok, false); assert.match(v.reason, /más témáról/);
});

t('ellenorzoValaszTema: Getting started with … elfogadott', () => {
  const v = ellenorzoValaszTema('{"ok": true, "title": "Getting started with Lumo", "reason": "r"}', { title: 'Getting started with Lumo', tool: 'Lumo' });
  assert.equal(v.ok, true, v.reason);
});

t('ellenorzoValaszTema: ha az eredeti címnek nincs tartalmi szava, a közös-szó vizsgálat kimarad', () => {
  const v = ellenorzoValaszTema('{"ok": true, "title": "How to get started with Lumo", "reason": "r"}', { title: 'Getting started with Lumo', tool: 'Lumo', company: 'Lumo' });
  assert.equal(v.ok, true, v.reason);
});

t('ellenorzoValaszTema: rossz alak / túl hosszú cím / ok:false / szemét → elutasít', () => {
  assert.equal(ellenorzoValaszTema('{"ok": true, "title": "Spaces explained", "reason": "r"}', tema).ok, false);
  const hosszu = 'How to use Perplexity Spaces ' + 'research '.repeat(20);
  assert.equal(ellenorzoValaszTema(JSON.stringify({ ok: true, title: hosszu, reason: 'r' }), tema).ok, false);
  assert.equal(ellenorzoValaszTema('{"ok": false, "reason": "admin only"}', tema).ok, false);
  assert.equal(ellenorzoValaszTema('szemét', tema).ok, false);
});

t('ellenorzoPromptTema: részleges szintnél kimondja, hogy gomb-/menünév nem lesz', () => {
  const sugo = { url: 'u', cim: 'c', szoveg: 'Kitalált tesztszöveg.' };
  assert.match(ellenorzoPromptTema(tema, sugo, { szint: 'reszleges' }).rendszer, /button|menu/i);
  const teljes = ellenorzoPromptTema(tema, sugo, { szint: 'teljes' }).rendszer;
  assert.doesNotMatch(teljes, /name no buttons/i, 'teljes szintnél nincs ilyen korlát');
});

t('ellenorzoPromptTema: ugyanaz a téma, csak szűkíthet; a súgó szövege és a téma a promptban', () => {
  const p = ellenorzoPromptTema(tema, { url: 'https://x/y', cim: 'What are Spaces?', szoveg: 'Kitalált tesztszöveg.' }, { szint: 'teljes' });
  assert.match(p.rendszer, /SAME topic/i); assert.match(p.rendszer, /narrower/i);
  assert.match(p.felhasznalo, /Perplexity Spaces/); assert.match(p.felhasznalo, /What are Spaces\?/); assert.match(p.felhasznalo, /Kitalált tesztszöveg/);
});

if (hiba) { console.log(`\n❌ sugo-horgony.test: ${hiba} hiba`); process.exit(1); }
console.log(`\n✅ sugo-horgony.test: mind a ${pass} eset rendben`);
