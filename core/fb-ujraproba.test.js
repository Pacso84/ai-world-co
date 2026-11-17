// core/fb-ujraproba.js — a Make-ben elbukott FB-fotóposzt magától visszakerül a sorba (2026-11-17)
// Éles eset: 11-16 19:45:09.548 UTC a Make „Not Found”-ot kapott a képre (a friss deploy még nem ért el
// az európai szerverig) → status 2. Nálunk posted_fb: true, posted_at 19:45:09.670 → soha nem ment volna újra.
import assert from 'assert';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { bukottPosztok, ujraJelol, fbUjraproba, FB_UJRAPROBA_MAX, LECSENGES_FOTO_MS } from './fb-ujraproba.js';

let hiba = 0;
const t = async (nev, fn) => { try { await fn(); console.log('  ✅ ' + nev); } catch (e) { hiba++; console.log('  ❌ ' + nev + '\n     ' + e.message); } };

const MOST = Date.parse('2026-11-17T08:00:00Z');
const log = (ts, status, extra = {}) => ({ timestamp: ts, status, type: 'auto', eventType: 'EXECUTION_END', ...extra });
const poszt = (slug, postedAt, extra = {}) => ({ key: slug, post: { slug, posted_fb: true, posted_at: postedAt, ...extra } });

await t('VALÓDI 11-16-i eset: a bukott Make-futás a hozzá tartozó posztot adja vissza', async () => {
  const r = bukottPosztok([log('2026-11-16T19:45:09.548Z', 2)], [poszt('gemini-s-66', '2026-11-16T19:45:09.670Z')], MOST);
  assert.deepEqual(r.map(x => x.key), ['gemini-s-66']);
  assert.equal(r[0].bukottAt, '2026-11-16T19:45:09.548Z');
});

await t('VALÓDI 11-17-i köteg: 5 poszt egy másodpercen belül — csak a bukott párja jön vissza', async () => {
  // a Make-napló ideje (webhook-fogadás) mindig a mi posted_at-unk ELŐTT van ~100–200 ms-mal
  const logs = [log('2026-11-17T06:02:32.400Z', 1), log('2026-11-17T06:02:32.850Z', 1), log('2026-11-17T06:02:33.302Z', 2), log('2026-11-17T06:02:33.765Z', 1)];
  const posts = [poszt('a', '2026-11-17T06:02:32.520Z'), poszt('b', '2026-11-17T06:02:32.980Z'), poszt('c', '2026-11-17T06:02:33.420Z'), poszt('d', '2026-11-17T06:02:33.890Z')];
  assert.deepEqual(bukottPosztok(logs, posts, MOST).map(x => x.key), ['c'], '🔴 rossz posztot tenne vissza → dupla poszt');
});

await t('sikeres futás, párosítatlan poszt, régi (48 óránál korábbi) hiba → semmi', async () => {
  assert.equal(bukottPosztok([log('2026-11-17T06:02:33.302Z', 1)], [poszt('a', '2026-11-17T06:02:33.420Z')], MOST).length, 0);
  assert.equal(bukottPosztok([log('2026-11-17T06:02:33.302Z', 2)], [poszt('a', '2026-11-17T07:30:00.000Z')], MOST).length, 0, 'messzi időpont nem pár');
  assert.equal(bukottPosztok([log('2026-11-14T06:02:33.302Z', 2)], [poszt('a', '2026-11-14T06:02:33.420Z')], MOST).length, 0, '48 óránál régebbi');
});

await t(`legfeljebb ${FB_UJRAPROBA_MAX}× próbálja újra (ne pörögjön végtelenül egy tartós hibán)`, async () => {
  const r = bukottPosztok([log('2026-11-17T06:02:33.302Z', 2)], [poszt('a', '2026-11-17T06:02:33.420Z', { fb_ujraproba: FB_UJRAPROBA_MAX })], MOST);
  assert.equal(r.length, 0);
});

