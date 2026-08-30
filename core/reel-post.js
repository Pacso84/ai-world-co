// ===================================================================
// REEL-KÜLDÉS — a kész álló videó kiküldése a Facebookra
// ===================================================================
//
// A lánc: core/short-video.js legyártja a videót → a build kiteszi az
// oldalra → EZ a modul szól a Make „Facebook Reel" forgatókönyvének,
// az pedig felteszi a Facebook-oldalra.
//
// A Make két mezőt vár: `video` (a letölthető cím) és `caption` (a
// leírás). URL-módban a Facebook MAGA tölti le a videót — ezért kerül
// 1 Make-műveletbe 3 helyett, és ezért KELL a címnek élnie.
//
// ── MIÉRT ELLENŐRIZZÜK A CÍMET KÜLDÉS ELŐTT (2026-08-23, éles lecke) ──
// Aznap háromszor küldtünk ki egy videó-címet, ami még 404 volt, és a
// Facebook mindháromszor 422/DataError-t adott. Egy HEAD kérés ingyen van
// és pár ezredmásodperc — a kiküldött hibás poszt viszont nem.
//
// ⚠️ A HEAD NEM CSAK A STÁTUSZT NÉZI. Egy félbeszakadt ffmpeg 0 bájtos
// fájlt hagy maga után, arra a Cloudflare 200-at ad, és a Facebook megint
// 422-t adna — visszajönne pont az a hiba, ami ellen a kapu épült. Ezért
// a típust és a méretet is megnézzük, ugyanabból az egy kérésből.
//
// ── AMI A PIPELINE-BA KÖTÉSHEZ KELLETT (bekötve 2026-08-25) ──────────
// Ez a modul eleinte KÉZZEL indult, és a fejléce két feltételt szabott a
// bekötéshez. Mindkettő megvan:
//   • „már kiment" jelölés → a cikk `_meta.reel_at` mezője (a send() írja).
//     Enélkül a 8 óránként futó CI naponta háromszor küldené ki ugyanazt.
//   • MAKE-KERET → a Reel a 7066389-es forgatókönyvön fut, és UGYANABBÓL az
//     1000-es havi fiók-keretből eszik, mint a fotós poszt (6452490): napi
//     ~2 művelet, havi ~60. A művelet-őr 2026-08-30 óta MINDKETTŐT
//     összegzi — core/make-budget.js → SHARED_SCENARIOS / usedThisMonth().
//
// ⚠️ A LECKE: a bekötés megtörtént, a feltétel öt napig pótlatlan maradt, és
// ezt a fejléc szövege sem árulta el — a kód saját kommentje NEM bizonyíték.
// A Reel a napi riport Make-őrszemébe is csak 08-30-án került be
// (core/daily-report.js → WATCH).
// ===================================================================

import { followCta, trimToWords } from './social-text.js';
import { guideMeta, findArticleBySlug } from './frontmatter.js';

export const SITE = 'https://aiworldhq.com';

// A mobil Facebook a leírást 125–180 karakter között elvágja (mérve
// 2026-08-20: a követésre hívás a 358. karakternél állt, és SOHA nem
// látszott). Az alsó határral számolunk — az a biztos.
export const MOBIL_VAGAS = 125;

// A legkisebb hihető videóméret. A mi Reeljeink ~450 KB-osak; egy
// félbeszakadt vagy üres fájl nagyságrendekkel kisebb.
export const MIN_VIDEO_BAJT = 100000;

export function reelVideoUrl(slug, site = SITE) {
  const s = String(slug || '');
  return s ? `${site}/assets/video/shorts/${s}.mp4` : '';
}

// A kanonikus cikk-URL .html NÉLKÜLI (a lemezen .html-es fájlok vannak,
// de kifelé sosem azt mutatjuk). A /guides/ útvonal NEM létezik — 404.
export function reelArticleUrl(slug, site = SITE) {
  const s = String(slug || '');
  return s ? `${site}/article/${s}` : '';
}

