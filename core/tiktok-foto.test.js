// ===================================================================
// TIKTOK FOTÓ-POSZT + THREADS-VIDEÓ — tesztek (2026-10-15)
// ===================================================================
// INGYENES, hálózat nélküli. Fut: node core/run-tests.js
//
// USER-DÖNTÉS (10-15): „minden közösségi médiában ugyanazok jelenjenek meg".
//   • a napi videók a Threadsre is mennek (videó-poszt);
//   • a Facebookra kiment hír/útmutató a TikTokra is, FOTÓ-posztként, napi max 3.
// A buffer-poster.js NEM importálható (élesben posztolna), ezért a döntés a
// core/tiktok-foto.js-ben él, a bekötést FORRÁS-SZÖVEG teszt őrzi.
// ===================================================================

import assert from 'assert/strict';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { tiktokFotoSor, maiMarkaDb, fotoKeret, FOTO_NAPI_MAX } from './tiktok-foto.js';
import { CHANNELS } from './social-text.js';
import { jelolMezo } from './social-mark.js';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0;
const t = (n, f) => { f(); pass++; console.log('  ✅ ' + n); };
console.log('🧪 tiktok-fotó + threads-videó\n');

const MOST = Date.parse('2026-10-15T12:00:00Z');
// Egy sor-elem, ahogy a poszter építi: a közösségi bejegyzés + a cikk kora.
const it = (slug, pubAt, post = {}, isFresh = true) => ({
  path: slug + '.json', pubAt, isFresh, isGuide: false,
  post: { facebook: 'szöveg', url: 'https://x/' + slug, posted_at: '2026-10-15T05:00:00Z', ...post }
});
const slugok = r => r.sor.map(x => x.path.replace('.json', ''));

t('csak a Facebookra már kiment ÉS friss poszt jelölt', () => {
  const r = tiktokFotoSor([
    it('fb-kint', '2026-10-15T01:00:00Z'),
    it('fb-nem-ment', '2026-10-15T02:00:00Z', { posted_at: undefined }),
    it('regi', '2026-10-01T02:00:00Z', {}, false)
  ], { now: MOST, keret: 6 });
  assert.deepEqual(slugok(r), ['fb-kint']);
});

t('kizárja, aminek már van TikTok-videója vagy -fotója', () => {
  const r = tiktokFotoSor([
    it('van-video', '2026-10-15T01:00:00Z', { posted_tiktok: '2026-10-15T06:00:00Z' }),
    it('van-foto', '2026-10-15T02:00:00Z', { posted_tiktok_photo: '2026-10-14T06:00:00Z' }),
    it('szabad', '2026-10-15T03:00:00Z')
  ], { now: MOST, keret: 6 });
  assert.deepEqual(slugok(r), ['szabad']);
});

t('a legfrissebb elöl', () => {
  const r = tiktokFotoSor([
    it('a', '2026-10-13T01:00:00Z'), it('c', '2026-10-15T01:00:00Z'), it('b', '2026-10-14T01:00:00Z')
  ], { now: MOST, keret: 6 });
  assert.deepEqual(slugok(r), ['c', 'b', 'a']);
});

t('napi max 3, a MAI jelölésekből számolva (tegnapi nem számít)', () => {
  assert.equal(FOTO_NAPI_MAX, 3);
  const mind = [
    it('x1', '2026-10-15T01:00:00Z', { posted_tiktok_photo: '2026-10-15T01:30:00Z' }),
    it('x2', '2026-10-14T01:00:00Z', { posted_tiktok_photo: '2026-10-14T23:59:00Z' }),   // tegnap
    it('n1', '2026-10-15T02:00:00Z'), it('n2', '2026-10-15T03:00:00Z'), it('n3', '2026-10-15T04:00:00Z')
  ];
  assert.equal(maiMarkaDb(mind, 'posted_tiktok_photo', MOST), 1);
  const r = tiktokFotoSor(mind, { now: MOST, keret: 6 });
  assert.equal(r.hely, 2, '3 - 1 mai = 2 hely');
  assert.equal(r.sor.length, 3, 'a jelöltek listája teljes (a kép-ellenőrzés a hívónál szűr)');
});

