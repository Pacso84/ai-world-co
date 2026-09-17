// ===================================================================
// ÁLLÓ RÖVIDVIDEÓ — a szkript-kinyerés tesztjei
// ===================================================================
//
// MIÉRT INGYENES A SZKRIPT. Mérve (2026-08-23): a 352 útmutató MINDEGYIKE
// legalább 3 lépéses, és a 2026 lépés-cím MIND ugyanabban a formában áll:
// „Step N — <cím>". Ezért a videó szövegéhez NEM kell AI — a cikk saját
// szerkezete adja. A hang (msedge-tts), a kép (sharp) és az összerakás
// (ffmpeg) is ingyenes, tehát a teljes lánc $0.
//
// Ez a fájl CSAK a tiszta logikát nézi: hálózat, ffmpeg és fájlírás nélkül.
// ===================================================================

import assert from 'assert/strict';
import { readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  cardsFromGuide, splitHeading, horogCimbol, videoArgs, tablaSvg,
  MIN_LEPES, SAV_FELSO, SAV_ALSO, W
} from './short-video.js';
import { BETU_CSALAD } from './video-font.js';
import { fm } from './frontmatter.js';
import { utmutatoE } from './guide-kind.js';

// ⚠️ MEGHAJTÓBETŰS ÚTVONAL ITT TILOS (core/test-hygiene.test.js őrzi): Linuxon
// az relatív mappa lenne, és a kiadási lánc `git add -A`-ja becommitolná.
const __dirname = dirname(fileURLToPath(import.meta.url));
const CIKK_DIR = join(__dirname, '..', 'content', 'articles');

let pass = 0;
const t = (n, f) => { f(); pass++; console.log('  ✅ ' + n); };
console.log('🧪 álló rövidvideó — szkript\n');

const CIKK = `---
title: "How to Spot a Deepfake Video or Voice Clone Before You Share It"
subtitle: "Five quick checks anyone can run in under two minutes"
---

# How to Spot a Deepfake Video or Voice Clone Before You Share It

> **In short:** Look at the eyes, mouth and face edges.

## Before you start

Semmi különös.

## Step 1 — Watch the face for small glitches

Szöveg.

## Step 2 — Listen to the voice for flat delivery

Szöveg.

## Step 3 — Read the message around the clip

Szöveg.

## Step 4 — Run a quick source check

Szöveg.

## Step 5 — Decide what to do next

Szöveg.

## Common mistakes
`;

// ── a cím kettévágása: nagy szöveg + alcím ──────────────────────────
//
// A kézzel írt mintában a „Step 1 — Watch the face for small glitches"
// ebből lett: NAGY „Watch the face", kicsi „for small glitches". Ez nem
// ötlet volt, hanem a mondat természetes törése — és gépiesíthető: a
// vágás ott jó, ahol a nagy szöveg ~18 karakter körül van.

t('a hosszú lépés-címet természetes ponton vágja ketté', () => {
  const r = splitHeading('Watch the face for small glitches');
  assert.equal(r.nagy, 'Watch the face');
  assert.equal(r.kicsi, 'for small glitches');
});

t('nem az ELSŐ töréspontnál vág, hanem a legjobbnál', () => {
  // A „to" hamarabb jön, de utána 1 szó maradna: „Listen".
  const r = splitHeading('Listen to the voice for flat delivery');
  assert.equal(r.nagy, 'Listen to the voice');
  assert.equal(r.kicsi, 'for flat delivery');
});

t('a rövid címet nem darabolja', () => {
  const r = splitHeading('Run a quick source check');
  assert.equal(r.nagy, 'Run a quick source check');
  assert.equal(r.kicsi, '');
});

t('a zárójeles kiegészítés lekerül — a kártyán is, a hangban is', () => {
  const r = splitHeading('Meet the friendly all-rounders (ChatGPT and Gemini)');
  assert.ok(!r.nagy.includes('('), 'zárójel nem fér a kártyára');
  assert.ok(!r.kicsi.includes('('));
});

// ── a kártyák ───────────────────────────────────────────────────────

t('🎬 a horog, a lépések és a záró kártya sorban állnak elő', () => {
  const { cards } = cardsFromGuide(CIKK, { maxSteps: 4 });
  assert.equal(cards.length, 6, 'horog + 4 lépés + záró');
  assert.equal(cards[0].cimke, '', 'a horgon nincs sorszám');
  assert.deepEqual(cards.slice(1, 5).map(c => c.cimke), ['01', '02', '03', '04']);
  assert.match(cards[5].nagy, /aiworldhq/, 'a végén a domain');
});

