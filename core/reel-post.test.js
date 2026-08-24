// ===================================================================
// REEL-KÜLDÉS — tesztek
// ===================================================================
//
// Ez a modul a kész álló videót küldi ki a Make „Facebook Reel"
// forgatókönyvének. Hálózat nélkül tesztelhető: a `fetchFn` beadható.
//
// ⚠️ ÉLES LECKE (2026-08-23): háromszor küldtünk ki egy videó-címet, ami
// akkor még 404 volt. A Facebook mindháromszor 422-t adott. A cím
// ellenőrzése INGYEN van (egy HEAD kérés) — ezért küldés ELŐTT megnézzük.
//
// ⚠️ MIT NEM VETT ÉSZRE AZ ELSŐ VÁLTOZAT (2026-08-24, kódellenőrzés). Négy
// mutáció ÁTMENT mind a 16 teszten:
//   1. `caption: video` a payloadban  — a leírás ÉRTÉKÉT senki nem nézte
//   2. HEAD és POST címének FELCSERÉLÉSE — a mockok eldobták az url-t
//   3. a `Content-Type: application/json` fejléc törlése
//   4. az `if (!video)` őr törlése
// Mindegyikre van most eset. A tanulság: egy teszt, ami csak azt nézi,
// MELYIK KULCSOK vannak a válaszban, az alakot ellenőrzi, nem a viselkedést.
// ===================================================================

import assert from 'assert/strict';
import { readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  reelVideoUrl, reelArticleUrl, reelCaption, sendReel,
  MOBIL_VAGAS, MIN_VIDEO_BAJT, SITE
} from './reel-post.js';

let pass = 0;
const t = (n, f) => { f(); pass++; console.log('  ✅ ' + n); };
const at = async (n, f) => { await f(); pass++; console.log('  ✅ ' + n); };
console.log('🧪 reel-küldés\n');

const SLUG = 'how-to-spot-a-deepfake-video-or-voice-clone-before-you-share-it';
const ALCIM = 'Five quick checks anyone can run on a suspicious video or voice clip in under two minutes — no app or account needed';

// A VALÓDI cikk-alak: slug a `_meta`-ban, cím és alcím a frontmatterben.
const cikk = (slug, alcim, cim) => ({
  _meta: slug === null ? {} : { slug },
  article_markdown: `---\ntitle: "${cim || 'Egy cím'}"\nsubtitle: "${alcim == null ? '' : alcim}"\n---\n\n# Törzs\n`
});

// ── címek ───────────────────────────────────────────────────────────

t('a videó címe a kimért, ÉLŐ útvonalra mutat', () => {
  assert.equal(reelVideoUrl(SLUG), SITE + '/assets/video/shorts/' + SLUG + '.mp4');
});

t('a cikk címe /article/ alatt van, .html NÉLKÜL', () => {
  const u = reelArticleUrl(SLUG);
  assert.equal(u, SITE + '/article/' + SLUG);
  assert.ok(!u.endsWith('.html'));
  assert.ok(!u.includes('/guides/'), 'a /guides/ útvonal 404-et ad');
});

t('⛔ slug nélkül NEM gyártunk csonka címet', () => {
  // Élesben mérve: a „https://aiworldhq.com/article/" cím 404-et ad.
  assert.equal(reelArticleUrl(''), '');
  assert.equal(reelArticleUrl(null), '');
  assert.equal(reelVideoUrl(undefined), '');
});

// ── a leírás ────────────────────────────────────────────────────────

t('📱 az első sor befér a mobil vágása elé', () => {
  const elso = reelCaption(cikk(SLUG, ALCIM)).split('\n')[0];
  assert.ok(elso.length <= MOBIL_VAGAS, 'túl hosszú: ' + elso.length);
  assert.ok(elso.length > 20);
});

