// ===================================================================
// BEÁGYAZÓ-LÁNC — melyik szolgáltatót próbáljuk, és mit tanultunk róla?
// (2026-09-06)
// ===================================================================
//
// MÉRT LELET. A `memory/embed-guard.json` teljes git-történetében 33 bejegyzés
// van; a 16 SIKERES mind `provider: "mistral"` — google EGY SEM. Ugyanezt
// mondja a `guides/topic-embeddings.json` is: 58 db 768 dimenziós (Google-kori)
// vektor mellett 46 db 1024 dimenziós (Mistral). A váltás megtörtént.
//
// Az `embedText()` viszont MINDEN egyes hívásnál elölről kezdte a sort, tehát
// minden beágyazás előtt lefutott egy biztosan bukó Google-kör. Egy futásban ez
// 100+ eldobott HTTP-hívás (a memória-vektorok újraszámolása egymaga százas
// nagyságrend).
//
// ÉS A DIAGNÓZIS IS ELVESZETT: a ciklus a Google hibáját FELÜLÍRTA a
// Mistraléval, ezért az őrszem-fájlból SOHA nem derült ki, MIÉRT halott a
// Google — csak az, hogy a tartalék is bukott. Egy őrszem, ami elnyeli az okot,
// félkész őrszem.
//
// ───────────────────────────────────────────────────────────────────
// MIÉRT FOLYAMAT-LOKÁLIS A RÖVIDZÁR, ÉS NEM KONFIG?
// ───────────────────────────────────────────────────────────────────
// A kézenfekvő „javítás" az volna, hogy kivesszük a Google-t a sorból (vagy
// `enabled:false`-ra tesszük). Két kemény projekt-szabály tiltja:
//   • „A config `enabled` mezője nem kapcsol ki semmit" — az `ai-router` sosem
//     nézi, tehát a mező léte nem bizonyíték.
//   • A MÉRÉS ROMLANDÓ: a kvóta jövő hónapban visszatérhet, és egy beégetett
//     „a Google halott" döntést senki nem venne vissza. Tartós vak döntés.
//
// Ezért a tudás A FOLYAMAT ÉLETTARTAMÁIG él: aki EBBEN a futásban már elbukott,
// azt nem próbáljuk újra minden egyes hívásnál. A következő CI-futás új
// processz, üres nyilvántartással — magától újramér. Nincs beégetett ítélet,
// és nincs 100+ fölösleges kör sem.
//
// 🔒 ÉS EGY KEMÉNY KIKÖTÉS: a rövidzár SOSEM zárhat ki mindenkit. Ha a kihagyás
// után nem maradna kit próbálni, MINDENKIT újrapróbálunk. A spórolás nem
// vásárolhat vakságot — épp az ellen készült ez az egész modul.
//
// ⚠️ ILYENKOR A NYILVÁNTARTÁST NEM ÜRÍTJÜK, hanem a SIKER törli a saját
// bejegyzését. A mutációs próba mutatta meg, miért számít ez (2026-09-06): az
// első változat `clear()`-t hívt, amitől a „siker törli a jelet" sor SOHA nem
// futott le érdemben — halott kód volt, és a mutánsa túlélte a tesztet. Az
// ürítés ráadásul a MÉG HALOTT szolgáltató okát is eldobta volna, tehát a
// következő teljes bukásnál hiányosat jelentenénk.
// ===================================================================

/**
 * A megjegyzett bukás-okok emberi olvasatra, a szolgáltatók SORRENDJÉBEN.
 * Csak azok kerülnek bele, akikről tudunk valamit — az üres nyilvántartásból
 * üres sztring lesz, nem „undefined".
 *
 * @param {Array<[string, Function]>} providers  a teljes sor, sorrendben
 * @param {Map<string,string>} kiesett           provider → a bukás oka
 * @returns {string} pl. „google: 429 credits depleted · mistral: HTTP 401"
 */
export function osszefuz(providers, kiesett) {
  return providers
    .map(([nev]) => (kiesett.has(nev) ? `${nev}: ${kiesett.get(nev)}` : null))
    .filter(Boolean)
    .join(' · ');
}

/**
 * Végigpróbálja a szolgáltatókat, kihagyva azokat, akik EBBEN A FOLYAMATBAN
 * már elbuktak.
 *
 * A szolgáltató-függvények INJEKTÁLTAK — ez a modul nem tud a hálózatról, és
 * ezért teljesen tesztelhető valódi (fizetős) hívás nélkül.
 *
 * @param {Array<[string, (t:string)=>Promise<{v:any,error:string|null}>]>} providers
 * @param {Map<string,string>} kiesett  folyamat-lokális bukás-nyilvántartás (MÓDOSUL)
 * @param {string} text
 * @returns {Promise<{provider:string|null, v:any, error:string|null}>}
 *          Sikerkor `error: null`; teljes bukáskor az error MINDEN ismert okot
 *          tartalmaz — a rövidzárral kihagyottakét is.
 */
export async function probalSorban(providers, kiesett, text) {
  let sor = providers.filter(([nev]) => !kiesett.has(nev));
  // 🔒 A rövidzár nem zárhat ki mindenkit (lásd a fejlécet). Nem ürítünk:
  // a talpra álló szolgáltató a SAJÁT bejegyzését törli odalent, a többiek
  // oka pedig megmarad a jelentéshez.
  if (!sor.length) sor = providers;

  for (const [nev, fn] of sor) {
    const { v, error } = await fn(text);
    if (v) {
      kiesett.delete(nev);                     // gyógyulás: újra teljes értékű
      return { provider: nev, v, error: null };
    }
    // Az ok nélkül bukó szolgáltató se maradjon néma — a „nem tudom" is adat.
    kiesett.set(nev, error || 'ismeretlen hiba');
  }
  return { provider: null, v: null, error: osszefuz(providers, kiesett) };
}
