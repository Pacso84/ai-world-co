// ===================================================================
// REEL-SOR — melyik útmutatóból legyen ma videó?
// ===================================================================
//
// ⚠️ A CI NAPONTA HÁROMSZOR FUT. Jelölés nélkül ugyanaz a Reel naponta
// háromszor menne ki — ez az egyetlen ok, amiért a Reel eddig nem volt
// bekötve az automatikába (2026-08-24 óta készen áll minden más).
//
// A jelölés helye a cikk `_meta.reel_at` mezője — ugyanaz a minta, mint a
// Facebook-poszté (`posted_fb`), és ugyanabban a fájlban él, amit a CI
// amúgy is visszacommitol.
// ===================================================================

import assert from 'assert/strict';
import { readFileSync } from 'fs';
import { reelMaMar, kovetkezoReel, maiReelCikk, maiReelCikkek, reelForma, videoCsatornaMai, tiktokExtra, maiTiktokExtra, tiktokPotlas } from './reel-queue.js';

let pass = 0;
const t = (n, f) => { f(); pass++; console.log('  ✅ ' + n); };
console.log('🧪 reel-sor\n');

const MOST = Date.parse('2026-08-25T17:00:00Z');
const g = (slug, at, extra = {}) => ({
  slug, type: 'guide', published_at: at, ...extra
});

// ── ment-e ma már Reel? ─────────────────────────────────────────────

t('ma már ment → igen', () => {
  assert.equal(reelMaMar([g('a', '2026-01-01', { reel_at: '2026-08-25T02:10:00Z' })], MOST), true);
});

t('tegnap ment, ma még nem → nem', () => {
  assert.equal(reelMaMar([g('a', '2026-01-01', { reel_at: '2026-08-24T23:59:00Z' })], MOST), false);
});

t('soha nem ment → nem', () => {
  assert.equal(reelMaMar([g('a', '2026-01-01')], MOST), false);
  assert.equal(reelMaMar([], MOST), false);
  assert.equal(reelMaMar(null, MOST), false);
});

// ── kit válasszunk? ─────────────────────────────────────────────────
//
// A LEGRÉGEBBIT. Az útmutató ÖRÖKZÖLD, tehát nincs romlandósága — a friss
// előnyben részesítése (mint a Facebook-sornál) itt csak azt érné el, hogy
// a 358 régi soha ne kerüljön sorra. FIFO: a hátralék kiszámíthatóan fogy.

t('a LEGRÉGEBBI, még sosem használt útmutatót választja', () => {
  const cikkek = [
    g('uj', '2026-08-20'),
    g('regi', '2026-06-01'),
    g('kozepes', '2026-07-15')
  ];
  assert.equal(kovetkezoReel(cikkek, MOST)?.slug, 'regi');
});

t('amiből már volt Reel, azt kihagyja', () => {
  const cikkek = [
    g('regi', '2026-06-01', { reel_at: '2026-07-01T00:00:00Z' }),
    g('kovetkezo', '2026-06-05')
  ];
  assert.equal(kovetkezoReel(cikkek, MOST)?.slug, 'kovetkezo');
});

t('⛔ HÍRBŐL nem lesz Reel — csak útmutatóból', () => {
  // A videó szövege a „Step N —" fejlécekből épül; a hírben ilyen nincs.
  const cikkek = [{ slug: 'egy-hir', type: 'news', published_at: '2026-01-01' }, g('utm', '2026-08-01')];
  assert.equal(kovetkezoReel(cikkek, MOST)?.slug, 'utm');
});

t('⛔ ha ma már ment Reel, nem választ senkit', () => {
  const cikkek = [g('regi', '2026-06-01'), g('mai', '2026-08-01', { reel_at: '2026-08-25T02:00:00Z' })];
  assert.equal(kovetkezoReel(cikkek, MOST), null);
});

t('a szűrő (pl. „elég lépés van-e") kizárhat cikkeket', () => {
  // A videó legalább 3 lépést kér (core/short-video.js MIN_LEPES). Azt, hogy
  // egy cikkből TELIK-E videó, csak a markdown ismeretében lehet eldönteni —
  // ezért a hívó adja be szűrőként, nem itt találgatunk.
  const cikkek = [g('rovid', '2026-06-01'), g('jo', '2026-06-05')];
  const r = kovetkezoReel(cikkek, MOST, { alkalmas: c => c.slug !== 'rovid' });
  assert.equal(r?.slug, 'jo');
});

