// ===================================================================
// POSZT-SZÖVEG CSATORNÁNKÉNT — karakterkorlát, link, csonkítás
// ===================================================================
//
// A social agent EGY szöveget ír cikkenként (content/social/<slug>.json →
// `facebook` mező, max ~280 karakter), és a linket BELEÍRJA a szövegbe.
// A Facebookon ez jó, mert ott fénykép-posztot küldünk külön caption-nel.
// A Threadsen és az X-en viszont kemény karakterkorlát van, ezért:
//   1) kiszedjük a linket a törzsből (különben kétszer szerepelne),
//   2) a törzset a korláthoz igazítjuk,
//   3) a linket KÜLÖN SORBAN a végére tesszük — ez SOHA nem eshet ki.
//
// MIÉRT SZENT A LINK: a poszt egyetlen célja, hogy olvasót hozzon. Link
// nélküli poszt elfogyasztja a Make-műveletet és nem ad semmit cserébe.
// ===================================================================

export const CHANNELS = {
  // Az X minden linket t.co-ra rövidít, és FIXEN 23 karakternek számol —
  // hiába 78 karakteres a mi URL-ünk. Ha a valódi hosszal számolnánk,
  // fölöslegesen vágnánk le 55 karakternyi mondanivalót.
  x: { limit: 280, urlWeight: 23, field: 'posted_x', label: 'X' },
  // A Threads a link teljes hosszát beleszámolja az 500-ba.
  threads: { limit: 500, urlWeight: null, field: 'posted_threads', label: 'Threads' }
};

const SEP = '\n\n';
const ELLIPSIS = '…';

// A link kiszedése a szövegtörzsből. Ugyanaz a szabály, mint az
// agents/social/poster.js-ben — a kettő ne szakadjon el egymástól.
export function stripUrl(text, url) {
  if (!text) return '';
  const bare = url ? String(text).split(url).join('') : String(text);
  return bare.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

// Szóhatáron csonkít, és jelzi a vágást. Félbevágott szó olvashatatlan,
// és azt sugallja, hogy elromlott valami — az pedig bizalmat ront.
function trimToWords(text, max) {
  if (text.length <= max) return text;
  const room = max - ELLIPSIS.length;
  if (room <= 0) return ELLIPSIS.slice(0, Math.max(0, max));
  const cut = text.slice(0, room);
  const lastSpace = cut.lastIndexOf(' ');
  // Ha az első "szó" is hosszabb a keretnél (pl. egy hosszú azonosító),
  // nincs szóhatár — ilyenkor kényszerből karakteren vágunk.
  const body = lastSpace > room * 0.5 ? cut.slice(0, lastSpace) : cut;
  return body.replace(/[\s,;:.!-]+$/, '') + ELLIPSIS;
}

// Egy csatornára kész poszt. null = ne küldjünk semmit.
export function composePost({ text, url, channel }) {
  const cfg = CHANNELS[channel];
  if (!cfg || !url) return null;

  const body = stripUrl(text, url);
  if (!body) return null;

  // A link súlya a csatorna szabálya szerint (X: fix 23, Threads: valós hossz).
  const urlCost = cfg.urlWeight ?? String(url).length;
  const room = cfg.limit - SEP.length - urlCost;
  if (room <= 0) return null;                       // ilyen csatornára nem posztolunk

  const fitted = trimToWords(body, room);
  return {
    body: fitted + SEP + url,
    weight: fitted.length + SEP.length + urlCost,   // ahogy a CSATORNA számolja
    truncated: fitted.length < body.length,
    field: cfg.field,
    label: cfg.label
  };
}
