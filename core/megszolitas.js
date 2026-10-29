// 🗣️ MEGSZÓLÍTÁS-VADÁSZ (2026-07-14, website/check-i18n.js) — kiemelve és pontosítva 2026-10-29.
// A márka-norma: hu = tegezés, es = tú. A régi őr puszta szövegrészletet keresett, és 17 nap alatt
// 53-szor jelzett — szinte mindig UGYANAZT az Alexa-útmutatót, ahol NEM volt magázás:
//   „Kérj meg egy családtagot, hogy nyissa meg az Alexa appot” → 3. személy (a családtag teszi)
//   „…hogy megnyisson egy táblázatot” → a „nyisson” egy hosszabb szó belseje
// Ezért: csak EGÉSZ szó számít, és nem számít, ha közvetlenül előtte „hogy” / „que” áll (felszólítás
// harmadik személyre: „kérd meg, hogy…”, „pídele que…”). Küszöb változatlanul 2 jel.

export const FORMALITY = {
  // 'hozzon létre'/'adja meg' SZÁNDÉKOSAN nincs itt: 3. személyben az AI-ra is vonatkozhat.
  hu: ['kattintson', 'nyissa meg', 'jelentkezzen be', 'írja be', 'válassza ki', 'nyisson'],
  es: ['haga clic', 'inicie sesión', 'seleccione', 'escriba su', 'abra su', 'pulse'],
};
const KOTOSZO = { hu: /\bhogy\s+$/i, es: /\bque\s+$/i };
const BETU = /[\p{L}\p{N}]/u;

/** A szövegben talált magázó jelek (egyedi alakonként egyszer), a 3. személyű „hogy …” alakok nélkül. */
export function megszolitasJelek(text, lang) {
  const marks = FORMALITY[lang] || [];
  const kis = String(text || '').toLowerCase();
  const talalt = [];
  for (const w of marks) {
    let i = -1;
    while ((i = kis.indexOf(w, i + 1)) >= 0) {
      const elotte = kis[i - 1] || ' ', utana = kis[i + w.length] || ' ';
      if (BETU.test(elotte) || BETU.test(utana)) continue;                    // szórészlet (megnyisson)
      if (KOTOSZO[lang] && KOTOSZO[lang].test(kis.slice(Math.max(0, i - 12), i))) continue;   // „hogy nyissa meg”
      talalt.push(w); break;
    }
  }
  return talalt;
}
