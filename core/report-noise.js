// ===================================================================
// RIPORT-ZAJSZŰRŐ — az őrszem csak akkor szólal meg, ha VÁLTOZOTT (2026-08-28)
// ===================================================================
// A USER PANASZA: „kapok napi jelentést, de amit küld, az nem releváns."
//
// A 2026-08-28-i riport 14 sorából 7 egy FEJLESZTŐNEK szólt, aki nem létezik:
// hiányzó eszköz-link, 200 átnézendő helyesírási javaslat, i18n-foltok, nem
// termelő források, házmester-karbantartás. És ezek NAPRÓL NAPRA UGYANAZOK:
// a „🔗 Hivatalos link nélküli új eszköz: Picsart" sor szó szerint ugyanaz
// volt 08-24-én, 08-25-én, 08-26-án és 08-28-án. Négy nap, egy mondat, nulla
// cselekvés.
//
// 🔑 A PROJEKT SZABÁLYA EDDIG FÉLIG VOLT MEG. Tudtuk, hogy „az őrszem csak
// akkor őr, ha odaszól, ahol a user néz" — de nem mondtuk meg, MIKOR
// HALLGASSON. Egy őrszem, ami minden nap ugyanazt mondja, nem őrszem, hanem
// háttérzaj; és a zajnak ára van, mert elrejti azt az egy sort, ami számít.
// (Élő bizonyíték: a user 08-27-én azt sem vette észre, hogy AZNAP EGYÁLTALÁN
// NEM JÖTT riport — annyira megszokta, hogy a tartalma úgysem mond semmit.)
//
// ⚠️ A CSAPDA, AMIT EL KELL KERÜLNI: ha csak elnémítjuk a sorokat, onnantól
// a „nincs változás" és a „elromlott az őrszem" KÍVÜLRŐL EGYFORMÁN NÉZ KI —
// pontosan az a hiba, ami a témaismétlés-őrnél hónapokig rejtve maradt.
// Ezért a `csendesSor()` egyetlen sorban felsorolja, MELYIK őrszem futott le
// némán. Hét sor helyett egy, de a bizonyíték megmarad.
//
// USER-DÖNTÉS (2026-08-28): „Csak ha VÁLTOZIK vagy dönteni kell."
// ===================================================================

/**
 * Módok:
 *   'halmaz'    — csak ha ÚJ elem jelenik meg a felsorolásban
 *   'novekedes' — csak ha a szám a valaha látott CSÚCS fölé megy (romlás)
 *   'valtozas'  — csak ha a sor szövege megváltozott
 *   'soha'      — rutin/lezárt: sosem megy ki magától
 */
export const SZABALYOK = [
  { kulcs: 'toolLink', minta: 'Hivatalos link nélküli új eszköz', mod: 'halmaz', nev: 'eszköz-linkek' },
  { kulcs: 'nemTermel', minta: '🔎 Nem termel', mod: 'halmaz', nev: 'források' },
  { kulcs: 'minosegOr', minta: '🧹 Minőség-őr', mod: 'valtozas', nev: 'minőség-őr' },
  { kulcs: 'i18n', minta: '🈳 I18N-ŐRSZEM', mod: 'valtozas', nev: 'nyelvi foltok' },
  // TŰRÉS 15%: a szám a cikkállománnyal EGYÜTT nő (201/821 → 207/841 = lapos
  // arány), tehát a puszta „nagyobb, mint eddig" majdnem minden nap átengedte.
  { kulcs: 'helyesiras', minta: '📝 Helyesírás', mod: 'novekedes', nev: 'helyesírás', szamMinta: /átnézésre:\s*(\d+)/, tures: 0.15 },
  // A user 2026-08-26-án LEZÁRTA az 53 meglévő csonka szöveget („maradjon
  // így"). Egy lezárt döntést nyitott problémaként jelenteni napi zaj — de
  // egy 54. MÁR ÚJ HIBA lenne (a router keret-mentője romlott el), ezért a
  // 'novekedes' mód pont jó: a mai szám lesz a néma alap.
  { kulcs: 'csonka', minta: '✂️ CSONKA-ŐRSZEM', mod: 'novekedes', nev: 'csonka szövegek', szamMinta: /:\s*(\d+)/ },
  { kulcs: 'hazmester', minta: '🧹 HÁZMESTER', mod: 'soha', nev: 'házmester' },
  { kulcs: 'osszevonas', minta: '🔗 Összevonás: nem volt', mod: 'soha', nev: 'hír-összevonás' }
];

/** A felsorolt elemek egy „halmaz"-sorból: a kettőspont után, a gondolatjelig. */
export function halmazElemek(sor) {
  const t = String(sor);
  const kettospont = t.indexOf(':');
  if (kettospont < 0) return [];
  let resz = t.slice(kettospont + 1);
  const gondolatjel = resz.indexOf(' — ');
  if (gondolatjel >= 0) resz = resz.slice(0, gondolatjel);
  return resz.split(/[·,]/)
    .map(x => x.replace(/\(.*?\)/g, '').replace(/…/g, '').trim())
    .filter(Boolean);
}

