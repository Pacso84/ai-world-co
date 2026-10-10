// TESZT — tartalom-kapcsolók: középszintű útmutató + „If you already use it" (core/content-switches.js).
// Ingyenes, hálózat nélkül. Az agent-fájlokat CSAK olvassa (importjuk pénzt költene).
import assert from 'assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { tartalomKapcsolok, maiKozepDb, szintSorrend, KOZEP_NAPI } from './content-switches.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, bukott = 0;
const t = (nev, fn) => {
  try { fn(); pass++; console.log('  ✅ ' + nev); }
  catch (e) { bukott++; console.log('  ❌ ' + nev + '\n     ' + String(e.message).split('\n')[0]); }
};
console.log('🧪 Tartalom-kapcsolók\n');

t('🔑 a kapcsolók a config.json-ban vannak, és false-ra TÉNYLEG kikapcsolnak', () => {
  const c = JSON.parse(readFileSync(join(ROOT, 'config.json'), 'utf-8'));
  assert.equal(typeof c.content?.intermediate_guides, 'boolean');
  assert.equal(typeof c.content?.news_if_you_use, 'boolean');
  const d = mkdtempSync(join(tmpdir(), 'kapcs-'));
  writeFileSync(join(d, 'c.json'), JSON.stringify({ content: { intermediate_guides: false, news_if_you_use: false } }));
  assert.deepEqual(tartalomKapcsolok(join(d, 'c.json')), { kozepUtmutato: false, hirHalado: false });
  writeFileSync(join(d, 'u.json'), '{}');
  assert.deepEqual(tartalomKapcsolok(join(d, 'u.json')), { kozepUtmutato: true, hirHalado: true }, 'hiányzó mező = bekapcsolva');
});

const T = (id, level = 'beginner') => ({ id, level });
t('🔑 napi 1 középszintű: ha ma még nincs → az első középszintű ELŐRE; ha van → mára kimarad', () => {
  const sor = [T('a'), T('b'), T('k1', 'intermediate'), T('c'), T('k2', 'intermediate')];
  assert.deepEqual(szintSorrend(sor, { maiKozep: 0 }).map(x => x.id), ['k1', 'a', 'b', 'c', 'k2']);
  assert.deepEqual(szintSorrend(sor, { maiKozep: KOZEP_NAPI }).map(x => x.id), ['a', 'b', 'c']);
  assert.deepEqual(szintSorrend(sor, { maiKozep: 0, be: false }).map(x => x.id), ['a', 'b', 'c'], 'kikapcsolva nincs középszint');
  assert.deepEqual(szintSorrend([T('a'), T('b')], { maiKozep: 0 }).map(x => x.id), ['a', 'b'], 'középszintű téma nélkül a sor változatlan');
});

t('🔑 ha a sorban NINCS középszintű téma → az első nem-kezdő című téma lesz ma középszintű (élő eset 09-30: 10 téma, 0 középszintű)', () => {
  const sor = [{ id: 'g', title: 'Getting started with Claude', level: 'beginner' }, { id: 'x', title: 'How to Use Ideogram Character for Consistent Mascot Visuals', level: 'beginner' }, { id: 'y', title: 'Plan a trip', level: 'beginner' }];
  const r = szintSorrend(sor, { maiKozep: 0 });
  assert.deepEqual(r.map(x => x.id), ['x', 'g', 'y']);
  assert.equal(r[0].level, 'intermediate');
  assert.equal(sor[1].level, 'beginner', 'az eredeti témát nem írja át (másolat)');
  assert.equal(szintSorrend(sor, { maiKozep: 1 }).every(x => x.level === 'beginner'), true, 'ha ma már volt, nem léptet elő');
  assert.equal(szintSorrend([{ id: 'g', title: 'A beginner guide to Gemini', level: 'beginner' }], { maiKozep: 0 })[0].level, 'beginner', 'kezdő című nem lesz középszintű');
});

t('a mai középszintűek számlálása a written_at napja szerint', () => {
  const m = [{ level: 'intermediate', written_at: '2026-09-29T03:10:00Z' }, { level: 'intermediate', written_at: '2026-09-28T23:59:00Z' }, { level: 'beginner', written_at: '2026-09-29T08:00:00Z' }];
  assert.equal(maiKozepDb(m, '2026-09-29'), 1);
});

t('🔑 a két író TÉNYLEG ezt a modult kérdezi (és a prompt-szövegek a kapcsolótól függnek)', () => {
  const g = readFileSync(join(ROOT, 'agents', 'guide', 'agent.js'), 'utf-8');
  assert.match(g, /import \{ tartalomKapcsolok, maiKozepDb, szintSorrend \} from '\.\.\/\.\.\/core\/content-switches\.js';/);
  // 10-10: a fókusz-téma (core/guide-focus.js) az ELSŐ helyen jön, a szint-sorrend a maradékra
  // és a fókusszal frissített mai középszintű-számra fut — a kapcsoló ugyanúgy a modulból jön.
  assert.match(g, /const kozepBe = tartalomKapcsolok\(\)\.kozepUtmutato;/);
  assert.match(g, /maiKozep: maiKozepDb\(metak, maNap\), kozepBe/);
  assert.match(g, /szintSorrend\(fk\.tobbi, \{ maiKozep: fk\.maiKozep, be: kozepBe \}\)/);
  assert.match(g, /topic\.level === 'intermediate' \? KOZEP_BLOKK :/);
  assert.match(g, /\$\{szintKeveres\(\)\}/);
  assert.match(g, /LEVEL: INTERMEDIATE[\s\S]{0,1500}ALL clarity and honesty rules still apply/);
  const i = readFileSync(join(ROOT, 'agents', 'iro', 'agent.js'), 'utf-8');
  assert.match(i, /import \{ tartalomKapcsolok \} from '\.\.\/\.\.\/core\/content-switches\.js';/);
  assert.match(i, /const HIR_HALADO_PONT = tartalomKapcsolok\(\)\.hirHalado/);
  assert.match(i, /an easy first step\$\{HIR_HALADO_PONT\}/);
  // 09-30: a sablon példapontját az író NEM követte (4 hírből 0) → kifejezett szabály is kell
  assert.match(i, /with practical advice for different reader types\$\{HIR_HALADO_SZABALY\}/);
  assert.match(i, /const HIR_HALADO_SZABALY = tartalomKapcsolok\(\)\.hirHalado/);
});

console.log(`\n${bukott ? '❌' : '✅'} ${pass} sikeres, ${bukott} bukott`);
process.exit(bukott ? 1 : 0);