t('ha senki nem alkalmas, null — nem borulás', () => {
  assert.equal(kovetkezoReel([g('a', '2026-06-01')], MOST, { alkalmas: () => false }), null);
  assert.equal(kovetkezoReel([], MOST), null);
  assert.equal(kovetkezoReel(null, MOST), null);
});

t('dátum nélküli cikket nem választ — nem tudnánk sorba tenni', () => {
  assert.equal(kovetkezoReel([{ slug: 'nincs-datum', type: 'guide' }], MOST), null);
});

// ── a jelölés IRÁNYA ────────────────────────────────────────────────

t('⚠️ a HIBÁS reel_at nem számít „ma már ment"-nek', () => {
  // Ha a mező szemét, abból NEM következik, hogy ma ment ki Reel. A rossz
  // irány itt az lenne, hogy egy elrontott mező ÖRÖKRE elnémítja a Reelt.
  for (const rossz of ['', 'tegnap', null, 0, {}]) {
    assert.equal(reelMaMar([g('a', '2026-01-01', { reel_at: rossz })], MOST), false, JSON.stringify(rossz));
  }
});


// ── A MAI REEL CIKKE (2026-08-26) ─────────────────────────────────
// Miért kell külön a reelMaMar-tól: a videó a .gitignore-ban van, tehát
// minden CI-futás tiszta lappal indul. Ha a mai Reel MÁR kiment, de a
// videó nincs a lemezen, a build utáni deploy LETÖRLI az élő oldalról —
// és az Instagram (ami a videó URL-jét kéri) aznap kimarad.
t('megtalálja a mai Reel cikkét', () => {
  const most = Date.parse('2026-08-26T18:00:00.000Z');
  const cikkek = [
    { slug: 'regi', reel_at: '2026-08-25T18:33:00.000Z' },
    { slug: 'mai', reel_at: '2026-08-26T08:53:00.000Z' },
    { slug: 'soha', reel_at: null }
  ];
  assert.equal(maiReelCikk(cikkek, most)?.slug, 'mai');
});

t('tegnapi Reel NEM mai, és a hibás dátum sem', () => {
  const most = Date.parse('2026-08-26T18:00:00.000Z');
  assert.equal(maiReelCikk([{ slug: 'regi', reel_at: '2026-08-25T18:33:00.000Z' }], most), null);
  assert.equal(maiReelCikk([{ slug: 'rossz', reel_at: 'nem-datum' }], most), null);
});

t('üres vagy hibás bemenet nem omlik össze', () => {
  assert.equal(maiReelCikk([], Date.now()), null);
  assert.equal(maiReelCikk(null, Date.now()), null);
  assert.equal(maiReelCikk(undefined, Date.now()), null);
});


// ===================================================================
// VÁLTOZATOSSÁG (2026-09-09) — a user vette észre: „sok az ismétlés"
// ===================================================================
// A VALÓDI ESET: az utolsó 8 Reelből 6 szó szerint „Getting started with
// <asszisztens>" volt — ChatGPT, Claude, Gemini, Copilot, DeepSeek, Le Chat.
//
// 🔑 AZ OK NEM HIBA VOLT, HANEM KÖVETKEZMÉNY. A tiszta FIFO pontosan azt
// csinálta, amit kértek tőle; csak a tartalmunk KÖTEGEKBEN készült (a
// legrégebbi útmutatók mind a 2026-06-22–24-i „alapító" kezdő-sorozatból
// valók), és FIFO + kötegelt tartalom = TÉMA-CSOMÓSODÁS.
//
// A javítás SZŰK: a FIFO marad a gerinc, csak átugorjuk azt a jelöltet,
// ami az elmúlt hét Reeljeivel azonos ESZKÖZRŐL vagy azonos CÍM-KEZDETTEL
// szól. Valódi adaton szimulálva: 4/15 ismétlés → 0/15, és a sor továbbra
// is az első ~18 elemből válogat (a hátralék ugyanúgy fogy).
console.log('\n🧪 változatosság — ne ugyanarról szóljon egy héten át');