t('a csatorna maradék kerete is korlátoz; 0 / ismeretlen keret → 0 hely', () => {
  const mind = [it('a', '2026-10-15T01:00:00Z')];
  assert.equal(tiktokFotoSor(mind, { now: MOST, keret: 2 }).hely, 2);
  assert.equal(tiktokFotoSor(mind, { now: MOST, keret: 0 }).hely, 0);
  for (const rossz of [null, undefined, NaN, -1]) {
    assert.equal(tiktokFotoSor(mind, { now: MOST, keret: rossz }).hely, 0, '🔒 keret=' + rossz);
  }
  assert.equal(tiktokFotoSor(mind, { now: MOST, keret: Infinity }).hely, 3, 'plafon nélkül a napi 3 marad');
});

t('hibás bemenetre üres, nem borul', () => {
  assert.deepEqual(tiktokFotoSor(null, { now: MOST, keret: 3 }), { sor: [], hely: 0 });
  assert.equal(maiMarkaDb(null, 'posted_tiktok_photo', MOST), 0);
  assert.equal(maiMarkaDb([it('a', 'x', { posted_tiktok_photo: 'skipped-stale' })], 'posted_tiktok_photo', MOST), 0);
});

t('fotoKeret: plafon - ma eddig - most kiment videó; ismeretlen darabszám = zár', () => {
  assert.equal(fotoKeret({ plafon: 6, maiDb: 3, videoKikuldve: 0 }), 3);
  assert.equal(fotoKeret({ plafon: 6, maiDb: 2, videoKikuldve: 1 }), 3);
  assert.equal(fotoKeret({ plafon: 6, maiDb: 5, videoKikuldve: 2 }), 0, 'nem megy negatívba');
  assert.equal(fotoKeret({ plafon: 6, maiDb: null, videoKikuldve: 0 }), 0, '🔒 „nem tudom" → nem posztolunk');
  assert.equal(fotoKeret({ plafon: null, maiDb: null, videoKikuldve: 0 }), Infinity, 'plafon nélkül nincs korlát');
});

// ── a csatorna-beállítás ────────────────────────────────────────────

t('a csatornák tudják, melyik jelölőmezőt használják a videóra / fotóra', () => {
  assert.equal(CHANNELS.threads.videoField, 'posted_threads_video');
  assert.notEqual(CHANNELS.threads.videoField, CHANNELS.threads.field, 'külön mező, mert a link-poszt már napokkal korábban kimehetett');
  assert.equal(CHANNELS.tiktok.photoField, 'posted_tiktok_photo');
  assert.equal(CHANNELS.tiktok.videoOnly, true, 'a TikTok VIDEÓS sora változatlan');
});

// ── FORRÁS-SZÖVEG bekötés (a poszter nem importálható) ──────────────

const src = readFileSync(join(ROOT, 'agents', 'social', 'buffer-poster.js'), 'utf-8');

t('🔌 poszter: a Threads a videókat videó-posztként küldi, saját jelölőmezővel', () => {
  assert.match(src, /cfg\.videoField/, '🔴 a Threads-videó ág nincs bekötve');
  assert.match(src, /maiVideok\(cfg\.videoField, cikkLista\)/, '🔴 a Threads-videó a saját mezőre szűr');
  assert.match(src, /markField/, '🔴 a jelölés mezőjét tételenként kell megadni (a videó ≠ link-poszt)');
});

