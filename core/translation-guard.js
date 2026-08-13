// ===================================================================
// FORDÍTÁS-VÉDELEM — a CÍM oldalán (2026-08-04)
//
// MIÉRT: a fordítónak 2026-07-25 óta van nem-fordítás védelme, de az CSAK a
// TÖRZSET nézi. A cím külön úton jön (TITLE: sor a válaszban), és ha az
// hiányzik vagy angolul jön, a kód NÉMÁN az angolt menti:
//     const title = (tm ? tm[1] : enTitle).trim()   // ← angol fallback
//
// Élesben mérve (611 fordítás): 3 spanyol cím maradt angolul. Magyarban 0.
// Kevés — de a KAPCSOLÓDÓ-CIKK dobozon keresztül EGYETLEN ilyen cím 47
// spanyol oldalon jelenik meg, mert minden ajánló a cikk címét mutatja.
// A napi riport ezt nem látta: a "fordítás-hiány" számláló a fájl MEGLÉTÉT
// méri, nem a tartalmát — a fordítás ott volt, csak a címe angol.
//
// A MÉRCE: szó-átfedés a két cím között. Terméknevek (DeepSeek, Copilot)
// mindkettőben szerepelnek, ezért a küszöb magas. Éles kalibráció:
//   valódi angolul-maradt címek:  100% átfedés
//   valódi spanyol cím termékekkel: 71% és 75%
// → 0.85 tisztán elválasztja a kettőt.
// ===================================================================

const words = s => String(s || '').toLowerCase().match(/\p{L}{3,}/gu) || [];

export const UNTRANSLATED_TITLE_THRESHOLD = 0.85;

/**
 * Angolul maradt-e a lefordított cím?
 * @param {string} enTitle  az eredeti angol cím
 * @param {string} trTitle  a fordító által adott cím
 * @returns {boolean} true, ha a cím lényegében az angol (NE mentsük el)
 */
export function titleLooksUntranslated(enTitle, trTitle) {
  const T = words(trTitle);
  const E = new Set(words(enTitle));
  // Rövid címnél (1-2 érdemi szó) nem ítélünk: ott a terméknév-egyezés
  // önmagában 100%-ot adna. Pl. "Gemini 3 Pro" jogosan azonos.
  if (T.length < 4 || !E.size) return false;
  const overlap = T.filter(w => E.has(w)).length / T.length;
  return overlap >= UNTRANSLATED_TITLE_THRESHOLD;
}

// ===================================================================
// FORDÍTÁS-VÉDELEM — a TÖRZS oldalán (2026-08-10)
//
// A szűrő maga 2026-07-25 óta él a fordítóban: ha a lefordított törzsben túl
// sűrűn állnak angol funkciószavak, a modell nem fordított, és NEM mentünk.
// Itt csak KÖLTÖZIK (tesztelhető helyre) és PONTOSABB lesz.
//
// MIÉRT: a 2026-08-09-i heti összefoglaló magyar fordítása hatszor bukott el
// némán, és a cikk magyarul angolul ment ki. A szűrő a saját URL-jeinket is
// szövegnek vette — a slugjaink pedig angol szavakból állnak:
//     /article/how-people-are-really-using-chatgpt-and-what-that-means
// Élesben mérve a spanyol digesten: 54 angol találat, MIND az URL-ekből;
// a tényleges spanyol prózában NULLA. A spanyol 0.0584-gyel épp elcsúszott
// a küszöb alatt, a magyar (tömörebb, ugyanannyi URL) fölé ment.
//
// Az URL nem próza: egyetlen fordítás sem fordítja le. Ha kivesszük, a mérce
// azt méri, amit mérni akar — és MINDKÉT irányban élesebb lesz, mert a
// nevezőből is kikerül a nem-fordítható zaj.
// ===================================================================

// A küszöb a 2026-07-25-ös éles kalibrációból: jó fordítás ≤0.016,
// angolul-maradt ~0.16. Nem nyúlunk hozzá — csak azt tisztítjuk, amit mér.
export const UNTRANSLATED_BODY_THRESHOLD = 0.06;

// 40 szó alatt a hányados zajos: néhány terméknév is átbillentheti.
// A fordító amúgy is eldobja a 80 karakternél rövidebb törzset.
const MIN_WORDS = 40;

const EN_FUNCTION_WORDS = /\b(the|and|with|your|you|for|this|that|what|when|from|will|can|how|are)\b/gi;