const gm = (slug, at, cim, extra = {}) => g(slug, at, { md: `---\ntitle: "${cim}"\n---\n\n## Step 1 — x`, ...extra });

t('🔑 A VALÓDI ESET: hat „Getting started with…" után NEM a hetedik jön', () => {
  const cikkek = [
    // az elmúlt hat nap Reeljei — mind ugyanaz a forma
    gm('a', '2026-06-01', 'Getting started with ChatGPT', { tool: 'ChatGPT', reel_at: '2026-08-19T09:00:00Z' }),
    gm('b', '2026-06-02', 'Getting started with Claude', { tool: 'Claude', reel_at: '2026-08-20T09:00:00Z' }),
    gm('c', '2026-06-03', 'Getting started with Gemini', { tool: 'Gemini', reel_at: '2026-08-21T09:00:00Z' }),
    // a jelöltek: a LEGRÉGEBBI megint ugyanolyan, a következő más
    gm('d', '2026-06-04', 'Getting started with Perplexity', { tool: 'Perplexity' }),
    gm('e', '2026-06-05', 'How to plan a trip with AI', { tool: '' })
  ];
  const v = kovetkezoReel(cikkek, MOST);
  assert.equal(v.slug, 'e', 'megint „Getting started with…" ment volna ki: ' + (v && v.slug));
});

t('🔑 ugyanaz az ESZKÖZ sem jöhet a héten belül', () => {
  // Két KÜLÖNBÖZŐ cím-kezdet, de ugyanaz a termék — a nézőnek az is ismétlés.
  const cikkek = [
    gm('a', '2026-06-01', 'Getting started with Claude', { tool: 'Claude', reel_at: '2026-08-24T09:00:00Z' }),
    gm('b', '2026-06-02', 'Organize your work with Claude Projects', { tool: 'Claude' }),
    gm('c', '2026-06-03', 'How to plan a trip with AI', { tool: '' })
  ];
  assert.equal(kovetkezoReel(cikkek, MOST).slug, 'c');
});

t('🔑 FIFO MARAD, ha nincs hasonlóság — nem véletlenszerű', () => {
  const cikkek = [
    gm('regi', '2026-06-01', 'How to plan a trip with AI'),
    gm('ujabb', '2026-07-01', 'Summarize any long document')
  ];
  assert.equal(kovetkezoReel(cikkek, MOST).slug, 'regi', 'a legrégebbinek kell mennie');
});

t('🚨 VISSZAESÉS: ha MINDEN jelölt hasonlít, akkor is MEGY Reel', () => {
  // A változatosság kényelem, a napi videó a feladat. Enélkül a sor némán
  // megállna — és az „elromlott" pontosan úgy nézne ki, mint a „nincs jelölt".
  const cikkek = [
    gm('volt', '2026-06-01', 'Getting started with ChatGPT', { tool: 'ChatGPT', reel_at: '2026-08-24T09:00:00Z' }),
    gm('x', '2026-06-02', 'Getting started with ChatGPT Voice', { tool: 'ChatGPT' }),
    gm('y', '2026-06-03', 'Getting started with ChatGPT Memory', { tool: 'ChatGPT' })
  ];
  const v = kovetkezoReel(cikkek, MOST);
  assert.ok(v, '⚠️ a sor MEGÁLLT — a változatosság nem előzheti meg a feladatot');
  assert.equal(v.slug, 'x', 'visszaeséskor a LEGRÉGEBBI megy');
});

t('a hét ELŐTTI Reel már nem korlátoz (az ablak gördül)', () => {
  const cikkek = [
    // 8 régebbi Reel, mind más formájú — a „Getting started" kicsúszik az ablakból
    ...Array.from({ length: 8 }, (_, i) =>
      gm('r' + i, '2026-05-0' + (i + 1), 'Filler title number ' + i, { reel_at: `2026-08-1${i}T09:00:00Z` })),
    gm('regen', '2026-04-01', 'Getting started with ChatGPT', { tool: 'ChatGPT', reel_at: '2026-08-01T09:00:00Z' }),
    gm('most', '2026-06-01', 'Getting started with Claude', { tool: 'Claude' })
  ];
  assert.equal(kovetkezoReel(cikkek, MOST).slug, 'most', 'a 8 nappal ezelőtti forma még mindig korlátoz');
});

