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
// ── AMI SZÁNDÉKOSAN NINCS BENNE ──────────────────────────────────────
// NINCS „már kiment" jelölés (a poster.js `posted_fb`-je). Ez a modul ma
// KÉZZEL, egyszer indul; a jelölés a napi automatikába kötéskor lesz
// kötelező, mert a CI 8 óránként fut, és jelölés nélkül ugyanaz a Reel
// naponta háromszor menne ki. ADDIG NE KÖSD BE A PIPELINE-BA.
//
// ⚠️ A MAKE-KERET SEM SZEREPEL ITT. A poster.js művelet-őre CSAK a
// 6452490-es (Facebook-fotó) forgatókönyv naplóját összegzi — a Reel a
// 7066389-esen fut, tehát a Reel műveletei NEM számítanak bele. Egy kézi
// próbánál (1 művelet) elhanyagolható; pipeline-ba kötés előtt a
// core/make-budget.js oldalán kell kezelni.
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
//   node core/reel-post.js <slug>          kiküldés
//   node core/reel-post.js <slug> --dry    csak megmutatja, mit küldene
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

const kozvetlen = process.argv[1] && process.argv[1].endsWith('reel-post.js');
if (kozvetlen) main().catch(e => { console.error('💥 reel-post hiba:', e.message); process.exit(1); });
