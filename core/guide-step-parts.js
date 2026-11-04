// ===================================================================
// AZ ÚTMUTATÓ-LÉPÉS RÉSZEKRE BONTÁSA — „prezentáció" nézethez (2026-09-27)
// ===================================================================
//
// MIÉRT: a user „képes, prezentációszerű" útmutatót kért („hasonlítson egy
// prezentációhoz, hogy követhetőbb legyen"). Az útmutató-szöveg MÁR
// tartalmazza a diákhoz kellő részeket — csak egy bekezdés-folyamban:
//   • a teendő, • „ha másképp néz ki…" tartalék, • 💬 minta,
//   • „You'll know it worked when…" siker-ellenőrzés.
// Mérve (09-27): a siker-mondat EN 100%, ES 98%, HU 58% (a fordítás tízféle
// alakban mondja — ezért a bő magyar minta), a „ha másképp" EN 36%.
//
// Ez a modul a lépés MARKDOWN-jából kiemeli a siker- és a tartalék-mondatot,
// hogy a honlap külön dobozba tehesse. Tiszta függvény; a szöveg NEM változik,
// csak a helye. Ha nincs találat, a lépés érintetlen (a régi nézet).
// ===================================================================

export const SIKER_RX = {
  en: /you['’]ll know (?:it|this|that)(?:['’]s| has| is)? (?:worked|working|done|right)|you know it worked when|you['’]ll know you['’]re done/i,
  hu: /akkor (?:tudod|fogod tudni|látod), hogy (?:sikerült|működ|jól|kész)|akkor (?:csináltad|csináltod) jól|akkor (?:lesz sikeres|jártál sikerrel|működik|jó|lesz rendben|sikerült)(?:,)? ha|tudod, hogy sikerült|onnan tudod|abból tudod|tudni fogod, hogy/i,
  es: /sabrás que|lo has conseguido cuando|sabrás si (?:ha )?funcion/i
};

export const MASKEPP_RX = {
  en: /\bif (?:it|yours|your screen|the screen|the (?:app|button|menu|option)|things?) (?:looks?|is) different|\bif you (?:can['’]t|don['’]t|do not|cannot) (?:see|find)/i,
  hu: /\bha (?:nálad )?(?:másképp|máshogy|más(?:képp)?) (?:néz ki|jelenik meg)|\bha nem (?:látod|találod)/i,
  es: /\bsi (?:se ve|lo ves|tu pantalla se ve) (?:distint|diferent)|\bsi no (?:ves|encuentras)/i
};

/** A mondat határai a szövegen belül, a találat indexe körül. */
function mondatHatarok(szoveg, idx) {
  let eleje = 0;
  for (let i = idx - 1; i >= 0; i--) {
    if (/[.!?]/.test(szoveg[i]) && /\s/.test(szoveg[i + 1] || '')) { eleje = i + 1; break; }
    if (szoveg[i] === '\n') { eleje = i + 1; break; }
  }
  let vege = szoveg.length;
  const m = /[.!?](?=\s|$)|\n\n/g;
  m.lastIndex = idx;
  const t = m.exec(szoveg);
  if (t) vege = t[0] === '\n\n' ? t.index : t.index + 1;
  return [eleje, vege];
}

/** Egy mondat kiemelése: { maradek, kiemelt } vagy null. A 💬 példa-sort nem bontjuk. */
function kiemel(md, rx, { utolso = false } = {}) {
  const s = String(md || '');
  const talalatok = [];
  const g = new RegExp(rx.source, rx.flags.includes('g') ? rx.flags : rx.flags + 'g');
  for (const m of s.matchAll(g)) {
    const sorEleje = s.lastIndexOf('\n', m.index) + 1;
    if (/^[ \t>]*💬/.test(s.slice(sorEleje, m.index))) continue;     // a példa-doboz érintetlen
    if (/```/.test(s.slice(0, m.index)) && (s.slice(0, m.index).match(/```/g) || []).length % 2 === 1) continue; // kódblokkban
    talalatok.push(m.index);
  }
  if (!talalatok.length) return null;
  const idx = utolso ? talalatok[talalatok.length - 1] : talalatok[0];
  const [eleje, vege] = mondatHatarok(s, idx);
  const kiemelt = s.slice(eleje, vege).trim().replace(/^[-*]\s+/, '');
  if (kiemelt.length < 12) return null;
  const maradek = (s.slice(0, eleje) + ' ' + s.slice(vege)).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim();
  return { maradek, kiemelt };
}

// A doboz CÍME már kimondja a mondat elejét („✅ You'll know it worked when") —
// a mondatból ezt levágjuk, hogy ne ismételje (09-27, élő kép: „If it looks
// different / If it looks different: …"). Ha a levágás nem biztos, marad az egész.
const SIKER_ELEJE = {
  en: /^(?:\*\*)?you['’]ll know (?:it|this|that)(?:['’]s| has| is)? (?:worked|working|done|right)(?:\s+when|:)\s*/i,
  hu: /^(?:\*\*)?akkor [^.!?]{0,60}?,?\s+ha\s+/i,   // a „…, ha" utáni rész marad (az „Akkor tudod, hogy működik, ha …" is)
  es: /^(?:\*\*)?sabrás que (?:ha )?funcion(?:ó|a)(?:\s+cuando|:)\s*/i
};
const MASKEPP_ELEJE = {
  en: /^(?:\*\*)?if (?:it|yours|your screen|things?) looks? different[:,—–-]?\s*/i,
  hu: /^(?:\*\*)?ha (?:nálad )?(?:másképp|máshogy) néz ki[:,—–-]?\s*/i,
  es: /^(?:\*\*)?si (?:se ve|lo ves) (?:distinto|diferente)[:,—–-]?\s*/i
};
function eleje(mondat, rx) {
  const m = String(mondat).match(rx);
  if (!m) return mondat;
  const maradek = mondat.slice(m[0].length).trim();
  if (maradek.length < 8) return mondat;
  // a nyitó ** párját is rendbe tesszük: ha a levágott rész **-gal kezdődött, a maradék is azzal kezdődjön
  return (m[0].startsWith('**') ? '**' : '') + maradek;
}

/**
 * @param {string} md    a lépés törzse (markdown, a címsor nélkül)
 * @param {string} lang  en | hu | es
 * @returns {{ fo: string, siker: string, maskepp: string }}
 */
export function lepesReszek(md, lang = 'en') {
  let fo = String(md || '');
  let siker = '', maskepp = '';
  const s = kiemel(fo, SIKER_RX[lang] || SIKER_RX.en, { utolso: true });
  if (s) { fo = s.maradek; siker = s.kiemelt; }
  const k = kiemel(fo, MASKEPP_RX[lang] || MASKEPP_RX.en);
  if (k) { fo = k.maradek; maskepp = k.kiemelt; }
  return { fo, siker, maskepp };
}

/** A dobozba kerülő szöveg: a doboz címét ismétlő mondat-eleje nélkül. */
export function dobozSzoveg(mondat, fajta, lang = 'en') {
  const rx = (fajta === 'siker' ? SIKER_ELEJE : MASKEPP_ELEJE)[lang] || (fajta === 'siker' ? SIKER_ELEJE.en : MASKEPP_ELEJE.en);
  return eleje(mondat, rx);
}

export default { lepesReszek, SIKER_RX, MASKEPP_RX };
