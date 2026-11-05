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
 * 🔧 „Ha elakadsz” doboz — a napi generátor (core/elakadas-gen.js) mai munkája egy sorban.
 *
 * A generátor a memory/elakadas-state.json fájlba írja: { nap (UTC), koltseg, uj, forditva, kimaradt }.
 * ⚠️ CSAK A MAI ÁLLAPOTOT mutatjuk: egy tegnapi fájlból „🔧 2 új doboz” azt sugallná, hogy ma is futott
 * a generátor — a „nem volt dolga” és az „el sem indult” így kívülről egyformán nézne ki. Régi vagy
 * hiányzó állapotra `null` (a hívó ilyenkor semmit sem ír ki). A hibás számmező 0, sosem NaN.
 * A `kimaradt` (pl. „keret”) egy sorba tördelve és rövidítve kerül a sor végére.
 *
 * @param {object|null} allapot  a memory/elakadas-state.json tartalma
 * @param {string} maNap         YYYY-MM-DD (UTC) — a riport mai napja
 * @returns {string|null}
 */
export function elakadasLine(allapot, maNap) {
  if (!allapot || typeof allapot !== 'object' || Array.isArray(allapot)) return null;
  if (!allapot.nap || allapot.nap !== maNap) return null;

  const szam = x => (Number.isFinite(Number(x)) && x !== null && x !== '' ? Number(x) : 0);
  const uj = Math.max(0, Math.round(szam(allapot.uj)));
  const forditva = Math.max(0, Math.round(szam(allapot.forditva)));
  const koltseg = Math.max(0, szam(allapot.koltseg));

  let sor = `🔧 „Ha elakadsz” dobozok: ${uj} új, ${forditva} fordítás ($${koltseg.toFixed(3)})`;
  const kimaradt = kimaradtSzoveg(allapot.kimaradt);
  if (kimaradt) sor += ` · kimaradt: ${kimaradt}`;
  return sor;
}

// 11-05: a „kimaradt: index ×3” belső kód volt (core/elakadas-gen.js okai) → közérthető mondat.
const KIMARADT_OK = {
  index: 'nem jött le a gyártó súgóoldal-listája',
  'idő': 'elfogyott a futásidő',
  keret: 'elfogyott a napi keret',
  hiba: 'hiba történt'
};
/** „index ×3, idő ×1” → „3 útmutató (nem jött le a gyártó súgóoldal-listája), 1 útmutató (elfogyott a futásidő)”. */
export function kimaradtSzoveg(nyers) {
  const s = String(nyers ?? '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  return s.split(/\s*,\s*/).map(resz => {
    const m = resz.match(/^(\S+?)(?:\s*×\s*(\d+))?$/u);
    if (!m || !KIMARADT_OK[m[1]]) return resz;
    return m[2] ? `${m[2]} útmutató (${KIMARADT_OK[m[1]]})` : KIMARADT_OK[m[1]];
  }).join(', ').slice(0, 120);
}

/** Szóhatáron rövidít, „…”-lel (a riport címlistájához; eddig szó közepén vágott: „…és mi mar”). */
export function rovidCim(s, max = 70) {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const vag = t.slice(0, max - 1);
  const sz = vag.lastIndexOf(' ');
  return (sz > max * 0.6 ? vag.slice(0, sz) : vag).replace(/[\s,;:–—-]+$/u, '') + '…';
}

/**
 * 👔 A főnöki napló (memory/ceo-desk-log.json, agents/ceo/desk.js) mai bejegyzései közérthetően.
 * 11-05: eddig a nyers bejegyzés ment ki: „Újraindítva (rewrite-explainer, 1. főnöki kör): "Heimstaden…”.
 */
