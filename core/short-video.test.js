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
  cardsFromGuide, splitHeading, horogCimbol, nagybetusHorog, VEDETT_ELSO_SZAVAK,
  videoArgs, tablaSvg,
  MIN_LEPES, SAV_FELSO, SAV_ALSO, W,
  ALCIM_MERET, ALCIM_MIN_MERET, ALCIM_ARANY,
  SZOVEG_MAX_SZELES, BETU_ARANY, SZOVEG_MIN_MERET, SAV_JELZO_Y, MARKAJEL_Y
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

// ⚠️ A KÖVETKEZŐ KÉT TESZT ÁT LETT ÍRVA (2026-09-18) — SZÁNDÉKOS VÁLTOZÁS
// érvénytelenítette őket, nem elavultak. Mindkettő a haladásjelző y-át KÉZZEL
// beírt 1180-cal kereste, és a sáv azóta 1208-ra került (SAV_JELZO_Y), mert az
// eredeti helyén KERESZTÜLMENT a háromsoros táblák alcímén (3385 valódi
// kártyából 492-t érintett). A beírt szám cserélve az EXPORTÁLT KONSTANSRA:
// így a következő elmozdítást már nem ez a két teszt akadályozza, hanem az
// alant következő ütközés-őr — ami a TÁVOLSÁGOT méri, nem a számot rögzíti.
t('📊 a haladásjelző szegmens-száma = db, és a <= i indexűek teltek', () => {
  for (const db of [3, 5, 7]) {
    for (const i of [0, 1, db - 1]) {
      const svg = tablaSvg(MINTA_TABLA, i, db).toString();
      const szegm = svg.match(new RegExp('<rect[^>]*y="' + SAV_JELZO_Y + '"[^>]*/>', 'g')) || [];
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
  const xek = [...svg.matchAll(new RegExp('<rect x="([\\d.]+)" y="' + SAV_JELZO_Y + '"', 'g'))]
    .map(m => parseFloat(m[1]));
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

// ═══════════════════════════════════════════════════════════════════
// A HOROG ELSŐ BETŰJE (2026-09-19)
// ═══════════════════════════════════════════════════════════════════
//
// ÉLES LELET. A ma kiküldött Reel nyitótáblájára „create images" ment ki —
// kisbetűvel, mert a cím „How to create images with AI…" volt, és a
// felvezető-vágás után mondatKÖZÉPI ige maradt elöl. MÉRVE: a 447 videóképes
// útmutatóból 49 (11,0%) horga kezdődött kisbetűvel.
//
// 🔑 AMIÉRT EZ NEM EGY toUpperCase(). A 49 között VAN egy, ami helyes volt:
// „xAI's Grok". Ugyanaz a karakter-alak, ellentétes helyes válasz — ezért a
// javításnak tudnia kell, mi márkanév.

/** A legkisebb videóképes útmutató egy adott címmel — itt csak a horog érdekel. */
const horogCikk = cim => [
  '---', 'title: "' + cim + '"', '---', '',
  '## Step 1 — Open the app and sign in', '', 'x', '',
  '## Step 2 — Ask a question in plain words', '', 'x', '',
  '## Step 3 — Check the sources it shows', '', 'x', ''
].join('\n');

/** A mai éles eset, szó szerint a kiküldött videó címe. */
const MAI = "How to create images with AI: a beginner's first try";

t('🔠 a MAI éles eset: „create images" → „Create images"', () => {
  const { cards } = cardsFromGuide(horogCikk(MAI));
  assert.equal(cards[0].nagy, 'Create images');
});

t('🔠 a ZÁRÓ tábla „aiworldhq"-ja VÁLTOZATLAN', () => {
  // A LEGFONTOSABB visszaesés-védelem. A nagybetűsítés EGYETLEN kártyára szól;
  // ha egyszer a `tordel`-be vagy a `tablaSvg`-be csúszik, akkor a saját
  // domainünk „Aiworldhq.com"-ként megy ki a videó utolsó másodpercében.
  for (const md of [CIKK, horogCikk(MAI), horogCikk('use AI for everything')]) {
    const { cards } = cardsFromGuide(md, { maxSteps: 4 });
    assert.equal(cards[cards.length - 1].nagy, 'aiworldhq\n.com', 'a záró tábla nagy szövege');
  }
});

t('🔠 a szándékosan kisbetűs márkanév NEM kap nagybetűt', () => {
  // VALÓDI cím a mai 447-ből — az EGYETLEN kisbetűs első szó, ami nem ige.
  // A birtokos farok („'s") nem rejtheti el a nevet az összevetés elől.
  const { cards } = cardsFromGuide(horogCikk(
    "Get Started with xAI's Grok to Draft Professional Emails in Seconds"));
  assert.equal(cards[0].nagy, "xAI's Grok");
  // Szintetikus családtagok: ilyen cím ma nincs, de bármikor lehet.
  assert.equal(nagybetusHorog('iPhone tricks worth knowing'), 'iPhone tricks worth knowing');
  assert.equal(nagybetusHorog('eBay listings in one minute'), 'eBay listings in one minute');
  assert.equal(nagybetusHorog('macOS shortcuts for AI'), 'macOS shortcuts for AI');
  assert.equal(nagybetusHorog('iPhone: the short version'), 'iPhone: the short version');
});

t('🔠 a védelem TELJES szóra illeszt, SOHA nem előtagra', () => {
  // ⚠️ A projektben KÉTSZER fogott meg az előtag-illesztés (analysis → analyzis).
  // Az „iOS" védett — de az „iOSomething" nem az „iOS", és a „set" sem.
  assert.equal(nagybetusHorog('iOSomething made up'), 'IOSomething made up');
  assert.equal(nagybetusHorog('set up two-factor login'), 'Set up two-factor login');
  assert.equal(nagybetusHorog('iPadding out a sentence'), 'IPadding out a sentence');
  // A lista ne ürülhessen ki csendben: ez az EGY elem mért valódi eset.
  assert.ok(VEDETT_ELSO_SZAVAK.includes('xAI'),
    'az xAI a névjegyzékünk (website/tool-links.json) EGYETLEN kisbetűs neve — ha kiesik a '
    + 'listából, a „xAI\'s Grok" horog „XAI\'s Grok"-ként megy ki');
  for (const x of ['', '   ', 'A', '5 steps']) assert.equal(nagybetusHorog(x), x);
  for (const x of [null, undefined]) assert.equal(nagybetusHorog(x), '');
});

t('🔠 a KIMONDOTT mondat érintetlen — a nagybetűt a felolvasó nem hallja', () => {
  // A `mond` a TELJES címből épül, és a hang számára a kis/nagybetű nem
  // létezik. Ezért itt SZÁNDÉKOSAN kisbetűs marad — a két helyen más a jó
  // válasz, pontosan mint a felvezető-vágásnál.
  const { cards } = cardsFromGuide(horogCikk(MAI));
  assert.equal(cards[0].nagy, 'Create images');
  assert.match(cards[0].mond, /^create images with AI/);
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

// ── FÉSŰ: A HOROG ELSŐ BETŰJE A VALÓDI CIKKEKEN (2026-09-19) ────────
//
// 🔑 MIÉRT A VALÓDI ADATON. A „create images" senkinek nem jutott volna
// eszébe kitalált példaként — a 447 élő útmutató végigmérése köpte ki, és
// csak ott derült ki, hogy a 49 kisbetűs horog között van EGY, amit nem
// javítani kell, hanem megvédeni („xAI's Grok").
//
// A MÉRCE EGY HELYEN ÁLL (`elsoBetuFesu`), és KÉT bemeneten fut:
//   • a JAVÍTOTT úton (amit a néző látni fog)  → 0 kifogás,
//   • a NYERS úton (a `nagybetusHorog` megkerülésével) → ott kell FOGNIA.
// Enélkül nem tudnánk, hogy a fésűnek van-e foga egyáltalán.

/** Kifogás akkor van, ha a horog kisbetűvel kezdődik ÉS nem védett név.
 *  A „védett-e" kérdést a gyártó függvény válaszolja meg (ha kisbetűvel
 *  kezdődik és a javító mégis érintetlenül hagyja, akkor névnek tartja) —
 *  a logika ÚJRAÍRÁSA itt párhuzamos megvalósítás lenne, és pont azt a
 *  hibát rejtené el, amit keresünk. */
function elsoBetuFesu(horgok) {
  const kisbetus = horgok.filter(h => /^\p{Ll}/u.test(String(h.szoveg)));
  const vedett = kisbetus.filter(h => nagybetusHorog(h.szoveg) === h.szoveg);
  return {
    kisbetus, vedett,
    hiba: kisbetus.filter(h => nagybetusHorog(h.szoveg) !== h.szoveg)
      .map(h => '«' + String(h.szoveg).replace(/\n/g, ' ') + '»  ←  ' + h.cim)
  };
}

t('🔠 a VALÓDI útmutatók horga nagybetűvel kezdődik (vagy védett név)', () => {
  const javitott = [], nyers = [];
  let utmutato = 0, videokepes = 0;
  for (const f of readdirSync(CIKK_DIR).filter(x => x.endsWith('.json'))) {
    let j; try { j = JSON.parse(readFileSync(join(CIKK_DIR, f), 'utf-8')); } catch { continue; }
    if (!utmutatoE(f, j)) continue;
    utmutato++;
    const md = j.article_markdown || '';
    const { cards } = cardsFromGuide(md);
    if (!cards) continue;
    videokepes++;
    const cim = fm(md, 'title');
    javitott.push({ szoveg: cards[0].nagy, cim });
    // A NYERS út: pontosan az, amit a kód 2026-09-19 előtt kitett. A `tordel`
    // csak sorokra vág, az ELSŐ karakteren nem változtat — a fésű szempontjából
    // a két bemenet összemérhető.
    nyers.push({ szoveg: splitHeading(horogCimbol(cim)).nagy, cim });
  }
  // ⚠️ A MINTA NE ÜRÜLHESSEN KI: „0 kifogás" a semmiből is kijön.
  assert.ok(utmutato >= 300, 'csak ' + utmutato + ' útmutatót látott — romlott a minta');
  assert.ok(videokepes >= 300, 'csak ' + videokepes + ' videóképes — romlott a minta');

  const most = elsoBetuFesu(javitott);
  assert.deepEqual(most.hiba, [], most.hiba.length + ' élő horog kezdődik kisbetűvel:\n     '
    + most.hiba.slice(0, 12).join('\n     '));

  // ── A MÉRŐESZKÖZ HITELESÍTÉSE ISMERT ESETTEL ──────────────────────
  // A javítás NÉLKÜL ugyanennek a fésűnek FOGNIA kell. Mérve 2026-09-19:
  // 447 horogból 49 kezdődött kisbetűvel (11,0%), ebből 48 kifogás és 1
  // védett név („xAI's Grok").
  //
  // ⚠️ MIÉRT KÜSZÖB ÉS NEM PONTOS SZÁM. Naponta 2 új útmutató jelenik meg, és
  // ~11%-uk kisbetűs címközéppel indul — egy `=== 49` pár nap múlva hamis
  // riasztás lenne. A PONTOS számot az alábbi befagyasztott lista adja.
  const regi = elsoBetuFesu(nyers);
  assert.ok(regi.kisbetus.length >= 20, 'a fésűnek FOGNIA kell a javítás nélkül, de csak '
    + regi.kisbetus.length + ' kisbetűs horgot talált — a mérce elveszítette a fogát');
  assert.ok(regi.hiba.length >= 20, 'a javítás nélkül ' + regi.hiba.length + ' kifogás — kevés');
  console.log('       ' + videokepes + ' útmutató · javítás nélkül ' + regi.kisbetus.length
    + ' kisbetűs horog (' + (100 * regi.kisbetus.length / videokepes).toFixed(1) + '%), ebből '
    + regi.hiba.length + ' kifogás · javítva: 0 kifogás, ' + most.vedett.length + ' védett név');
});

t('🔠 a fésű PONTOS száma befagyasztott valódi címeken', () => {
  // ISMERT POZITÍV, ami nem mozdul a tartalom növésével: hét VALÓDI cím a
  // 2026-09-19-i 49-ből (a példák a leletből), plusz az egy védett eset.
  const CIMEK = [
    'How to write a standout cover letter with AI',
    'How to use AI to write quick, polite emails and replies',
    "How to create images with AI: a beginner's first try",
    'How to plan meals and a grocery budget with AI',
    'How to turn a meeting into clear notes and action items with AI',
    'How to build or improve your CV with AI',
    'How to study and learn faster with AI – a beginner’s step-by-step guide'
  ];
  const VEDETT_CIM = "Get Started with xAI's Grok to Draft Professional Emails in Seconds";

  const nyers = c => ({ szoveg: splitHeading(horogCimbol(c)).nagy, cim: c });
  const kesz = c => ({ szoveg: cardsFromGuide(horogCikk(c)).cards[0].nagy, cim: c });

  // A javítás NÉLKÜL mind a hét bukik — a fésűnek tehát van foga.
  assert.equal(elsoBetuFesu(CIMEK.map(nyers)).hiba.length, 7);
  // …a javítással egy sem.
  assert.equal(elsoBetuFesu(CIMEK.map(kesz)).hiba.length, 0);
  // A védett eset MINDKÉT úton kisbetűs marad, és egyik úton sem kifogás.
  for (const ut of [nyers, kesz]) {
    const r = elsoBetuFesu([ut(VEDETT_CIM)]);
    assert.equal(r.kisbetus.length, 1, 'az „xAI" kisbetűs marad');
    assert.deepEqual(r.hiba, [], 'a védett név nem kifogás');
  }
});

// ═══════════════════════════════════════════════════════════════════
// A TÁBLA KERETE: VÍZSZINTES KIFUTÁS ÉS FÜGGŐLEGES ÜTKÖZÉS (2026-09-18)
// ═══════════════════════════════════════════════════════════════════
//
// ELŐZMÉNY. A fenti sáv-őr EGYDIMENZIÓS volt: csak azt nézte, hogy egy elem
// `y`-ja a SAV_FELSO…SAV_ALSO közé esik-e. Emiatt KÉT valódi hibát engedett át,
// és mindkettő KI IS MENT az olvasóhoz:
//
//  1. VÍZSZINTES KIFUTÁS. A méret egy ideig CSAK a sorok SZÁMÁTÓL függött
//     (≤2 sor → 138 px). Az „Open DeepSeek" 13 karakter: 138 pixeles betűvel
//     1114 px széles az 1080-as vásznon, tehát a szó SZÉLE LEVÁGÓDOTT. A 443
//     élő útmutatón végigmérve 27 sor futott ki — nagyjából minden 16. Reelen
//     lett volna egy csonka tábla. Az `y` ebből SEMMIT nem mutat.
//  2. ÜTKÖZÉS. A haladásjelző y=1180-on állt, a háromsoros tábla alcímének
//     alapvonala viszont a képletből MINDIG 1173-ra esik, a betűk alja 1186-ra
//     — a zsálya sáv KERESZTÜLMENT az alcímen. 3385 valódi kártyából 492-t
//     érintett (14,5%). Mindkét szám a sávon BELÜL volt, tehát az őr zöldet
//     mondott. 🔑 Egy elem helye nem attól jó, hogy a sávban van, hanem attól,
//     hogy nem ér hozzá a szomszédjához.
//
// 🔑 MIÉRT NEM A BETU_ARANY-NYAL MÉRÜNK. A kódban a `BETU_ARANY = 0,65` egy
// BECSLÉS: karakterszám × arány. Ha a teszt ugyanezt a szorzást ismételné meg,
// akkor a saját becslésünket hitelesítenénk önmagával — pontosan az a
// körkörös zöld, amiből ez a projekt már többször megélt. Ezért a teszt MÉR:
// kiolvassa a becsomagolt betűfájlból a VALÓDI karakterszélességeket, és
// azokkal számol. Ha valaki az ARANY-t 0,9-re rontja, ez a fésű buktat.

const BETU_UT = join(__dirname, '..', 'shared', 'fonts', 'schibsted-grotesk-900.ttf');

/**
 * MINI TTF-OLVASÓ — `cmap` + `hmtx` + `hhea` + `head` + `OS/2`.
 *
 * Tiszta `fs` + `Buffer`, függőség nélkül: a repó szándékosan
 * dependency-mentes ezen a szinten, és egy betűkönyvtár behúzása egy 90 KB-os
 * fájl kiolvasásához aránytalan lenne.
 *
 * Amit kiolvas és miért:
 *   • `head.unitsPerEm`  — ebben vannak megadva a szélességek (itt 2048)
 *   • `hhea.numberOfHMetrics` — az `hmtx` tábla hossza; az ezen túli glifák
 *     az UTOLSÓ szélességet öröklik (ez a TTF-formátum tömörítése)
 *   • `hhea.descender`   — mennyivel lóg a betű az alapvonal ALÁ (−528)
 *   • `OS/2.sCapHeight`  — a NAGYBETŰ magassága (1440); a márkajel csupa
 *     nagybetű, tehát a teteje ennyivel van az alapvonala fölött
 *   • `cmap` 4-es formátum — karakterkód → glifa-azonosító
 *
 * DOB, ha bármelyik tábla hiányzik vagy értelmezhetetlen. Szándékosan: a
 * néma „0 szélesség" zöldet adna mindenre — a mérőeszköz hiánya nem lehet
 * ugyanaz a jel, mint a hiba hiánya.
 */
function betuMetrika(fajl) {
  const b = readFileSync(fajl);
  if (b.length < 12) throw new Error('a betűfájl túl rövid: ' + fajl);

  const tablak = {};
  for (let i = 0; i < b.readUInt16BE(4); i++) {
    const o = 12 + i * 16;
    tablak[b.toString('latin1', o, o + 4)] = b.readUInt32BE(o + 8);
  }
  for (const kell of ['head', 'hhea', 'hmtx', 'maxp', 'cmap']) {
    if (tablak[kell] === undefined) throw new Error('hiányzó TTF-tábla: ' + kell);
  }

  const em = b.readUInt16BE(tablak.head + 18);
  const numH = b.readUInt16BE(tablak.hhea + 34);
  const numGlyphs = b.readUInt16BE(tablak.maxp + 4);
  const descender = b.readInt16BE(tablak.hhea + 6);
  const ascender = b.readInt16BE(tablak.hhea + 4);
  if (!em || !numH || !numGlyphs) throw new Error('értelmetlen betű-metrika (em/numH/numGlyphs = 0)');
  // Az sCapHeight csak az OS/2 2-es verziójától létezik; enélkül az ascender
  // a konzervatív pótlék (nagyobb → a rés kisebbnek számít → óvatosabb).
  const capHeight = tablak['OS/2'] !== undefined && b.readUInt16BE(tablak['OS/2']) >= 2
    ? b.readInt16BE(tablak['OS/2'] + 88) : ascender;

  // ── cmap: a 4-es formátumú alábla (a BMP-t fedi) ──────────────────
  const cm = tablak.cmap;
  let sub = -1;
  for (let i = 0; i < b.readUInt16BE(cm + 2); i++) {
    const o = cm + 4 + i * 8;
    const plat = b.readUInt16BE(o), enc = b.readUInt16BE(o + 2), s = cm + b.readUInt32BE(o + 4);
    if (b.readUInt16BE(s) !== 4) continue;
    if (plat === 3 && enc === 1) { sub = s; break; }        // Windows Unicode BMP — ez az elsődleges
    if (sub < 0 && plat === 0) sub = s;                     // Unicode platform — tartalék
  }
  if (sub < 0) throw new Error('nincs 4-es formátumú cmap alábla a betűben');

  const segX2 = b.readUInt16BE(sub + 6), seg = segX2 / 2;
  const endO = sub + 14, startO = endO + segX2 + 2, deltaO = startO + segX2, roO = deltaO + segX2;

  /** Karakterkód → glifa-azonosító; 0 = a betű NEM ismeri ezt a karaktert. */
  const glifa = (kod) => {
    if (kod > 0xffff) return 0;                             // a 4-es formátum csak a BMP-t fedi
    for (let i = 0; i < seg; i++) {
      if (kod > b.readUInt16BE(endO + i * 2)) continue;
      const start = b.readUInt16BE(startO + i * 2);
      if (kod < start) return 0;
      const ro = b.readUInt16BE(roO + i * 2);
      if (ro === 0) return (kod + b.readInt16BE(deltaO + i * 2)) & 0xffff;
      const gi = roO + i * 2 + ro + (kod - start) * 2;
      if (gi + 1 >= b.length) return 0;
      const g = b.readUInt16BE(gi);
      return g === 0 ? 0 : (g + b.readInt16BE(deltaO + i * 2)) & 0xffff;
    }
    return 0;
  };

  /** Glifa-azonosító → előretolás (advance width) a betű saját egységeiben. */
  const eloretolas = (g) => b.readUInt16BE(tablak.hmtx + Math.min(g >= numGlyphs ? 0 : g, numH - 1) * 4);

  return { em, descender, ascender, capHeight, numGlyphs, glifa, eloretolas };
}

const BETU = betuMetrika(BETU_UT);

/**
 * Egy szöveg VALÓDI szélessége pixelben: Σ előretolás / unitsPerEm × betűméret.
 *
 * ⚠️ AMIT NEM SZÁMOL: az alávágást (kerning, GPOS) és a ligatúrákat. Mindkettő
 * SZŰKÍTENÉ a szöveget, tehát a mérésünk FELÜLRŐL becsül — a kalibráció szerint
 * 0,3–2,7%-kal a valódi tinta fölött. A keret-őrnél ez a jó irány: inkább
 * jelezzen egy hajszálnyival korábban, mint hogy egy levágott szó kimenjen.
 *
 * ⚠️ AZ ISMERETLEN KARAKTER NEM NULLA SZÉLES. Amit a betű nem ismer, arra a
 * `.notdef` glifa előretolását adjuk (itt 0,5 em) — az a téglalap, amit a
 * renderelő ténylegesen kirajzol. Nullázni azért nem szabad, mert egy
 * ismeretlen karakterekkel teli sor így NULLA szélesnek látszana.
 */
function szovegSzeles(szoveg, meret, m = BETU) {
  let egyseg = 0;
  const ismeretlen = [];
  for (const ch of String(szoveg)) {
    const kod = ch.codePointAt(0);
    const g = m.glifa(kod);
    if (g === 0) ismeretlen.push('U+' + kod.toString(16).toUpperCase().padStart(4, '0'));
    egyseg += m.eloretolas(g);
  }
  return { px: egyseg / m.em * meret, ismeretlen };
}

// ── A MÉRŐESZKÖZ HITELESÍTÉSE — MINDKÉT IRÁNYBAN ────────────────────
//
// Házszabály: „a mérőeszközt ISMERT ESETTEL kell hitelesíteni". Enélkül a
// „0 bukás" ugyanúgy kijön egy vak mércéből, mint egy hibátlan tábla-halmazból.

t('📏 a mérce LÁTJA a karakterek közti különbséget — nem konstanst ad', () => {
  // Ha a cmap- vagy a hmtx-olvasás elromlik, a legkézenfekvőbb hibamód az,
  // hogy MINDEN karakterre ugyanaz jön ki (pl. mindenre a .notdef). Egy ilyen
  // mérce mindenre ugyanazt mondaná, és a zöldje semmit nem érne.
  const w = szovegSzeles('W', 100).px, i = szovegSzeles('i', 100).px;
  assert.ok(w > i * 2, 'a „W" legalább kétszer olyan széles, mint az „i" (' + w + ' vs ' + i + ')');
  assert.ok(szovegSzeles('AAAA', 100).px > 3.5 * szovegSzeles('A', 100).px * 0.99,
    'négy „A" ~négyszer olyan széles, mint egy');
  assert.equal(szovegSzeles('', 138).px, 0, 'üres szöveg nulla széles');
  // A betűméret arányosan skáláz — különben a 116-os és a 138-as tábla
  // ugyanannak látszana.
  assert.ok(Math.abs(szovegSzeles('Open DeepSeek', 276).px
    - 2 * szovegSzeles('Open DeepSeek', 138).px) < 0.001);
});

t('📏 ISMERT POZITÍV: a nyilvánvalóan túl hosszú sorra a mérce BUKÁST mond', () => {
  // KÖZVETLENÜL a szélesség-számolót hívjuk, nem a kártyákon keresztül: a kapu
  // ma épp nem enged ilyet át, és ha a fésű csak rajta keresztül tudna
  // riasztani, sosem derülne ki, hogy egyáltalán tud-e.
  const OLDAL_MARGO = 20, HATAR = W - 2 * OLDAL_MARGO;
  assert.ok(szovegSzeles('Open DeepSeek', 138).px > HATAR,
    'ez az ÉLES eset, ami 2026-09-18-ig kifutott a vászonról — a mércének fognia kell');
  assert.ok(szovegSzeles('recommendation', 138).px > HATAR, 'a 14 betűs sor 138-cal szintén kifut');
  // …és az ártatlan sorra NEM riaszt: az egyoldalú mérce is használhatatlan.
  assert.ok(szovegSzeles('Watch the', 138).px < HATAR, 'a rövid sor 138-cal befér');
  assert.ok(szovegSzeles('Open DeepSeek', 118).px < HATAR, 'ugyanaz a szöveg kisebb betűvel már befér');
});

// ── KALIBRÁCIÓ: VALÓDI RENDERELÉS TINTA-SZÉLESSÉGÉHEZ MÉRVE ─────────
//
// A fenti két eset csak azt mondja meg, hogy a mérce KÜLÖNBSÉGET lát. Azt nem,
// hogy a SZÁMAI igazak-e. Ezért a táblázat alább egy VALÓDI RENDERELÉSBŐL jön.
//
// HOGYAN KÉSZÜLT (2026-09-18, rögzítve, hogy újra lehessen futtatni):
//   ffmpeg -f lavfi -i color=white:s=3000x400 \
//     -vf "drawtext=fontfile=shared/fonts/schibsted-grotesk-900.ttf:\
//          text=<szöveg>:fontsize=138:fontcolor=black:x=100:y=100" -frames:v 1 k.png
//   …majd a k.png-ből a legbaloldalibb és a legjobboldalibb sötét képpont
//   távolsága = a TINTA szélessége. A drawtext a betűFÁJLT olvassa (libfreetype
//   + libharfbuzz), tehát nem kell telepíteni semmit, és nem tud némán
//   visszaesni egy másik betűre — ez itt a lényeg.
//
// A számokat egy MÁSODIK, FÜGGETLEN renderelő is megerősítette: a sharp
// (librsvg + pango + cairo), a repó betűmappájára állított ideiglenes
// fontconfig-fájllal ugyanezt adta ±1 képpontra (1112 vs 1111, 1191 vs 1191).
// Két különböző betűmotor ugyanaz a válasz = a fixtúra nem az egyik motor
// szeszélye.
//
// ⚠️ MIÉRT FIXTÚRA, ÉS MIÉRT NEM RENDERELÜNK ITT. Az `npm test` szerződése:
// ingyenes, hálózat nélküli és GYORS. Egy ffmpeg-hívás táblánként ~0,3 mp, a
// sharp behúzása egy nagy natív könyvtár — egyik sem való egy 100 fájlos
// tesztsorba. A fixtúra viszont ugyanazt őrzi: ha valaki a parsert elrontja
// (rossz tábla-eltolás, rossz unitsPerEm), a mért érték elcsúszik a VALÓDI
// rendereléstől, és ez a teszt buktat.
//
// A tinta SZŰKEBB az előretolásnál (az első/utolsó glifa oldal-térközével),
// ezért a parsernek FÖLÖTTE kell lennie — de 5%-nál nem többel.
const KALIBRACIO = [
  ['Open DeepSeek', 138, 1111],
  ['recommendation', 138, 1191],
  ['Pull names and emails', 138, 1546],
  ['Watch the face', 138, 1034],
  ['Command model', 138, 1170],
  ['AIWORLDHQ.COM', 138, 1301],
  ['Perplexity', 138, 734],
  ['In five steps', 138, 847]
];

t('📏 KALIBRÁCIÓ: a mért szélesség 5%-on belül van a VALÓDI rendereléshez', () => {
  const baj = [];
  for (const [szoveg, meret, tinta] of KALIBRACIO) {
    const px = szovegSzeles(szoveg, meret).px;
    const elteres = (px - tinta) / tinta * 100;
    if (px < tinta) {
      baj.push('«' + szoveg + '» ALÁBECSÜL: ' + px.toFixed(1) + ' < tinta ' + tinta
        + ' — így egy kifutó sor átcsúszhatna');
    } else if (elteres > 5) {
      baj.push('«' + szoveg + '» ' + elteres.toFixed(1) + '% eltérés (' + px.toFixed(1)
        + ' vs tinta ' + tinta + ')');
    }
  }
  assert.deepEqual(baj, [], 'a TTF-olvasó elcsúszott a valódi rendereléstől:\n     ' + baj.join('\n     '));
});

t('📏 a betűfájl metrikái a várt nagyságrendben vannak', () => {
  // Ha valaki kicseréli a betűt (más vastagság, más vágat), ez szól: a fenti
  // kalibrációs számok ahhoz a fájlhoz tartoznak, amelyikkel készültek.
  assert.equal(BETU.em, 2048, 'unitsPerEm — ehhez van kalibrálva a fixtúra');
  assert.ok(BETU.descender < 0 && BETU.descender > -0.4 * BETU.em, 'descender: ' + BETU.descender);
  assert.ok(BETU.capHeight > 0.5 * BETU.em && BETU.capHeight < BETU.em, 'capHeight: ' + BETU.capHeight);
  assert.ok(BETU.numGlyphs > 100, 'csonka betűfájl? ' + BETU.numGlyphs + ' glifa');
});

// ── A VALÓDI KÁRTYA-HALMAZ — egyszer beolvasva ──────────────────────
//
// 🔑 MIÉRT A VALÓDI ADATON. A kitalált példát a kód szerzője a kódhoz méretezi.
// Az „Open DeepSeek" sem jutott volna eszébe senkinek — a 443 élő útmutató
// végigmérése köpte ki. Ez a fésű azt kérdezi, amit a NÉZŐ látni fog.

/** A méret-szabály a tablaSvg-ből — az EXPORTÁLT konstansokból, nem beírt számokból. */
function tablaMeret(sorok) {
  const alapMeret = sorok.length <= 2 ? 138 : 116;
  const leghosszabb = Math.max(1, ...sorok.map(s => s.length));
  return Math.max(SZOVEG_MIN_MERET,
    Math.min(alapMeret, Math.floor(SZOVEG_MAX_SZELES / (leghosszabb * BETU_ARANY))));
}

// ── AMIT A TÁBLA TÉNYLEGESEN KIÍR ───────────────────────────────────
//
// 🔑 A KÁRTYA-OBJEKTUM NEM AZ, AMI A KÉPRE KERÜL. A `tablaSvg` útközben
// átalakítja a szöveget (`esc()`: XML-jelek + a nem törhető kötőjel cseréje),
// és az alcímet KI IS HAGYHATJA, ha nem fér be. Ezért minden mérés, ami azt
// kérdezi, „mit lát a néző", a KÉSZ SVG-ből olvas, nem a `cards` tömbből.
// Ugyanaz a lecke, mint a fordítás-kapunál: a fájl LÉTEZÉSE nem bizonyíték
// arra, hogy tartalom is van benne.

/** Az XML-visszafejtés — a `&lt;` sorrendben ELŐBB, különben `&amp;lt;`-ből `<` lenne. */
const xmlVissza = s => String(s)
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/** A tábla `<text>` elemei: attribútumok + a VISSZAFEJTETT, kiírt szöveg. */
function svgSzovegek(svg) {
  return [...svg.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/g)]
    .map(m => ({ attr: m[1], szoveg: xmlVissza(m[2]) }));
}

/** Egy számattribútum a `<text>`-ről; NaN, ha nincs (a hívó veszi észre). */
const attrSzam = (elem, nev) => {
  const m = elem.attr.match(new RegExp('\\s' + nev + '="([^"]*)"'));
  return m ? parseFloat(m[1]) : NaN;
};

/** Az alcím `<text>`-je a táblán — a HALVANY szín azonosítja. `undefined`, ha lemaradt. */
const alcimElem = svg => svgSzovegek(svg).find(x => /fill="#5c5850"/.test(x.attr));

/** Minden élő útmutató minden kártyája, a KIRENDERELT táblájával együtt. */
const VALODI = (() => {
  const ki = { utmutato: 0, videokepes: 0, kartyak: [] };
  for (const f of readdirSync(CIKK_DIR).filter(x => x.endsWith('.json'))) {
    let j; try { j = JSON.parse(readFileSync(join(CIKK_DIR, f), 'utf-8')); } catch { continue; }
    if (!utmutatoE(f, j)) continue;
    ki.utmutato++;
    const md = j.article_markdown || '';
    const { cards } = cardsFromGuide(md);
    if (!cards) continue;
    ki.videokepes++;
    cards.forEach((c, i) => ki.kartyak.push({
      c, i, db: cards.length, fajl: f, cim: fm(md, 'title'),
      svg: tablaSvg(c, i, cards.length).toString()
    }));
  }
  return ki;
})();

/** A minta ne ürüljön ki: „0 bukás" a semmiből is kijön (443 mérve 2026-09-18). */
function mintaEll() {
  assert.ok(VALODI.utmutato >= 300, 'csak ' + VALODI.utmutato + ' útmutatót látott — romlott a minta');
  assert.ok(VALODI.videokepes >= 300, 'csak ' + VALODI.videokepes + ' videóképes — romlott a minta');
  assert.ok(VALODI.kartyak.length >= 2000, 'csak ' + VALODI.kartyak.length + ' kártya — romlott a minta');
}

t('📐 VÍZSZINTES: egyetlen élő kártya-sor sem fut ki a vászonról', () => {
  mintaEll();
  const OLDAL_MARGO = 20, HATAR = W - 2 * OLDAL_MARGO;
  const kifut = [];
  let sorok = 0, legszelesebb = { px: 0 };
  for (const { c, fajl, cim } of VALODI.kartyak) {
    const sorLista = String(c.nagy).split('\n').slice(0, 3);
    const meret = tablaMeret(sorLista);
    for (const s of sorLista) {
      sorok++;
      const { px } = szovegSzeles(s, meret);
      if (px > legszelesebb.px) legszelesebb = { px, s, meret, cim };
      if (px > HATAR) {
        kifut.push('«' + s + '» ' + meret + ' px betű → ' + px.toFixed(0) + ' px (max ' + HATAR
          + ') — ' + fajl);
      }
    }
  }
  assert.ok(sorok >= 4000, 'csak ' + sorok + ' sort mért — romlott a minta');
  assert.deepEqual(kifut, [], kifut.length + ' élő kártya-sor szélét levágná a vászon:\n     '
    + kifut.slice(0, 12).join('\n     '));
  console.log('       ' + VALODI.videokepes + ' útmutató · ' + VALODI.kartyak.length + ' kártya · '
    + sorok + ' sor · legszélesebb: ' + legszelesebb.px.toFixed(0) + ' px («'
    + legszelesebb.s + '», ' + legszelesebb.meret + ' px betű)');
});

// ── AZ ALCÍM IS KIFUTOTT (2026-09-18, ez a mérés találta) ───────────
//
// A nagy szöveg keretét megkapta a védelmet, az ALCÍMÉT nem: 2226 élő
// alcímből 45 (2,0%) szélesebb volt a vászonnál a fix 52 pixeles betűvel, a
// legrosszabb 1801 px az 1080-ból — a fele lelógott. 🔑 Ugyanaz a hiba-alak,
// mint a nagy szövegnél, EGY ELEMMEL ODÉBB: aki egy kaput megépít, keresse meg
// a testvéreit is (a beágyazás-ügy leckéje: „ha ilyet találsz, keresd meg a
// többit").
//
// A `tablaSvg` azóta kicsinyít, és ha az sem elég, ELHAGYJA az alcímet. Ezért
// a fésű a KÉSZ SVG-ből veszi a tényleges `font-size`-ot és a tényleges
// szöveget: a képletet megismételni itt ugyanaz a párhuzamos-megvalósítás
// csapda lenne, és a lemaradt alcímet sem venné észre.

t('📐 VÍZSZINTES: egyetlen élő ALCÍM sem fut ki a vászonról', () => {
  mintaEll();
  const OLDAL_MARGO = 20, HATAR = W - 2 * OLDAL_MARGO;
  const kifut = [];
  let osszes = 0, latszik = 0, kicsinyitve = 0, lemarad = 0, legszelesebb = { px: 0 };
  for (const { c, fajl, svg } of VALODI.kartyak) {
    if (!c.kicsi) continue;
    osszes++;
    const elem = alcimElem(svg);
    if (!elem) { lemarad++; continue; }         // nem fért be → a tábláról lekerült
    latszik++;
    const meret = attrSzam(elem, 'font-size');
    assert.ok(Number.isFinite(meret) && meret > 0, 'az alcímnek nincs értelmes font-size-a: ' + fajl);
    assert.ok(meret >= ALCIM_MIN_MERET, 'olvashatatlanul kicsi alcím (' + meret + ' px, min '
      + ALCIM_MIN_MERET + ') — ' + fajl);
    if (meret < ALCIM_MERET) kicsinyitve++;
    const { px } = szovegSzeles(elem.szoveg, meret);
    if (px > legszelesebb.px) legszelesebb = { px, s: elem.szoveg, meret };
    if (px > HATAR) {
      kifut.push('«' + elem.szoveg + '» ' + meret + ' px betű → ' + px.toFixed(0) + ' px (max '
        + HATAR + ') — ' + fajl);
    }
  }
  assert.ok(osszes >= 1500, 'csak ' + osszes + ' alcímet látott — romlott a minta');
  assert.deepEqual(kifut, [], kifut.length + ' élő alcím szélét levágná a vászon:\n     '
    + kifut.slice(0, 12).join('\n     '));
  console.log('       ' + osszes + ' alcím · megjelenik ' + latszik + ' (ebből kicsinyítve '
    + kicsinyitve + ') · lemarad ' + lemarad + ' · legszélesebb: '
    + legszelesebb.px.toFixed(0) + ' px @' + legszelesebb.meret + ' («' + legszelesebb.s + '»)');
});

t('📐 ISMERT POZITÍV: a RÉGI, fix 52 px-es alcímmel a fésű elbukna', () => {
  // Enélkül nem tudnánk, hogy az alcím-fésű fog-e egyáltalán: ma minden
  // átmegy, és a csupa-zöld mérce a vaktól megkülönböztethetetlen. Itt
  // ugyanazzal a `szovegSzeles`-sel mérünk, csak a kicsinyítés NÉLKÜL.
  const HATAR = W - 2 * 20;
  let regiKifut = 0, regiLegszelesebb = 0;
  for (const { c } of VALODI.kartyak) {
    if (!c.kicsi) continue;
    const { px } = szovegSzeles(c.kicsi.replace(/‑/g, '-'), ALCIM_MERET);
    if (px > regiLegszelesebb) regiLegszelesebb = px;
    if (px > HATAR) regiKifut++;
  }
  assert.ok(regiKifut >= 20, 'a fix ' + ALCIM_MERET + ' px-es alcímmel több tucat élő alcímnek ki '
    + 'kellene futnia, de a mérce csak ' + regiKifut + '-at lát — vak a mérce');
  assert.ok(regiLegszelesebb > W, 'a legrosszabb régi alcím szélesebb volt a teljes vászonnál, '
    + 'a mérce szerint viszont csak ' + regiLegszelesebb.toFixed(0) + ' px');
});

// ── FÜGGŐLEGES ÜTKÖZÉS ──────────────────────────────────────────────
//
// 🔑 A GEOMETRIÁT A KÉSZ SVG-BŐL OLVASSUK, NEM A KÉPLETBŐL SZÁMOLJUK ÚJRA.
// Ha a teszt megismételné a `kezd = 980 − (sorok−1) × meret × 0,55` képletet, a
// kód és a teszt EGYÜTT csúszna el — a „párhuzamos megvalósítás" ugyanaz a
// csapda, amibe a projekt 11 helyen belefutott az „útmutató-e?" kérdéssel.

/** Az alsó három elem MÉRT helye egy kész tábla-SVG-ből. */
function alsoGeometria(svg) {
  const szovegek = svgSzovegek(svg);
  const ertek = attrSzam;
  const alcim = szovegek.find(x => /fill="#5c5850"/.test(x.attr));       // HALVANY = az alcím
  const marka = szovegek.find(x => /AIWORLDHQ/.test(x.szoveg));
  const jelzok = [...svg.matchAll(/<rect\b[^>]*\bheight="(\d+)"[^>]*\/>/g)]
    .map(m => m[0]).filter(s => /height="8"/.test(s));                    // a haladásjelző szegmensei
  assert.ok(marka, 'nincs márkajel a táblán — romlott a mérőeszköz');
  assert.ok(jelzok.length > 0, 'nincs haladásjelző a táblán — romlott a mérőeszköz');

  const jelzoY = parseFloat(jelzok[0].match(/\sy="([\d.]+)"/)[1]);
  const melyseg = Math.abs(BETU.descender) / BETU.em;      // mennyivel lóg a betű az alapvonal alá
  const nagybetu = BETU.capHeight / BETU.em;               // a nagybetű magassága az alapvonal fölött
  const markaMeret = ertek(marka, 'font-size');
  return {
    jelzoY,
    jelzoMagas: 8,
    // A HIÁNYZÓ alcím nem ütközhet semmivel: ilyenkor `null`, nem 0.
    alcimAlja: alcim ? ertek(alcim, 'y') + melyseg * ertek(alcim, 'font-size') : null,
    markaTeteje: ertek(marka, 'y') - nagybetu * markaMeret,
    markaAlja: ertek(marka, 'y') + melyseg * markaMeret
  };
}

/**
 * A három kritikus RÉS pixelben. Pozitív = van hézag.
 *
 * ⚠️ A `jelzoY` PARAMÉTER, nem a konstansból jön: így a teszt ki tudja mérni,
 * hogy a RÉGI, y=1180-as értékkel elbukna-e. Enélkül nem tudnánk, hogy a mérce
 * egyáltalán fog-e valamit — a mai elrendezésen ugyanis mindhárom rés rendben
 * van, és egy csupa-zöld mérce a vakságtól megkülönböztethetetlen.
 */
function resek(g, jelzoY = g.jelzoY) {
  return {
    alcimTolJelzo: g.alcimAlja === null ? Infinity : jelzoY - g.alcimAlja,
    jelzotolMarka: g.markaTeteje - (jelzoY + g.jelzoMagas),
    markaSavAlatt: SAV_ALSO - g.markaAlja
  };
}

/** Ennyi levegő kell két elem közé, hogy ne érjenek össze. */
const MIN_RES = 15;

t('📐 FÜGGŐLEGES: az alcím, a haladásjelző és a márkajel nem ér egymáshoz', () => {
  mintaEll();
  const utkozes = [];
  let legszukebb = { res: Infinity };
  for (const { c, fajl, svg } of VALODI.kartyak) {
    const g = alsoGeometria(svg);
    const r = resek(g);
    if (r.alcimTolJelzo < legszukebb.res) {
      legszukebb = { res: r.alcimTolJelzo, kicsi: c.kicsi, sorok: String(c.nagy).split('\n').length, fajl };
    }
    if (r.alcimTolJelzo < MIN_RES) {
      utkozes.push('alcím «' + c.kicsi + '» → haladásjelző: ' + r.alcimTolJelzo.toFixed(1)
        + ' px rés (min ' + MIN_RES + ') — ' + fajl);
    }
    if (r.jelzotolMarka < MIN_RES) {
      utkozes.push('haladásjelző → márkajel: ' + r.jelzotolMarka.toFixed(1) + ' px rés — ' + fajl);
    }
    if (r.markaSavAlatt < 0) {
      utkozes.push('a márkajel alja KILÓG a biztonságos sávból: ' + (-r.markaSavAlatt).toFixed(1)
        + ' px-szel — ' + fajl);
    }
  }
  assert.deepEqual(utkozes.slice(0, 12), [], utkozes.length + ' élő kártyán ütköznek az alsó elemek:\n     '
    + utkozes.slice(0, 12).join('\n     '));
  console.log('       legszűkebb rés alcím→haladásjelző: ' + legszukebb.res.toFixed(1)
    + ' px («' + legszukebb.kicsi + '», ' + legszukebb.sorok + ' soros tábla)');
});

t('📐 a függőleges mérce TÉNYLEG fog — a RÉGI y=1180-as jelzővel elbukna', () => {
  // ISMERT POZITÍV. Ugyanaz a `resek()` függvény, csak a haladásjelző y-ja a
  // 2026-09-18 előtti érték. A háromsoros tábla alcíme akkor 1186 körül ért
  // véget, a sáv 1180-on ment — vagyis KERESZTÜL rajta. Ha ezzel is zöld
  // lenne, a fenti fésű zöldje sem jelentene semmit.
  const HAROMSOROS = { cimke: '', nagy: 'Perplexity\nfor answers\nthat work', kicsi: 'In five steps' };
  const g = alsoGeometria(tablaSvg(HAROMSOROS, 0, 7).toString());

  const regi = resek(g, 1180);
  assert.ok(regi.alcimTolJelzo < MIN_RES,
    'a régi y=1180 mellett a sávnak bele kellene érnie az alcímbe, de a mérce '
    + regi.alcimTolJelzo.toFixed(1) + ' px rést lát — vak a mérce');
  assert.ok(regi.alcimTolJelzo < 0, 'a régi értéknél a sáv ÁTMENT az alcímen: '
    + regi.alcimTolJelzo.toFixed(1) + ' px');

  // …és ugyanaz a tábla a MAI jelzővel átmegy: a mérce nem mindenre pirosat mond.
  const mai = resek(g);
  assert.ok(mai.alcimTolJelzo >= MIN_RES, 'a mai SAV_JELZO_Y=' + SAV_JELZO_Y + ' mellett rendben kell '
    + 'lennie, de csak ' + mai.alcimTolJelzo.toFixed(1) + ' px a rés');
  assert.ok(mai.jelzotolMarka >= MIN_RES, 'jelző→márkajel: ' + mai.jelzotolMarka.toFixed(1) + ' px');
  assert.ok(mai.markaSavAlatt >= 0, 'a márkajel alja a SAV_ALSO fölött marad');

  // A két konstans EGYMÁSHOZ van kötve: aki az egyiket mozdítja, itt bukik.
  assert.ok(MARKAJEL_Y > SAV_JELZO_Y, 'a márkajel a haladásjelző ALATT van');
});

t('📐 a geometria-olvasó nem néma: hiányzó elemre szól, nem nullát ad', () => {
  // A `alsoGeometria` a mai SVG ALAKJÁRA illeszt (fill="#5c5850", AIWORLDHQ,
  // height="8"). Ha a tábla átrajzolódik és ezek eltűnnek, a fésű CSENDBEN
  // üresen futna — az őrszem legrosszabb hibamódja. Ezért dob.
  assert.throws(() => alsoGeometria('<svg></svg>'), /márkajel|haladásjelző/);
  // A hiányzó ALCÍM viszont nem hiba (a záró és a sok lépés-tábla ilyen):
  // ott a rés végtelen, nem nulla — különben minden alcím nélküli tábla bukna.
  const nincsAlcim = alsoGeometria(tablaSvg({ cimke: '01', nagy: 'Egy sor', kicsi: '' }, 0, 3).toString());
  assert.equal(nincsAlcim.alcimAlja, null);
  assert.equal(resek(nincsAlcim).alcimTolJelzo, Infinity);
});

// ── AMIT A BETŰ NEM TUD KIRAJZOLNI ──────────────────────────────────
//
// ÉLES LELET (2026-09-18, ez a mérés találta). A 7693 élő kártya-sorban 26-szor
// szerepelt a NEM TÖRŐ KÖTŐJEL (U+2011) — és a becsomagolt Schibsted Grotesk
// ezt a karaktert NEM ISMERI: ahol előfordul, a renderelő a `.notdef` glifát
// rajzolja, azaz egy üres téglalapot. A `core/short-video.js` `esc()`-e azóta
// közönséges kötőjelre cseréli.
//
// ⚠️ EZÉRT A KÉSZ SVG-BŐL SZÁMOLUNK, NEM A KÁRTYA-OBJEKTUMBÓL. A `cards`
// tömbben a U+2011 TOVÁBBRA IS ott van — a csere a kiíráskor történik. Ha a
// fésű a nyers kártyát nézné, egy már MEGOLDOTT hibát jelentene örökké, és
// (rosszabb) egy ROSSZ helyre nézne: a nézőhöz az kerül, ami az SVG-ben van.
// A mérce iránya itt is számít: nem az a kérdés, mit írt az agent, hanem hogy
// mi kerül a képre.
//
// KÜSZÖB: NULLA. Bármelyik kirajzolhatatlan karakter üres doboz lenne egy
// kiküldött Reelen — a „26 ismert" fajta engedmény pont az a fajta állandó
// sárga, amit egy idő után senki nem néz meg.
t('🔤 a KIRENDERELT táblákon nincs kirajzolhatatlan karakter', () => {
  mintaEll();
  const talalt = new Map();
  let vizsgalt = 0;
  for (const { c, fajl, svg } of VALODI.kartyak) {
    for (const { szoveg } of svgSzovegek(svg)) {
      vizsgalt++;
      for (const k of szovegSzeles(szoveg, 100).ismeretlen) {
        const kulcs = k + ' («' + szoveg + '», ' + fajl + ')';
        talalt.set(kulcs, (talalt.get(kulcs) || 0) + 1);
      }
    }
  }
  // Kiürülés-védelem: minden táblán van legalább 2 <text> (nagy szöveg + márkajel).
  assert.ok(vizsgalt >= 2 * VALODI.kartyak.length,
    'csak ' + vizsgalt + ' <text> elemet nézett meg ' + VALODI.kartyak.length
    + ' táblán — romlott a mérőeszköz');
  assert.deepEqual([...talalt.keys()].sort(), [], talalt.size + ' helyen olyan karakter kerül a '
    + 'táblára, amit a becsomagolt betű nem tud kirajzolni (üres téglalap lenne a Reelen) — '
    + 'vagy cseréld le az esc()-ben, vagy bővítsd a betűt ('
    + BETU_UT.split(/[\\/]/).slice(-3).join('/') + '):\n     '
    + [...talalt.keys()].slice(0, 10).join('\n     '));
  console.log('       ' + vizsgalt + ' kirenderelt <text> · kirajzolhatatlan karakter: 0');
});

t('🔤 a mérce a KIRENDERELT szöveget nézi — a nyers kártyán még ott a U+2011', () => {
  // ISMERT POZITÍV a fenti fésűhöz. Ha a `tablaSvg` cseréje egyszer kiesik, az
  // a nyers és a kirenderelt szöveg KÜLÖNBSÉGÉN látszik — ezért itt mindkettőt
  // megmérjük ugyanazzal a mércével.
  const NYERS = 'day‑by‑day';
  assert.deepEqual(szovegSzeles(NYERS, 52).ismeretlen, ['U+2011', 'U+2011'],
    'a mérce a nyers szövegben MEG KELL hogy találja a nem törhető kötőjelet — különben a '
    + 'fenti nulla-küszöb semmit nem bizonyít');
  const svg = tablaSvg({ cimke: '01', nagy: NYERS, kicsi: NYERS }, 0, 3).toString();
  for (const { szoveg } of svgSzovegek(svg)) {
    assert.deepEqual(szovegSzeles(szoveg, 52).ismeretlen, [],
      'a tablaSvg kimenetében már nem lehet kirajzolhatatlan karakter: «' + szoveg + '»');
  }
  assert.ok(/day-by-day/.test(svg), 'a nem törhető kötőjel helyén közönséges kötőjel áll');
});

console.log('\n✅ short-video.test: mind a ' + pass + ' eset rendben');
