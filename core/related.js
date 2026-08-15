// ===================================================================
// KAPCSOLÓDÓ CIKKEK — mit ajánljunk a cikk alján?
// ===================================================================
//
// ELŐZMÉNY (2026-08-15, élesben mérve): egy DEEPFAKE-CSALÁSOKRÓL szóló cikk
// alján ez a négy ajánlat állt: hétvégi autós út · szülinapi ajándékötletek ·
// teendőlista · üzenetfordítás. Közben van egy ADATHALÁSZATRÓL szóló cikkünk
// — az egyik legolvasottabb —, és azt NEM ajánlottuk fel.
//
// MIÉRT SZÁMÍT: mérve 1,17 oldal/látogató, vagyis négyből három ember egyetlen
// cikket olvas és távozik. A forgalom 82%-a a Facebookról érkezik EGY cikkre.
// A "mi legyen a következő" az egyetlen dolog, amit kóddal befolyásolni tudunk;
// új közönséghez sem idő, sem pénz nincs (user-döntés).
//
// A RÉGI MÓDSZER a címke-átfedést pontozta. A címkeszótár viszont elfajult:
// 866 különböző címke 711 cikkre, ebből 568 (66%) EGYETLEN cikken szerepel —
// az ilyen címke definíció szerint nem tud összekötni semmit. A másik véglet a
// `getting-started`, ami a cikkek 54%-án ott van, tehát szintén nem különböztet
// meg. A deepfake- és az adathalászat-cikk EGYETLEN címkén sem osztozik
// (`ai-safety,deepfakes` ↔ `security,phishing`), így 0 találat → tartalék →
// a négy LEGFRISSEBB cikk. Pontosan ezt láttuk kint.
//
// AZ ÚJ MÓDSZER a cikkek SZAVAIT veti össze (TF-IDF koszinusz): a ritka szó
// sokat ér, a mindenhol előforduló semmit. Mérve ugyanazon a hibás eseten:
// deepfake → "how to spot AI scams" (0,37) és "spot AI-generated scam
// messages" (0,16).
//
// ⚠️ MIÉRT NEM BEÁGYAZÁS (embedding): jobb lenne, ingyenes is (a téma-
// duplikátumoknál már fut), DE a meglévő gyorsítótár 66 bejegyzésre 611 KB →
// 711 cikkre ~6,5 MB, amit naponta háromszor újraírnánk a repóban. A szó-alapú
// hasonlóság nem kér API-t, kulcsot, gyorsítótárat, és nem tud elhasalni a
// CI-ban. Ha egy nap a minőség kevés lesz, AKKOR érdemes beágyazásra váltani.
// ===================================================================

/** Legalább ennyi linket teszünk ki, legfeljebb ennyit. */
export const REL_MIN = 4, REL_MAX = 6;

/**
 * Ez alatt nem tekintjük VALÓDI rokonnak — inkább jöjjön a tartalék, mint egy
 * félrevezető ajánlás. Az élő adaton mérve: a jó találatok 0,15 fölött vannak,
 * a használható leggyengébb ~0,11, alatta zaj.
 */
export const MIN_SIM = 0.08;

/** Azonos cégről szóló cikkek rokonsága: valódi, de a szöveg-hasonlóságnál gyengébb jel. */
export const COMPANY_BOOST = 0.10;

// Zajszavak. A szokásos angol töltelékeken túl a SAJÁT sablonszavaink is:
// ezek minden cikkünk címében ott vannak ("how to… with AI"), tehát nem
// különböztetnek meg semmit — bent hagyva pont a rossz párokat erősítenék.
export const STOPWORDS = new Set((
  'a an the and or of to in for with your you it is are be was were how what why when where '
  + 'this that on at from by as into out up down get got make made use using used do does done '
  + 'can could will would should i we they he she them his her its not no yes if then than so '
  + 'about after before over under more most just like now one two three first next '
  + 'ai new best top guide guides tips step steps way ways minutes minute quick easy simple '
  + 'without really actually thing things want need help using'
).split(/\s+/));

/** Szavakra bont, zajszavak és rövid szavak nélkül. Kötőjelet is határnak veszi. */
export function tokenize(text) {
  return String(text == null ? '' : text).toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter(w => w.length > 2 && !STOPWORDS.has(w));
}