/**
 * Kiveszi a szövegből azt, amit egyetlen fordítás sem fordít le: URL-eket,
 * képútvonalakat, kódot. A link SZÖVEGE bent marad — az fordítandó tartalom,
 * és ha kivennénk, egy angolul hagyott linkgyűjtemény átcsúszna a szűrőn.
 */
export function stripNonProse(md) {
  return String(md || '')
    .replace(/```[\s\S]*?```/g, ' ')                          // kódblokk
    .replace(/`[^`\n]*`/g, ' ')                               // soron belüli kód
    .replace(/\]\([^)]*\)/g, '] ')                            // [szöveg](CÉL) → a cél megy
    .replace(/^\s*\[[^\]]*\]:\s*\S+$/gm, ' ')                 // referencia-link definíció
    .replace(/https?:\/\/\S+/g, ' ')                          // csupasz URL
    .replace(/\/\S*\.(?:jpg|jpeg|png|webp|svg|gif)\b/gi, ' ') // képútvonal
    .replace(/<[^>]+>/g, ' ');                                // beágyazott HTML
}

/**
 * Angolul maradt-e a lefordított TÖRZS?
 * @param {string} body  a fordító által adott törzsszöveg (frontmatter nélkül)
 * @returns {boolean} true, ha a modell nem fordított (NE mentsük el)
 */
export function bodyLooksUntranslated(body) {
  const proza = stripNonProse(body);
  const szavak = proza.split(/\s+/).filter(Boolean);
  if (szavak.length < MIN_WORDS) return false;
  const talalat = (proza.match(EN_FUNCTION_WORDS) || []).length;
  return talalat / szavak.length > UNTRANSLATED_BODY_THRESHOLD;
}

// ===================================================================
// AZONNALI ÚJRAPRÓBA (2026-08-13)
// ===================================================================
//
// 2026-08-13 hajnalban két friss cikk magyar fordítása elbukott, és a magyar
// oldalra ANGOL szöveg került. Ugyanabból a forrásból a SPANYOL hibátlanul
// lefordult — a forrás tehát ép volt. Kézzel újrafuttatva MINDKETTŐ elsőre
// sikerült ($0,0219). A bukás átmeneti volt; a rendszer mégis 8 órán át
// (a következő ütemezett futásig) angol szöveget tartott kint.
//
// A MECHANIZMUS a saját naplónkból: ugyanabban a futásban, ugyanazzal a
// modellel az egyik cikk 3 629, a másik 14 039 kimeneti tokent használt —
// pedig a magyar szöveg ~3 000-et igényel. A többi GONDOLKODÁS, a 16 000-es
// kereten belül. Ha az kicsit többet visz, a fordítás csonkul. Ez a memóriában
// rögzített jelenség: a reasoning-off zászló NEM megbízható (ugyanazon a
// prompton 0 vs 1323 token). Ezért az újrapróba EMELT kerettel megy.
//
// MIÉRT NEM MINDEN BUKÁST PRÓBÁLUNK ÚJRA: ha a FORRÁSNAK nincs frontmatter-e,
// az újrapróba pontosan ugyanúgy elbukik — az csak pénz. A többi ok a modell
// pillanatnyi viselkedése, azon az újrapróba segít.
// ===================================================================

/** A fordítás elbukásának okai. A napló ÉS az újrapróba-döntés ezt használja. */
export const FAIL = {
  NO_FRONTMATTER: 'a forrásnak nincs frontmatter-e',
  NO_RESPONSE: 'a modell nem adott szöveget',
  TOO_SHORT: 'gyanúsan rövid törzs',
  TRUNCATED: 'csonkult fordítás (kifutott a keretből)',
  ENGLISH_BODY: 'a törzs angolul maradt',
  ENGLISH_TITLE: 'a cím angolul maradt'
};

/** Érdemes-e AZONNAL, ugyanabban a futásban újrapróbálni? */
export function shouldRetryTranslation(reason) {
  return !!reason && reason !== FAIL.NO_FRONTMATTER;
}

/** Az újrapróba kerete: 1,5× ráhagyás, kemény plafonnal. */
export const RETRY_TOKEN_CAP = 24000;
export function retryTokenFrame(base) {
  const n = Number(base);
  if (!Number.isFinite(n) || n <= 0) return RETRY_TOKEN_CAP;
  return Math.min(Math.round(n * 1.5), RETRY_TOKEN_CAP);
}

export default {
  titleLooksUntranslated, UNTRANSLATED_TITLE_THRESHOLD,
  bodyLooksUntranslated, stripNonProse, UNTRANSLATED_BODY_THRESHOLD,
  FAIL, shouldRetryTranslation, retryTokenFrame, RETRY_TOKEN_CAP
};
