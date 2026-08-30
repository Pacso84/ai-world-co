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
import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  reelVideoUrl, reelArticleUrl, reelCaption, sendReel,
  MOBIL_VAGAS, MIN_VIDEO_BAJT, SITE, igertLepesszam,
  futtatFazis, send
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

// ── SZÁM-ÍGÉRET (2026-08-24, éles eset) ─────────────────────────────
//
// Az első kiküldött Reelünk alatt „Five quick checks…" állt, a videó viszont
// NÉGY lépést mutatott. Egyik állítás sem volt hamis önmagában — az alcím a
// CIKKRŐL szól, a videó magáról —, de egymás mellett hibának látszik.
// A user vette észre, mert megkért, hogy fordítsam le neki soronként.

t('felismeri a sor eleji számnevet', () => {
  assert.equal(igertLepesszam('Five quick checks anyone can run'), 5);
  assert.equal(igertLepesszam('Three things to try today'), 3);
  assert.equal(igertLepesszam('TEN ways to start'), 10);
});

t('a mondat KÖZEPÉN álló szám nem lépés-ígéret', () => {
  // „…in under two minutes" az IDŐ, nem a lépésszám. Ha ezt is beszámítanánk,
  // a kapu ártatlan alcímeket rontana el.
  assert.equal(igertLepesszam('Checks anyone can run in under two minutes'), null);
  assert.equal(igertLepesszam('A guide for one and all'), null);
});

t('nem-szám kezdetre és hibás bemenetre null', () => {
  for (const x of ['Quick checks', '', null, undefined, 42, {}]) {
    assert.equal(igertLepesszam(x), null, JSON.stringify(x));
  }
});

t('⚠️ ha az alcím TÖBBET ígér, mint amennyi a videóban van → a CÍM megy ki', () => {
  const c = cikk(SLUG, 'Five quick checks anyone can run', 'How to Spot a Deepfake Video');
  const elso = reelCaption(c, { videoSteps: 4 }).split('\n')[0];
  assert.ok(!/^Five/i.test(elso), 'nem ígérhet ötöt, ha négy van: ' + elso);
  assert.match(elso, /Deepfake/, 'a cím lép a helyére');
});

t('✅ ha EGYEZIK, marad az alcím — az a jobb szöveg', () => {
  const c = cikk(SLUG, 'Five quick checks anyone can run', 'How to Spot a Deepfake Video');
  assert.match(reelCaption(c, { videoSteps: 5 }).split('\n')[0], /^Five quick checks/);
});

t('lépésszám nélkül nem avatkozunk be — nincs mihez mérni', () => {
  const c = cikk(SLUG, 'Five quick checks anyone can run', 'How to Spot a Deepfake Video');
  assert.match(reelCaption(c).split('\n')[0], /^Five quick checks/);
  assert.match(reelCaption(c, { videoSteps: null }).split('\n')[0], /^Five quick checks/);
});