t('a forma: eszköz + a cím első HÁROM szava', () => {
  const f = reelForma({ tool: 'ChatGPT', md: '---\ntitle: "Getting Started with ChatGPT: Your First 15 Minutes"\n---' });
  assert.equal(f.eszkoz, 'chatgpt');
  assert.equal(f.kezdet, 'getting started with');
  // Három szó, mert a „getting started with" és a „how to use" is három.
  assert.equal(reelForma({ md: '---\ntitle: "How to use Meta AI"\n---' }).kezdet, 'how to use');
});

t('hiányzó cím/eszköz nem dob és nem korlátoz', () => {
  for (const rossz of [null, undefined, {}, { md: 42 }, { tool: null }]) {
    assert.doesNotThrow(() => reelForma(rossz));
    const f = reelForma(rossz);
    assert.equal(f.eszkoz, '');
    assert.equal(f.kezdet, '');
  }
  // Üres forma NEM korlátozhat: különben egy cím nélküli régi Reel mindent kizárna.
  const cikkek = [
    gm('volt', '2026-06-01', '', { reel_at: '2026-08-24T09:00:00Z' }),
    gm('a', '2026-06-02', 'How to plan a trip with AI')
  ];
  assert.equal(kovetkezoReel(cikkek, MOST).slug, 'a');
});

t('🚨 az ESZKÖZ NÉLKÜLI cikkek nem zárják ki EGYMÁST', () => {
  // ⚠️ EZT A LÉPÉST MUTÁCIÓVAL TALÁLTAM MEG. Az előző eset egyetlen jelölttel
  // dolgozott, ezért a visszaesés amúgy is ugyanazt adta — vagyis NEM MÉRTE,
  // amit hittem. Itt KÉT jelölt van, és a helyes válasz a régebbi.
  //
  // A VALÓDI KOCKÁZAT: a Reeljeink egy részének NINCS `tool` mezője (mérve: a
  // 16 eddigiből 5). Ha az üres eszköz „formának" számítana, EGY ilyen Reel
  // után MINDEN eszköz nélküli jelölt kiesne — pedig azok épp a legáltalánosabb,
  // legjobban terjedő útmutatóink („How to plan a trip with AI").
  const cikkek = [
    gm('volt', '2026-06-01', 'Filler title here', { reel_at: '2026-08-24T09:00:00Z' }),  // nincs tool
    gm('altalanos', '2026-06-02', 'How to plan a trip with AI'),                          // nincs tool
    gm('eszkozos', '2026-07-01', 'Organize your work with Claude', { tool: 'Claude' })
  ];
  assert.equal(kovetkezoReel(cikkek, MOST).slug, 'altalanos',
    '⚠️ az eszköz nélküli jelölt kiesett, mert egy korábbi Reelnek sem volt eszköze');
});

t('🔑 a sor-döntés MEGKAPJA a tool mezőt (különben fél szabály vak)', () => {
  // A `cikkekBetolt()` a reel-post.js-ben van, ami NEM importálható
  // (posztolna). Forrásból nézzük — a kommenteket levágva, mert a fejléc is
  // leírja a mezőnevet.
  const src = readFileSync(new URL('./reel-post.js', import.meta.url), 'utf-8')
    .split('\n').filter(s => !s.trim().startsWith('//')).join('\n');
  assert.ok(/tool:\s*m\.tool/.test(src),
    '⚠️ a cikkekBetolt() nem adja tovább a tool mezőt — az eszköz-ismétlés némán átcsúszna');
});

