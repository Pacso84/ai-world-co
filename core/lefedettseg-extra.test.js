// Cég-lefedettség +1 hely (2026-11-07, user: „Napi +1 hely”): a 6 „Getting started” téma (Kimi,
// MiniMax Code, Z.ai, Duck.ai, Brave Leo, Lumo) 11-06 óta „todo”, mert a napi 2 hely (középszintű +
// trend) mindig foglalt. Megoldás: naponta 1 EXTRA útmutató, CSAK coverage-témából, a rendes
// 2-es keret (daily_guides_max) érintetlen; ha nincs több coverage-téma, magától leáll.
// Ingyenes, hálózat nélküli.
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { LEFEDETTSEG_EXTRA_BE, extraTemaMa, extraUtmutato } from './lefedettseg-extra.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const olvas = p => readFileSync(join(ROOT, ...p.split('/')), 'utf-8');
let hiba = 0;
const t = (nev, fn) => { try { fn(); console.log('  ✅ ' + nev); } catch (e) { hiba++; console.log('  ❌ ' + nev + '\n     ' + e.message); } };
console.log('\n🧪 lefedettseg-extra (napi +1 hely a 0 útmutatós cégeknek)');

const MA = '2026-11-08';
const cov = (id, extra) => ({ id, title: 'Getting started with ' + id, priority: 'coverage', status: 'todo', ...(extra || {}) });

t('🔛 a kapcsoló be van kapcsolva (kézi kill-switch a kódban)', () => {
  assert.equal(LEFEDETTSEG_EXTRA_BE, true);
});

t('🎯 van todo coverage-téma és ma még nem volt extra → az ELSŐ coverage-témát adja', () => {
  const topics = [{ id: 'x', priority: 'balance', status: 'todo' }, cov('kimi'), cov('lumo')];
  assert.equal(extraTemaMa(topics, MA)?.id, 'kimi');
});

t('1️⃣ naponta legfeljebb EGY: ha ma már kiosztottuk (extra_slot = ma), nincs több', () => {
  const topics = [cov('kimi', { status: 'done', extra_slot: MA }), cov('lumo')];
  assert.equal(extraTemaMa(topics, MA), null);
});

t('📅 a TEGNAPI kiosztás nem számít → ma újra jár egy', () => {
  const topics = [cov('kimi', { status: 'done', extra_slot: '2026-11-07' }), cov('lumo')];
  assert.equal(extraTemaMa(topics, MA)?.id, 'lumo');
});

t('🛑 magától leáll: nincs todo coverage-téma → null (a balance/general témák NEM kapják)', () => {
  const topics = [cov('kimi', { status: 'done' }), { id: 'b', priority: 'balance', status: 'todo' }, { id: 'g', status: 'todo' }];
  assert.equal(extraTemaMa(topics, MA), null);
});

t('🪦 megszűnt eszköz (ChatRTX) coverage-témája sem kerülhet sorra', () => {
  const topics = [{ id: 'rtx', tool: 'ChatRTX', title: 'Getting started with ChatRTX', priority: 'coverage', status: 'todo' }, cov('lumo')];
  assert.equal(extraTemaMa(topics, MA)?.id, 'lumo');
});

t('🏷️ az extra útmutatót a _meta.extra_slot jelöli (a rendes keretbe NEM számít)', () => {
  assert.equal(extraUtmutato({ type: 'guide', extra_slot: MA }), true);
  assert.equal(extraUtmutato({ type: 'guide', extra_slot: null }), false);
  assert.equal(extraUtmutato({ type: 'guide' }), false);
  assert.equal(extraUtmutato(undefined), false);
});

t('💾 az útmutató-író a téma extra_slot-ját a _meta-ba menti', () => {
  const src = olvas('agents/guide/agent.js');
  assert.match(src, /extra_slot:\s*topic\.extra_slot\s*\|\|\s*null/, 'saveGuide _meta-jából hiányzik az extra_slot');
});

t('🧮 a CEO a rendes útmutató-keretből KIVONJA az extra útmutatókat, és az extra lépés a --cover UTÁN, az idle-fill ELŐTT fut', () => {
  const src = olvas('agents/ceo/agent.js');
  assert.match(src, /guides_remaining:\s*Math\.max\(0,\s*GUIDES_MAX\s*-\s*\(byType\.guides\s*-\s*byType\.guidesExtra\)\s*-\s*\(drafts\.writerGuides\s*-\s*drafts\.writerGuidesExtra\)\)/,
    'a guides_remaining nem vonja ki az extra útmutatókat → az extra elvenné a rendes helyet');
  const cover = src.indexOf("['--cover']");
  const extra = src.indexOf("'3i3. CÉG-LEFEDETTSÉG +1'");
  const idle = src.indexOf("haveTime(8, '3j. IDLE-FILL')");
  assert.ok(extra > 0, 'a 3i3 extra lépés hiányzik a CEO-ból');
  assert.ok(cover < extra && extra < idle, 'rossz sorrend: --cover → 3i3 extra → idle-fill kell');
  assert.match(src, /gate\.newsBlocked && gate\.guidesBlocked && !gate\.lefedettsegExtra/,
    'a korai kilépés („mindkét keret betelt”) nem nézi az esedékes extra helyet → sosem futna');
});

t('📏 a rendes napi keret VÁLTOZATLANUL 2 (config.json)', () => {
  const cfg = JSON.parse(olvas('config.json'));
  assert.equal(cfg.limits.daily_guides_max, 2);
});

t('🧯 fék: a jóváhagyott súgó nélküli eszköz coverage-témája nem kap extra helyet — a következő jön', () => {
  const meta = cov('meta-ai', { tool: 'Meta AI', company: 'Meta' });
  const kimi = cov('kimi', { tool: 'Kimi', company: 'Moonshot AI' });
  assert.equal(extraTemaMa([meta, kimi], MA)?.id, 'kimi');
  assert.equal(extraTemaMa([meta], MA), null, 'csak fékezett todo van → nincs extra');
  assert.equal(extraTemaMa([cov('x', { tool: 'ChatGPT', company: 'OpenAI' })], MA)?.id, 'x', 'teljes súgójú eszköz továbbra is mehet');
});

if (hiba) { console.log(`\n❌ ${hiba} hiba`); process.exit(1); }
console.log('\n✅ lefedettseg-extra: minden rendben');
