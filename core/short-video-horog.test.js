// ===================================================================
// AZ ÚJ NYITÓKÉP („B") — a fájdalom-kérdéses horog-kártya tesztjei
// ===================================================================
//
// MIÉRT (2026-10-25, mérve): a FB Reels és a TikTok nézői átlagosan 2 mp-ig
// néznek, a 3 mp-et csak ~8% éri el. A 4 poszt, ami 500 megtekintés fölé
// ment, MIND egy FÁJDALOM-kérdéssel nyitott („Stop rewriting the same
// instructions…", „Need a name for your side project…?"). A régi első
// kártya a MEGOLDÁST (az útmutató címét) írta ki, alul, egy papírkártyán —
// ott, ahol a TikTok/Reels felülete takarja. A user a „B" tervet hagyta jóvá:
// „B szerintem, a kabala az összesítőnél legyen változatlanul!"
//
// Ez a fájl a TISZTA logikát nézi (hálózat, ffmpeg, TTS nélkül): a horog
// kinyerését, a kiemelést, a kártyát, az SVG szerkezetét, a pop-képkocka
// listáját és a bekötést. A VALÓDI betűvel mért szélesség-fésű a
// core/short-video.test.js-ben lakik (ott van a TTF-olvasó).
// ===================================================================

import assert from 'assert/strict';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  cardsFromGuide, horogSzovegbol, kiemeltSzavak, horogSvg, horogTordel, kepListaSor,
  horogSlugbol, UJ_NYITOKEP_BE, HOROG_X, HOROG_JOBB, HOROG_ALJA, HOROG_MIN_MERET,
  HOROG_MAX_SOR, POP_MP, W, H, REEL_MARKA, SAV_FELSO, SAV_ALSO, MARKAJEL_Y, POP_SKALA
} from './short-video.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

let pass = 0;
const t = (n, f) => { f(); pass++; console.log('  ✅ ' + n); };
console.log('🧪 álló rövidvideó — az új nyitókép (horog)\n');

const CIM_MEETING = 'How to Summarize and Organize a Long Meeting Transcript You Recorded';
const CIM_GROK = 'How to Use Grok to Brainstorm Gift Ideas for Anyone on Your List';
const Q_MEETING = 'Got a long meeting transcript sitting in your inbox?';
const Q_GROK = 'Stuck on what to get someone?';

const MD = `---
title: "${CIM_MEETING}"
---
## Step 1 — Paste the transcript into the chat
## Step 2 — Ask for a summary first
## Step 3 — Pull out decisions and action items
## Step 4 — List the open questions
`;

// A RÉGI első kártya, BETŰRE — a változtatás ELŐTTI kimenetből rögzítve
// (2026-10-25). A visszaesés-ágnak ezt kell adnia, semmi mást.
const REGI_ELSO = {
  cimke: '',
  nagy: 'Summarize and\nOrganize a Long\nMeeting Transcript',
  kicsi: 'In four steps',
  mond: 'Summarize and Organize a Long Meeting Transcript You Recorded. In four fast steps.',
  marka: 'FULL GUIDE: AIWORLDHQ.COM'
};

// ── 1. A HOROG KINYERÉSE A KÖZÖSSÉGI SZÖVEGBŐL ──────────────────────
t('horogSzovegbol: a valódi FB-szövegek ELSŐ mondata a horog', () => {
  assert.equal(horogSzovegbol(Q_MEETING + " Here's a simple way to pull out the summary. https://aiworldhq.com/article/x #meetings"), Q_MEETING);
  assert.equal(horogSzovegbol(Q_GROK + ' Grok can take a few details about the person.'), Q_GROK);
  assert.equal(horogSzovegbol('Stop rewriting the same instructions every time you chat with AI. Here is how.'),
    'Stop rewriting the same instructions every time you chat with AI.');
  assert.equal(horogSzovegbol('Need a name for your side project, podcast, or small business? Try this.'),
    'Need a name for your side project, podcast, or small business?');
});

