// ===================================================================
// TANULSÁG-BLOKK TESZT — futtatás: node core/lessons-block.test.js
// Nem hív API-t; a memory/store.json-t a végén visszaállítja.
// ===================================================================
import { strict as assert } from 'assert';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { remember, lessonsBlock } from './memory-manager.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STORE = join(__dirname, '..', 'memory', 'store.json');
const backup = readFileSync(STORE, 'utf-8');

try {
  remember('shared', 'ZZTESZT-közös: a csempe mindig a legrövidebb hivatalos terméknév');
  remember('zzteszt-agent', 'ZZTESZT-saját: a fordításban a title sosem tükörfordítás');

  // A shared scope-ban ÉLES tanulságok versenyeznek a helyekért (salience) —
  // ezért a konkrét teszt-szöveg helyett a BLOKK-SZERKEZETET ellenőrizzük.
  const block = lessonsBlock('zzteszt-agent');
  assert.ok(block.includes('[cég]'), 'közös (shared) lecke-sor van a blokkban');
  assert.ok(block.includes('ZZTESZT-saját'), 'saját scope lecke benne van');
  assert.ok(block.length < 1600, 'token-sapka tartva');

  // iro/guide: a saját leckéiket maguk töltik (szemantikus) — ide csak a shared jár
  const iroBlock = lessonsBlock('iro');
  assert.ok(!iroBlock.includes('ZZTESZT-saját'), 'iro nem kapja más agent leckéit');
  assert.ok(iroBlock.includes('[cég]') && !iroBlock.includes('[saját]'), 'iro csak közös leckéket kap');

  assert.equal(lessonsBlock(''), '', 'agentName nélkül üres');

  // ISMÉTLÉS-SZÁMLÁLÓ (2026-07-19): ugyanaz a stabil hiba-szöveg újra-remember-elve
  // = a hiba megismétlődött → repeats nő, lastRepeat mai. (Első íráskor NINCS repeats.)
  remember('zzteszt-agent', 'ZZTESZT-ismétlés: ugyanaz a hiba stabil szöveggel.');
  remember('zzteszt-agent', 'ZZTESZT-ismétlés: ugyanaz a hiba stabil szöveggel.');
  const st = JSON.parse(readFileSync(STORE, 'utf-8'));
  const it = st.items.find(i => i.scope === 'zzteszt-agent' && /ZZTESZT-ismétlés/.test(i.text));
  assert.equal(it.repeats, 1, 'második előfordulás = 1 ismétlés');
  assert.ok((it.lastRepeat || '').startsWith(new Date().toISOString().slice(0, 10)), 'lastRepeat mai');
  const first = st.items.find(i => /ZZTESZT-saját/.test(i.text));
  assert.equal(first.repeats, undefined, 'első írásnál nincs repeats mező');

  console.log('✅ lessons-block.test: minden átment');
} finally {
  writeFileSync(STORE, backup, 'utf-8');
}