export function fonokiDontesSor(bejegyzesek) {
  const td = (Array.isArray(bejegyzesek) ? bejegyzesek : []).filter(x => typeof x === 'string' && x.trim());
  if (!td.length) return '';
  const cim = s => `„${rovidCim(String(s).replace(/[*_`[\]]/g, ''), 45)}”`;
  const egy = (b) => {
    let m;
    if ((m = b.match(/^Újraindítva \(([^,]+), \d+\. főnöki kör\): "(.*)"$/u))) {
      const mit = m[1] === 'fix-only' ? 'kijavíttatta' : 'újraíratta közérthetőbben';
      return `${mit}: ${cim(m[2])}`;
    }
    if ((m = b.match(/^Menthetetlen .*lezárva: "(.*)"$/u))) return `elvetette (többszöri javítás után sem ment át): ${cim(m[1])}`;
    if ((m = b.match(/^Elvetve \(okafogyott\): "(.*)"$/u))) return `elvetette (már nem aktuális): ${cim(m[1])}`;
    if ((m = b.match(/^Duplikátum lezárva: "(.*)"$/u))) return `lezárta (már megírtuk): ${cim(m[1])}`;
    if ((m = b.match(/^Rövidhírként mentve[^:]*: "(.*)"/u))) return `rövidhírként mentette: ${cim(m[1])}`;
    return rovidCim(b, 70);
  };
  const reszek = td.slice(0, 2).map(egy);
  return `👔 Főnöki döntés ma: ${td.length} — ${reszek.join(' · ')}${td.length > 2 ? ` · …és még ${td.length - 2}` : ''}`;
}

/**
 * 🧩 A kimenet-őr (core/output-guard.js → memory/output-guard.json) sora közérthetően. '' = nincs lelet.
 * 11-05: eddig a nyers osztálynevek mentek ki („midread, midread__arrow, … pack-foot”) — érthetetlenül, így a
 * mögöttük álló valódi hiba (az útmutatókból eltűnt „Ezt olvasd utána” doboz) napokig senkinek nem tűnt fel.
 */
const ELEM_NEV = {
  midread: 'az „Ezt olvasd utána” doboz',
  'pack-foot': 'a PDF-csomag ajánló sor',
  'ad-slot': 'a hirdetés helye'
};
export function kimenetOrSor(og) {
  const p = Array.isArray(og?.problems) ? og.problems : [];
  if (!p.length) return '';
  const nevek = (elemek) => [...new Set((elemek || []).map(k => {
    const alap = String(k).split('__')[0];
    return ELEM_NEV[alap] || `„${alap}”`;
  }))].join(', ');
  const egy = (x) => {
    if (x.code === 'PARITAS_CSAK_HIR' && x.elemek?.length) return `az útmutató-oldalakról hiányzik, ami a híreken megvan: ${nevek(x.elemek)}`;
    if (x.code === 'PARITAS_CSAK_UTMUTATO' && x.elemek?.length) return `csak az útmutató-oldalakon van (a híreken nincs): ${nevek(x.elemek)}`;
    if (x.code === 'PARITAS_TAG' && x.elemek?.length) return `a hír- és az útmutató-oldal HTML-je eltér: <${x.elemek.join('>, <')}>`;
    return String(x.uzenet || x.code || '?');
  };
  const fedes = `${og.hir ?? '?'} hír + ${og.utmutato ?? '?'} útmutató átnézve`;
  return `🧩 KIMENET-ŐR (a kész oldalak ellenőrzése): ${p.length} lelet — ${p.slice(0, 3).map(egy).join(' · ')} — ${fedes}`;
}

/**
 * 🧩 Régi promptok kitölthetővé tétele — a napi generátor (core/kitoltheto-regi-gen.js) mai munkája egy sorban.
 * Az elakadasLine mintájára: CSAK a MAI állapot ad sort (régi/hiányzó/hibás állapot → null), a hibás szám 0.
 * @param {object|null} allapot  a memory/kitoltheto-regi-state.json tartalma: { nap, koltseg, uj (útmutató), mezo, kimaradt }
 * @param {string} maNap         YYYY-MM-DD (UTC)
 */
export function kitolthetoRegiLine(allapot, maNap) {
  if (!allapot || typeof allapot !== 'object' || Array.isArray(allapot)) return null;
  if (!allapot.nap || allapot.nap !== maNap) return null;
  const szam = x => (Number.isFinite(Number(x)) && x !== null && x !== '' ? Number(x) : 0);
  const uj = Math.max(0, Math.round(szam(allapot.uj))), mezo = Math.max(0, Math.round(szam(allapot.mezo)));
  let sor = `🧩 Régi promptok kitölthetővé: ${uj} útmutató, ${mezo} mező ($${Math.max(0, szam(allapot.koltseg)).toFixed(3)})`;
  const kimaradt = String(allapot.kimaradt ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);   // 11-05: `/s+/` volt (backslash nélkül)
  if (kimaradt) sor += ` · kimaradt: ${kimaradt}`;
  return sor;
}

/**
 * 🕵️ Tény-ellenőrző — mit nézett át az elmúlt 24 órában (2026-11-01, 4. rész).
 *
 * MIÉRT: 10-21 – 10-31 között 42 visszautasított javítás és gyanú üzenete CSAK a memory/ops.json-ba ment, amit
 * senki nem olvas — a tény-ellenőrző munkája láthatatlan volt (az átnézés 10-31-én a naplókból derítette ki,
 * hogy 22 útmutató-javítást „emlékezetből” utasított vissza, 5 jó hír-javítás elveszett). Most a
 * logs/factcheck_*.json naplókból (a CI commitolja; a fact-check lépés a napi riport ELŐTT fut) egy sor + max 4
 * részletsor a javított / gyanús / visszautasított tételekről.
 *
 * Három állapot, mint az ismétlés-őrnél: „nem futott” (⚠️, mert hiba) · „futott, nem volt dolga” · eredmények.
 * A régi formájú napló (11-01 előtt: csak ok/fixed/cost) is beszámít, részletsor nélkül.
 * A cím a Telegram Markdown-jét elronthatná (*, _, `, [) → ezeket kivesszük.
 *
 * @param {object[]} naplok  a beolvasott factcheck_*.json objektumok (bármennyi; az ablakon kívülieket kiszűri)
 * @param {number} [now]
 * @param {number} [oraAblak]  ennyi órára visszamenőleg (a riport naponta egyszer megy)
 */
