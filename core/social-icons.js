// ===================================================================
// IKONOK A KÖZÖSSÉGI KÉPHEZ (2026-09-21)
// ===================================================================
//
// A user megnézte az első infografikámat, és igaza volt: „nincs a
// háttérben semmilyen grafika". A mutatott minták attól élnek, hogy
// MINDEN soruk mellett van egy jel — mappa, boríték, fogaskerék, pipa.
//
// MIÉRT KÉZZEL RAJZOLT SVG, ÉS NEM KÉPGENERÁTOR VAGY IKON-CSOMAG:
//   • képgenerátor → elgépelt felirat kerülhet a képre (a Reel borítóján
//     élesben ott volt a „perrplexity"). Itt minden vonal kódból jön.
//   • külső ikon-csomag → futásidejű függőség és licenc-kérdés. Ezek
//     vonalas alapformák (kör, vonal, téglalap), nem védjegyek.
//   • a MÁRKAlogókat továbbra is a `website/assets/logos/` adja —
//     valódi, letöltött védjegyek. KITALÁLT LOGÓ SOHA.
//
// Minden ikon 24×24-es dobozban él, vonalas rajz (`stroke`), hogy a
// színt a hívó adja meg — ugyanúgy, ahogy a honlap logói csinálják.
// ===================================================================

/**
 * Az ikonok. Szándékosan ALAPFORMÁKBÓL (kör, vonal, téglalap, törtvonal)
 * épülnek, nem bonyolult path-adatból: így ránézésre ellenőrizhető, hogy
 * tényleg azt rajzolják, aminek a nevük mondja.
 */
export const IKONOK = {
  // Megnyitás, alkalmazás, weboldal
  ablak: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/><circle cx="6.5" cy="6.5" r=".6" fill="currentColor"/>',
  // Bejelentkezés
  kulcs: '<circle cx="8" cy="12" r="4"/><path d="M12 12h9M18 12v3M15 12v2"/>',
  // Letöltés, telepítés
  letolt: '<path d="M12 3v11M7 10l5 5 5-5M4 20h16"/>',
  // Feltöltés, hozzáadás, csatolás
  feltolt: '<path d="M12 16V5M7 9l5-5 5 5M4 20h16"/>',
  // Kérdezés, beírás, prompt
  buborek: '<path d="M4 5h16v11H9l-4 4V5z"/><path d="M8 10h8M8 13h5"/>',
  // Beállítás, kapcsoló
  fogaskerek: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
  // Ellenőrzés, átnézés
  pipa: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16 9.5"/>',
  // Mentés, megőrzés
  konyvjelzo: '<path d="M6 3h12v18l-6-4.5L6 21V3z"/>',
  // Másolás
  masol: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 012-2h10"/>',
  // Keresés
  nagyito: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  // Kép, fotó
  kep: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.6"/><path d="M4 17l5-4.5 4 3.5 3-2.5 4 3.5"/>',
  // Hang, beszéd
  mikrofon: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/>',
  // Lista, terv
  lista: '<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1.2" fill="currentColor"/><circle cx="4" cy="12" r="1.2" fill="currentColor"/><circle cx="4" cy="18" r="1.2" fill="currentColor"/>',
  // Küldés, e-mail, megosztás
  borítek: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 6.5L12 13l8.5-6.5"/>',
  // Idő, ütemezés
  ora: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5.5l3.5 2"/>',
  // Összehasonlítás
  oszlopok: '<path d="M5 20V10M12 20V4M19 20v-7M3 20h18"/>',
  // Mappa, fájl
  mappa: '<path d="M3 7a2 2 0 012-2h4l2 2.5h8a2 2 0 012 2V18a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/>',
  // ── A MÁSODIK KÖR (2026-09-21) ──────────────────────────────────
  // Mérve: az első készlettel a lépések 19,9%-a esett az általános
  // szikrára — minden ötödik sor mellett ugyanaz a jel állt volna, ami
  // maga is „gépies" benyomást kelt. Ez az öt a leggyakoribb kimaradókat
  // fedi le (létrehozás, választás, kód, megértés, futtatás).
  // Új, létrehozás
  plusz: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
  // Választás, kijelölés
  celkereszt: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  // Kód, beillesztés a kódba
  kod: '<path d="M9 7l-5 5 5 5M15 7l5 5-5 5"/>',
  // Megértés, felfedezés, tanulás
  villanykorte: '<path d="M9.5 18h5M10 21h4"/><path d="M12 3a6 6 0 00-3.5 10.9c.6.5.9 1.2.9 1.9v.2h5.2v-.2c0-.7.3-1.4.9-1.9A6 6 0 0012 3z"/>',
  // Futtatás, kipróbálás
  lejatszas: '<circle cx="12" cy="12" r="9"/><path d="M10 8.5l6 3.5-6 3.5v-7z"/>',
  // Alapértelmezés: szikra (a lépés „csinálj valamit" jellege)
  szikra: '<path d="M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2L12 3z"/>'
};