t('🔑 CSAK FRISS: a maxKorNap-nál régebbi útmutatóból nincs Reel (user 09-27)', () => {
  const ut = (slug, napja) => ({ slug, type: 'guide', published_at: new Date(MOST - napja * 864e5).toISOString(), reel_at: '' });
  const cikkek = [ut('regi', 40), ut('friss', 2)];
  assert.equal(kovetkezoReel(cikkek, MOST, { maxKorNap: 7 }).slug, 'friss');
  assert.equal(kovetkezoReel([ut('regi', 40)], MOST, { maxKorNap: 7 }), null, 'régi útmutatóból Reel készülne');
  assert.equal(kovetkezoReel([ut('regi', 40)], MOST).slug, 'regi', 'kapcsoló nélkül a régi viselkedés megmarad');
  const src = readFileSync(new URL('./reel-post.js', import.meta.url), 'utf-8');
  assert.match(src, /maxKorNap: REEL_FRISS_NAP/, 'a Reel-küldő nem kér csak frisset');
  const buf = readFileSync(new URL('../agents/social/buffer-poster.js', import.meta.url), 'utf-8');
  assert.match(buf, /selectSocialBatch\(q, keret, \{ csakFriss: true \}\)/, 'a Threads még a hátralékot üríti');
});

t('🔑 NAPI 2 REEL: a második is mehet, a harmadik nem; kapcsoló nélkül marad napi 1 (09-27)', () => {
  const ma = new Date(MOST - 3600e3).toISOString();
  const ut = (slug, reel = '') => ({ slug, type: 'guide', published_at: new Date(MOST - 2 * 864e5).toISOString(), reel_at: reel });
  const egyMent = [ut('a', ma), ut('b'), ut('c')];
  assert.ok(kovetkezoReel(egyMent, MOST, { napiMax: 2 }), 'a második napi Reel nem mehet');
  assert.equal(kovetkezoReel(egyMent, MOST), null, 'kapcsoló nélkül is mehetne második');
  const ketMent = [ut('a', ma), ut('b', ma), ut('c')];
  assert.equal(kovetkezoReel(ketMent, MOST, { napiMax: 2 }), null, 'harmadik Reel is menne');
  assert.deepEqual(maiReelCikkek(ketMent, MOST).map(c => c.slug).sort(), ['a', 'b']);
  const src = readFileSync(new URL('./reel-post.js', import.meta.url), 'utf-8');
  assert.match(src, /export const REEL_NAPI = 2;/);
  assert.match(src, /let napiKeret = REEL_NAPI;/);
  assert.match(src, /napiMax: napiKeret/);
  assert.match(src, /for \(const mai of maiak\)/, 'a nap minden Reeljét életben kell tartani');
});

// ── VIDEÓS CSATORNA (TikTok, 2026-10-07): a mai Reelek, amik ott még nem mentek ki ──
//
// A napi 2 Reel két KÜLÖN CI-futásban születik (reggel, délután). A TikTok-
// poszter mindkét futásban lefut, tehát a döntésnek tudnia kell: ami reggel
// már kiment TikTokra, az délután NE menjen újra; ami reggel elbukott, azt
// délután még pótolhatja — de a TEGNAPIT már nem (csak friss, user 09-27).

t('🎬 TikTok: csak a MAI, oda még ki nem küldött Reel — a korábbi elöl', () => {
  const ma1 = '2026-08-25T03:30:00Z', ma2 = '2026-08-25T15:10:00Z', tegnap = '2026-08-24T15:00:00Z';
  const cikkek = [
    g('delutani', '2026-01-01', { reel_at: ma2 }),
    g('reggeli', '2026-01-01', { reel_at: ma1 }),
    g('tegnapi', '2026-01-01', { reel_at: tegnap }),
    g('nincs-reel', '2026-01-01')
  ];
  const posztok = {
    delutani: { slug: 'delutani' },
    reggeli: { slug: 'reggeli' },
    tegnapi: { slug: 'tegnapi' }
  };
  const p = s => posztok[s] || null;
  assert.deepEqual(videoCsatornaMai(cikkek, p, 'posted_tiktok', MOST).map(x => x.slug), ['reggeli', 'delutani']);

  posztok.reggeli.posted_tiktok = '2026-08-25T03:40:00Z';
  assert.deepEqual(videoCsatornaMai(cikkek, p, 'posted_tiktok', MOST).map(x => x.slug), ['delutani'],
    '🔴 a reggel már kiment TikTok-videó délután újra menne');

  delete posztok.delutani;   // nincs közösségi szöveg → nem megy (idegen szöveggel sem)
  assert.deepEqual(videoCsatornaMai(cikkek, p, 'posted_tiktok', MOST), []);
  assert.deepEqual(videoCsatornaMai(null, p, 'posted_tiktok', MOST), []);
});