t('📱 szóhatáron vág, és NEM hagy záró vesszőt a „…" előtt', () => {
  // A social-text.js trimToWords-ét használjuk. Amikor ezt lemásoltam, a
  // másolat nem hántotta le a záró írásjelet — 358 valódi alcímből 9-nél
  // vessző maradt volna. Egy példány van belőle, és ez a teszt őrzi.
  const hosszu = 'Five quick checks anyone can run on a suspicious video or voice clip in under two minutes, with no app, no account and no special software';
  const elso = reelCaption(cikk(SLUG, hosszu)).split('\n')[0];
  assert.ok(elso.endsWith('…'), 'jelezze, hogy folytatódik');
  const csonk = elso.slice(0, -1);
  assert.ok(!/[\s,;:.!-]$/.test(csonk), 'záró írásjel maradt: ' + JSON.stringify(elso.slice(-6)));
  assert.ok(hosszu.startsWith(csonk), 'a csonk az eredeti eleje legyen');
});

t('a leírásban benne van a cikk linkje', () => {
  assert.ok(reelCaption(cikk(SLUG, ALCIM)).includes(reelArticleUrl(SLUG)));
});

t('a végén követésre hívás áll — ugyanaz a hang, mint a többi poszton', () => {
  assert.match(reelCaption(cikk(SLUG, ALCIM)), /follow AI World HQ/i);
});

t('alcím híján a cím lép a helyére', () => {
  const c = reelCaption(cikk(SLUG, '', 'How to Spot a Deepfake Video'));
  assert.match(c.split('\n')[0], /Deepfake/);
});

t('⛔ SLUG NÉLKÜL nincs leírás — a halott link rosszabb, mint a néma nap', () => {
  assert.equal(reelCaption(cikk(null, ALCIM)), '');
});

t('⛔ se alcím, se cím → nincs leírás', () => {
  assert.equal(reelCaption({ _meta: { slug: SLUG }, article_markdown: '---\nx: 1\n---\n' }), '');
  assert.equal(reelCaption(null), '');
  assert.equal(reelCaption({}), '');
});

// ── a küldés ────────────────────────────────────────────────────────

const VIDEO = 'https://aiworldhq.com/assets/video/shorts/x.mp4';
const HOOK = 'https://hook.eu1.make.com/abc';

// A mock MINDENT rögzít: módszert, címet, fejlécet, törzset. Az első
// változat eldobta az url-t, és emiatt egy felcserélt argumentum
// (HEAD a webhookra, POST a videóra) észrevétlenül átment volna.
const mock = (opts = {}) => {
  const hivott = [];
  const f = async (url, opt = {}) => {
    const method = opt.method || 'GET';
    hivott.push({ method, url, headers: opt.headers, body: opt.body });
    if (method === 'HEAD') {
      if (opts.headThrow) throw new Error('timeout');
      return {
        ok: opts.headOk !== false,
        status: opts.headOk === false ? 404 : 200,
        headers: { get: (n) => (opts.fejlecek || { 'content-type': 'video/mp4', 'content-length': '468821' })[String(n).toLowerCase()] ?? null }
      };
    }
    if (opts.postThrow) throw new Error('The operation was aborted due to timeout');
    return { ok: opts.postOk !== false, status: opts.postOk === false ? 400 : 200 };
  };
  return { f, hivott };
};

await at('🎬 a payload a két mezőt viszi — ÉS A LEÍRÁS a leírás helyére kerül', async () => {
  const { f, hivott } = mock();
  const r = await sendReel({ video: VIDEO, caption: 'szia', hook: HOOK, fetchFn: f });
  assert.equal(r.ok, true);
  const post = hivott.find(x => x.method === 'POST');
  const test = JSON.parse(post.body);
  assert.deepEqual(Object.keys(test).sort(), ['caption', 'video']);
  assert.equal(test.video, VIDEO);
  assert.equal(test.caption, 'szia', 'a caption ÉRTÉKE — enélkül a videó URL-je mehetne leírásként');
});

await at('🎯 a HEAD a VIDEÓRA megy, a POST a WEBHOOKRA — nem fordítva', async () => {
  // Felcserélve a webhook-titkot POST-olnánk a videó címére.
  const { f, hivott } = mock();
  await sendReel({ video: VIDEO, caption: 'c', hook: HOOK, fetchFn: f });
  assert.deepEqual(
    hivott.map(x => [x.method, x.url]),
    [['HEAD', VIDEO], ['POST', HOOK]]
  );
});

