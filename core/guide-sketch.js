// ===================================================================
// LÉPÉS-VÁZLAT — kóddal rajzolt telefon-vázlat az útmutató lépéséhez (2026-09-29)
// ===================================================================
//
// MIÉRT: a user „képes, prezentációszerű" útmutatót kért („ide kattintson, ezt
// látja"). A lépés mellett eddig egy DÍSZÍTŐ 3D-ikon állt, ami a teendőből
// semmit nem mutat.
//
// ⚠️ MIÉRT NEM AI-KÉP: egy generált „képernyőkép" KITALÁLT FELÜLETET rajzolna
// (olvashatatlan menük, nem létező gombok) — pont az, ami ellen 08-17 óta
// védekezünk. Ez a vázlat CSAK azt mutatja, amit a lépés SZÖVEGE is állít:
//   • a gomb nevét (a szövegben **félkövér**, egy művelet-ige után),
//   • a helyét, HA a mondat megmondja („top-right", „jobb felül", „abajo"),
//   • vagy a beírandó mintát (💬 sor).
// Minden más semleges szürke sáv. Alatta felirat: „Vázlat — a te képernyőd
// kicsit másképp nézhet ki". $0, determinisztikus, minden nyelven magától jó.
//
// Ha a lépésből nem olvasható ki semmi biztos, NINCS vázlat → marad a régi ikon.
// Vészkapcsoló: config.json → website.guide_sketch = false.
// ===================================================================

const IGE = {
  en: /\b(?:tap|click|press|select|choose|hit|open|toggle|pick)\b[^.!?\n]{0,40}$/i,
  hu: /(?:koppints|kattints|nyomd meg|nyomj|válaszd|nyisd meg|érintsd meg|bökj)[^.!?\n]{0,40}$/i,
  es: /\b(?:toca|pulsa|haz clic|presiona|selecciona|elige|abre|activa)\b[^.!?\n]{0,40}$/i
};

// Beírás-igék: a lépés fő szövegében kell lenniük, hogy a 💬 minta „beírandó" legyen.
const IR_IGE = {
  en: /\b(?:type|paste|write|ask|enter|send|say)\b/i,
  hu: /(?:írd|írj|írjon|másold|illeszd be|kérdezd|kérd meg|küldd|mondd)/i,
  es: /\b(?:escribe|pega|pregunta|pide|envía|introduce|di)\b/i
};
// Leíró mondat, nem beírandó szöveg („You notice…", „Notas…", „Észreveszed…").
const NARRATIVA = /^(?:you (?:notice|see|should|will|can)|notas|ves|verás|észreveszed|látod|látni fogod)\b/i;

const HELY = {
  fent: { en: /\b(?:top|upper)\b/i, hu: /\b(?:fent|felül|felső|tetején)\b/i, es: /\b(?:arriba|superior)\b/i },
  lent: { en: /\b(?:bottom|lower)\b/i, hu: /\b(?:lent|alul|alsó|alján)\b/i, es: /\b(?:abajo|inferior)\b/i },
  bal: { en: /\bleft\b/i, hu: /\bbal\b|\bbalra\b|\bbal oldal/i, es: /\bizquierd/i },
  jobb: { en: /\bright\b/i, hu: /\bjobb\b|\bjobbra\b|\bjobb oldal/i, es: /\bderech/i }
};

export const FELIRAT = {
  en: 'Sketch — your screen may look a little different',
  hu: 'Vázlat — a te képernyőd kicsit másképp nézhet ki',
  es: 'Boceto: tu pantalla puede verse un poco distinta'
};
const ALT_KOPP = { en: 'Sketch: tap “{g}”', hu: 'Vázlat: koppints erre: „{g}”', es: 'Boceto: toca «{g}»' };
const ALT_IR = { en: 'Sketch: type your message and send it', hu: 'Vázlat: írd be az üzenetet, és küldd el', es: 'Boceto: escribe tu mensaje y envíalo' };