t('horogSzovegbol: emoji és URL lekerül, a kérdésen belüli idézőjeles „?" nem vág', () => {
  assert.equal(horogSzovegbol('🔥 Stuck on what to get someone? More.'), Q_GROK);
  assert.equal(horogSzovegbol('Tired of getting “how do I do this?” calls from your folks? Here.'),
    'Tired of getting “how do I do this?” calls from your folks?');
});

t('horogSzovegbol: túl hosszú / túl rövid / URL / üres → null (a régi első kártya marad)', () => {
  assert.equal(horogSzovegbol(''), null);
  assert.equal(horogSzovegbol(null), null);
  assert.equal(horogSzovegbol(undefined), null);
  assert.equal(horogSzovegbol({}), null);
  assert.equal(horogSzovegbol('Hi there.'), null, '12 karakter alatt nincs horog');
  assert.equal(horogSzovegbol('x'.repeat(96) + '?'), null, '95 karakter fölött nincs horog');
  assert.equal(horogSzovegbol("Here's something that could make dealing with government less frustrating: AI that takes one request from a citizen and sends it."), null);
  assert.equal(horogSzovegbol('Read it at http//aiworldhq.com now please?'), null, 'a csonka „http" is kizáró ok');
  assert.equal(horogSzovegbol('https://aiworldhq.com/article/x'), null, 'csak URL → semmi nem marad');
});

// ── 2. A SÁRGA KIEMELÉS ─────────────────────────────────────────────
const szavakIdx = (q, idx) => idx.map(i => q.split(' ')[i]).join(' ');

t('kiemeltSzavak: a kérdés és a cím közös, ≥2 tartalmas szavas szakasza', () => {
  const k = kiemeltSzavak(Q_MEETING, CIM_MEETING);
  assert.equal(szavakIdx(Q_MEETING, k), 'long meeting transcript');
  assert.deepEqual(k, [2, 3, 4]);
});

t('kiemeltSzavak: nincs közös szakasz → nincs kiemelés', () => {
  assert.deepEqual(kiemeltSzavak(Q_GROK, CIM_GROK), [], 'az „on" és a „to" kötőszó, nem tartalom');
  assert.deepEqual(kiemeltSzavak('Got a long day ahead?', CIM_MEETING), [], 'egyetlen közös tartalmas szó kevés');
  assert.deepEqual(kiemeltSzavak('', CIM_MEETING), []);
  assert.deepEqual(kiemeltSzavak(Q_MEETING, ''), []);
});

t('kiemeltSzavak: TELJES szóalakra illeszt, nem előtagra (a „transcripts" nem „transcript")', () => {
  assert.deepEqual(kiemeltSzavak('Got long meeting transcripts?', CIM_MEETING).length, 2,
    'csak a „long meeting" — a „transcripts" más szóalak');
});

// ── 3. A KÁRTYA ─────────────────────────────────────────────────────
t('cardsFromGuide + horog → az első kártya „horog" típusú, a többi változatlan', () => {
  const regi = cardsFromGuide(MD).cards;
  const uj = cardsFromGuide(MD, { horog: Q_MEETING }).cards;
  assert.equal(uj.length, regi.length, 'a kártyák száma NEM változhat (a leírás lépésszáma ebből jön)');
  const k = uj[0];
  assert.equal(k.tipus, 'horog');
  assert.equal(k.kerdes, Q_MEETING);
  assert.deepEqual(k.kiemeles, [2, 3, 4]);
  assert.match(k.valasz, /\b4\b.*steps|four steps/i, 'a válasz kimondja a lépésszámot');
  assert.equal(k.valasz, 'Fix it in 4 steps ↓');
  assert.equal(k.mond, Q_MEETING + " Here's how, in four steps.");
  assert.equal(k.marka, REEL_MARKA);
  assert.deepEqual(uj.slice(1), regi.slice(1), 'a lépés- és a záró kártya betűre ugyanaz');
});