t('🎬 a horog FELSZÓLÍTÓ, nem körülírás — az első két másodperc dönt', () => {
  // Az első változat „Here is how to Spot a Deepfake…"-et mondott: hosszabb,
  // sutább, és a lényeg csak a negyedik szó után jött.
  const { cards } = cardsFromGuide(CIKK, { maxSteps: 4 });
  assert.match(cards[0].mond, /^Spot a Deepfake/, 'a „How to" lekerül');
  assert.ok(!/here is how/i.test(cards[0].mond));
  assert.match(cards[0].mond, /four fast steps/i, 'mondja meg, mennyi jön');
});

t('🎬 a „Before you start" és a „Common mistakes" NEM lépés', () => {
  const { cards } = cardsFromGuide(CIKK, { maxSteps: 4 });
  const szoveg = cards.map(c => c.nagy + ' ' + c.kicsi).join(' ');
  assert.ok(!/Before you start/i.test(szoveg));
  assert.ok(!/Common mistakes/i.test(szoveg));
});

t('🎬 a kimondott mondat sorszámot kap, hogy követhető legyen', () => {
  const { cards } = cardsFromGuide(CIKK, { maxSteps: 4 });
  assert.match(cards[1].mond, /^One[.,]/);
  assert.match(cards[2].mond, /^Two[.,]/);
});

t('🎬 a domain KIMONDVA is érthető — „dot com", nem pont', () => {
  const { cards } = cardsFromGuide(CIKK, { maxSteps: 4 });
  assert.match(cards.at(-1).mond, /dot com/, 'a felolvasó a pontot nem mondja ki');
});

// ── amikor NEM készül videó ─────────────────────────────────────────
//
// A hallgatás a biztonságos irány: rossz videót kitenni rosszabb, mint
// nem kitenni semmit.