await at('📮 JSON content-type nélkül a Make nem képezi le a mezőket', async () => {
  // A webhook fejléc nélkül is 200-at adna → néma siker, üres Reel.
  const { f, hivott } = mock();
  await sendReel({ video: VIDEO, caption: 'c', hook: HOOK, fetchFn: f });
  const post = hivott.find(x => x.method === 'POST');
  assert.equal(post.headers['Content-Type'], 'application/json');
});

await at('⛔ nem létező videó-címre EL SEM INDUL a küldés', async () => {
  const { f, hivott } = mock({ headOk: false });
  const r = await sendReel({ video: VIDEO, caption: 'c', hook: HOOK, fetchFn: f });
  assert.equal(r.ok, false);
  assert.equal(hivott.filter(x => x.method === 'POST').length, 0);
  assert.match(r.reason, /nem tölthető le|404/i);
});

await at('⛔ 0 bájtos „videó" is elbukik — a 200 önmagában nem elég', async () => {
  // Félbeszakadt ffmpeg: a fájl ott van, a szerver 200-at ad, a Facebook 422-t.
  const { f, hivott } = mock({ fejlecek: { 'content-type': 'video/mp4', 'content-length': '0' } });
  const r = await sendReel({ video: VIDEO, caption: 'c', hook: HOOK, fetchFn: f });
  assert.equal(r.ok, false, 'a 0 bájtos fájlt meg kell fogni');
  assert.equal(hivott.filter(x => x.method === 'POST').length, 0);
});

await at('⛔ gyanúsan kicsi fájl elbukik, a rendes méret átmegy', async () => {
  const kicsi = mock({ fejlecek: { 'content-type': 'video/mp4', 'content-length': String(MIN_VIDEO_BAJT - 1) } });
  assert.equal((await sendReel({ video: VIDEO, caption: 'c', hook: HOOK, fetchFn: kicsi.f })).ok, false);
  const jo = mock({ fejlecek: { 'content-type': 'video/mp4', 'content-length': String(MIN_VIDEO_BAJT + 1) } });
  assert.equal((await sendReel({ video: VIDEO, caption: 'c', hook: HOOK, fetchFn: jo.f })).ok, true);
});

await at('⛔ ha a cím nem videót ad vissza (pl. HTML hibalap), nem küldünk', async () => {
  const { f } = mock({ fejlecek: { 'content-type': 'text/html', 'content-length': '999999' } });
  const r = await sendReel({ video: VIDEO, caption: 'c', hook: HOOK, fetchFn: f });
  assert.equal(r.ok, false);
  assert.match(r.reason, /content-type/i);
});

await at('⛔ helyi cím nem mehet — a Facebook a SAJÁT szerveréről tölti le', async () => {
  const { f, hivott } = mock();
  for (const rossz of ['http://localhost:8788/x.mp4', 'https://127.0.0.1/x.mp4', 'http://aiworldhq.com/x.mp4']) {
    const r = await sendReel({ video: rossz, caption: 'c', hook: HOOK, fetchFn: f });
    assert.equal(r.ok, false, rossz);
  }
  assert.equal(hivott.length, 0, 'hálózatot sem kell hívni hozzá');
});

await at('⛔ hiányzó webhook-cím HANGOS hiba, nem néma kihagyás', async () => {
  const { f } = mock();
  const r = await sendReel({ video: VIDEO, caption: 'c', hook: '', fetchFn: f });
  assert.equal(r.ok, false);
  assert.match(r.reason, /webhook/i);
});

await at('⛔ hiányzó videó-cím megáll — és megmondja, mi hiányzik', async () => {
  const { f, hivott } = mock();
  for (const x of ['', null, undefined]) {
    const r = await sendReel({ video: x, caption: 'c', hook: HOOK, fetchFn: f });
    assert.equal(r.ok, false, JSON.stringify(x));
    assert.match(r.reason, /videó/i);
  }
  assert.equal(hivott.length, 0);
});

await at('⛔ üres vagy csak szóközös leírással nem küldünk', async () => {
  const { f } = mock();
  for (const x of ['', '   ', '\n\n', null]) {
    const r = await sendReel({ video: VIDEO, caption: x, hook: HOOK, fetchFn: f });
    assert.equal(r.ok, false, JSON.stringify(x));
    assert.match(r.reason, /leírás/i);
  }
});