/**
 * A Reel leírása EGY VALÓDI cikk-JSON-ból. INGYENES: a cikk saját
 * alcíméből épül, nem AI írja — ahogy a videó szövege sem.
 *
 * ⚠️ A BEMENET A NYERS CIKK-JSON. Az első változatom `{slug, subtitle}`
 * alakot várt a JSON gyökerében — olyan alakot, ami MIND A 358 valódi
 * útmutatónk közül EGYRE SEM illett (a cím és az alcím a markdown
 * frontmatterében él, a slug a `_meta.slug`-ban). 16 zöld teszt nem vette
 * észre, mert mind kézzel írt mintát etetett.
 *
 * Felépítés (a sorrend szándékos):
 *   1. sor  — mit kapsz, a mobil vágása ELÉ férve
 *   2. blokk— a link
 *   3. blokk— követésre hívás (a videó záró táblája is a domaint mutatja)
 */
export function reelCaption(article, { site = SITE, videoSteps = null } = {}) {
  const { slug, title, subtitle } = guideMeta(article);
  // SLUG NÉLKÜL NINCS LEÍRÁS. A link a poszt egyetlen célja; slug nélkül
  // a „👉 https://aiworldhq.com/article/" cím ÉLESBEN 404-et ad (mérve).
  // Inkább ne menjen ki semmi, mint egy halott linkes Reel.
  if (!slug) return '';

  // ⚠️ AZ ALCÍM NEM ÍGÉRHET OLYAN SZÁMOT, AMIT A VIDEÓ NEM MUTAT (2026-08-24,
  // éles eset). Az első kiküldött Reelünk alatt ez állt: „Five quick checks…",
  // a videó viszont NÉGY lépést mutatott. Egyik állítás sem volt hamis
  // önmagában (az alcím a CIKKRŐL szól, a videó magáról), de egymás mellett
  // hibának látszik. Mérve: 358 alcímből mindössze 1 kezdődik számmal, tehát
  // ez a kapu szinte sosem sül el — de amikor igen, az kifelé látszik.
  const igert = igertLepesszam(subtitle);
  const utkozik = igert !== null && Number.isFinite(videoSteps) && igert !== videoSteps;

  const nyers = String((utkozik ? title : (subtitle || title)) || '').trim();
  if (!nyers) return '';
  const elso = trimToWords(nyers, MOBIL_VAGAS);
  const cta = followCta(slug);
  return `${elso}\n\n👉 ${reelArticleUrl(slug, site)}${cta ? `\n\n${cta}` : ''}`;
}

// Kiírt számnevek, amikkel egy alcím kezdődhet („Five quick checks…").
// Csak a SOR ELEJI szám számít: a mondat közepén álló szám nem a lépések
// számát ígéri („…in under two minutes" — az idő, nem a lépésszám).
const SZAMSZAVAK = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10
};

/** Hány lépést ígér az alcím? null, ha nem ígér semmit. */
export function igertLepesszam(subtitle) {
  const m = String(subtitle == null ? '' : subtitle)
    .match(/^(one|two|three|four|five|six|seven|eight|nine|ten)\b/i);
  return m ? SZAMSZAVAK[m[1].toLowerCase()] : null;
}

/** A cím nyilvános-e? A Facebook a saját szerveréről tölti le. */
function nyilvanosCim(url) {
  let u;
  try { u = new URL(String(url)); } catch { return false; }
  if (u.protocol !== 'https:') return false;
  return !/^(localhost|127\.|0\.0\.0\.0|\[?::1\]?|192\.168\.|10\.)/i.test(u.hostname);
}

/**
 * Kiküldés a Make webhookra.
 *
 * @returns {{ok:boolean, reason?:string, status?:number, dry?:boolean,
 *            payload?:object, sent?:'unknown'}}
 *
 * A NÉMA KIHAGYÁS ITT HIBA. A napi poszter jogosan hallgat, ha nincs
 * beállítva webhook (a CI-nak nem szabad elhasalnia tőle). Ez viszont
 * SZÁNDÉKOS, kézzel indított küldés — itt a néma siker megtévesztene.
 */