t('⛔ három lépésnél kevesebből nem lesz videó', () => {
  const rovid = CIKK.replace(/## Step [3-5][\s\S]*?(?=## |$)/g, '');
  const r = cardsFromGuide(rovid, { maxSteps: 4 });
  assert.equal(r.cards, null);
  assert.match(r.reason, /lépés/i, 'mondja meg, miért nem');
});

t('⛔ cím nélküli cikkből nem lesz videó', () => {
  const r = cardsFromGuide(CIKK.replace(/title: ".*"/, ''), { maxSteps: 4 });
  assert.equal(r.cards, null);
});

t('⛔ üres vagy hiányzó bemenetre nem borulunk', () => {
  for (const x of ['', null, undefined, 12]) {
    const r = cardsFromGuide(x, {});
    assert.equal(r.cards, null);
  }
});

t('a MIN_LEPES egy helyen él, nem szórva a kódban', () => {
  assert.equal(typeof MIN_LEPES, 'number');
  assert.ok(MIN_LEPES >= 3);
});

// ── hossz: a Reels rövid műfaj ──────────────────────────────────────

t('⏱️ négy lépésnél a felolvasandó szöveg belefér ~30 másodpercbe', () => {
  const { cards } = cardsFromGuide(CIKK, { maxSteps: 4 });
  const szavak = cards.map(c => c.mond).join(' ').split(/\s+/).length;
  // ~2,6 szó/másodperc a mért felolvasási tempó
  const mp = szavak / 2.6;
  assert.ok(mp < 34, 'túl hosszú lenne: ' + mp.toFixed(1) + ' mp (' + szavak + ' szó)');
  assert.ok(mp > 12, 'túl rövid: ' + mp.toFixed(1) + ' mp');
});

t('⏱️ a maxSteps tényleg korlátoz', () => {
  assert.equal(cardsFromGuide(CIKK, { maxSteps: 3 }).cards.length, 5);
  assert.equal(cardsFromGuide(CIKK, { maxSteps: 5 }).cards.length, 7);
});

// ── a Facebook követelményei ────────────────────────────────────────
//
// ÉLES LELET (2026-08-23): a legyártott fájlt átengedtem volna, pedig a
// színformátuma `yuvj420p` lett a várt `yuv420p` helyett. A JPEG-bemenet
// TELJES színtartományú, és ezt az ffmpeg végig magával viszi — a `-pix_fmt`
// kapcsoló ezen NEM segít, a szűrőlánc végén kell a `format=yuv420p`.
//
// A Facebook az ilyet vagy újrakódolja (romlik a minőség), vagy fakó, túl
// kontrasztos színekkel adja vissza. Nem állította volna meg a posztolást —
// csak rosszul nézett volna ki, és nem tudtuk volna, miért. A kész fájlt nem
// tudjuk itt megnézni (ffmpeg + hálózat kellene), de az ARGUMENTUMOKAT igen.

t('🎥 a színformátum a SZŰRŐLÁNCBAN dől el, nem a -pix_fmt kapcsolón', () => {
  const a = videoArgs({ kepek: 'k.txt', hang: 'h.mp3', out: 'ki.mp4' });
  const vf = a[a.indexOf('-vf') + 1];
  assert.match(vf, /format=yuv420p/, 'enélkül yuvj420p lesz a JPEG-ekből');
  assert.match(vf, /out_range=tv/, 'a skálázónak is szólni kell a tartományról');
});

t('🎥 a méret 1080x1920 marad — a Reels ezt várja', () => {
  const a = videoArgs({ kepek: 'k.txt', hang: 'h.mp3', out: 'ki.mp4' });
  assert.match(a[a.indexOf('-vf') + 1], /scale=1080:1920/);
});

t('🎥 faststart: a moov atom a fájl ELEJÉRE kerül', () => {
  // Enélkül a letöltőnek az EGÉSZ fájlt le kell húznia, mielőtt bármit kezdene.
  const a = videoArgs({ kepek: 'k.txt', hang: 'h.mp3', out: 'ki.mp4' });
  assert.equal(a[a.indexOf('-movflags') + 1], '+faststart');
});

t('🎥 h264 + aac — amit a Facebook elfogad', () => {
  const a = videoArgs({ kepek: 'k.txt', hang: 'h.mp3', out: 'ki.mp4' });
  assert.equal(a[a.indexOf('-c:v') + 1], 'libx264');
  assert.equal(a[a.indexOf('-c:a') + 1], 'aac');
  assert.equal(a[a.indexOf('-r') + 1], '30', '23–60 közé kell esnie');
});

// ── A TÁBLA: „PAPÍR" DIZÁJN (2026-09-17) ────────────────────────────
//
// A régi tábla sötét volt, és fehér szöveget írt az ELMOSOTT borítóképre.
// Két baja volt, mindkettő MÉRT:
//
//  1. A borítók AI-val generált képek, és hibás feliratot tartalmazhatnak:
//     a Perplexity-útmutató borítóján „perrplexity" állt, két r-rel.
//     Elmosva nem tűnt fel — élesen kitéve a hitelességünkbe kerülne.
//     Ezért a háttér ma egybefüggő papírszín, kép nélkül.
//  2. A látható elemek a platform saját felületrétegei ALATT voltak —
//     lásd a következő szakaszt.

const MINTA_TABLA = { cimke: '01', nagy: 'Watch the\nface', kicsi: 'for small glitches' };

t('🎨 papír háttér és tinta-szöveg — nem sötét tábla fehér felirattal', () => {
  const svg = tablaSvg(MINTA_TABLA, 0, 5).toString();
  assert.match(svg, /<rect width="1080" height="1920" fill="#f2ede4"\/>/, 'egybefüggő papír háttér');
  assert.match(svg, /fill="#1c1a16"[^>]*>Watch the</, 'a nagy szöveg tinta-színű');
  assert.ok(!/opacity="0\.8/.test(svg), 'nincs áttetsző elfedő réteg — nincs mit elfedni');
});

t('🎨 a felső vonal zsálya, teljes szélességű', () => {
  const svg = tablaSvg(MINTA_TABLA, 0, 5).toString();
  assert.match(svg, /<rect x="0" y="0" width="1080" height="14" fill="#5f8a76"\/>/);
});

t('🇪🇺 az „AI"-jel MINDEN táblán ott van — EU AI Act', () => {
  // Nem csak a lépés-táblákon: a horgon és a záró táblán is. Aki a Reelt
  // látja, esetleg CSAK azt látja — a jelölésnek ott kell lennie.
  for (const c of [MINTA_TABLA, { cimke: '', nagy: 'aiworldhq\n.com', kicsi: '' }]) {
    const svg = tablaSvg(c, 0, 5).toString();
    assert.match(svg, /<rect x="914" y="270" width="96" height="56" rx="10" fill="#1c1a16"\/>/,
      'az „AI"-jel doboza');
    assert.match(svg, /font-weight="900" fill="#f2ede4">AI<\/text>/, 'a doboz felirata');
  }
});

t('🎨 a márkajel a domain, nem a régi szóköz-tagolt név', () => {
  const svg = tablaSvg(MINTA_TABLA, 0, 5).toString();
  assert.match(svg, />AIWORLDHQ\.COM</, 'a nézőnek beírható alakban kell');
  assert.ok(!/>AI WORLD HQ</.test(svg));
});

t('🔤 a BETU_CSALAD MINDEN <text>-en ott van — nincs kimaradó elem', () => {
  // ÉLES LELET (2026-09-17): az „Arial Black" a fejlesztői Windowson VAN, a
  // CI ubuntu-latest futtatóján NINCS — ott a betűmotor némán egy vékonyabb
  // alapbetűre esett vissza, és három hétig nem az a videó ment ki, amit
  // terveztünk. A betűt egy helyen kérjük (core/video-font.js), és itt
  // ellenőrizzük, hogy MINDEN szöveg azt kapja.
  for (const c of [MINTA_TABLA, { cimke: '', nagy: 'egy\nket\nharom', kicsi: 'alcim' }]) {
    const tagek = tablaSvg(c, 1, 5).toString().match(/<text\b[^>]*>/g) || [];
    assert.ok(tagek.length >= 4, 'túl kevés <text> — romlott a mérőeszköz: ' + tagek.length);
    for (const tag of tagek) {
      assert.ok(tag.includes('font-family="' + BETU_CSALAD + '"'),
        'ez a <text> nem a becsomagolt betűt kéri: ' + tag.replace(/\s+/g, ' '));
    }
  }
});

t('🔤 se „Arial Black", se fehér szövegszín nem maradt a táblán', () => {
  const svg = tablaSvg(MINTA_TABLA, 0, 5).toString();
  assert.ok(!/Arial Black/.test(svg), 'az Arial Black a CI futtatóján NEM létezik');
  assert.ok(!/#ffffff/i.test(svg), 'papír háttéren a fehér szöveg olvashatatlan');
});

// ── A BIZTONSÁGOS SÁV ───────────────────────────────────────────────
//
// A Facebook/Instagram a Reels felső ~14%-ára a saját fejlécét teszi, az
// alsó ~35%-ára a leírást, a linket és a gombsort. A régi tábla
// haladásjelzője y=1788-on állt (a magasság 93%-a), a márkajel y=1854-en —
// tehát jó eséllyel SENKI nem látta egyiket sem.
//
// 🔑 A TESZT REGEXSZEL SZEDI KI az y-okat, nem felsorolással: így egy
// KÉSŐBBI elmozdítás is elbukik, nem csak a mai állapot van lecementezve.
// Kivétel a háttér és a felső vonal — mindkettő TELJES SZÉLESSÉGŰ sáv, és
// szándékosan fut ki a szélig, mert nem hordoz információt.

/** Az SVG elemei y-koordinátával; a teljes szélességű sávok kihagyva. */
const savonKivul = svg => {
  const kint = [];
  for (const elem of svg.match(/<(?:rect|text)\b[^>]*>/g) || []) {
    if (new RegExp('width="' + W + '"').test(elem)) continue;   // háttér + felső vonal
    for (const m of elem.matchAll(/\sy="([-\d.]+)"/g)) {
      const y = parseFloat(m[1]);
      if (y < SAV_FELSO || y > SAV_ALSO) kint.push(y + ' — ' + elem.replace(/\s+/g, ' '));
    }
  }
  return kint;
};

t('📐 MINDEN látható elem a SAV_FELSO…SAV_ALSO sávban van', () => {
  const esetek = [
    [{ cimke: '', nagy: 'Perplexity\nfor answers', kicsi: 'In five steps' }, 0, 7],
    [{ cimke: '01', nagy: 'Watch the\nface', kicsi: 'for small glitches' }, 1, 7],
    [{ cimke: '06', nagy: 'Decide what\nto do next\nright away', kicsi: '' }, 6, 7],
    [{ cimke: '', nagy: 'aiworldhq\n.com', kicsi: 'Daily AI tips, in plain English' }, 6, 7],
    [{ cimke: '', nagy: 'Egy sor', kicsi: '' }, 0, 3]
  ];
  for (const [c, i, db] of esetek) {
    const kint = savonKivul(tablaSvg(c, i, db).toString());
    assert.deepEqual(kint, [], (c.cimke || 'horog') + ' — a sávon kívüli elem a lejátszó '
      + 'fejléce/leírása alatt lenne:\n     ' + kint.join('\n     '));
  }
});

t('📐 a mérőeszköz TÉNYLEG fog — az elmozdított elemet elbuktatja', () => {
  // Ismert esettel hitelesítünk (a projekt szabálya): ha a mérce a régi,
  // y=1788-as haladásjelzőt sem venné észre, a zöld semmit nem érne.
  const rosszSvg = '<rect x="60" y="1788" width="200" height="7"/>';
  assert.equal(savonKivul(rosszSvg).length, 1, 'a régi y=1788-at is át kellene engednie');
  assert.equal(savonKivul('<rect x="60" y="640" width="200" height="7"/>').length, 0,
    'ártatlan elemre nem riaszt');
});

t('📊 a haladásjelző szegmens-száma = db, és a <= i indexűek teltek', () => {
  for (const db of [3, 5, 7]) {
    for (const i of [0, 1, db - 1]) {
      const svg = tablaSvg(MINTA_TABLA, i, db).toString();
      const szegm = svg.match(/<rect[^>]*y="1180"[^>]*\/>/g) || [];
      assert.equal(szegm.length, db, 'db=' + db + ' szegmens kell');
      const telt = szegm.filter(s => /opacity="1"/.test(s)).length;
      assert.equal(telt, i + 1, 'db=' + db + ', i=' + i + ': a <= i indexűek teltek');
      // A szín ugyanaz, csak a fedettség más — így a sáv egy vonalnak látszik.
      for (const s of szegm) assert.match(s, /fill="#5f8a76"/);
      for (const s of szegm.slice(i + 1)) assert.match(s, /opacity="0\.22"/);
    }
  }
});

t('📊 a haladásjelző KÖZÉPEN van, nem a szélig fut', () => {
  const svg = tablaSvg(MINTA_TABLA, 0, 4).toString();
  const xek = [...svg.matchAll(/<rect x="([\d.]+)" y="1180"/g)].map(m => parseFloat(m[1]));
  assert.equal(xek[0], 180, 'a 720 pontos sáv 180-nál kezdődik');
  const utolso = xek.at(-1) + (720 - 3 * 10) / 4;
  assert.ok(Math.abs(utolso - 900) < 0.01, 'és 900-nál végződik, nem 1080-nál: ' + utolso);
});

// ── A HOROG: az általános felvezető nem hír ─────────────────────────
//
// ÉLES LELET (2026-09-17). A nyitótábla nagy szövege eddig csak a „how to"-t
// vágta le a címről. A „Getting started with Perplexity for answers that show
// their sources" címből így „Getting started" lett — a szó, ami megállítaná a
// görgetést („Perplexity"), kimaradt. Ez a videó ki is ment.

t('🪝 a Perplexity-cím horga a TERMÉKNEVET mutatja, nem a felvezetőt', () => {
  const md = `---
title: "Getting started with Perplexity for answers that show their sources"
---

## Step 1 — Open the app and sign in

x

## Step 2 — Ask a question in plain words

x

## Step 3 — Check the sources it shows

x
`;
  const { cards } = cardsFromGuide(md);
  assert.ok(cards, 'három lépésből lesz videó');
  assert.match(cards[0].nagy, /Perplexity/, 'ez az a szó, ami megállítja a görgetést');
  assert.ok(!/^Getting started/i.test(cards[0].nagy), 'a felvezető nem horog');
});

t('🪝 a felvezető-vágás TELJES fordulatokra illeszt, nem szótöredékre', () => {
  // ⚠️ A projektben KÉTSZER fogott meg az előtag-illesztés csapdája
  // (analysis → analyzis). A „how to" NEM illeszkedhet a „How together"-re.
  assert.equal(horogCimbol('How together we beat AI scams'), 'How together we beat AI scams');
  assert.equal(horogCimbol('Overviewing your AI receipts'), 'Overviewing your AI receipts');
  assert.equal(horogCimbol('Get startedness is not a word here'), 'Get startedness is not a word here');
  // …de a valódi fordulatot levágja, kis/nagybetűtől függetlenül.
  assert.equal(horogCimbol('GETTING STARTED WITH Claude for careful help'), 'Claude for careful help');
  assert.equal(horogCimbol('The basics of Gemini for everyday life'), 'Gemini for everyday life');
  assert.equal(horogCimbol('A Beginner’s Guide to Using ChatGPT Voice'), 'Using ChatGPT Voice');
});

t('🪝 a vágás a sor ELEJÉHEZ van kötve — a cím közepén nem nyúl bele', () => {
  assert.equal(horogCimbol('Claude: an introduction to careful writing'),
    'Claude: an introduction to careful writing');
});

t('🪝 egy szónál nem vágunk tovább — üres horgot nem tesszük ki', () => {
  // A HALLGATÁS A BIZTONSÁGOS IRÁNY: inkább maradjon bent a suta felvezető.
  assert.equal(horogCimbol('Getting started'), 'Getting started');
  assert.equal(horogCimbol('Introduction to AI'), 'Introduction to AI');
  for (const x of ['', null, undefined]) assert.equal(horogCimbol(x), '');
});

t('🪝 a KIMONDOTT mondat változatlan — ott a felvezető nem baj', () => {
  // A hang tovább mondja a lényeget; a képen a nagy szöveg minden, amit az
  // első másodpercben látni lehet. A két helyen más a jó válasz.
  const { cards } = cardsFromGuide(CIKK, { maxSteps: 4 });
  assert.match(cards[0].mond, /^Spot a Deepfake/);
});

// ── FÉSŰ A VALÓDI ÚTMUTATÓKON ───────────────────────────────────────
//
// MÉRVE (2026-09-17, 443 élő útmutató, mind videóképes):
//   ELŐTTE 15 horog-szöveg volt pontosan egy általános fordulat —
//     „getting started" 13× · „get started" 1× · „a beginner's guide" 1×
//   UTÁNA 0.
// A 443-ból 15 horog változott, a többi 428 szó szerint ugyanaz maradt.
//
// 🔑 MIÉRT A VALÓDI ADATON. A kitalált példákat a kód szerzője a kódhoz
// méretezi. Ez a fésű azt kérdezi, amit a NÉZŐ látni fog.

/** Amit a horog NEM lehet: a nagy szöveg pontosan egy semmitmondó fordulat. */
const ALTALANOS = ['getting started', 'get started', 'introduction', 'overview',
  'the basics', "a beginner's guide", 'a beginner’s guide', 'a beginners guide'];

const norm = s => String(s).replace(/\s+/g, ' ').trim().toLowerCase().replace(/[.:,;!?]+$/, '');

t('🪝 a VALÓDI útmutatók egyetlen horga sem általános fordulat', () => {
  let utmutato = 0, videokepes = 0;
  const rossz = [];
  for (const f of readdirSync(CIKK_DIR).filter(x => x.endsWith('.json'))) {
    let j; try { j = JSON.parse(readFileSync(join(CIKK_DIR, f), 'utf-8')); } catch { continue; }
    if (!utmutatoE(f, j)) continue;
    utmutato++;
    const md = j.article_markdown || '';
    const { cards } = cardsFromGuide(md);
    if (!cards) continue;
    videokepes++;
    if (ALTALANOS.includes(norm(cards[0].nagy))) {
      rossz.push('«' + norm(cards[0].nagy) + '»  ←  ' + fm(md, 'title'));
    }
  }
  // ⚠️ A MÉRŐESZKÖZ HITELESÍTÉSE. „0 bukás" a semmiből is kijön: ha a mappa
  // eltűnik vagy a besorolás elromlik, a fésű üresen fut és ZÖLD lesz.
  // Kimérve 443 útmutató — a küszöb jóval alatta van, hogy cikkek jogos
  // törlése (90 napos hír-megőrzés) ne buktassa el.
  assert.ok(utmutato >= 300, 'csak ' + utmutato + ' útmutatót látott — romlott a minta');
  assert.ok(videokepes >= 300, 'csak ' + videokepes + ' videóképes — romlott a minta');
  assert.deepEqual(rossz, [], 'általános horog-szöveg élő cikken:\n     ' + rossz.join('\n     '));
});

console.log('\n✅ short-video.test: mind a ' + pass + ' eset rendben');