t('🔌 poszter: a TikTok-fotó a core-szelektort hívja, képpel, és külön jelöli', () => {
  assert.match(src, /from '\.\.\/\.\.\/core\/tiktok-foto\.js'/);
  assert.match(src, /tiktokFotoSor\(/, '🔴 a fotó-szelektor nincs hívva');
  assert.match(src, /cfg\.photoField/, '🔴 a fotó jelölőmezője nincs bekötve');
  assert.match(src, /imageExists\(/);
  assert.match(src, /image: item\.kep/, '🔴 a fotó-poszt nem kapja meg a képet');
});

t('🔌 poszter: a „CSAK videó" kommentek nem hazudnak többé', () => {
  assert.ok(!/CSAK a mai Reel megy ki/.test(src), 'elavult komment: a TikTokra már fotó is megy');
});

// ── 10-15 javítás: I1 — a fotó CSAK hírből; ugyanaz a cikk nem megy videóként ÉS fotóként ──

t('🔴 I1/a: a friss, FB-n kint lévő ÚTMUTATÓ soha nem fotó-jelölt (az videóként megy)', () => {
  const r = tiktokFotoSor([{ ...it('utmutato', '2026-10-15T05:00:00Z'), isGuide: true }], { now: MOST, keret: 6 });
  assert.deepEqual(slugok(r), []);
});

t('🔴 I1/b: a futásban videóként már kiment cikk (kizar) soha nem fotó-jelölt', () => {
  const r = tiktokFotoSor([it('b', '2026-10-15T02:00:00Z')], { now: MOST, keret: 6, kizar: new Set(['b.json']) });
  assert.deepEqual(slugok(r), []);
});

t('I1/c: a friss, FB-n kint lévő HÍR viszont jelölt (a szűrő nem dob ki mindent)', () => {
  const r = tiktokFotoSor([
    it('hir', '2026-10-15T01:00:00Z'),
    { ...it('utmutato', '2026-10-15T05:00:00Z'), isGuide: true },
    it('videozott', '2026-10-15T02:00:00Z')
  ], { now: MOST, keret: 6, kizar: new Set(['videozott.json']) });
  assert.deepEqual(slugok(r), ['hir']);
});

// ── I2: a jelölés mindig a FRISS fájlba megy ──

t('🔴 I2: két elavult objektumból írt két jelölés MIND megmarad, a visszatérési érték az egyesített állapot', () => {
  const dir = mkdtempSync(join(tmpdir(), 'jelol-'));
  try {
    const f = join(dir, 'cikk.json');
    writeFileSync(f, JSON.stringify({ facebook: 'sz', url: 'u' }), 'utf-8');
    const regiA = JSON.parse(readFileSync(f, 'utf-8'));     // link-poszt tétel
    const regiB = JSON.parse(readFileSync(f, 'utf-8'));     // videó tétel (külön parse)
    jelolMezo(f, 'posted_threads', '2026-10-15T01:00:00Z', { fallback: regiA });
    const vissza = jelolMezo(f, 'posted_threads_video', '2026-10-15T02:00:00Z', { fallback: regiB });
    const v = JSON.parse(readFileSync(f, 'utf-8'));
    assert.equal(v.posted_threads, '2026-10-15T01:00:00Z', '🔴 a második írás letörölte az elsőt');
    assert.equal(v.posted_threads_video, '2026-10-15T02:00:00Z');
    assert.equal(v.facebook, 'sz');
    assert.deepEqual(vissza, v, 'a visszatérési érték nem az egyesített állapot');
    // olvashatatlan fájl: a tartalék objektumra esik vissza (a régi viselkedés)
    const g = join(dir, 'uj.json');
    const r = jelolMezo(g, 'posted_tiktok', 'T', { fallback: { facebook: 'x' } });
    assert.equal(r.posted_tiktok, 'T');
    assert.equal(JSON.parse(readFileSync(g, 'utf-8')).facebook, 'x');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

t('🔌 poszter: minden jelölés a friss-fájlos jelolMezo-n megy, és a fotó kizárja a mai videókat', () => {
  assert.match(src, /jelolMezo\(item\.path, markField/, '🔴 a jelölés megint az elavult objektumot írja vissza');
  assert.ok(!/writeFileSync\(item\.path/.test(src), '🔴 maradt közvetlen visszaírás');
  assert.match(src, /kizar: videoUtak/, '🔴 a fotó-szelektor nem kapja meg a mai videó-cikkeket');
  assert.match(src, /foto: maiMarkaDb\(/, '🔴 a riport nem kapja külön a fotó-számot');
  assert.match(src, /video: maiMarkaDb\(/, '🔴 a riport nem kapja külön a videó-számot');
});

console.log('\n✅ tiktok-foto.test: mind a ' + pass + ' eset rendben');
