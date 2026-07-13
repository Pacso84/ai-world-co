// ===================================================================
// VISSZAADÓ-IRODA TESZTEK — futtatás: node core/handback.test.js
// Nem hív API-t; a memory/handbacks.json-t a végén visszaállítja.
// ===================================================================
import { strict as assert } from 'assert';
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { fileHandback, openFor, roundsFor, markDelivered, escalateStale, listEscalated, closeCase, sourceDefect } from './handback.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE = join(__dirname, '..', 'memory', 'handbacks.json');
const backup = existsSync(STATE) ? readFileSync(STATE, 'utf-8') : null;

try {
  // tiszta lappal indulunk
  writeFileSync(STATE, JSON.stringify({ items: [] }, null, 2), 'utf-8');

  // 1) engedélyezett él: translator→iro
  const r1 = fileHandback({ from: 'translator', to: 'iro', ref: 'ARTICLE_zz-teszt.json', reason: 'nincs H1' });
  assert.equal(r1.ok, true, '1) engedélyezett él létrejön');
  assert.equal(openFor('iro').length, 1, '1) nyitott tétel az Írónál');

  // 2) tiltott él: social→translator → hangos hiba, nem jön létre
  const r2 = fileHandback({ from: 'social', to: 'translator', ref: 'x.json', reason: 'x' });
  assert.equal(r2.ok, false, '2) tiltott él elutasítva');
  assert.equal(openFor('translator').length, 0, '2) nem jött létre tétel');

  // 3) dupla nyitás ugyanarra: nem új tétel, kör-számláló nem duplázódik nyitottnál
  fileHandback({ from: 'translator', to: 'iro', ref: 'ARTICLE_zz-teszt.json', reason: 'még mindig nincs H1' });
  assert.equal(openFor('iro').length, 1, '3) továbbra is egy nyitott tétel');
  assert.equal(roundsFor('ARTICLE_zz-teszt.json'), 1, '3) egy életút-tétel');

  // 4) kézbesítés → delivered; a kör-számláló NEM nullázódik (teljes életútra számol)
  markDelivered(openFor('iro')[0].id);
  assert.equal(openFor('iro').length, 0, '4) kézbesítve');
  assert.equal(roundsFor('ARTICLE_zz-teszt.json'), 1, '4) életút-számláló marad');

  // 5) 2. kör: új tétel; 3. kör → escalated (max 2 kör)
  fileHandback({ from: 'translator', to: 'iro', ref: 'ARTICLE_zz-teszt.json', reason: 'másodszor' });
  assert.equal(roundsFor('ARTICLE_zz-teszt.json'), 2, '5) második kör számolva');
  markDelivered(openFor('iro')[0].id);
  const r3 = fileHandback({ from: 'translator', to: 'iro', ref: 'ARTICLE_zz-teszt.json', reason: 'harmadszor is' });
  assert.equal(r3.ok, true, '5) harmadik kör rögzül');
  assert.equal(listEscalated().length, 1, '5) a Főnök asztalára került');

  // 6) lezárt ügyre nem nyitható új
  closeCase('ARTICLE_zz-teszt.json');
  const r4 = fileHandback({ from: 'translator', to: 'iro', ref: 'ARTICLE_zz-teszt.json', reason: 'megint' });
  assert.equal(r4.ok, false, '6) lezárt ügy védve');

  // 7) escalateStale: előző futásból nyitva maradt tétel → escalated
  writeFileSync(STATE, JSON.stringify({ items: [{ id: 'h1', from: 'translator', to: 'iro', ref: 'ARTICLE_regi.json', reason: 'r', hint: '', status: 'open', created_at: new Date(Date.now() - 9 * 3600e3).toISOString(), updated_at: new Date(Date.now() - 9 * 3600e3).toISOString() }] }, null, 2), 'utf-8');
  const esc = escalateStale();
  assert.equal(esc.length, 1, '7) elöregedett nyitott tétel eszkalálva');
  assert.equal(listEscalated().length, 1, '7) az asztalon van');

  // 8) sourceDefect: hibás forrás felismerése
  assert.ok(sourceDefect('nincs cím, csak szöveg'), '8) H1-hiány felismerve');
  assert.equal(sourceDefect('---\ntitle: "x"\n---\n\n# Cím\n' + 'törzs '.repeat(120)), null, '8) egészséges cikk átmegy');

  console.log('✅ handback.test: mind a 8 eset átment');
} finally {
  if (backup === null) { if (existsSync(STATE)) unlinkSync(STATE); }
  else writeFileSync(STATE, backup, 'utf-8');
}