// ── TIKTOK-EXTRA (2026-10-11, user: „ha belefér a keretbe mehet több video is a tiktokra is!") ──

t('🎵 TikTok-extra: a LEGRÉGEBBI friss, videó nélküli útmutató; naponta egy', () => {
  const nap = d => new Date(MOST - d * 864e5).toISOString();
  const cikkek = [
    g('uj', nap(1)),
    g('regi', nap(6)),
    g('kiregedett', nap(9)),                         // 7 napnál régebbi
    g('reelt-kapott', nap(6.5), { reel_at: nap(2) }),
    g('mar-tiktok', nap(6.8), { tiktok_video_at: nap(3) }),
    { slug: 'hir', type: 'news', published_at: nap(6.9) }
  ];
  const opts = { maxKorNap: 7 };
  assert.equal(tiktokExtra(cikkek, MOST, opts).slug, 'regi', 'nem a kiöregedéshez legközelebbit választotta');
  assert.equal(tiktokExtra(cikkek, MOST, { ...opts, kizar: 'regi' }).slug, 'uj', '🔴 a most gyártott FB-Reel cikke lett a TikTok-extra is');
  assert.equal(tiktokExtra(cikkek, MOST, { ...opts, alkalmas: c => c.slug !== 'regi' }).slug, 'uj');

  const maMent = [...cikkek, g('mai-extra', nap(4), { tiktok_video_at: new Date(MOST - 3600e3).toISOString() })];
  assert.equal(tiktokExtra(maMent, MOST, opts), null, '🔴 ma már volt TikTok-extra — a második is menne');
  assert.deepEqual(maiTiktokExtra(maMent, MOST).map(c => c.slug), ['mai-extra']);
  assert.equal(tiktokExtra(cikkek, MOST, { ...opts, napiMax: 0 }), null, 'a 0-s keret nem állítja le');
  assert.equal(tiktokExtra([], MOST), null);
});

t('🎵 TikTok-poszter: a mai Reelek UTÁN a mai extra is megy — egyszer, a saját szövegével', () => {
  const ma = h => new Date(MOST - h * 3600e3).toISOString();
  const cikkek = [
    g('extra', '2026-08-20', { tiktok_video_at: ma(10) }),
    g('reel', '2026-08-21', { reel_at: ma(12) }),
    g('mindketto', '2026-08-19', { reel_at: ma(2), tiktok_video_at: ma(11) })   // FB később ugyanazt választotta
  ];
  const posztok = { extra: { slug: 'extra' }, reel: { slug: 'reel' }, mindketto: { slug: 'mindketto', posted_tiktok: ma(11) } };
  const p = s => posztok[s] || null;
  assert.deepEqual(videoCsatornaMai(cikkek, p, 'posted_tiktok', MOST).map(x => x.slug), ['reel', 'extra'],
    '🔴 az extra kimaradt, vagy ami már kiment TikTokra, újra menne');
});

t('🔌 a reel-post tényleg gyártja (a FB-Reel UTÁN, hibatűrően), a Buffer-poszter tényleg látja', () => {
  const src = readFileSync(new URL('./reel-post.js', import.meta.url), 'utf-8');
  // 10-14: a Reel-ág TTS-hibája (429) miatt a TikTok-extra EL SEM INDULT → a két ág független.
  assert.match(src, /try \{ ki = await prepareReel\(ROOT, join\); \} catch \(e\) \{ reelHiba = e; \}\s*\n\s*\/\/[^\n]*\n\s*try \{ await prepareTiktokExtra\(ROOT, join\); \}/,
    '🔴 a Reel-ág hibája után a TikTok-extra nem fut le');
  assert.match(src, /if \(reelHiba\) throw reelHiba;/, 'a Reel-ág hibáját nem szabad elnyelni (a riport innen tud róla)');
  assert.match(src, /export const TIKTOK_EXTRA_NAPI = 1;/);
  assert.match(src, /cikk\._meta\.tiktok_video_at = new Date\(\)\.toISOString\(\);/);
  assert.match(src, /tiktok_video_at: m\.tiktok_video_at \|\| ''/, 'a cikk-betöltő nem adja tovább a jelölést');
  assert.match(src, /for \(const c of maiTiktokExtra\(cikkek\)\)/, 'a mai extra videót életben kell tartani');
  const buf = readFileSync(new URL('../agents/social/buffer-poster.js', import.meta.url), 'utf-8');
  assert.match(buf, /tiktok_video_at: data\?\._meta\?\.tiktok_video_at \|\| ''/, '🔴 a Buffer-poszter nem látja a TikTok-extrát');
});