t('cardsFromGuide: kijelentés-horog után „See how in N steps ↓" (a „Fix it" csak kérdés után)', () => {
  const k = cardsFromGuide(MD, { horog: 'Stop rewriting the same prompts every week.' }).cards[0];
  assert.equal(k.tipus, 'horog');
  assert.equal(k.valasz, 'See how in 4 steps ↓');
});

t('cardsFromGuide horog NÉLKÜL / kikapcsolva / használhatatlan horoggal → a RÉGI első kártya, betűre', () => {
  assert.equal(UJ_NYITOKEP_BE, true, 'a kapcsoló alapból BE');
  assert.deepEqual(cardsFromGuide(MD).cards[0], REGI_ELSO);
  assert.deepEqual(cardsFromGuide(MD, { horog: null }).cards[0], REGI_ELSO);
  assert.deepEqual(cardsFromGuide(MD, { horog: '' }).cards[0], REGI_ELSO);
  assert.deepEqual(cardsFromGuide(MD, { horog: Q_MEETING, ujNyitokep: false }).cards[0], REGI_ELSO);
  assert.equal(JSON.stringify(cardsFromGuide(MD, { horog: Q_MEETING, ujNyitokep: false })),
    JSON.stringify(cardsFromGuide(MD)), 'kikapcsolva az EGÉSZ kimenet bájtra azonos');
});

t('cardsFromGuide: ha a kérdés 84 px-szel sem fér 5 sorba → a régi első kártya', () => {
  const nagyon = 'Supercalifragilisticexpialidocious antidisestablishmentarianism?';
  assert.equal(horogTordel(nagyon), null, 'egy szó szélesebb a sávnál');
  assert.deepEqual(cardsFromGuide(MD, { horog: nagyon }).cards[0], REGI_ELSO);
});

t('horogTordel: legfeljebb 5 sor, a betű legalább 84 px, a sorok együtt kiadják a kérdést', () => {
  for (const q of [Q_MEETING, Q_GROK,
    'Ever wish ChatGPT could just give you a neat table instead of a wall of text?']) {
    const r = horogTordel(q);
    assert.ok(r, 'befér: ' + q);
    assert.ok(r.sorok.length >= 1 && r.sorok.length <= HOROG_MAX_SOR, r.sorok.length + ' sor');
    assert.ok(r.meret >= HOROG_MIN_MERET && r.meret <= 116, 'méret: ' + r.meret);
    assert.equal(r.sorok.join(' '), q, 'egy szó sem veszhet el');
  }
  assert.equal(horogTordel(Q_GROK).meret, 116, 'a rövid kérdés a teljes méretet kapja');
});

// ── 4. AZ SVG ───────────────────────────────────────────────────────
const KARTYA = cardsFromGuide(MD, { horog: Q_MEETING }).cards[0];
const SVG = horogSvg(KARTYA, { W, H }).toString();
const xmlVissza = s => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const szovegElemek = svg => [...svg.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/g)]
  .map(m => ({ attr: m[1], szoveg: xmlVissza(m[2].replace(/<[^>]+>/g, '')), index: m.index }));
const szam = (attr, nev) => { const m = attr.match(new RegExp('\\s' + nev + '="([-\\d.]+)"')); return m ? +m[1] : NaN; };