t('a szám nélküli alcímhez a lépésszám nem szól hozzá', () => {
  const c = cikk(SLUG, 'Quick checks anyone can run', 'A cím');
  assert.match(reelCaption(c, { videoSteps: 4 }).split('\n')[0], /^Quick checks/);
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


// ===================================================================
// AZ ŐRSZEM AKKOR IS MEGTUDJA, HA A KIKÜLDÉS BUKOTT (2026-08-30)
// ===================================================================
//
// A `--send` fázis bukását a `memory/reel-guard.json`-ból olvassa ki a napi
// riport (core/daily-report.js → „🎬 REEL-ŐRSZEM"). Az őrszem 2026-08-26-án
// pontosan azért készült, mert az első automata Reel némán elbukott a CI-ban.
//
// CSAKHOGY a send() a hibaágon `process.exit(1)`-et hívott — az AZONNAL
// megöli a folyamatot, tehát a hívó try/catch-e (és vele az őrszem-írás)
// SOSEM futott le. A guard-fájlban az ELŐZŐ futás `ok:true`-ja maradt, és a
// riport hallgatott: pont az a bukás lett láthatatlan, amiért az őr épült.
//
// A `sendReel()` SOSEM DOB — {ok:false}-t ad hiányzó webhookra, nem elérhető
// videóra (bukott deploy → 404), rossz content-type-ra, túl kicsi fájlra és
// webhook-HTTP-hibára. Vagyis a néma ág volt a TIPIKUS ág.
//
// ⚠️ HA A HIBA VISSZAJÖN, EZ A TESZTFÁJL NEM „bukik", hanem MEGHAL: a
// process.exit(1) a teszt-folyamatot is megöli. A futtató ezt is ❌-nek
// látja — csak a kimenet lesz csonka.
//
// ⚠️ A VALÓDI memory/reel-guard.json-hoz NEM NYÚLUNK: minden eset a saját
// ideiglenes gyökerében fut. A valódi fájlt a végén ellenőrizzük is.

const VALODI_GUARD = join(dirname(fileURLToPath(import.meta.url)), '..', 'memory', 'reel-guard.json');
const GUARD_EREDETI = existsSync(VALODI_GUARD) ? readFileSync(VALODI_GUARD, 'utf-8') : null;
const HOOK_EREDETI = process.env.MAKE_REEL_WEBHOOK_URL;

/** Ideiglenes „projekt-gyökér" — a teszt SEMMIT nem ír a repóba. */
function ideiglenesGyoker() {
  const root = mkdtempSync(join(tmpdir(), 'reel-teszt-'));
  mkdirSync(join(root, 'memory'), { recursive: true });
  mkdirSync(join(root, 'content', 'articles'), { recursive: true });
  return root;
}
const guardOlvas = (root) => {
  const p = join(root, 'memory', 'reel-guard.json');
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf-8')) : null;
};
const takarit = (root) => { try { rmSync(root, { recursive: true, force: true }); } catch { /* */ } };

try {
  await at('📓 sikeres fázis után ok:true kerül az őrszem-fájlba', async () => {
    const root = ideiglenesGyoker();
    await futtatFazis({ ROOT: root, join, fazis: 'prepare', fn: async () => {} });
    assert.equal(guardOlvas(root).prepare.ok, true);
    takarit(root);
  });

  await at('📓 a dobott hiba ok:false-ként bekerül — ÉS tovább is megy a CI felé', async () => {
    const root = ideiglenesGyoker();
    await assert.rejects(
      () => futtatFazis({ ROOT: root, join, fazis: 'send', fn: async () => { throw new Error('spawnSync ffmpeg ENOENT'); } }),
      /ffmpeg/, 'a hibát tovább kell adni: enélkül a CI zöld pipát adna');
    const g = guardOlvas(root);
    assert.equal(g.send.ok, false);
    assert.match(g.send.hiba, /ffmpeg/, 'az OK is kell, nem csak a tény');
    takarit(root);
  });

  await at('📓 az előző futás sikerét FELÜLÍRJA a mai bukás', async () => {
    // Ez a valódi guard-fájl állapota: {send:{ok:true}} egy korábbi napról.
    // Ha a mai bukás nem íródik felül, a riport a tegnapi sikert látja.
    const root = ideiglenesGyoker();
    await futtatFazis({ ROOT: root, join, fazis: 'send', fn: async () => {} });
    assert.equal(guardOlvas(root).send.ok, true);
    await assert.rejects(() => futtatFazis({ ROOT: root, join, fazis: 'send', fn: async () => { throw new Error('404'); } }));
    assert.equal(guardOlvas(root).send.ok, false, 'a régi ok:true maradt bent');
    takarit(root);
  });

  await at('🚨 a BUKOTT kiküldés eljut az őrszemig — nem lép ki előtte', async () => {
    // A legolcsóbb valódi bukás: nincs webhook-cím. A sendReel ilyenkor
    // {ok:false}-t ad — HÁLÓZAT NÉLKÜL, az első sorban.
    delete process.env.MAKE_REEL_WEBHOOK_URL;
    const root = ideiglenesGyoker();
    const fajl = 'ARTICLE_GUIDE_teszt.json';
    writeFileSync(join(root, 'content', 'articles', fajl), JSON.stringify({
      _meta: { slug: SLUG, type: 'guide' },
      article_markdown: `---\ntitle: "Egy cím"\nsubtitle: "${ALCIM}"\n---\n\n# Törzs\n`
    }), 'utf-8');
    writeFileSync(join(root, 'memory', 'reel-pending.json'),
      JSON.stringify({ slug: SLUG, file: fajl, at: new Date().toISOString() }), 'utf-8');

    await assert.rejects(
      () => futtatFazis({ ROOT: root, join, fazis: 'send', fn: () => send(root, join, false) }),
      /webhook/i, 'a send() a bukást DOBJA, nem process.exit-tel némítja');

    const g = guardOlvas(root);
    assert.ok(g, 'meg sem született az őrszem-fájl');
    assert.equal(g.send.ok, false, 'a bukás nem került be az őrszem-fájlba — a riport hallgatna');
    assert.match(g.send.hiba, /webhook/i, 'a riport a `hiba` mezőt írja ki');
    takarit(root);
  });

  await at('✅ a „nincs mit küldeni" NEM bukás — a csendes napok maradjanak csendesek', async () => {
    // Nincs reel-pending.json: a send() rendben visszatér. Ha ezt bukásnak
    // vennénk, a riport minden nap vészjelezne — az őrszem elveszítené az
    // erejét (lásd a Pinterest-sor kigyomlálását 2026-08-09-én).
    const root = ideiglenesGyoker();
    await futtatFazis({ ROOT: root, join, fazis: 'send', fn: () => send(root, join, false) });
    assert.equal(guardOlvas(root).send.ok, true);
    takarit(root);
  });

  t('🔒 a valódi memory/reel-guard.json érintetlen maradt', () => {
    const most = existsSync(VALODI_GUARD) ? readFileSync(VALODI_GUARD, 'utf-8') : null;
    assert.equal(most, GUARD_EREDETI, 'a teszt beleírt az ÉLES őrszem-fájlba');
  });
} finally {
  if (HOOK_EREDETI === undefined) delete process.env.MAKE_REEL_WEBHOOK_URL;
  else process.env.MAKE_REEL_WEBHOOK_URL = HOOK_EREDETI;
  if (GUARD_EREDETI !== null) writeFileSync(VALODI_GUARD, GUARD_EREDETI, 'utf-8');
}

console.log('\n✅ reel-post.test: mind a ' + pass + ' eset rendben');
