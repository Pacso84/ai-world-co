// ===================================================================
// TESZT — az ellenőrző AI-bírálatának forrás-blokkja (core/biralo-forrasinfo.js)
// ===================================================================
// INGYENES, hálózat nélküli. Fut: node core/run-tests.js
//
// MIÉRT (2026-11-06): a „Gemini Omni 1.2 Flash now in Picsart” hírt az
// ellenőrző AI-bírálata azzal utasította el, hogy a modellnév „kitalált” —
// pedig a hivatalos Picsart-forrás címében szó szerint ez állt, és a Google
// is bejelentette (blog.google, DeepMind modellkártya). Ugyanez a minta, mint
// 11-05-én a Gemini Notebooknál. Ok: a hiteles névlistát és a „forrás címében
// szereplő név valódi” szabályt eddig CSAK a hitelesség-kapu (truth-gate.js)
// kapta meg, az ellenőrző nem — az a saját, elavult tudásához mért.
// ===================================================================

import assert from 'assert/strict';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { biraloForrasInfo } from './biralo-forrasinfo.js';
import { knownRealNames } from './truth-gate.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('  ✅ ' + name); };

console.log('🧪 ellenőrző forrás-blokk (hiteles nevek)\n');

const picsart = {
  original_title: 'Gemini Omni 1.2 Flash now in Picsart: a creator’s guide',
  _meta: { source_name: 'Picsart Blog', source_id: 'picsart', source_link: 'https://picsart.com/blog/gemini-omni-1-2-flash-launch/' }
};

t('a régi mezők (forrás, URL, eredeti cím) megmaradnak', () => {
  const s = biraloForrasInfo(picsart, { known: ['Gemini'], today: '2026-11-06' });
  assert.match(s, /Source: Picsart Blog \(picsart\)/);
  assert.match(s, /URL: https:\/\/picsart\.com\/blog\/gemini-omni-1-2-flash-launch\//);
  assert.match(s, /Original title: Gemini Omni 1\.2 Flash now in Picsart/);
});

t('megkapja a mai dátumot és a „forrás címében szereplő név VALÓDI” szabályt', () => {
  const s = biraloForrasInfo(picsart, { known: [], today: '2026-11-06' });
  assert.match(s, /Today's date: 2026-11-06/);
  assert.match(s, /NEWER than your training/);
  assert.match(s, /original title or the URL are REAL/);
});

t('megkapja a hiteles névlistát', () => {
  const s = biraloForrasInfo(picsart, { known: ['Gemini', 'Gemini Omni'], today: '2026-11-06' });
  assert.match(s, /VERIFIED-REAL NAMES[^\n]*\n.*Gemini Omni/);
});

t('alapból a website/tool-links.json listáját adja, és abban ott a Gemini Omni', () => {
  const s = biraloForrasInfo(picsart);
  assert.ok(knownRealNames().includes('Gemini Omni'), 'Gemini Omni a tool-links.json-ban');
  assert.match(s, /Gemini Omni/);
});

t('forrás-URL nélkül nem állít „frissebb forrást”, de a névlista marad', () => {
  const s = biraloForrasInfo({ original_title: 'x', _meta: {} }, { known: ['Claude'], today: '2026-11-06' });
  assert.doesNotMatch(s, /NEWER than your training/);
  assert.match(s, /VERIFIED-REAL NAMES[^\n]*\nClaude/);
});

t('az ellenőrző agent ténylegesen ezt használja (nem a régi, névlista nélküli blokkot)', () => {
  const src = readFileSync(join(ROOT, 'agents', 'ellenorzo', 'agent.js'), 'utf-8');
  assert.match(src, /import \{ biraloForrasInfo \} from '\.\.\/\.\.\/core\/biralo-forrasinfo\.js'/);
  assert.match(src, /const sourceInfo = biraloForrasInfo\(writerData\)/);
});

t('a Gemini Omni hivatalos linkje a Google saját oldala', () => {
  const tl = JSON.parse(readFileSync(join(ROOT, 'website', 'tool-links.json'), 'utf-8'));
  assert.equal(tl.tools['Gemini Omni'], 'https://gemini.google/overview/video-generation/');
});

console.log(`\n✅ ${pass} eset zöld`);
