// ===================================================================
// RIPORT-SOROK  —  a napi jelentés két félrevezető sorának javítása
// ===================================================================
//
// User-jelzés (2026-08-06): "ne küldjön valótlan adatokat".
//
// 1. "📘 Facebook-poszt: 6"
//    A szám a MI jelölésünkből jött (posted_fb), ami a webhook HTTP 200-as
//    válaszára kerül rá — az viszont csak annyit jelent, hogy a Make ÁTVETTE
//    a kérést. Élesben mérve: a Pinterest 3 pinje elbukott a kimeneti
//    modulban, miközben nálunk mind "kiküldve" volt. A riport tehát
//    magabiztosan írt ki olyan számot, ami felfelé torzít.
//    JAVÍTÁS: a Make futási naplójából vett TÉNYLEGES szám is odakerül.
//    Ha nincs Make-adat, a sor őszintén csak annyit mond: "kiküldve".
//
// 2. "♻️ ISMÉTLŐDŐ hiba … (legmakacsabb 4×) — kemény szabály kellhet"
//    A 4 nem MAI szám volt, hanem a lecke TELJES élettartamára (2026-07-03
//    óta, 34 nap) vonatkozó összeg. Így a sor havi 4 előfordulást úgy
//    mutatott, mintha ma történt volna négyszer — és sürgetett is.
//    JAVÍTÁS: az időtáv kiírva, a sürgetés pedig HETI ÜTEMHEZ kötve.
// ===================================================================

// Efölött szólunk kemény szabályért. 4 előfordulás / 34 nap ≈ heti 0,8 —
// az nem makacs hiba, hanem a minőségkapu normál működése.
export const REPEAT_URGENT_PER_WEEK = 3;

/**
 * A közösségi posztok sora: mennyit KÜLDTÜNK és mennyi MENT KI valóban.
 *
 * @param {number} sent       amit mi kiküldtünk (posted_fb, 24 óra)
 * @param {number|null} delivered  a Make sikeres futásai (null = nincs adat)
 */
export function describePosts(sent, delivered) {
  if (delivered == null) return `📘 Facebook-poszt: ${sent} kiküldve`;
  // A Make-napló ablaka nem pont ugyanaz, mint a mienk; ha többet mutat,
  // attól még nem jelenhetett meg több, mint amennyit küldtünk.
  const shown = Math.min(delivered, sent);
  if (shown < sent) {
    return `📘 Facebook-poszt: ${sent} kiküldve, de csak ${shown} jelent meg ⚠️`;
  }
  return `📘 Facebook-poszt: ${sent} kiküldve, mind megjelent`;
}

// NAP ELEJÉTŐL NAP ELEJÉIG mérünk. (Az első változat a záró naphoz
// 23:59:59-et adott, ami egy egész napot kerekített felfelé — a teszt
// kapta el: 34 nap helyett 35-öt írt volna a riportba.)
const dayDiff = (fromIso, toIso) => {
  const a = Date.parse(String(fromIso).slice(0, 10) + 'T00:00:00Z');
  const b = Date.parse(String(toIso).slice(0, 10) + 'T00:00:00Z');
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(1, Math.round((b - a) / 86400000));
};

/**
 * Az ismétlődő hibák sora — vagy null, ha ma nem ismétlődött semmi.
 *
 * @param {Array}  repeated  a ma ismétlődött leckék
 * @param {number} types     hány TÍPUS ismétlődött ma
 * @param {string} today     'YYYY-MM-DD'
 */
export function describeRepeat(repeated, types, today) {
  if (!repeated || !repeated.length) return null;
  const worst = [...repeated].sort((a, b) => (b.repeats || 0) - (a.repeats || 0))[0];
  const n = worst.repeats || 0;
  const days = dayDiff(worst.created, today);
  const span = days ? ` ${days} nap alatt` : '';
  const perWeek = days ? (n / days) * 7 : 0;

  const head = `♻️ Ismétlődő hiba: ${types} típus ma`
    + ` (legmakacsabb: [${worst.scope || '?'}] ${String(worst.text || '').slice(0, 60)}…`
    + ` — ${n}×${span})`;

  // Sürgetni csak akkor, ha tényleg sűrű. Enélkül minden nap riasztana
  // olyasmiért, ami a minőségkapu normál munkája.
  return perWeek >= REPEAT_URGENT_PER_WEEK
    ? head + ' — ez sűrű, kemény szabály kellhet!'
    : head;
}