/**
 * Melyik ikon illik a lépéshez?
 *
 * A párosítás KULCSSZAVAS és determinisztikus — ugyanaz a lépés mindig
 * ugyanazt a jelet kapja. A sorrend SZÁMÍT: az „open the settings" a
 * beállítás-ikont kapja, nem az ablakot, mert a fogaskerék a konkrétabb.
 *
 * ⚠️ A SZAVAK SZÓHATÁRRA ILLESZKEDNEK. Előtag-illesztéssel a „scan" a
 * „can"-re ülne rá — ez a projektben a helyesírás-szótárnál KÉTSZER
 * megfogott minket („analysis" → „analyzis").
 */
const SZABALYOK = [
  ['fogaskerek', ['setting', 'settings', 'toggle', 'enable', 'disable', 'configure', 'preference', 'permission', 'option']],
  ['kulcs', ['login', 'account', 'password', 'register', 'signin']],
  ['letolt', ['download', 'install', 'export']],
  ['feltolt', ['upload', 'attach', 'import', 'drop']],
  ['nagyito', ['find', 'search', 'look', 'locate', 'browse', 'discover']],
  ['pipa', ['check', 'verify', 'confirm', 'review', 'test', 'proof', 'sanity', 'compare']],
  ['oszlopok', ['track', 'measure', 'analyse', 'analyze', 'budget', 'report', 'result', 'results']],
  ['kep', ['photo', 'photos', 'image', 'images', 'picture', 'pictures', 'render']],
  ['mikrofon', ['voice', 'speak', 'speech', 'talk', 'listen', 'dictate', 'audio', 'record']],
  ['borítek', ['email', 'mail', 'send', 'reply', 'message']],
  ['ora', ['daily', 'weekly', 'schedule', 'remind', 'routine', 'minute', 'minutes']],
  ['lista', ['list', 'plan', 'organise', 'organize', 'outline', 'steps', 'summarise', 'summarize', 'summary']],
  ['konyvjelzo', ['save', 'keep', 'store', 'remember', 'memory', 'bookmark']],
  ['masol', ['copy', 'paste', 'duplicate']],
  ['mappa', ['folder', 'file', 'files', 'document', 'documents', 'pdf']],
  ['kod', ['code', 'script', 'embed', 'snippet', 'html', 'css', 'widget']],
  ['celkereszt', ['choose', 'pick', 'select', 'define', 'set', 'target', 'decide', 'name']],
  ['plusz', ['create', 'make', 'build', 'generate', 'new', 'draft', 'write']],
  ['villanykorte', ['understand', 'learn', 'know', 'explore', 'meet', 'discover', 'why', 'explain', 'idea', 'ideas', 'brainstorm']],
  ['lejatszas', ['try', 'run', 'apply', 'practice', 'practise', 'play']],
  ['ablak', ['open', 'launch', 'visit', 'head', 'go', 'start', 'navigate']],
  // ⚠️ A BESZÉD-BUBORÉK SZÁNDÉKOSAN UTOLSÓ ELŐTTI. Eredetileg a lista
  // hatodik helyén állt, és onnan ELNYELTE a képet: a lépések 33,8%-a
  // kapta, mert egy AI-útmutató szinte minden lépésében szerepel az
  // „ask" vagy a „type". Volt olyan poszterünk, ahol MIND AZ ÖT sor
  // mellett ugyanaz a buborék állt — az nem dizájn, hanem bélyegző.
  // Így a konkrétabb szabályok (letöltés, beállítás, kép, hang…) előbb
  // szólnak, és a buborék csak akkor jön, ha tényleg nincs jobb.
  ['buborek', ['ask', 'prompt', 'type', 'tell', 'chat', 'describe', 'request', 'say']]
];

