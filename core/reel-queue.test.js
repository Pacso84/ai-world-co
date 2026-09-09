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
import { reelMaMar, kovetkezoReel, maiReelCikk, reelForma } from './reel-queue.js';

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

console.log('\n✅ reel-queue.test: mind a ' + pass + ' eset rendben');