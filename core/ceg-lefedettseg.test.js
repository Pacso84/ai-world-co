// Cég-lefedettség (2026-11-05): a 10-30-án felvett 6 új cég (Kimi, MiniMax Code, Z.ai, Duck.ai,
// Brave Leo, Lumo) 6 nap alatt EGY útmutató-témát sem kapott, mert a `--cover` csak az idle-fillben
// futott, az pedig „Szabad útmutató-slot: 0” miatt minden futásban kimaradt.
// Ingyenes, hálózat nélküli.
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const olvas = p => readFileSync(join(ROOT, ...p.split('/')), 'utf-8');
let hiba = 0;
const t = (nev, fn) => { try { fn(); console.log('  ✅ ' + nev); } catch (e) { hiba++; console.log('  ❌ ' + nev + '\n     ' + e.message); } };
console.log('\n🧪 ceg-lefedettseg (hiányzó cégek témája)');

t('🏢 a CEO a --cover-t a szabad slotoktól FÜGGETLENÜL futtatja (nem az idle-fill ágban)', () => {
  const src = olvas('agents/ceo/agent.js');
  const cover = src.indexOf("['--cover']");
  const idle = src.indexOf("haveTime(8, '3j. IDLE-FILL')");
  assert.ok(cover > 0, 'a --cover hívás hiányzik a CEO-ból');
  assert.ok(idle > 0, 'az idle-fill blokk nem található (átnevezték? igazítsd a tesztet)');
  assert.ok(cover < idle, 'a --cover megint az idle-fill (slots > 0) ágon belül van → 0 slotnál sosem fut');
  assert.equal(src.split("['--cover']").length - 1, 1, 'a --cover kétszer fut egy futásban');
});

t('🥇 a témaválasztó a coverage-témát a balance-témák ELÉ teszi', () => {
  const src = olvas('agents/guide/agent.js');
  const m = src.match(/const balance = todo\.filter\([^;]*;/s);
  assert.ok(m, 'a balance-lista nem található a pickTopics-ban');
  assert.match(m[0], /\.sort\(.*'coverage'/s, 'a coverage-témák nincsenek előre rendezve');
});

t('📚 mind a 6 új cég a katalógusban van (a --cover ebből dolgozik)', () => {
  const src = olvas('agents/guide/agent.js');
  for (const tool of ['Kimi', 'MiniMax Code', 'Z.ai', 'Duck.ai', 'Brave Leo', 'Lumo'])
    assert.ok(src.includes(`tool: '${tool}'`), tool + ' hiányzik a COMPANY_CATALOG-ból');
});

if (hiba) { console.log(`\n❌ ceg-lefedettseg.test: ${hiba} hiba`); process.exit(1); }
console.log('\n✅ ceg-lefedettseg.test: mind rendben');