await t('csak a posted_fb === true posztot nézi (skipped-reel / skipped-stale nem)', async () => {
  const r = bukottPosztok([log('2026-11-17T06:02:33.302Z', 2)], [poszt('a', '2026-11-17T06:02:33.420Z', { posted_fb: 'skipped-reel' })], MOST);
  assert.equal(r.length, 0);
});

await t('a nem végrehajtás-sorok (modify/start/stop) nem számítanak', async () => {
  const r = bukottPosztok([log('2026-11-17T06:02:33.302Z', 2, { type: 'modify' })], [poszt('a', '2026-11-17T06:02:33.420Z')], MOST);
  assert.equal(r.length, 0);
});

await t('ujraJelol: visszaengedi a sorba, számol, a többi csatorna jelölése marad', async () => {
  const p = { slug: 'a', posted_fb: true, posted_at: 'x', posted_tiktok_photo: 'y' };
  ujraJelol(p, '2026-11-16T19:45:09.548Z');
  assert.equal(p.posted_fb, false);
  assert.equal(p.fb_ujraproba, 1);
  assert.equal(p.fb_bukott, '2026-11-16T19:45:09.548Z');
  assert.equal(p.posted_tiktok_photo, 'y');
});

await t('fbUjraproba: fájlt ír; hiba / nincs kulcs → üres lista, nem dob', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'fbu-'));
  try {
    writeFileSync(join(dir, 'gemini.json'), JSON.stringify({ slug: 'gemini', posted_fb: true, posted_at: '2026-11-17T06:02:33.420Z' }));
    writeFileSync(join(dir, 'jo.json'), JSON.stringify({ slug: 'jo', posted_fb: true, posted_at: '2026-11-17T05:00:00.120Z' }));
    const fetchFn = async () => ({ ok: true, json: async () => ({ scenarioLogs: [log('2026-11-17T06:02:33.302Z', 2), log('2026-11-17T05:00:00.010Z', 1)] }) });
    const r = await fbUjraproba({ dir, token: 'x', fetchFn, now: MOST });
    assert.deepEqual(r.map(x => x.slug), ['gemini']);
    const g = JSON.parse(readFileSync(join(dir, 'gemini.json'), 'utf-8'));
    assert.equal(g.posted_fb, false);
    assert.equal(JSON.parse(readFileSync(join(dir, 'jo.json'), 'utf-8')).posted_fb, true);
    assert.deepEqual(await fbUjraproba({ dir, token: '', fetchFn, now: MOST }), []);
    assert.deepEqual(await fbUjraproba({ dir, token: 'x', fetchFn: async () => { throw new Error('net'); }, now: MOST }), []);
    assert.deepEqual(await fbUjraproba({ dir, token: 'x', fetchFn: async () => ({ ok: false, status: 401 }), now: MOST }), []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

await t('🔌 bekötés: a FB-poszter a sor építése ELŐTT újrapróbál, és friss deploy után vár a küldéssel', async () => {
  const p = readFileSync(new URL('../agents/social/poster.js', import.meta.url), 'utf-8');
  const ujra = p.indexOf('await fbUjraproba('), sor = p.indexOf('for (const f of readdirSync(SOCIAL_DIR)');
  assert.ok(ujra > 0 && ujra < sor, '🔴 az újrapróba nincs bekötve, vagy a sor építése után fut');
  const var_ = p.indexOf('LECSENGES_FOTO_MS'), kuld = p.indexOf('await fetch(hook');
  assert.ok(var_ > 0 && var_ < kuld, '🔴 friss deploy után nincs várakozás a fotóposzt előtt');
  assert.ok(LECSENGES_FOTO_MS >= 45000, 'a Reelnél bevált 45 mp-nél ne legyen rövidebb');
});

if (hiba) { console.log(`❌ fb-ujraproba: ${hiba} hiba`); process.exit(1); }
console.log('✅ fb-ujraproba: minden rendben');