// ── FRISS VIDEÓ ELÉRHETŐSÉGE (2026-10-12: a Buffer 4 mp-cel a deploy után 404-et kapott) ──
{
  const { varjVideora } = await import('./reel-post.js');
  const sor = st => { let i = 0; return async () => ({ status: st[Math.min(i++, st.length - 1)], ok: st[Math.min(i - 1, st.length - 1)] === 200 }); };
  const alvasok = [];
  const alvas = async ms => { alvasok.push(ms); };
  const r1 = await varjVideora('https://x/v.mp4', { fetchFn: sor([404, 404, 200]), alvas, varasMs: 10, lecsengesMs: 99 });
  assert.equal(r1.ok, true, '🔴 egy 404 után feladta — a TikTok aznap kimaradt volna');
  assert.deepEqual(alvasok, [10, 10, 99], 'hiány után lecsengés is kell (a Buffer máshonnan tölt le)');
  alvasok.length = 0;
  assert.equal((await varjVideora('https://x/v.mp4', { fetchFn: sor([200]), alvas })).ok, true);
  assert.deepEqual(alvasok, [], 'elsőre meglévő videónál nincs várakozás');
  const r3 = await varjVideora('https://x/v.mp4', { fetchFn: sor([404]), alvas, probak: 3, varasMs: 1 });
  assert.equal(r3.ok, false); assert.equal(r3.status, 404);
  const buf = readFileSync(new URL('../agents/social/buffer-poster.js', import.meta.url), 'utf-8');
  assert.match(buf, /const h = await varjVideora\(video\);/, '🔴 a Buffer-poszter megint egyetlen HEAD-del dönt');
  pass++; console.log('  ✅ friss videó: újrapróba + lecsengés, a Buffer-poszter is ezt használja');
}

t('🔴 10-13: új Reel mellett a nap KORÁBBI Reelje is újragyártódik; a Buffer „nem olvasható" hibára újrapróbál', () => {
  const rp = readFileSync(new URL('./reel-post.js', import.meta.url), 'utf-8');
  const uj = rp.indexOf("console.log('✅ ' + r.seconds.toFixed(1) + ' mp — a küldés a deploy után jön (--send)');");
  const vege = rp.indexOf('return { betu: r.betu };', uj);
  assert.ok(uj > 0 && vege > uj, 'nem találom az új-Reel ágat');
  assert.match(rp.slice(uj, vege), /for \(const mai of maiReelCikkek\(cikkek\)\)[\s\S]*renderVideo/, '🔴 az új-Reel ág nem tartja életben a reggeli videót');
  const buf = readFileSync(new URL('../agents/social/buffer-poster.js', import.meta.url), 'utf-8');
  assert.match(buf, /VIDEO_NEM_OLVASHATO = \/could not be read from its URL\/i/);
  assert.match(buf, /VIDEO_NEM_OLVASHATO\.test\(r\.error\) && ujra <= 2/, '🔴 a Buffer-hibára nincs újrapróba');
});

// ── 10-13 + 10-14: a délutáni Reel MINDKÉT nap a tegnapi TikTok-extra volt → TikTok csak 2/3 ──
//
// Mindkét választó a LEGRÉGEBBI videó nélküli útmutatót keresi, tehát amit reggel a
// TikTok-extra elvitt, azt másnap a Facebook-Reel választotta — a TikTokra pedig
// ugyanaz kétszer nem megy. Két javítás: a Reel előnyben részesíti a még sehol nem
// videózott útmutatót, és ha mégis ütközik (fókusz, visszaesés), jár egy pótló extra.

