// TERMÉK-ADATLAP — homlokzat: EGY hívással megmondja, mit tudunk egy eszközről.
//
// Ez SZÁNDÉKOSAN csak homlokzat: a meglévő listákat (core/forras-szint.js: forrásszint és súgó-kulcsok,
// core/megszunt-eszkozok.js: megszűnt eszközök) olvassa, NEM másolja őket, így nem lehet velük ellentmondásban.
// A 3. fázis fogja a listákat egyetlen közös adatlap-táblába összeolvasztani; addig ez az egyetlen belépési pont.
//
// adatlap({ tool, company, title, angle }) → {
//   nev        — az eszköz kanonikus neve (null, ha cégfüggetlen vagy ismeretlen)
//   szint      — 'teljes' | 'reszleges' | 'nincs' | 'cegfuggetlen'  (forrásszint)
//   kulcsok    — a hozzá tartozó súgó-kulcsok (core/sugo-index.js); üres, ha nincs cikklista
//   megszunt   — { nev, datum, forras } ha kivezetés alatt álló eszközről szól a téma, különben null
//   horgonyKell — igaz, ha a témához súgó-cikk horgony kell: teljes/részleges szint, van kulcs, nem megszűnt
// }
// Hibás vagy hiányzó bemenetre (null, szöveg…) is választ ad: cégfüggetlen, horgony nélkül.
import { forrasSzint, sugoKulcsok, SZINT } from './forras-szint.js';
import { megszuntTema } from './megszunt-eszkozok.js';

export function adatlap(t) {
  const be = t && typeof t === 'object' ? t : {};
  const { tool, company, title, angle } = be;

  const fs = forrasSzint(tool, company);
  const kulcsok = sugoKulcsok(tool, company);

  const m = megszuntTema({ tool, title, angle });
  const megszunt = m ? { nev: m.nev, datum: m.datum, forras: m.forras } : null;

  const szintOk = fs.szint === SZINT.TELJES || fs.szint === SZINT.RESZLEGES;
  return {
    nev: fs.eszkoz || null,
    szint: fs.szint,
    kulcsok,
    megszunt,
    horgonyKell: szintOk && kulcsok.length > 0 && !megszunt
  };
}

export default { adatlap };