await at('a webhook hibáját TOVÁBBADJA, nem nyeli le', async () => {
  const { f } = mock({ postOk: false });
  const r = await sendReel({ video: VIDEO, caption: 'c', hook: HOOK, fetchFn: f });
  assert.equal(r.ok, false);
  assert.match(String(r.reason), /400/);
});

await at('🌐 a HEAD hálózati hibáját megmondja, és nem küld', async () => {
  const { f, hivott } = mock({ headThrow: true });
  const r = await sendReel({ video: VIDEO, caption: 'c', hook: HOOK, fetchFn: f });
  assert.equal(r.ok, false);
  assert.equal(hivott.filter(x => x.method === 'POST').length, 0);
});

await at('⚠️ időtúllépésnél a kimenetel BIZONYTALAN — és ezt ki is mondja', async () => {
  // A Make már átvehette a kérést. Ha „nem sikerült"-et mondanánk, az
  // operátor újrakattintana, és két Reel menne ki ugyanarról.
  const { f } = mock({ postThrow: true });
  const r = await sendReel({ video: VIDEO, caption: 'c', hook: HOOK, fetchFn: f });
  assert.equal(r.ok, false);
  assert.equal(r.sent, 'unknown', 'meg kell különböztetni a biztos bukástól');
  assert.match(r.reason, /NEM JELENTI|Make napló/i, 'mondja meg, mit tegyen az ember');
});

await at('🧪 próbamód: NEM posztol, de a videó címét ELLENŐRZI', async () => {
  const { f, hivott } = mock();
  const r = await sendReel({ video: VIDEO, caption: 'c', hook: HOOK, fetchFn: f, dry: true });
  assert.equal(r.ok, true);
  assert.equal(r.dry, true);
  assert.equal(r.hookConfigured, true);
  assert.deepEqual(hivott.map(x => x.method), ['HEAD'], 'csak ellenőrzés mehet, küldés nem');
  assert.deepEqual(r.payload, { video: VIDEO, caption: 'c' });
});

await at('🧪 próbamód webhook NÉLKÜL is lefut — de megmondja, hogy hiányzik', async () => {
  // Enélkül helyben egyáltalán nem lehetne próbálni. A hallgatás viszont
  // néma siker lenne: „rendben", pedig élesben nem lenne hová küldeni.
  const { f } = mock();
  const r = await sendReel({ video: VIDEO, caption: 'c', hook: '', fetchFn: f, dry: true });
  assert.equal(r.ok, true);
  assert.equal(r.hookConfigured, false, 'a hiányt jelezni KELL');
});

await at('⛔ ÉLES küldésnél viszont a hiányzó webhook megállít', async () => {
  const { f, hivott } = mock();
  const r = await sendReel({ video: VIDEO, caption: 'c', hook: '', fetchFn: f, dry: false });
  assert.equal(r.ok, false);
  assert.equal(hivott.length, 0);
});

await at('🧪 próbamód halott címre is szól — ez a lényege', async () => {
  const { f } = mock({ headOk: false });
  assert.equal((await sendReel({ video: VIDEO, caption: 'c', hook: HOOK, fetchFn: f, dry: true })).ok, false);
});

// ── és a VALÓDI cikkeken ────────────────────────────────────────────

t('📌 VALÓDI útmutatókon: mindegyikhez épül érvényes leírás és videó-cím', () => {
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
  const DIR = join(ROOT, 'content', 'articles');
  const fajlok = readdirSync(DIR).filter(f => f.startsWith('ARTICLE_GUIDE') && f.endsWith('.json'));
  let rossz = 0, hosszu = 0;
  for (const f of fajlok) {
    const j = JSON.parse(readFileSync(join(DIR, f), 'utf-8'));
    const c = reelCaption(j);
    if (!c || !c.includes('/article/')) { rossz++; continue; }
    if (c.split('\n')[0].length > MOBIL_VAGAS) hosszu++;
  }
  assert.equal(rossz, 0, rossz + ' cikkhez nem épült érvényes leírás');
  assert.equal(hosszu, 0, hosszu + ' leírás első sora túllógna a mobil vágásán');
  console.log('     (' + fajlok.length + ' valódi útmutató átnézve)');
});

console.log('\n✅ reel-post.test: mind a ' + pass + ' eset rendben');