t('🔴 10-14: a Reel a TikTokon még NEM járt útmutatót választja, ha van ilyen', () => {
  const nap = d => new Date(MOST - d * 864e5).toISOString();
  const cikkek = [
    g('tegnapi-extra', nap(6), { tiktok_video_at: nap(1) }),
    g('uj', nap(2)),
    g('legujabb', nap(1))
  ];
  assert.equal(kovetkezoReel(cikkek, MOST, { maxKorNap: 7, napiMax: 2 }).slug, 'uj',
    '🔴 a Reel a tegnapi TikTok-extrát választotta — a TikTokra így ma eggyel kevesebb megy');
  // VISSZAESÉS: ha minden jelölt járt már TikTokon, a Facebook akkor is kap Reelt.
  const csakVolt = [g('a', nap(5), { tiktok_video_at: nap(1) }), g('b', nap(3), { tiktok_video_at: nap(2) })];
  assert.equal(kovetkezoReel(csakVolt, MOST, { maxKorNap: 7, napiMax: 2 }).slug, 'a', '🔴 a Facebook Reel nélkül maradt');
  // A FÓKUSZ (Alexa) is a még nem videózottat keresi előbb, de ha csak TikTokon járt van, azt viszi.
  const alexa = [
    g('alexa-volt', nap(5), { tool: 'Alexa+', tiktok_video_at: nap(1) }),
    g('alexa-uj', nap(2), { tool: 'Alexa+' }),
    g('mas', nap(4))
  ];
  assert.equal(kovetkezoReel(alexa, MOST, { maxKorNap: 7, napiMax: 2, fokusz: 'Alexa+' }).slug, 'alexa-uj');
  assert.equal(kovetkezoReel(alexa.filter(c => c.slug !== 'alexa-uj'), MOST, { maxKorNap: 7, napiMax: 2, fokusz: 'Alexa+' }).slug,
    'alexa-volt', 'a fókusz-Reel elveszett, mert csak TikTokon járt Alexa-útmutató volt');
});

t('🎵 pótló extra: a mai Reel, ami korábbi napon már TikTok-extra volt, +1 extrát ad', () => {
  const nap = d => new Date(MOST - d * 864e5).toISOString();
  const ora = h => new Date(MOST - h * 3600e3).toISOString();
  const cikkek = [
    g('reggeli-reel', nap(3), { reel_at: ora(12) }),                               // új a TikTokon
    g('delutani-reel', nap(6), { reel_at: ora(2), tiktok_video_at: nap(1) }),      // tegnap már TikTok-extra
    g('mai-extra', nap(5), { tiktok_video_at: ora(13) }),
    g('regi-reel', nap(6), { reel_at: nap(2), tiktok_video_at: nap(3) })           // nem mai Reel
  ];
  assert.equal(tiktokPotlas(cikkek, MOST), 1, '🔴 a délutáni ütközés nem ad pótló extrát');
  // A MOST gyártott (még reel_at nélküli) Reel is számít — a délutáni futás ekkor dönt az extráról.
  const fuggo = [...cikkek, g('fuggo', nap(6), { tiktok_video_at: nap(2) })];
  assert.equal(tiktokPotlas(fuggo, MOST, 'fuggo'), 2);
  assert.equal(tiktokPotlas(fuggo, MOST, 'delutani-reel'), 1, 'ugyanaz a cikk kétszer számolva');
  // Ugyanaznapi extra + Reel NEM ütközés-pótlás: az a TikTokon egy videó, ami ma kiment.
  assert.equal(tiktokPotlas([g('x', nap(3), { reel_at: ora(1), tiktok_video_at: ora(5) })], MOST), 0);
  assert.equal(tiktokPotlas([], MOST), 0);
  assert.equal(tiktokPotlas(null, MOST), 0);
  const src = readFileSync(new URL('./reel-post.js', import.meta.url), 'utf-8');
  assert.match(src, /napiMax: TIKTOK_EXTRA_NAPI \+ tiktokPotlas\(cikkek, Date\.now\(\), fogalt\)/,
    '🔴 a TikTok-extra gyártója nem kapja meg a pótlást');
});

console.log('\n✅ reel-queue.test: mind a ' + pass + ' eset rendben');