// ── KIFEJEZÉSEK, NEM SZAVAK ─────────────────────────────────────────
//
// ⚠️ EZT ÉN RONTOTTAM EL (2026-09-21). A „sign" szót kivettem a
// bejelentkezés-ikonból, mert a „Attach a photo of the sign" (tábla)
// tévesen kulcsot kapott tőle — csakhogy ezzel a „Sign in to GitHub"
// is elvesztette a kulcsot, és szikrát kapott. A szó kétértelmű, a
// KIFEJEZÉS nem: a „sign in" mindig bejelentkezés.
//
// Ezek ELŐBB futnak, mint a szavas szabályok.
const KIFEJEZESEK = [
  ['kulcs', ['sign in', 'signs in', 'sign into', 'log in', 'log into', 'sign up', 'logged in']],
  ['feltolt', ['add a photo', 'add an image', 'add a file', 'add your file']],
  ['borítek', ['share it with', 'send it to']],
  ['kep', ['edit the photo', 'edit the image']]
];

/**
 * Az ÖSSZES illeszkedő ikon, a szabályok sorrendjében.
 * Ebből tud a poszter másodikat választani, ha az első már foglalt.
 */
export function ikonJeloltek(szoveg) {
  const nyers = String(szoveg || '').toLowerCase();
  const szavak = new Set(nyers.match(/[a-z]+/g) || []);
  const ki = [];
  for (const [ikon, kifejezesek] of KIFEJEZESEK) {
    for (const k of kifejezesek) if (nyers.includes(k)) { ki.push(ikon); break; }
  }
  for (const [ikon, kulcsok] of SZABALYOK) {
    for (const k of kulcsok) if (szavak.has(k)) { ki.push(ikon); break; }
  }
  ki.push('szikra');
  return [...new Set(ki)];
}

/** @returns {string} az IKONOK egyik kulcsa */
export function ikonHoz(szoveg) { return ikonJeloltek(szoveg)[0]; }

/**
 * Egy poszter ÖSSZES lépésének ikonja, ISMÉTLŐDÉS NÉLKÜL.
 *
 * Ha egy jel már szerepel a képen, a következő lépés a második legjobb
 * illeszkedését kapja. Enélkül egy ötsoros poszteren öt egyforma ikon
 * állhat (élesben előfordult) — az pont azt a „gépi" hatást kelti,
 * ami ellen az egész infografika készült.
 */
export function ikonokHoz(szovegek) {
  const hasznalt = new Set();
  return (szovegek || []).map(sz => {
    const jeloltek = ikonJeloltek(sz);
    const szabad = jeloltek.find(x => !hasznalt.has(x));
    const valasztott = szabad || jeloltek[0];
    hasznalt.add(valasztott);
    return valasztott;
  });
}

/**
 * Egy ikon SVG-je adott dobozméretre és színre.
 * @param {string} nev az IKONOK kulcsa
 * @param {{x:number,y:number,meret:number,szin:string,vastag?:number}} o
 */
export function ikonSvg(nev, { x, y, meret, szin, vastag = 2 }) {
  const rajz = IKONOK[nev] || IKONOK.szikra;
  const m = meret / 24;
  return `<g transform="translate(${x} ${y}) scale(${m.toFixed(4)})" fill="none" `
    + `stroke="${szin}" stroke-width="${(vastag / m).toFixed(2)}" `
    + `stroke-linecap="round" stroke-linejoin="round">${rajz}</g>`;
}

export default { IKONOK, ikonHoz, ikonokHoz, ikonJeloltek, ikonSvg };