t('horogSvg: a kérdés minden szava, a zöld válasz és az AI-jelölés rajta van', () => {
  const minden = szovegElemek(SVG).map(e => e.szoveg).join(' ');
  for (const sz of Q_MEETING.split(' ')) assert.ok(minden.includes(sz), 'hiányzik: ' + sz);
  assert.ok(minden.includes('Fix it in 4 steps ↓'), 'nincs zöld válasz');
  assert.ok(szovegElemek(SVG).some(e => e.szoveg.trim() === 'AI'), 'nincs AI-jelölés (EU AI Act)');
  assert.ok(/AI WORLD HQ/.test(minden), 'nincs márkajel');
  assert.ok(/<linearGradient\b/.test(SVG), 'nincs sötétítő átmenet');
  assert.ok(/#f5d547/i.test(SVG), 'nincs sárga kiemelés');
});

t('horogSvg: a márkasor alul („FULL GUIDE: AIWORLDHQ.COM"), a sávon belül — mint a többi kártyán', () => {
  const m = szovegElemek(SVG).find(e => e.szoveg === REEL_MARKA);
  assert.ok(m, 'nincs „FULL GUIDE" márkasor a nyitóképen (10-17-i döntés: minden kártyán)');
  assert.equal(szam(m.attr, 'y'), MARKAJEL_Y);
  assert.ok(MARKAJEL_Y <= SAV_ALSO);
});

t('horogSvg: az AI-jelölés és a fejléc a takart felső sáv ALATT (EU AI Act)', () => {
  const ai = SVG.match(/<rect x="(\d+)" y="(\d+)"[^>]*fill="#f2ede4"/);
  assert.ok(ai, 'nincs AI-doboz');
  assert.ok(+ai[2] >= SAV_FELSO, `az AI-doboz y=${ai[2]} a platform-fejléc alatt van (SAV_FELSO=${SAV_FELSO})`);
  for (const e of szovegElemek(SVG)) {
    const y = szam(e.attr, 'y'), meret = szam(e.attr, 'font-size');
    assert.ok(y - meret * 0.8 >= SAV_FELSO, `«${e.szoveg}» teteje a takart sávban`);
  }
});

t('horogSvg pop: csak a kérdés + pirula kicsinyül (≤ 1), a fejléc és a márkasor a csoporton KÍVÜL', () => {
  assert.ok(POP_SKALA > 0.8 && POP_SKALA < 1, 'a pop beugrás kisebbről indul — nagyítás kilógna a sávból');
  const pop = horogSvg(KARTYA, { skala: POP_SKALA }).toString();
  const g = pop.indexOf('<g transform=');
  assert.ok(g > 0, 'nincs skálázott csoport');
  assert.ok(pop.indexOf(REEL_MARKA) < g && pop.indexOf('>AI<') < g, 'a márkasor / AI-jel a skálázott csoportba került');
  assert.ok(pop.indexOf('Fix it in') > g, 'a pirula nincs a csoportban');
  assert.ok(!/<g transform=/.test(SVG), 'a normál kockán nincs skálázás');
});

t('horogTordel: a zöld pirula alja sosem éri el a márkasort (minden valódi horogra lent is mérve)', () => {
  for (const q of [Q_MEETING, Q_GROK, 'Ever wish ChatGPT could just give you a neat table instead of a wall of text?']) {
    const svg = horogSvg(cardsFromGuide(MD, { horog: q }).cards[0]).toString();
    const p = svg.match(/<rect x="\d+" y="(\d+)" width="\d+" height="(\d+)" rx="\d+" fill="#5f8a76"/);
    assert.ok(p, 'nincs pirula');
    assert.ok(+p[1] + +p[2] <= HOROG_ALJA, `pirula alja ${+p[1] + +p[2]} > ${HOROG_ALJA}`);
  }
});

t('horogSzovegbol: egybetűs rövidítés („U.S.") nem vágja el a mondatot', () => {
  assert.equal(horogSzovegbol('Moved to the U.S. and confused by taxes? Here is how.'), 'Moved to the U.S. and confused by taxes?');
});

t('horogSvg: semmi szöveg a pirula alatt (kivéve a márkasort), semmi a bal margón kívül', () => {
  const el = szovegElemek(SVG);
  assert.ok(el.length >= 7, 'gyanúsan kevés szöveg-elem: ' + el.length);
  for (const e of el) {
    const y = szam(e.attr, 'y'), meret = szam(e.attr, 'font-size'), x = szam(e.attr, 'x');
    assert.ok(Number.isFinite(y) && Number.isFinite(meret) && Number.isFinite(x), 'hiányzó x/y/font-size: ' + e.attr);
    if (e.szoveg !== REEL_MARKA) assert.ok(y + meret * 0.26 <= HOROG_ALJA, `«${e.szoveg}» alja ${Math.round(y + meret * 0.26)} > ${HOROG_ALJA}`);
    assert.ok(x >= HOROG_X - 1, `«${e.szoveg}» x=${x} a bal margón kívül`);
    assert.ok(x < W - HOROG_JOBB, `«${e.szoveg}» x=${x} a jobb oldali gombsor alatt kezdődik`);
    assert.ok(!/text-anchor="(end|middle)"/.test(e.attr), 'csak balra zárt szöveg van (a jobb szél így mérhető)');
  }
});

t('horogSvg: a sárga téglalapok MIND a szövegek ELŐTT állnak (különben levágják a fenti sor szárait)', () => {
  const sargak = [...SVG.matchAll(/<rect\b[^>]*fill="#f5d547"/gi)].map(m => m.index);
  // a kérdés szövegei a <g> csoportban vannak (a fejléc és a márkasor előtte, azok nem érintkeznek a sárgával)
  const g = SVG.indexOf('<g>');
  assert.ok(g > 0, 'nincs kérdés-csoport');
  const elsoSzoveg = g + SVG.slice(g).search(/<text\b/);
  // sorönként EGY téglalap: ahány sorban kiemelt szó van
  const { sorok } = horogTordel(Q_MEETING);
  let idx = 0, varhato = 0;
  for (const s of sorok) {
    const n = s.split(' ').length;
    if (KARTYA.kiemeles.some(i => i >= idx && i < idx + n)) varhato++;
    idx += n;
  }
  assert.ok(varhato >= 1);
  assert.equal(sargak.length, varhato, 'sorönként egy sárga téglalap kell');
  assert.ok(Math.max(...sargak) < elsoSzoveg, 'van sárga téglalap egy szöveg UTÁN');
});

t('horogSvg: kiemelés nélküli kérdésen nincs sárga téglalap', () => {
  const k = cardsFromGuide(MD.replace(CIM_MEETING, CIM_GROK), { horog: Q_GROK }).cards[0];
  assert.deepEqual(k.kiemeles, []);
  assert.ok(!/#f5d547/i.test(horogSvg(k).toString()));
});

t('horogSvg: a kiemelt szavak TINTA színnel, a többi fehérrel', () => {
  assert.ok(/<tspan[^>]*fill="#1c1a16"[^>]*>long\b/.test(SVG), 'a „long" nem tinta színű');
  assert.ok(/<tspan[^>]*fill="#ffffff"[^>]*>Got a ?<\/tspan>/.test(SVG), 'a „Got a" nem fehér');
  assert.ok(!/<tspan[^>]*fill="#1c1a16"[^>]*> /.test(SVG) && !/<tspan[^>]*fill="#1c1a16"[^>]*>[^<]* <\/tspan>/.test(SVG),
    'a sárga darab nem kezdődhet/végződhet szóközzel (a téglalap kilógna)');
});

// ── 5. A POP: KÉT KÉPKOCKA AZ ELSŐ KÁRTYÁN ──────────────────────────
t('kepListaSor pop NÉLKÜL → betűre a régi kepek.txt', () => {
  const idok = [3.2, 2.5, 2.75];
  const regi = idok.map((_, i) => `file 'k${i}.jpg'\nduration ${idok[i].toFixed(3)}`).join('\n')
    + `\nfile 'k${idok.length - 1}.jpg'\n`;
  assert.equal(kepListaSor(idok), regi);
  assert.equal(kepListaSor(idok, { pop: false }), regi);
});

t('kepListaSor pop-pal → az első kártya KÉT bejegyzés, a hosszuk összege idok[0]', () => {
  const idok = [3.2147, 2.5, 2.75];
  const s = kepListaSor(idok, { pop: true });
  const sorok = [...s.matchAll(/file '([^']+)'\nduration ([\d.]+)/g)].map(m => ({ f: m[1], d: +m[2] }));
  assert.equal(sorok.length, 4);
  assert.equal(sorok[0].f, 'k0p.jpg', 'előbb a nagyított kocka');
  assert.equal(sorok[1].f, 'k0.jpg');
  assert.equal(sorok[0].d, POP_MP);
  assert.ok(Math.abs(sorok[0].d + sorok[1].d - +idok[0].toFixed(3)) < 0.0005, 'a kártya hossza nem változhat (a hanghoz van kötve)');
  assert.deepEqual(sorok.slice(2).map(x => x.f), ['k1.jpg', 'k2.jpg']);
  assert.ok(s.endsWith("\nfile 'k2.jpg'\n"), 'a concat-trükk: az utolsó kép még egyszer');
  // rövid első kártya: a pop legfeljebb a fele
  const r = [...kepListaSor([0.3, 1], { pop: true }).matchAll(/duration ([\d.]+)/g)].map(m => +m[1]);
  assert.ok(r[0] <= 0.15 + 1e-9 && Math.abs(r[0] + r[1] - 0.3) < 0.0005, JSON.stringify(r));
});

// ── 6. A HOROG FORRÁSA: content/social/<slug>.json ──────────────────
t('horogSlugbol: a valódi közösségi fájlból olvas; hiányzó fájl / üres slug → null', () => {
  assert.equal(horogSlugbol(ROOT, 'how-to-summarize-and-organize-a-long-meeting-transcript-you-recorded'), Q_MEETING);
  assert.equal(horogSlugbol(ROOT, 'how-to-use-grok-to-brainstorm-gift-ideas-for-anyone-on-your-list'), Q_GROK);
  assert.equal(horogSlugbol(ROOT, 'nincs-ilyen-slug-zzqq'), null);
  assert.equal(horogSlugbol(ROOT, ''), null);
  assert.equal(horogSlugbol(ROOT, '../package'), null, 'útvonal-trükk nem jut ki a mappából');
});

// ── 7. A BEKÖTÉS — a függvények léte semmit nem bizonyít ─────────────
const kodbol = f => readFileSync(join(ROOT, 'core', f), 'utf-8')
  .split('\n').filter(s => !s.trim().startsWith('//')).join('\n');

t('a reel-post MINDEN útmutató-videó gyártásánál átadja a horgot (4 hely)', () => {
  const rp = kodbol('reel-post.js');
  const db = (rp.match(/horog: horogSlugbol\(ROOT, /g) || []).length;
  assert.equal(db, 4, db + ' helyen (4 kell: TikTok-extra + újragyártás + fő ág + a nap korábbi Reelje)');
  // minden renderVideo-hívás előtt közvetlenül horgos kártya készül (a csomag-reklám kivétel)
  const renderek = (rp.match(/await renderVideo\(/g) || []).length;
  assert.equal(renderek, 5, 'a renderVideo-hívások száma megváltozott — nézd át a horog-bekötést');
});

t('a short-video parancssora (CI „csak_render" / reel-test.yml) is horgot ad', () => {
  const sv = kodbol('short-video.js');
  assert.ok(/cardsFromGuide\(a\.article_markdown \|\| '', \{ horog: horogSlugbol\(ROOT, slug\) \}\)/.test(sv));
});

t('a renderVideo a horog-kártyát a horogSvg-vel rajzolja, és pop-kockát tesz elé', () => {
  const sv = kodbol('short-video.js');
  assert.ok(/horogKep\(sharp, cards\[0\]/.test(sv), 'a renderVideo nem a horogKep-et hívja');
  assert.ok(/kepListaSor\(idok, \{ pop: horogKartya \}\)/.test(sv), 'a kepek.txt nem a kepListaSor-ból jön');
});

t('a csomag-reklám nem kap horgot (a saját dizájnja marad)', () => {
  assert.ok(!/horog/.test(kodbol('packs-reel.js')));
});

console.log('\n✅ short-video-horog.test: mind a ' + pass + ' eset rendben');