export async function sendReel({ video, caption, hook, fetchFn, dry = false, timeoutMs = 20000 }) {
  const f = fetchFn || fetch;
  // Próbamódban NEM követeljük meg a webhookot: azt úgysem hívnánk meg, és
  // e nélkül helyben egyáltalán nem lehetne próbálni. A hiányát viszont
  // KIÍRJUK — egy „rendben"-nek látszó próba, ami elhallgatja, hogy éles
  // futásnál a titok hiányozna, pont a néma siker lenne.
  if (!hook && !dry) return { ok: false, reason: 'Nincs webhook-cím (MAKE_REEL_WEBHOOK_URL).' };
  if (!video) return { ok: false, reason: 'Nincs videó-cím.' };
  if (!String(caption || '').trim()) return { ok: false, reason: 'Üres leírás — nem küldünk.' };
  if (!nyilvanosCim(video)) {
    return { ok: false, reason: `A videó címe nem nyilvános https-cím: ${video} — a Facebook nem érné el.` };
  }

  // 1) Él-e a videó, és videó-e egyáltalán?
  let fej;
  try {
    fej = await f(video, { method: 'HEAD', signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    return { ok: false, reason: `A videó címe nem érhető el: ${e.message}` };
  }
  if (!fej || !fej.ok) {
    return { ok: false, reason: `A videó nem tölthető le (HTTP ${fej ? fej.status : '?'}) — a Facebook ettől bukna el.` };
  }
  const fejlec = (n) => (fej.headers && typeof fej.headers.get === 'function' ? fej.headers.get(n) : null);
  const tipus = String(fejlec('content-type') || '');
  if (tipus && !/^video\//i.test(tipus)) {
    return { ok: false, reason: `A cím nem videót ad vissza (content-type: ${tipus}).` };
  }
  // ⚠️ A HIÁNYZÓ FEJLÉCET ÉS A 0 BÁJTOT SZÉT KELL VÁLASZTANI. Először
  // `Number(fejlec(...)) > 0`-t írtam — de a `Number(null)` is 0, tehát a
  // „nincs fejléc" ellen írt őr épp a 0 bájtos fájlt engedte át, azt, ami
  // ellen az egész ellenőrzés készült. A NYERS értéket nézzük meg előbb.
  const nyersMeret = fejlec('content-length');
  if (nyersMeret !== null && nyersMeret !== undefined && String(nyersMeret).trim() !== '') {
    const meret = Number(nyersMeret);
    if (Number.isFinite(meret) && meret < MIN_VIDEO_BAJT) {
      return { ok: false, reason: `A videó gyanúsan kicsi (${meret} bájt) — félbeszakadt kódolás?` };
    }
  }

  if (dry) return { ok: true, dry: true, hookConfigured: !!hook, payload: { video, caption } };

  // 2) Küldés. A Make csak annyit mond: „átvettem" — a TÉNYLEGES sikert
  //    a forgatókönyv naplójából kell megnézni (status 1 = jó, 2 = bukás).
  let r;
  try {
    r = await f(hook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ video, caption }),
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (e) {
    // ⚠️ AZ IDŐTÚLLÉPÉS NEM BIZONYÍTJA, HOGY NEM MENT KI. A Make már
    // átvehette a kérést, és később futtatja le. Ha ilyenkor „nem sikerült"-et
    // mondanánk, az operátor újrakattintana — és két Reel menne ki ugyanarról.
    return {
      ok: false, sent: 'unknown',
      reason: `A webhook nem válaszolt (${e.message}). ⚠️ EZ NEM JELENTI, hogy nem ment ki — `
        + 'ÚJRAKÜLDÉS ELŐTT nézd meg a Make naplóját (7066389), különben két Reel megy ki.'
    };
  }
  if (!r.ok) return { ok: false, status: r.status, reason: `A webhook HTTP ${r.status}-t adott.` };
  return { ok: true, status: r.status };
}

// ===================================================================
// PARANCSSOR
// ===================================================================
//
//   node core/reel-post.js <slug>          kiküldés (kézzel)
//   node core/reel-post.js <slug> --dry    csak megmutatja, mit küldene
//
//   node core/reel-post.js --prepare       AUTOMATIKA, 1. lépés  (a build ELŐTT)
//   node core/reel-post.js --send          AUTOMATIKA, 2. lépés  (a deploy UTÁN)
//
// ── MIÉRT KÉT LÉPÉS ─────────────────────────────────────────────────
// A Facebook a SAJÁT szerveréről tölti le a videót, tehát a fájlnak KINT
// kell lennie a posztolás pillanatában. A CI sorrendje:
//     … → videó-gyártás → build → deploy → social
// A `--prepare` kiválasztja a következő útmutatót és legyártja a videót,
// a választást pedig a `memory/reel-pending.json`-ba írja. A `--send` a
// deploy után ezt veszi elő, kiküldi, és megjelöli a cikket.
//
// ⚠️ EZ A FÁJL AZ IMPORTRA NEM INDUL EL — őrszem van a végén. 25 agentből
// 21 a fájl végén feltétel nélkül hívja a main()-t, tehát a puszta import
// pénzt költ és publikál (2026-08-06).
//
// ⚠️ A KILÉPŐKÓD NEM NULLA, HA NEM SIKERÜLT. Enélkül a GitHub Actions zöld
// pipát adna egy ki nem ment Reelre — pont az a néma siker, ami ellen az
// egész modul íródott.

async function main() {
  // A dotenv CSAK itt töltődik be, a main()-en belül — a modul maga tiszta
  // marad, tehát a tesztek nem függenek a helyi .env-től.
  await import('dotenv/config');
  const { fileURLToPath } = await import('url');
  const { dirname, join } = await import('path');
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

  const args = process.argv.slice(2);
  const dry = args.includes('--dry');

  // ÁLLAPOT A NAPI RIPORTNAK (2026-08-26). Az első automata Reel a CI-ban
  // "spawnSync ffmpeg ENOENT"-tel bukott — és ez CSAK a CI naplójába került,
  // ahová senki nem néz. A workflow `|| true`-ja (helyesen) nem dönti el a
  // futást, de emiatt kívülről a bukás és a "ma nem volt dolga" EGYFORMÁN
  // néz ki: mindkettő néma. Ezért írjuk le, mi történt.
  if (args.includes('--prepare') || args.includes('--send')) {
    const fazis = args.includes('--prepare') ? 'prepare' : 'send';
    const fn = fazis === 'prepare' ? () => prepare(ROOT, join) : () => send(ROOT, join, dry);
    await futtatFazis({ ROOT, join, fazis, fn });
    return;
  }

  const kulcs = args.find(a => !a.startsWith('--'));
  if (!kulcs) {
    console.log('Használat: node core/reel-post.js <slug> [--dry]');
    process.exit(1);
  }

  // SLUG szerint keres, nem fájlnév szerint — közös a videó-gyártóval.
  const talalt = findArticleBySlug(join(ROOT, 'content', 'articles'), kulcs);
  if (!talalt) {
    console.error(`❌ Nincs cikk ezzel a sluggal: ${kulcs}`);
    process.exit(1);
  }
  const cikk = talalt.article;

  const { slug, title } = guideMeta(cikk);
  const video = reelVideoUrl(slug);

  // Hány lépés van a VIDEÓBAN? Ugyanaz a számítás, amit a videó-gyártó
  // futtatott — így a leírás tudja, mit ígérhet. (A kártyák: horog + lépések
  // + záró, ezért -2.)
  const { cardsFromGuide } = await import('./short-video.js');
  const kartyak = cardsFromGuide(cikk.article_markdown || '');
  const videoSteps = kartyak.cards ? kartyak.cards.length - 2 : null;
  const caption = reelCaption(cikk, { videoSteps });

  console.log('🎬 ' + (title || slug));
  console.log('   lépés  : ' + (videoSteps ?? '?') + ' a videóban');
  console.log('   videó : ' + video);
  console.log('   leírás : ' + JSON.stringify(caption));
  if (!caption) {
    console.error('❌ Nem sikerült leírást építeni (hiányzó slug vagy alcím).');
    process.exit(1);
  }

  const hook = (process.env.MAKE_REEL_WEBHOOK_URL || '').trim();
  const r = await sendReel({ video, caption, hook, dry });

  if (r.ok && r.dry) {
    console.log('\n🧪 PRÓBA — nem küldtem el. A videó címe él, és tényleg videót ad vissza.');
    console.log(r.hookConfigured
      ? '   ✅ A webhook-cím be van állítva — éles futásnál lenne hová küldeni.'
      : '   ⚠️ NINCS webhook-cím beállítva. Ez a próba rendben ment, de ÉLESBEN itt elhasalna.');
    return;
  }
  if (r.ok) { console.log(`\n✅ Átvette a Make (HTTP ${r.status}).`); console.log('   ⚠️ Ez még csak annyit jelent: „átvettem". Hogy a Facebookra KI IS MENT-e,'); console.log('      azt a Make naplójában látod (forgatókönyv 7066389, status 1 = jó, 2 = bukás).'); return; }

  console.error('\n❌ ' + r.reason);
  if (r.sent === 'unknown') console.error('   ⚠️ A kimenetel BIZONYTALAN — ne küldd újra vakon.');
  process.exit(1);
}

// ── AUTOMATIKA ──────────────────────────────────────────────────────

/** A cikkek betöltése a sor-döntéshez. */
async function cikkekBetolt(ROOT, join) {
  const { readFileSync, readdirSync, existsSync } = await import('fs');
  const DIR = join(ROOT, 'content', 'articles');
  if (!existsSync(DIR)) return [];
  const ki = [];
  for (const f of readdirSync(DIR)) {
    if (!f.startsWith('ARTICLE_') || !f.endsWith('.json')) continue;
    let j; try { j = JSON.parse(readFileSync(join(DIR, f), 'utf-8')); } catch { continue; }
    const m = j._meta || {};
    ki.push({ file: f, slug: m.slug || '', type: m.type === 'guide' ? 'guide' : 'news',
      published_at: m.published_at || '', reel_at: m.reel_at || '', md: j.article_markdown || '' });
  }
  return ki;
}

/** 1. LÉPÉS: kiválasztás + videó-gyártás. A build ELŐTT fut. */
/**
 * Feljegyzi, mi történt a Reellel — a napi riport ebből olvas.
 * SOHA nem dob: az állapot-írás hibája nem ronthatja el magát a Reelt.
 */
function reelAllapot(ROOT, join, mit) {
  try {
    const { writeFileSync, mkdirSync, existsSync, readFileSync } = require$('fs');
    const dir = join(ROOT, 'memory');
    mkdirSync(dir, { recursive: true });
    const p = join(dir, 'reel-guard.json');
    let elozo = {};
    if (existsSync(p)) { try { elozo = JSON.parse(readFileSync(p, 'utf-8')); } catch { /* */ } }
    writeFileSync(p, JSON.stringify({
      ...elozo, at: new Date().toISOString(), [mit.fazis]: mit
    }, null, 2), 'utf-8');
  } catch { /* a napló akkor is ott van */ }
}
// A `fs` szinkron kell (a hibaágon is), ezért createRequire-rel hozzuk be.
import { createRequire } from 'module';
const require$ = createRequire(import.meta.url);

/**
 * Egy fázis (prepare/send) lefuttatása ÚGY, hogy a kimenetele MINDIG
 * bekerüljön az őrszem-fájlba — sikerkor és bukáskor is.
 *
 * ⚠️ EZÉRT VAN KÜLÖN FÜGGVÉNYBEN: a fázis-futtatás a main()-ben élt, ahol
 * teszt nem érte el. A hívott függvény bármelyik `process.exit()`-je némán
 * kikerülte volna ezt a try/catch-et (2026-08-30, lásd a send() végét).
 *
 * A hibát TOVÁBBADJA: a nem nulla kilépőkód a CI-nak szól, az őrszem-fájl
 * a napi riportnak. A kettő nem helyettesíti egymást.
 */
export async function futtatFazis({ ROOT, join, fazis, fn }) {
  try {
    const ki = await fn();
    reelAllapot(ROOT, join, { fazis, ok: true });
    return ki;
  } catch (e) {
    reelAllapot(ROOT, join, { fazis, ok: false, hiba: String(e?.message || e).slice(0, 200) });
    throw e;
  }
}

async function prepare(ROOT, join) {
  const { writeFileSync, existsSync, mkdirSync, rmSync } = await import('fs');
  const { kovetkezoReel } = await import('./reel-queue.js');
  const { cardsFromGuide, renderVideo } = await import('./short-video.js');

  const { maiReelCikk } = await import('./reel-queue.js');
  const cikkek = await cikkekBetolt(ROOT, join);
  // ALKALMAS-E? Csak a markdown ismeretében derül ki (kell 3+ lépés).
  const valasztott = kovetkezoReel(cikkek, Date.now(), {
    alkalmas: c => !!cardsFromGuide(c.md).cards
  });
  if (!valasztott) {
    // ── A MAI VIDEÓ ÉLETBEN TARTÁSA (2026-08-26) ──────────────────
    //
    // MI TÖRTÉNT: a 08:29-es futás legyártotta és kitette a Reel videóját,
    // a Facebook Reel kiment. A 16:40-es futás viszont — helyesen — nem
    // gyártott újat („ma már ment"), így a `website/assets/video/shorts/`
    // ÜRESEN maradt, és a build utáni deploy LETÖRÖLTE a délelőtti videót.
    // Este már 404 volt.
    //
    // A videók szándékosan a .gitignore-ban vannak (napi 500 KB = 180 MB/év
    // a NYILVÁNOS repóban), tehát minden futás TISZTA lappal indul.
    //
    // A FACEBOOKNAK MINDEGY: ő a poszt pillanatában letölti és a saját
    // szerverén tárolja. Az INSTAGRAMNAK NEM: ha a Buffer-poszter később
    // fut (vagy egy későbbi futásban próbálkozna újra), a videó már nincs
    // ott — és az Instagram aznap kimarad. Ez adta a napi EGYETLEN esélyt.
    //
    // Az újragyártás INGYENES (ffmpeg + helyi TTS, ~26 mp), ezért inkább
    // minden futásban meglegyen, mint hogy egy elmulasztott Instagram-poszt
    // egy egész napba kerüljön.
    const mai = maiReelCikk(cikkek);
    if (mai) {
      const kiDir0 = join(ROOT, 'website', 'assets', 'video', 'shorts');
      const utvonal = join(kiDir0, mai.slug + '.mp4');
      if (existsSync(utvonal)) {
        console.log('💤 Reel: ma már ment, a videó megvan — nincs teendő.');
        return;
      }
      const { cards } = cardsFromGuide(mai.md);
      if (!cards) { console.log('💤 Reel: ma már ment (a videó nem gyártható újra).'); return; }
      console.log('♻️  Reel: ma már ment, de a videó hiányzik — újragyártom, hogy kint maradjon.');
      mkdirSync(kiDir0, { recursive: true });
      const r0 = await renderVideo(cards, {
        out: utvonal,
        workDir: join(ROOT, '.video-munka'),
        cover: join(ROOT, 'website', 'assets', 'images', mai.slug + '.jpg')
      });
      try { rmSync(join(ROOT, '.video-munka'), { recursive: true, force: true }); } catch { /* */ }
      console.log('   ✅ ' + r0.seconds.toFixed(1) + ' mp — a deploy után újra elérhető lesz.');
      return;   // pending-et NEM írunk: a Facebook Reel ma már kiment
    }
    console.log('💤 Reel: ma már ment, vagy nincs alkalmas útmutató — kihagyom.');
    return;
  }

  const { cards } = cardsFromGuide(valasztott.md);
  console.log('🎬 Reel készül: ' + valasztott.slug);
  console.log('   ' + cards.length + ' kártya (' + (cards.length - 2) + ' lépés)');

  const kiDir = join(ROOT, 'website', 'assets', 'video', 'shorts');
  mkdirSync(kiDir, { recursive: true });
  const r = await renderVideo(cards, {
    out: join(kiDir, valasztott.slug + '.mp4'),
    workDir: join(ROOT, '.video-munka'),
    cover: join(ROOT, 'website', 'assets', 'images', valasztott.slug + '.jpg')
  });
  try { rmSync(join(ROOT, '.video-munka'), { recursive: true, force: true }); } catch { /* */ }

  const memDir = join(ROOT, 'memory');
  if (!existsSync(memDir)) mkdirSync(memDir, { recursive: true });
  writeFileSync(join(memDir, 'reel-pending.json'),
    JSON.stringify({ slug: valasztott.slug, file: valasztott.file, at: new Date().toISOString() }, null, 2), 'utf-8');
  console.log('✅ ' + r.seconds.toFixed(1) + ' mp — a küldés a deploy után jön (--send)');
}

/** 2. LÉPÉS: kiküldés + megjelölés. A deploy UTÁN fut. */
export async function send(ROOT, join, dry) {
  const { readFileSync, writeFileSync, existsSync, unlinkSync } = await import('fs');
  const { guideMeta } = await import('./frontmatter.js');
  const { cardsFromGuide } = await import('./short-video.js');

  const P = join(ROOT, 'memory', 'reel-pending.json');
  if (!existsSync(P)) { console.log('💤 Reel: nincs előkészített videó — kihagyom.'); return; }
  let pending; try { pending = JSON.parse(readFileSync(P, 'utf-8')); } catch { pending = null; }
  if (!pending?.file) { console.log('💤 Reel: hibás előkészítés — kihagyom.'); try { unlinkSync(P); } catch { /* */ } return; }

  const cikkPath = join(ROOT, 'content', 'articles', pending.file);
  if (!existsSync(cikkPath)) { console.log('⏭️  Reel: a cikk közben eltűnt — kihagyom.'); try { unlinkSync(P); } catch { /* */ } return; }
  const cikk = JSON.parse(readFileSync(cikkPath, 'utf-8'));

  const { slug } = guideMeta(cikk);
  const kartyak = cardsFromGuide(cikk.article_markdown || '');
  const caption = reelCaption(cikk, { videoSteps: kartyak.cards ? kartyak.cards.length - 2 : null });
  const video = reelVideoUrl(slug || pending.slug);
  const hook = (process.env.MAKE_REEL_WEBHOOK_URL || '').trim();

  console.log('🎬 Reel küldése: ' + (slug || pending.slug));
  const r = await sendReel({ video, caption, hook, dry });

  if (r.ok && r.dry) { console.log('   🧪 PRÓBA — nem küldtem el.'); return; }

  // ⚠️ MEGJELÖLÜNK AKKOR IS, HA A KIMENETEL BIZONYTALAN (időtúllépés). A két
  // hiba nem egyforma súlyú: a kimaradt Reel egy nap csendje, a duplikált
  // viszont kint van az oldaladon. Ha a Make mégis kiküldte, a jelölés
  // pontosan azt akadályozza meg, hogy holnap megismételjük.
  if (r.ok || r.sent === 'unknown') {
    cikk._meta = cikk._meta || {};
    cikk._meta.reel_at = new Date().toISOString();
    writeFileSync(cikkPath, JSON.stringify(cikk, null, 2), 'utf-8');
  }
  try { unlinkSync(P); } catch { /* */ }

  if (r.ok) {
    console.log('   ✅ Átvette a Make (HTTP ' + r.status + ') — a TÉNYLEGES sikert a napló mondja meg');
    return;
  }
  console.error('   ❌ ' + r.reason);
  if (r.sent === 'unknown') console.error('   ⚠️ Bizonytalan kimenetel — megjelöltem, hogy ne menjen ki kétszer.');

  // ⚠️ DOBUNK, NEM LÉPÜNK KI (2026-08-30). Itt `process.exit(1)` állt — az
  // AZONNAL megöli a folyamatot, tehát a hívó futtatFazis() try/catch-e, és
  // vele az ŐRSZEM-ÍRÁS, SOSEM futott le: a memory/reel-guard.json-ban az
  // ELŐZŐ futás `ok:true`-ja maradt, a napi riport pedig hallgatott. Pont az
  // a bukás volt láthatatlan, amiért az őrszem 2026-08-26-án készült.
  //
  // ÉS EZ VOLT A TIPIKUS ÁG, nem a kivételes: a sendReel() SOSEM DOB —
  // hiányzó webhookra, nem elérhető videóra (bukott deploy → 404), rossz
  // content-type-ra, gyanúsan kicsi fájlra és webhook-HTTP-hibára is
  // {ok:false}-t ad vissza.
  //
  // A nem nulla kilépőkód MEGMARAD: a futtatFazis továbbdobja a hibát, a
  // fájl végi main().catch() pedig process.exit(1)-gyel zár. A kilépőkód a
  // CI-nak szól, az őrszem-fájl a napi riportnak — a kettő nem helyettesíti
  // egymást (a workflow `|| true`-ja miatt a CI-napló amúgy sem jut el senkihez).
  const hiba = new Error(r.reason || 'A Reel kiküldése nem sikerült.');
  hiba.sent = r.sent;          // 'unknown' = a Make már átvehette, ne küldd újra vakon
  throw hiba;
}

const kozvetlen = process.argv[1] && process.argv[1].endsWith('reel-post.js');
if (kozvetlen) main().catch(e => { console.error('💥 reel-post hiba:', e.message); process.exit(1); });