const tiszta = (s) => String(s || '').replace(/[`*_]/g, '').replace(/\s+/g, ' ').trim();

/** A mondat, amelyikben az index áll. */
function mondata(s, i) {
  const eleje = Math.max(s.lastIndexOf('. ', i), s.lastIndexOf('\n', i)) + 1;
  const m = /[.!?](\s|$)|\n/g; m.lastIndex = i;
  const t = m.exec(s);
  return s.slice(eleje, t ? t.index + 1 : s.length);
}

/**
 * Mit mutasson a vázlat? null = nincs biztos alap → a hívó a régi ikont teszi.
 * @param {string} md    a lépés fő szövege (markdown; a ✅/🔄 mondatok nélkül)
 * @param {string} lang  en | hu | es
 * @returns {{tipus:'koppint', gomb:string, x:string, y:string} | {tipus:'ir', szoveg:string} | null}
 */
export function vazlatAdat(md, lang = 'en') {
  const s = String(md || '');
  const nyelv = IGE[lang] ? lang : 'en';
  // A 💬 példa-sorokat a gomb-keresés nem nézi (ott a félkövér nem gomb).
  const szoveg = s.split('\n').filter(l => !/^\s*>?\s*💬/.test(l)).join('\n');
  for (const m of szoveg.matchAll(/\*\*([^*\n]{2,40})\*\*/g)) {
    const elotte = szoveg.slice(Math.max(0, m.index - 60), m.index);
    if (!IGE[nyelv].test(elotte)) continue;
    const gomb = tiszta(m[1]).replace(/^["“„«]|["”»]$/g, '');
    if (gomb.length < 2 || gomb.length > 28) continue;
    const mond = mondata(szoveg, m.index);
    const y = HELY.fent[nyelv].test(mond) ? 'fent' : HELY.lent[nyelv].test(mond) ? 'lent' : 'kozep';
    const x = HELY.bal[nyelv].test(mond) ? 'bal' : HELY.jobb[nyelv].test(mond) ? 'jobb' : 'kozep';
    return { tipus: 'koppint', gomb, x, y };
  }
  // Beírandó minta: az első 💬 sor idézőjeles/kódos része — DE csak ha a lépés
  // szövege tényleg BEÍRÁSRÓL szól, és a minta mondatnyi (≥4 szó). Mérve 09-29:
  // enélkül „New chat" (gombnév) és „You notice the maple tree…" (leírás) is
  // beírandó szövegként jelent meg.
  const pelda = s.split('\n').find(l => /^\s*>?\s*💬/.test(l));
  if (pelda && IR_IGE[nyelv].test(szoveg)) {
    const q = pelda.match(/[`"“„«]([^`"”»]{8,})[`"”»]/);
    if (q && tiszta(q[1]).split(' ').length >= 4 && !NARRATIVA.test(tiszta(q[1]))) {
      let t = tiszta(q[1]);
      if (t.length > 64) t = t.slice(0, 61).replace(/\s+\S*$/, '') + '…';
      return { tipus: 'ir', szoveg: t };
    }
  }
  return null;
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Szövegtördelés fix szélességre (karakterszámmal — vázlathoz elég). */
function tordel(t, max) {
  const ki = [];
  let sor = '';
  for (const w of String(t).split(' ')) {
    if ((sor + ' ' + w).trim().length > max) { if (sor) ki.push(sor); sor = w; } else sor = (sor + ' ' + w).trim();
  }
  if (sor) ki.push(sor);
  if (ki.length > 3) ki[2] = ki[2].replace(/[.,;:!?]?$/, '') + '…';
  return ki.slice(0, 3);
}

/**
 * A vázlat SVG-je (4:3, a régi ikon helyére). A színek CSS-változók → sötét mód is jó.
 * @param {object} adat  vazlatAdat() eredménye
 * @param {{tool?:string, lang?:string}} [o]
 */
export function vazlatSvg(adat, { tool = '', lang = 'en' } = {}) {
  if (!adat) return '';
  // Telefon: 130×224, középen a 320×240-es vásznon.
  const T = { x: 95, y: 8, w: 130, h: 224 };
  const fej = tool ? `<text x="160" y="${T.y + 23}" class="g-sk__app" text-anchor="middle">${esc(tiszta(tool).slice(0, 18))}</text>` : '';
  const savok = [0, 1, 2].map(i => `<rect x="${T.x + 14}" y="${T.y + 72 + i * 16}" width="${[96, 78, 88][i]}" height="7" rx="3.5" class="g-sk__sav"/>`).join('');
  let tartalom = '';
  if (adat.tipus === 'koppint') {
    const bw = Math.min(104, Math.max(48, adat.gomb.length * 6.2 + 20));
    const bx = adat.x === 'bal' ? T.x + 10 : adat.x === 'jobb' ? T.x + T.w - 10 - bw : 160 - bw / 2;
    const by = adat.y === 'fent' ? T.y + 44 : adat.y === 'lent' ? T.y + T.h - 42 : T.y + 112;
    const cx = bx + bw / 2, cy = by + 13;
    tartalom = `<rect x="${bx}" y="${by}" width="${bw}" height="26" rx="13" class="g-sk__gomb"/>`
      + `<text x="${cx}" y="${by + 17}" class="g-sk__gtxt" text-anchor="middle">${esc(adat.gomb.length > 15 ? adat.gomb.slice(0, 14) + '…' : adat.gomb)}</text>`
      + `<circle cx="${cx}" cy="${cy}" r="21" class="g-sk__gyuru"/>`
      + `<circle cx="${cx + 10}" cy="${cy + 12}" r="7" class="g-sk__ujj"/>`;
  } else {
    const sorok = tordel(adat.szoveg, 20);
    const bh = 18 + sorok.length * 12;
    const by = T.y + T.h - 14 - bh;
    tartalom = `<rect x="${T.x + 8}" y="${by}" width="${T.w - 16}" height="${bh}" rx="10" class="g-sk__mezo"/>`
      + sorok.map((s, i) => `<text x="${T.x + 16}" y="${by + 16 + i * 12}" class="g-sk__irt">${esc(s)}</text>`).join('')
      + `<circle cx="${T.x + T.w - 22}" cy="${by + bh - 12}" r="8" class="g-sk__gomb"/>`
      + `<path d="M${T.x + T.w - 22} ${by + bh - 16} v8 M${T.x + T.w - 25.5} ${by + bh - 12.5} l3.5 -3.5 l3.5 3.5" class="g-sk__nyil"/>`;
  }
  const alt = adat.tipus === 'koppint' ? (ALT_KOPP[lang] || ALT_KOPP.en).replace('{g}', adat.gomb) : (ALT_IR[lang] || ALT_IR.en);
  return `<svg class="g-sk" viewBox="80 2 160 236" role="img" aria-label="${esc(alt)}">`
    + `<rect x="${T.x}" y="${T.y}" width="${T.w}" height="${T.h}" rx="18" class="g-sk__tel"/>`
    + `<rect x="${T.x + 48}" y="${T.y + 7}" width="34" height="5" rx="2.5" class="g-sk__sav"/>`
    + fej + savok + tartalom + `</svg>`;
}

/** A teljes HTML-blokk (vázlat + felirat), vagy '' ha nincs biztos alap. */
export function vazlatHtml(md, lang = 'en', tool = '') {
  const adat = vazlatAdat(md, lang);
  if (!adat) return '';
  return `<figure class="g-step__art g-sketch">${vazlatSvg(adat, { tool, lang })}`
    + `<figcaption class="g-sketch__cap">✏️ ${esc(FELIRAT[lang] || FELIRAT.en)}</figcaption></figure>`;
}

export default { vazlatAdat, vazlatSvg, vazlatHtml, FELIRAT };
