// ===================================================================
// TÉMA-BESOROLÁS — melyik élet-területre tartozik egy útmutató?
// ===================================================================
// EGY HELYEN, mert KÉT dolog használja: a fizetős csomag válogatása
// (`core/ebook-pack.js`) és a téma-hub oldalak (`website/build.js`).
// „Egy szám, ami több helyre van kimásolva, matematikai biztonsággal
// szétcsúszik" — a besorolási szabály is ilyen.
//
// ⚠️ MIÉRT SZÜLETETT (2026-09-10): a szabály eredetileg az ebook-pack.js-ben
// lakott, `\b(email|meal|image|scam)\b` alakú mintákkal. A ZÁRÓ SZÓHATÁR
// miatt a TÖBBES SZÁM nem illeszkedett:
//
//     „polite emails" · „plan meals" · „create images" · „AI Scams, Deepfakes"
//
// mind kimaradt. Mérve: a 424 útmutatóból **255 (60%) volt besorolatlan** —
// egyetlen `s` betű miatt. 🔑 A minta pontosan azt csinálta, amit írtam neki;
// csak nem azt, amit akartam. (És ez a fizetős csomag válogatását is
// szűkítette: jó cikkek közül választott, de kevesebből, mint kellett volna.)
//
// A JAVÍTÁS: a kulcsszavakat SZÓLISTAKÉNT tartjuk, és a regexet EBBŐL
// építjük, egyetlen opcionális `s`-sel a végén. Így egy új szó felvételekor
// nem lehet elfelejteni a többes számot.
//
// ⚠️ CSAK EGY `s`, SOHA NEM SZABAD VÉG. A záró határ elhagyása azt jelentené,
// hogy a „safe" illeszkedik a „safely"-re és a „home" a „homework"-re — a
// projekt szótár-elve (`core/us-spelling.js`) épp ezt tiltja: EXPLICIT
// szóalakok, sosem előtag-illesztés.
//
// ⚠️ A SORREND SZÁMÍT: az ELSŐ illeszkedő terület nyer, ezért a
// SPECIFIKUSABB megy előre. Valódi hiba tanította meg: a „How to Spot a
// Phishing **Email**…" a Work területre esett, mert az „email" hamarabb
// illeszkedett, mint a „phishing".
// ===================================================================

/** Egy szólistából szóhatáros, EGY opcionális többes számot tűrő minta. */
export function temaMinta(szavak) {
  const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('\\b(?:' + szavak.map(esc).join('|') + ')s?\\b', 'i');
}

/**
 * Az élet-területek. A `szavak` lista a SZERZŐDÉS — a mintát belőle
 * építjük, hogy a többes szám ne maradhasson le újra.
 */
export const TEMAK = [
  { id: 'safe', cim: 'Staying safe', rovid: 'Staying safe with AI',
    szavak: ['scam', 'phishing', 'deepfake', 'fraud', 'privacy', 'password', 'security key',
      'safely with your', 'never share', 'chat history', 'training data', 'data saving', 'fake content'] },
  { id: 'money', cim: 'Money & admin', rovid: 'Money and paperwork',
    szavak: ['budget spreadsheet', 'personal budget', 'money', 'savings', 'saving money', 'spending',
      'bill', 'receipt', 'tax', 'insurance', 'subscription', 'price compar'] },   // ⚠️ a 'grocery budget' SZÁNDÉKOSAN nincs itt:
    // az étkezés-tervezés OTTHONI téma, és a money hamarabb fut, mint a home.
  { id: 'home', cim: 'Home & family', rovid: 'Home and family',
    szavak: ['meal', 'dinner', 'grocer', 'recipe', 'fridge', 'trip', 'travel', 'vacation', 'getaway',
      'packing', 'holiday', 'family', 'kid', 'bedtime', 'home', 'household', 'garden', 'pet',
      'shopping list', 'birthday', 'party'] },
  { id: 'create', cim: 'Photos, video & music', rovid: 'Photos, video and music',
    szavak: ['photo', 'image', 'picture', 'video', 'music', 'song', 'logo', 'avatar', 'wallpaper',
      'illustration', 'podcast'] },
  { id: 'learn', cim: 'Learning & getting started', rovid: 'First steps with AI',
    szavak: ['beginner', 'getting started', 'first try', 'first 15', 'explained', 'study', 'learn',
      'language', 'basics', 'simply'] },
  { id: 'work', cim: 'Work & email', rovid: 'Work and email',
    szavak: ['email', 'inbox', 'cv', 'resume', 'cover letter', 'interview', 'meeting', 'note',
      'report', 'spreadsheet', 'presentation', 'document', 'contract', 'small business'] },
  // A két utolsó téma a MARADÉKBÓL született: a besorolatlanok között két
  // valódi csoport látszott — „magyaráztasd el" és „automatizáld". Nem
  // kitalált kategóriák: a tényleges címekből olvastam ki őket.
  { id: 'explain', cim: 'Understand anything', rovid: 'Make sense of things',
    szavak: ['explain', 'compare', 'summarize', 'summarise', 'translate', 'understand', 'unpack',
      'gauge', 'analyze', 'analyse', 'research', 'fact-check', 'jargon'] },
  { id: 'automate', cim: 'Automate the boring bits', rovid: 'Let AI do the repetitive work',
    szavak: ['automate', 'routine', 'schedule', 'workflow', 'script', 'chatbot', 'widget',
      'reminder', 'batch', 'template'] }
];