/**
 * A cikk téma-hordozó szavai: CÍM + ALCÍM + CÍMKÉK.
 * A törzs szándékosan kimarad — abban mindenhol ugyanaz a magyarázó nyelv áll,
 * és a zaj elnyomná a témát.
 */
function words(a) {
  return [
    ...tokenize(a?.title),
    ...tokenize(a?.subtitle),
    ...(Array.isArray(a?.tags) ? a.tags : []).flatMap(tokenize)
  ];
}

/**
 * Kapcsolódó cikkek minden cikkhez.
 *
 * @param {Array} articles  a build cikk-objektumai (file, title, subtitle, tags, company, category, publishedAt)
 * @param {object} [opts]
 * @param {number} [opts.min=REL_MIN]  ennyi linkig tartalékkal töltünk
 * @param {number} [opts.max=REL_MAX]
 * @returns {Map<any, Array>}  cikk.file → ajánlott cikkek
 */
export function rankRelated(articles, opts = {}) {
  const A = Array.isArray(articles) ? articles.filter(Boolean) : [];
  const min = Number(opts.min) || REL_MIN;
  const max = Number(opts.max) || REL_MAX;
  const out = new Map();
  if (!A.length) return out;

  // IDF: hány cikkben fordul elő a szó?
  const df = new Map();
  const szavak = new Map();
  for (const a of A) {
    const w = words(a);
    szavak.set(a, w);
    for (const t of new Set(w)) df.set(t, (df.get(t) || 0) + 1);
  }
  const N = A.length;

  // Súlyozott vektor + hossz, cikkenként egyszer (nem minden párnál újra).
  const vec = new Map();
  for (const a of A) {
    const tf = new Map();
    for (const w of szavak.get(a)) tf.set(w, (tf.get(w) || 0) + 1);
    const v = new Map();
    let norm = 0;
    for (const [w, n] of tf) {
      const x = (1 + Math.log(n)) * Math.log(N / (1 + (df.get(w) || 0)));
      if (x > 0) { v.set(w, x); norm += x * x; }
    }
    vec.set(a, { v, norm: Math.sqrt(norm) || 1 });
  }

  const cos = (a, b) => {
    const x = vec.get(a), y = vec.get(b);
    // a kisebb vektoron iterálunk — 711 cikknél ez érezhető
    const [kis, nagy] = x.v.size < y.v.size ? [x, y] : [y, x];
    let s = 0;
    for (const [w, wx] of kis.v) { const wy = nagy.v.get(w); if (wy) s += wx * wy; }
    return s / (x.norm * y.norm);
  };

  // Tartalék-sorrend: friss elöl (lásd lentebb, miért kell egyáltalán).
  const frissElol = [...A].sort((a, b) =>
    String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')));

  for (const a of A) {
    const pont = [];
    for (const b of A) {
      if (b === a) continue;
      let s = cos(a, b);
      if (a.company && b.company === a.company) s += COMPANY_BOOST;
      if (s >= MIN_SIM) pont.push([s, b]);
    }
    // Determinisztikus sorrend: azonos pontszámnál a frissebb nyer, majd a
    // fájlnév dönt — különben két build más sorrendet adna ugyanarra.
    pont.sort((x, y) => y[0] - x[0]
      || String(y[1].publishedAt || '').localeCompare(String(x[1].publishedAt || ''))
      || String(x[1].file || '').localeCompare(String(y[1].file || '')));

    const picked = pont.slice(0, max).map(p => p[1]);

    // TARTALÉK (2026-07-25 óta): egyetlen oldal se maradjon belső link NÉLKÜL.
    // Az árva oldal rosszabbul feltérképezhető és indexelhető — fiatal domainnél
    // ez valódi kár. Inkább egy lazán kapcsolódó link, mint semmi.
    if (picked.length < min) {
      const van = new Set(picked); van.add(a);
      for (const b of [
        ...frissElol.filter(b => b.category === a.category),
        ...frissElol.filter(b => b.isGuide),
        ...frissElol
      ]) {
        if (picked.length >= min) break;
        if (van.has(b)) continue;
        picked.push(b); van.add(b);
      }
    }
    out.set(a.file, picked);
  }
  return out;
}

export default { rankRelated, tokenize, STOPWORDS, MIN_SIM, REL_MIN, REL_MAX, COMPANY_BOOST };