// ===================================================================
// 3. "🌍 Fordítás-hiány: 1 pár"  (2026-08-10)
//
//    A 2026-08-09-i heti összefoglaló magyar fordítása ÜRESEN maradt (a
//    fordító hatszor bukott el rajta némán), és a cikk magyarul ANGOLUL
//    ment ki — a főoldal tetején, ahol a legtöbben látják. A riportban ez
//    egyetlen "1 pár" volt: igaz szám, használhatatlan üzenet. A hibát
//    végül a user vette észre az oldalon, nem a rendszer a riportban.
//
//    Egy hiányzó fordítás nem statisztika. Meg kell nevezni, MELYIK cikk
//    az, és mi a baja — különben nincs mit kezdeni a sorral.
// ===================================================================

// Efölött már listát nem írunk, csak példát: a riport egy Telegram-üzenet.
const GAP_EXAMPLES = 3;

/**
 * A fordítás-hiány sora: melyik cikk, milyen nyelven, mi a baja.
 *
 * @param {Array<{slug:string, lang:string, ok:string, kiemelt?:boolean}>} gaps
 * @returns {string} a riport-sor, vagy '' ha nincs hiány
 */
export function describeTranslationGaps(gaps) {
  if (!gaps || !gaps.length) return '';

  // A KIEMELT tartalom (heti összefoglaló) előre: az ül a főoldal tetején
  // minden nyelven, tehát ott a legdrágább egy angolul maradt cikk.
  const sorrend = [...gaps].sort((a, b) => (b.kiemelt ? 1 : 0) - (a.kiemelt ? 1 : 0));
  const pelda = sorrend.slice(0, GAP_EXAMPLES)
    .map(g => `${g.lang}: ${g.slug} (${g.ok})`)
    .join(' · ');

  const fej = `🌍 Fordítás-hiány: ${gaps.length} pár`;
  const kiemelt = sorrend.find(g => g.kiemelt);
  const figyelem = kiemelt
    ? ` ⚠️ ebből a HETI ÖSSZEFOGLALÓ (${kiemelt.lang}) — az a főoldal tetején van!`
    : '';

  return `${fej} — ${pelda}${gaps.length > GAP_EXAMPLES ? ' …' : ''}${figyelem}`;
}
/**
 * 🔗 Hír-összevonás — hány cikk készült több hírből az elmúlt N napban.
 *
 * MIÉRT KELL EZ A SOR: az összevonás legvalószínűbb csendes hibája nem az,
 * hogy rosszul csoportosít, hanem hogy SOSEM csoportosít. Az ítélet
 * visszaeshet üres válaszra, a korlátok lehetnek túl szigorúak — és minden
 * „működni" látszana, mert a cikkek elkészülnek. Ez a szám a különbség az
 * „elkészült" és a „működik" között.
 *
 * ⚠️ AZ ABLAK SZÁMÍT: csak a MAI (N napos) cikkeket nézzük. A teljes élettartam
 * összege akkor is szép számot mutatna, amikor az ítélet ma már nem von össze
 * semmit — ez a hiba egyszer már megtörtént az „ISMÉTLŐDŐ hiba" sorral.
 */
export function mergeLine(articles, days = 1) {
  const lista = Array.isArray(articles) ? articles : [];
  const hatar = Date.now() - days * 86400000;
  let cikk = 0, hir = 0;
  for (const a of lista) {
    const at = Date.parse(a?._meta?.published_at || '');
    if (!Number.isFinite(at) || at < hatar) continue;
    const n = Number(a?._meta?.merged_from) || 1;
    if (n > 1) { cikk++; hir += n; }
  }
  return cikk
    ? `🔗 Összevonás: ${cikk} cikk ${hir} hírből (${days} nap)`
    : `🔗 Összevonás: nem volt (0 cikk, ${days} nap)`;
}
/**
 * 📝 Magyar helyesírás — mi kér EMBERI DÖNTÉST?
 *
 * MIÉRT CSAK EZ MEGY KI: az auto-javított szóalakkal nincs teendőd, azt a gép
 * már rendbe tette a szövegben. A riportba az való, amihez a gép nem nyúlhatott
 * magától — mert a bíró javaslata nem volt egyszerű behelyettesítés
 * (élesben: «askolsz vagy „túl tág kérdéseket teszel fel»).
 *
 * ⚠️ CSENDES, ha nincs teendő. A napi jelentés hosszú; ami nem kér tőled
 * semmit, az ne foglaljon benne sort.
 */