export const TENY_RESZLET_MAX = 4;
export function tenyellenorzoLine(naplok, now = Date.now(), oraAblak = 24) {
  const tol = now - oraAblak * 3600e3;
  const ablakban = (Array.isArray(naplok) ? naplok : []).filter(n => {
    const t = Date.parse(n?.at || '');
    return n && typeof n === 'object' && Number.isFinite(t) && t >= tol && t <= now + 3600e3;
  });
  if (!ablakban.length) return `🕵️ Tény-ellenőrző: ⚠️ NEM FUTOTT az elmúlt ${oraAblak} órában (nincs napló) — nézd meg a CI fact-check lépését`;

  const szam = x => (Number.isFinite(Number(x)) ? Number(x) : 0);
  const d = { ok: 0, javitva: 0, gyanu: 0, visszautasitva: 0, kihagyva: 0, ertelmezhetetlen: 0 };
  let osszes = 0, koltseg = 0;
  const reszletek = [];
  for (const n of ablakban) {
    koltseg += szam(n.cost);
    if (n.darab && typeof n.darab === 'object') {
      for (const k of Object.keys(d)) d[k] += szam(n.darab[k]);
      osszes += Number.isFinite(Number(n.osszes)) ? Number(n.osszes) : Object.keys(d).reduce((s, k) => s + szam(n.darab[k]), 0);
    } else {
      // régi forma (11-01 előtt): csak ok + fixed
      d.ok += szam(n.ok); d.javitva += szam(n.fixed); osszes += szam(n.ok) + szam(n.fixed);
    }
    for (const it of Array.isArray(n.items) ? n.items : []) {
      if (['javitva', 'gyanu', 'visszautasitva'].includes(it?.eredmeny)) reszletek.push(it);
    }
  }
  // 2026-11-02 (kód-átnézés): az agent üres sornál, időkorlátnál és hibánál is ír naplót → ezek látszanak, nem „NEM FUTOTT”.
  const megszakadt = ablakban.filter(n => n.megszakitva).length, hibas = ablakban.filter(n => n.hiba).length;
  const zavar = [megszakadt ? `⏱️ ${megszakadt}× időkorlát miatt megszakadt` : '', hibas ? `💥 ${hibas}× hibával állt le` : ''].filter(Boolean);
  if (!osszes) return `🕵️ Tény-ellenőrző: futott (${ablakban.length}×), de nem volt átnéznivaló cikk` + (zavar.length ? ` · ${zavar.join(' · ')}` : '');

  const tag = [`${osszes} cikk`];
  if (d.ok) tag.push(`✅ ${d.ok} rendben`);
  if (d.javitva) tag.push(`🔧 ${d.javitva} javítva`);
  // 11-05: a „⛔ javítás visszautasítva” félreérthető volt (nem a cikk hibás, hanem a gép JAVASOLT rossz javítást,
  // és a rendszer NEM engedte élő szövegre). A gyanúhoz senki nem nyúl → ezt is kimondjuk.
  if (d.gyanu) tag.push(`🙋 ${d.gyanu} gyanú (nem javítottuk)`);
  if (d.visszautasitva) tag.push(`⛔ ${d.visszautasitva} javítás-javaslatot nem engedtünk át`);
  if (d.kihagyva) tag.push(`⏭️ ${d.kihagyva} forrás olvashatatlan`);
  if (d.ertelmezhetetlen) tag.push(`⚠️ ${d.ertelmezhetetlen} értelmezhetetlen válasz`);
  tag.push(...zavar);
  tag.push(`$${koltseg.toFixed(2).replace('.', ',')}`);

  const tiszta = s => String(s || '').replace(/[*_`[\]]/g, '').replace(/\s+/g, ' ').trim();
  // a javítás a legfontosabb (élő szöveg változott), utána a visszautasítás, végül a gyanú
  const rang = { javitva: 0, visszautasitva: 1, gyanu: 2 };
  const sorok = reszletek
    .sort((a, b) => rang[a.eredmeny] - rang[b.eredmeny])
    .slice(0, TENY_RESZLET_MAX)
    .map(it => {
      const cim = tiszta(it.cim || it.file || '?');
      const ok = tiszta(it.ok_hu).slice(0, 140);
      // 11-05: minden tétel elé a fajtája — eddig nem derült ki, melyik pont gyanú, melyik kivédett javítás
      const jel = { javitva: '🔧 javítva', visszautasitva: '⛔ nem engedtük', gyanu: '🙋 gyanú' }[it.eredmeny];
      return `  • ${jel} „${cim.length > 50 ? cim.slice(0, 49) + '…' : cim}”${ok ? ` — ${ok}` : ''}`;
    });
  if (reszletek.length > TENY_RESZLET_MAX) sorok.push(`  • …és még ${reszletek.length - TENY_RESZLET_MAX} (logs/factcheck_*.json)`);
  return [`🕵️ Tény-ellenőrző: ${tag.join(' · ')}`, ...sorok].join('\n');
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

// ===================================================================
// 👥 LÁTOGATÓSZÁM (2026-08-28, user-döntés)
// ===================================================================
// A user panasza: „kapok napi jelentést, de amit küld, az nem releváns."
// A riport 14 sorából 7 egy fejlesztőnek szólt — és közben A LEGFONTOSABB
// SZÁM HIÁNYZOTT BELŐLE: hány látogató volt. Az adat hónapok óta megvan
// (memory/traffic-log.json), csak sosem került a jelentésbe.
//
// ⚠️ A DÁTUMOT NEM FELTÉTELEZZÜK. A Cloudflare-adat késhet, a CI is
// csúszhat — a naplóban lévő LEGFRISSEBB napot mutatjuk, és ha az nem
// tegnap volt, kiírjuk a dátumot. Egy „Tegnap: 67" felirat egy három napos
// adaton rosszabb, mint a semmi.
// ===================================================================

/** Egy nap belépőinek száma (a --report is így számol: minden útvonal). */
export function napiBelepok(rows) {
  if (!Array.isArray(rows)) return 0;
  return rows.reduce((s, r) => s + (Number(r?.visits) || 0), 0);
}

/**
 * @param {object} days  memory/traffic-log.json → days
 * @param {string} today YYYY-MM-DD (UTC)
 * @returns {string} a 👥 sor, vagy '' ha nincs elég adat
 */
export function visitorLine(days, today) {
  if (!days || typeof days !== 'object') return '';
  const kulcsok = Object.keys(days).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort();
  if (!kulcsok.length) return '';

  const utolso = kulcsok[kulcsok.length - 1];
  const db = napiBelepok(days[utolso]);

  const tegnap = new Date(Date.parse(today + 'T00:00:00Z') - 86400e3).toISOString().slice(0, 10);
  const cimke = utolso === tegnap ? 'Tegnap' : utolso;

  // 7 napos átlag — csak ha van mihez viszonyítani (3 nap alatt félrevezető).
  const utolso7 = kulcsok.slice(-7);
  let atlag = '';
  if (utolso7.length >= 3) {
    const ossz = utolso7.reduce((s, k) => s + napiBelepok(days[k]), 0);
    atlag = ` (${utolso7.length} napos átlag: ${Math.round(ossz / utolso7.length)})`;
  }
  return `👥 ${cimke}: ${db} látogató${atlag}`;
}

/**
 * Futott-e ma a témaismétlés-őr?
 *
 * ⚠️ KÉT FORRÁSBÓL, MERT AZ ŐR KÉT HELYEN DOLGOZIK (2026-08-30, hibavadászat).
 * A hívó eddig CSAK a `logs/writer_<ma>*.json` fájlokat nézte — azokat viszont
 * a HÍR-ÍRÓ készíti. Egy olyan napon, amikor csak útmutató születik (a
 * `guide-balance` / `guide-ideas` ágon), nincs writer-napló, és a riport
 * „⚠️ NEM FUTOTT — ez hiba"-t írt.
 *
 * ÉLESBEN MÉRVE 2026-08-30-án: a `memory/topic-dedup-log.json`-ban 4 mai
 * bejegyzés volt (mind `guide-*` forrásból), a riport mégis két EGYMÁSNAK
 * ELLENTMONDÓ sort adott, tizenöt sor távolságra:
 *     🔁 Ismétlődő téma kiszűrve: 4 (…)
 *     🔁 Ismétlés-őr: ⚠️ NEM FUTOTT (nincs adat) — ez hiba
 *
 * A hamis vészjelzés rosszabb a néma hibánál is: leszoktatja az embert arról,
 * hogy a ⚠️-t komolyan vegye.
 *
 * @param {{writerNaplok?: number, dedupMai?: number}} p
 */
export function orFutott({ writerNaplok = 0, dedupMai = 0 } = {}) {
  return Number(writerNaplok) > 0 || Number(dedupMai) > 0;
}

// ===================================================================
// A JELENTÉS ZÁRÓSORA (2026-10-12, user: „nem mentek ki a posztok facebookra
// és tiktokra sem! pedig telegram azt írta, hogy igen!!!!!")
// ===================================================================
// Élő eset 10-12: a jelentésben ott állt „🎬 REEL-ŐRSZEM: a videó-gyártás
// elbukott — Edge TTS … 403" és „⚠️ REEL-POSZTOLÓ: 1/2 poszt ELBUKOTT" — az
// utolsó sor mégis FELTÉTEL NÉLKÜL ezt mondta: „Minden megy magától. ✅".
// Aki csak a végét olvassa (mobilon ez látszik), az azt hiszi, minden kiment.
// Mostantól a zárósor számolja a hibajelző sorokat. A KRÓNIKUS leletek
// (🧩 kimenet-őr, ♻️ ismétlődő hiba) nem kimaradás, ezért nem számítanak.
const HIBA_JEL = /^\s*(⚠️|❌|🔴|🚨|⛔)|elbukott|ELBUKOTT|nem sikerült|leállt/;

/** Hány sor jelez valódi hibát? */
export function hibaSorok(sorok) {
  return (Array.isArray(sorok) ? sorok : []).filter(s => HIBA_JEL.test(String(s || '')));
}

/** A jelentés utolsó sora: ✅ csak akkor, ha egyetlen hibajelzés sincs fent. */
// A hibasor rövid neve a zárósorba („🎬 REEL-ŐRSZEM: a videó-gyártás…” → „REEL-ŐRSZEM”). 10-28: a zárósor csak
// a számot írta („3 hibajelzés fent”), és a Reel-hiba a 25 sor között elveszett (user: „szerintem nem írta a Telegram”).
const hibaNev = s => String(s || '').replace(/^[^\p{L}\p{N}]+/u, '').split(/\s*[:—]\s|\s+\(/)[0].trim().slice(0, 32);

export function zaroSor(sorok) {
  const hibak = hibaSorok(sorok);
  if (!hibak.length) return 'Minden megy magától. ✅';
  const nevek = [...new Set(hibak.map(hibaNev).filter(Boolean))];
  return `⚠️ Nem minden ment magától: ${hibak.length} hibajelzés — ${nevek.join(' · ')}. Fent a részletek.`;
}