// ===================================================================
// A TÉMÁK NEVE A TÖBBI NYELVEN (2026-09-12)
// ===================================================================
// ⚠️ MIÉRT ITT, ÉS NEM A build.js-BEN: a `buildTopicPage()` 2026-09-10-én
// BEÉGETETT ANGOLLAL készült, és ezzel 16 élő lap (8 téma × hu + es) angol
// címet, leírást és H1-et kapott — élesben ellenőrizve. Ez SZÓ SZERINT
// ugyanaz a hiba, amit 2026-08-04-én már kijavítottak a /guides és a /tools
// oldalon; a figyelmeztető komment ma is ott áll a buildGuidesPage-ben.
// A fordítás azért kerül IDE, a besorolás MELLÉ, mert egy új téma
// felvételekor a kettőnek együtt kell mozdulnia. Teszt őrzi, hogy minden
// témának minden élő nyelven legyen neve.
export const TEMA_NYELV = {
  safe: {
    hu: { cim: 'Biztonság', rovid: 'Biztonságban az AI-jal' },
    es: { cim: 'Seguridad', rovid: 'Seguridad con la IA' } },
  money: {
    hu: { cim: 'Pénz és ügyintézés', rovid: 'Pénz és papírmunka' },
    es: { cim: 'Dinero y trámites', rovid: 'Dinero y papeleo' } },
  home: {
    hu: { cim: 'Otthon és család', rovid: 'Otthon és család' },
    es: { cim: 'Hogar y familia', rovid: 'Hogar y familia' } },
  create: {
    hu: { cim: 'Fotó, videó és zene', rovid: 'Fotó, videó és zene' },
    es: { cim: 'Fotos, vídeo y música', rovid: 'Fotos, vídeo y música' } },
  learn: {
    hu: { cim: 'Tanulás és első lépések', rovid: 'Első lépések az AI-jal' },
    es: { cim: 'Aprender y empezar', rovid: 'Primeros pasos con la IA' } },
  work: {
    hu: { cim: 'Munka és e-mail', rovid: 'Munka és e-mail' },
    es: { cim: 'Trabajo y correo', rovid: 'Trabajo y correo electrónico' } },
  explain: {
    hu: { cim: 'Érts meg bármit', rovid: 'Legyen érthető' },
    es: { cim: 'Entiende cualquier cosa', rovid: 'Aclara las cosas' } },
  automate: {
    hu: { cim: 'Automatizáld az unalmast', rovid: 'Bízd az AI-ra az ismétlődő munkát' },
    es: { cim: 'Automatiza lo aburrido', rovid: 'Deja que la IA haga lo repetitivo' } }
};

// A hub-oldal leírás-mondata. A darabszám kívülről jön.
export const TEMA_LEIRAS = {
  en: (rovid, n) => `${rovid}: ${n} step-by-step AI guides in plain language.`,
  hu: (rovid, n) => `${rovid}: ${n} lépésről lépésre útmutató, közérthetően.`,
  es: (rovid, n) => `${rovid}: ${n} guías de IA paso a paso en lenguaje claro.`
};

/**
 * A téma neve az adott nyelven. Ismeretlen nyelvnél az ANGOL jön vissza —
 * a hiányzó fordítás jobb, mint az üres cím; a hiányt teszt fogja meg.
 */
export function temaSzoveg(t, lang) {
  const f = TEMA_NYELV[t?.id]?.[lang];
  return { cim: f?.cim || t?.cim || '', rovid: f?.rovid || t?.rovid || '' };
}

/** A leírás-mondat az adott nyelven; ismeretlen nyelvnél angol. */
export function temaLeiras(rovid, n, lang) {
  return (TEMA_LEIRAS[lang] || TEMA_LEIRAS.en)(rovid, n);
}

const MINTAK = TEMAK.map(t => ({ ...t, rx: temaMinta(t.szavak) }));

/**
 * Melyik témára tartozik ez a cím? Az ELSŐ illeszkedő nyer.
 * @returns {string|null} a téma azonosítója, vagy null
 */
export function temaOf(cim) {
  const c = String(cim || '');
  if (!c.trim()) return null;
  return MINTAK.find(t => t.rx.test(c))?.id || null;
}

/** A téma leíró objektuma (cím, rövid név) — vagy null. */
export function tema(id) {
  return TEMAK.find(t => t.id === id) || null;
}

export default { TEMAK, temaOf, tema, temaMinta };