/** A figyelt szám egy „novekedes"-sorból. null, ha nincs. */
export function szamKi(sor, minta) {
  const m = String(sor).match(minta || /(\d+)/);
  return m ? Number(m[1]) : null;
}

/**
 * Egyetlen őrszem-sor sorsa.
 * ⚠️ AZ ELSŐ FUTÁS MINDIG NÉMA: nincs mihez hasonlítani, tehát csak alapot
 * állítunk. Ez szándékos — így a bevezetés napján nem zúdul ki minden.
 */
export function dontes(szabaly, sor, elozo) {
  if (szabaly.mod === 'soha') return { mutasd: false, ujAllapot: null, indok: 'rutin/lezárt' };

  if (szabaly.mod === 'valtozas') {
    const mutasd = elozo !== undefined && elozo !== null && elozo !== sor;
    return { mutasd, ujAllapot: sor, indok: mutasd ? 'megváltozott' : 'változatlan' };
  }

  if (szabaly.mod === 'novekedes') {
    const n = szamKi(sor, szabaly.szamMinta);
    if (n === null) return { mutasd: false, ujAllapot: elozo ?? null, indok: 'nincs szám a sorban' };
    const alap = typeof elozo === 'number' ? elozo : null;
    // ⚠️ TŰRÉSHATÁR (2026-08-29, az első éles nap tanulsága). A puszta
    // „nagyobb, mint eddig" szabály a helyesírás-sort MAJDNEM MINDEN NAP
    // átengedte, mert a szám a cikkállománnyal EGYÜTT NŐ: 201 → 207,
    // miközben 821 → 841 cikk, vagyis arányban 24,5% → 24,6% (lapos).
    // Pont az a sor jött vissza naponta, amit ki akartunk szűrni.
    // A tűrés RULE-onként külön: a csonka szövegeknél 0, mert ott EGY új
    // elvágott szöveg is valódi hír (a keret-mentő romlását jelentené).
    const kuszob = alap === null ? null : alap * (1 + (szabaly.tures || 0));
    const mutasd = kuszob !== null && n > kuszob;
    // A CSÚCSOT tartjuk alapnak, nem az utolsó értéket: különben egy javulás
    // után a visszakapaszkodás fölöslegesen riasztana (200 → 190 → 195).
    return { mutasd, ujAllapot: alap === null ? n : Math.max(alap, n), indok: mutasd ? `nőtt (${alap} → ${n})` : 'nem romlott' };
  }

  // 'halmaz'
  const most = halmazElemek(sor);
  if (!Array.isArray(elozo)) return { mutasd: false, ujAllapot: most, indok: 'első alkalom' };
  const ujak = most.filter(x => !elozo.includes(x));
  // Az UTOLSÓ LÁTOTT halmazt tartjuk, nem a valaha látottak unióját: ha egy
  // elem eltűnik (megjavult), majd visszatér, az ÚJRA hír.
  return { mutasd: ujak.length > 0, ujAllapot: most, indok: ujak.length ? 'új: ' + ujak.join(', ') : 'nincs új' };
}

/**
 * Végigmegy a kész riport-sorokon, és kiszűri a változatlan őrszem-sorokat.
 * Ami nem őrszem-sor (tartalom, pénz, forgalom), az ÉRINTETLENÜL megy tovább.
 *
 * @param {string[]} sorok
 * @param {object} elozo  a korábbi állapot (memory/daily-report-state.json → orszem)
 * @returns {{sorok: string[], allapot: object, csendes: string[], indokok: object}}
 */
export function szurZajt(sorok, elozo = {}) {
  const allapot = { ...(elozo || {}) };
  const ki = [];
  const csendes = [];
  const indokok = {};

  for (const sor of Array.isArray(sorok) ? sorok : []) {
    const sz = SZABALYOK.find(s => typeof sor === 'string' && sor.includes(s.minta));
    if (!sz) { ki.push(sor); continue; }
    const d = dontes(sz, sor, allapot[sz.kulcs]);
    if (d.ujAllapot === null && sz.mod === 'soha') delete allapot[sz.kulcs];
    else allapot[sz.kulcs] = d.ujAllapot;
    indokok[sz.kulcs] = d.indok;
    if (d.mutasd) ki.push(sor); else csendes.push(sz.nev);
  }
  return { sorok: ki, allapot, csendes, indokok };
}

/**
 * Egyetlen sor arról, mely őrszemek futottak le NÉMÁN.
 *
 * ⚠️ EZ NEM DÍSZ. Enélkül a „nincs változás" és a „elromlott az őrszem"
 * kívülről egyformán nézne ki — ez a hiba a témaismétlés-őrnél hónapokig
 * rejtve maradt. Hét sor helyett egy, de a bizonyíték megmarad.
 */
export function csendesSor(csendes) {
  if (!Array.isArray(csendes) || !csendes.length) return '';
  const egyedi = [...new Set(csendes)];
  return '🔇 Csendben rendben: ' + egyedi.join(' · ');
}
