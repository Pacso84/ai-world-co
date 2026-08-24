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
  threads: { limit: 500, urlWeight: null, field: 'posted_threads', label: 'Threads' },
  // ── INSTAGRAM (2026-08-14) ──────────────────────────────────────────
  // A caption 2200 karakter, DE a link NEM KATTINTHATÓ benne. Ezt 08-11-én
  // mérve rögzítettük: a 2026-03-i "kattintható link" teszt csak Meta
  // Verified + creator fióknak szólt, havi 10 posztra, és asztali gépen sem
  // működött. Egy nyers URL a caption végén tehát NEM visz sehová — csak
  // helyet foglal és elrontottnak látszik. Ezért `linkMode: 'bio'`.
  // ⚠️ Az Instagram KÉPET is követel; azt a poszter adja (/assets/fb/<slug>.jpg,
  // 4:5 álló — pont az IG feed ideális aránya).
  instagram: { limit: 2200, urlWeight: null, field: 'posted_instagram', label: 'Instagram', linkMode: 'bio' }
};

const SEP = '\n\n';
const ELLIPSIS = '…';

/**
 * Az Instagram-poszt zárósora. A domaint KIÍRJUK, mert az olvasó be tudja
 * gépelni; a valódi, kattintható link a profilban ("link in bio") van.
 */
export const BIO_LINE = 'Full guide → link in bio · aiworldhq.com';

// ---------- KÖVETÉSRE HÍVÁS (2026-08-09) ----------
//
// A PROBLÉMA, MÉRVE: az oldalnak 3 követője van, mégis napi ~26 látogatót
// hoz. 3 követő ezt nem tudja előállítani → a teljes elérésünket a Meta
// ajánlómotorja adja, IDEGENEKNEK. Aki így lát minket, először találkozik
// az oldallal, rákattint a linkre, és elhagyja a Facebookot — a lájk és a
// követés ott maradt volna. Egyetlen sor sem hívta eddig követésre.
//
// ⚠️ ŐSZINTÉN A VÁRHATÓ HATÁSRÓL: ez kicsi. Az ajánlott posztból ritkán lesz
// követés, és a követő-építés azt igényelné (idő/pénz), amit a user kizárt.
// Azért érdemes mégis, mert INGYEN van és nem ront semmit.
//
// KOCKÁZAT-KEZELÉS: a hívás a caption VÉGÉRE kerül, a link UTÁN — így nem
// tolja el a mondanivalót, és nem néz ki lájkvadászatnak (a Meta a
// "lájkolj és oszd meg!" típusú felszólítást bünteti; a szolgáltatás-jellegű
// "több tipp itt" nem ilyen). Kikapcsolás: FOLLOW_CTAS = [].
const FOLLOW_CTAS = [
  'More plain-English AI tips: follow AI World HQ.',
  'We post practical AI guides daily — follow AI World HQ.',
  'Follow AI World HQ for everyday AI help, no jargon.'
];

// Determinisztikus váltogatás a slug alapján: ugyanaz a cikk mindig ugyanazt
// kapja (kiszámítható és tesztelhető), de a hírfolyamban váltakozik a szöveg
// — három egyforma poszt egymás után gépiesnek látszana.
export function followCta(slug) {
  if (!FOLLOW_CTAS.length) return '';
  let h = 0;
  for (const ch of String(slug || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return FOLLOW_CTAS[h % FOLLOW_CTAS.length];
}

// A link kiszedése a szövegtörzsből. Ugyanaz a szabály, mint az
// agents/social/poster.js-ben — a kettő ne szakadjon el egymástól.
export function stripUrl(text, url) {
  if (!text) return '';
  const bare = url ? String(text).split(url).join('') : String(text);
  return bare.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

// Szóhatáron csonkít, és jelzi a vágást. Félbevágott szó olvashatatlan,
// és azt sugallja, hogy elromlott valami — az pedig bizalmat ront.
//
// EXPORTÁLVA 2026-08-24: a core/reel-post.js-be először LEMÁSOLTAM ezt a
// szabályt, és a két példány AZONNAL eltért — a másolat nem vágta le a záró
// írásjelet. 358 valódi útmutató-alcímen mérve 9 olyan volt, ahol vessző
// maradt volna a „…" előtt. Egy példány van belőle, és ez az.
export function trimToWords(text, max) {
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

  // A ZÁRÓ RÉSZ csatornafüggő: ahol a link kattintható, oda a link megy;
  // az Instagramon egy nyers URL semmit nem érne (nem kattintható), ezért
  // ott a "link in bio" sor a záradék. Mindkettő SZENT: sosem eshet ki, mert
  // enélkül a poszt nem visz sehová.
  const tail = cfg.linkMode === 'bio' ? BIO_LINE : String(url);
  // A link súlya a csatorna szabálya szerint (X: fix 23, egyébként valós hossz).
  const tailCost = cfg.urlWeight ?? tail.length;
  const room = cfg.limit - SEP.length - tailCost;
  if (room <= 0) return null;                       // ilyen csatornára nem posztolunk

  const fitted = trimToWords(body, room);
  return {
    body: fitted + SEP + tail,
    weight: fitted.length + SEP.length + tailCost,  // ahogy a CSATORNA számolja
    truncated: fitted.length < body.length,
    field: cfg.field,
    label: cfg.label
  };
}