export function huSpellingLine(store) {
  const review = store?.review;
  if (!review || typeof review !== 'object') return '';
  const lista = Object.entries(review);

  // ⚠️ A LEFEDETTSÉG AKKOR IS KIMEGY, HA NINCS TEENDŐ (2026-08-21, éles lelet).
  // Az őrszem egy elrontott fájlválasztás miatt 773 cikkből 12-t nézett —
  // mindig ugyanazt a 12-t —, és erre „0 megítélendő szóalak"-ot jelentett.
  // Zöld volt a naplóban. A néma siker és a néma vakság ugyanúgy néz ki, ezért
  // a SZÁM kimegy: a „0 szóalak 773 cikkből" megnyugtató, a „0 szóalak 12
  // cikkből" viszont azonnal szemet szúr.
  const db = Number(store?.scan?.files);
  const fedes = Number.isFinite(db) && db > 0 ? `${db} cikk átnézve` : '';

  if (!lista.length) return fedes ? `📝 Helyesírás: ${fedes} · nincs átnézendő` : '';

  const pelda = lista.slice(0, 3).map(([w, d]) => `${w} → ${String(d?.correct || '').slice(0, 24)}`).join(' · ');
  const fej = fedes ? `📝 Helyesírás (${fedes}) — átnézésre: ` : '📝 Magyar szóalak átnézésre: ';
  return `${fej}${lista.length} — ${pelda}${lista.length > 3 ? ' …' : ''}`;
}

/**
 * 🔁 Ismétlés-őr — hány készülő cikket fogott meg, mert már írtunk róla?
 *
 * MIÉRT KELL EZ A SOR (2026-08-25). A témaismétlés-őr beágyazása HÓNAPOK ÓTA
 * halott volt: a Google-kulcs kerete elfogyott, a hívás némán `null`-t adott,
 * az őr meg szó nélkül átváltott a durva tartalékra. Mérve: 15 ismert
 * ismétlésből 1-et fogott meg (7%). Végig ZÖLDNEK LÁTSZOTT.
 *
 * ⚠️ EZÉRT KÜLÖNBÖZTETÜNK MEG HÁROM ÁLLAPOTOT, nem kettőt:
 *     „nem futott"  — az őr el sem indult  → ⚠️, mert ez HIBA
 *     „nem volt"    — futott, nem talált    → csendes rendben
 *     „N ismétlés"  — futott és fogott      → mit hagyott ki, és mi helyett
 *
 * A „nem volt" és a „nem futott" kívülről EGYFORMÁN néz ki (mindkettő nulla),
 * és pont ez a különbségtétel hiányzott hónapokig.
 */
export function repeatLine(stats) {
  const s = (stats && typeof stats === 'object') ? stats : {};
  const db = Number(s.skipped_repeat);
  const lista = Array.isArray(s.repeats) ? s.repeats : null;

  if (!Number.isFinite(db) || !lista) {
    return '🔁 Ismétlés-őr: ⚠️ NEM FUTOTT (nincs adat) — ez hiba, nézd meg a naplót';
  }
  if (!db) return '🔁 Ismétlés-őr: nem volt ismétlés (0)';

  const reszek = lista.slice(0, 3).map(r => {
    const cim = String(r?.cim || '?').slice(0, 44);
    const mar = String(r?.mar || '?').slice(0, 44);
    const p = Number(r?.pont);
    return `   • „${cim}"\n     helyett megvan: „${mar}"${Number.isFinite(p) ? ` (${p.toFixed(2)})` : ''}`;
  });
  const tobb = lista.length > 3 ? `\n   …és még ${lista.length - 3}` : '';
  return `🔁 Ismétlés-őr: ${db} cikk NEM jelent meg, mert már írtunk róla\n${reszek.join('\n')}${tobb}`;
}
