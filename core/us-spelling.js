// ===================================================================
// AMERIKAI HELYESÍRÁS — egyetlen közös szótár, AI NÉLKÜL, $0
// ===================================================================
//
// MIÉRT VAN: 2026-08-02-án a közönséget ausztrálról amerikaira igazítottuk
// (user-döntés), és a már kint lévő 523 cikket egyszeri futással átírtuk.
// Az ÍRÓ promptja is amerikaira váltott — de a 2026-08-03-i első termésben
// 12 cikkből 3 még tartalmazott brit alakot (colour, labelled, behaviour).
// Prompttal nem lehet 100%-ot garantálni; a helyesírás viszont GÉPIES,
// tehát nem az AI-ra bízzuk, hanem kijavítjuk.
//
// KÉT SZINT — szándékosan:
//   • toUS()        KISBETŰS alakot javít, automatikusan. Biztonságos.
//   • findBritish() NAGYBETŰS alakot CSAK JELEZ, nem nyúl hozzá.
//     Egy nagybetűs "Centre" lehet valódi szervezetnév ("Centre for AI
//     Safety"), egy "Summarise" lehet terméknév (Cohere Summarise). Nevet
//     átírni ugyanaz a hiba, mint kitalálni egyet — a hitelesség-kapu elve.
//     Mérés (2026-08-03): a napi hibák 3/3 arányban kisbetűsek, tehát ez a
//     korlátozás a gyakorlatban nem veszít semmit.
//
// AMI SZÁNDÉKOSAN NINCS A SZÓTÁRBAN:
//   a) AMERIKAIUL IS ÍGY VAN: analysis, analyses (főnév), analyst,
//      programmer, programmed, programming, realistic, specialist(s),
//      parameter, diameter.
//   b) MINDKÉT ALAK HELYES amerikaiul, tehát nem hiba: towards, dialogue,
//      catalogue, grey/gray állatnevekben (greyhound).
//   Ezért EXPLICIT szóalakokat sorolunk fel, NEM előtag-illesztést:
//   a `realis\w*` a "realistic"-ra is illeszkedne. Ez a csapda kétszer is
//   elkapott minket (a cserélőnél és később az ellenőrző szkriptnél).
//
// AMIHEZ SOSEM NYÚLUNK: kódblokk, soron belüli kód és WEBCÍM (2026-08-30) —
// lásd a PROTECTED_RX-nél. Egy átírt webcím halott link, és a link-vadász
// kapuja ekkor MÁR lefutott.
//
// Használat:
//   import { toUS, findBritish } from '../core/us-spelling.js';
// Bekötve: core/quality-guard.js (önjavítás) + agents/ellenorzo (kapu).
// ===================================================================

// [brit, amerikai] párok.
export const BRITISH_TO_US = [
  ['colour', 'color'], ['colours', 'colors'], ['coloured', 'colored'],
  ['colourful', 'colorful'], ['colouring', 'coloring'],
  ['behaviour', 'behavior'], ['behaviours', 'behaviors'], ['behavioural', 'behavioral'],
  ['favour', 'favor'], ['favours', 'favors'], ['favoured', 'favored'],
  ['favouring', 'favoring'], ['favourite', 'favorite'], ['favourites', 'favorites'],
  ['favouritism', 'favoritism'],
  ['honour', 'honor'], ['honours', 'honors'], ['honoured', 'honored'],
  ['neighbour', 'neighbor'], ['neighbours', 'neighbors'],
  ['organise', 'organize'], ['organised', 'organized'], ['organising', 'organizing'],
  ['organises', 'organizes'], ['organiser', 'organizer'], ['organisers', 'organizers'],
  ['organisation', 'organization'], ['organisations', 'organizations'],
  ['organisational', 'organizational'],
  ['realise', 'realize'], ['realised', 'realized'], ['realising', 'realizing'],
  ['realises', 'realizes'],
  ['recognise', 'recognize'], ['recognised', 'recognized'], ['recognising', 'recognizing'],
  ['recognises', 'recognizes'], ['recognisable', 'recognizable'],
  ['analyse', 'analyze'], ['analysed', 'analyzed'], ['analysing', 'analyzing'],
  ['apologise', 'apologize'], ['apologised', 'apologized'],
  ['prioritise', 'prioritize'], ['prioritised', 'prioritized'], ['prioritising', 'prioritizing'],
  ['customise', 'customize'], ['customised', 'customized'], ['customising', 'customizing'],
  ['customises', 'customizes'],
  ['summarise', 'summarize'], ['summarised', 'summarized'], ['summarising', 'summarizing'],
  ['summarises', 'summarizes'],
  ['personalise', 'personalize'], ['personalised', 'personalized'],
  ['personalising', 'personalizing'], ['personalises', 'personalizes'],
  ['optimise', 'optimize'], ['optimised', 'optimized'], ['optimising', 'optimizing'],
  ['optimises', 'optimizes'],
  ['minimise', 'minimize'], ['minimised', 'minimized'], ['minimising', 'minimizing'],
  ['maximise', 'maximize'], ['maximised', 'maximized'], ['maximising', 'maximizing'],
  ['specialise', 'specialize'], ['specialised', 'specialized'], ['specialising', 'specializing'],
  ['standardise', 'standardize'], ['standardised', 'standardized'],
  ['centre', 'center'], ['centres', 'centers'], ['centred', 'centered'],
  ['metre', 'meter'], ['metres', 'meters'],
  ['kilometre', 'kilometer'], ['kilometres', 'kilometers'],
  ['theatre', 'theater'], ['theatres', 'theaters'],
  ['defence', 'defense'], ['defences', 'defenses'],
  ['licence', 'license'], ['licences', 'licenses'],
  ['practise', 'practice'], ['practised', 'practiced'], ['practising', 'practicing'],
  ['travelled', 'traveled'], ['travelling', 'traveling'],
  ['traveller', 'traveler'], ['travellers', 'travelers'],
  ['cancelled', 'canceled'], ['cancelling', 'canceling'],
  ['modelled', 'modeled'], ['modelling', 'modeling'],
  ['labelled', 'labeled'], ['labelling', 'labeling'],
  ['fuelled', 'fueled'], ['fuelling', 'fueling'],
  ['programme', 'program'], ['programmes', 'programs'],
  ['sceptical', 'skeptical'], ['scepticism', 'skepticism'],
  ['enrol', 'enroll'], ['fulfil', 'fulfill'], ['fulfilment', 'fulfillment'],
  ['jewellery', 'jewelry'], ['pyjamas', 'pajamas'], ['moustache', 'mustache'],
  ['aeroplane', 'airplane'], ['aluminium', 'aluminum'],
  ['whilst', 'while'], ['amongst', 'among']
];

// Hosszabb alak elöl — enélkül a "colours" előbb "colour"-ként cserélődne,
// és "colors" helyett "colorss"-t kapnánk.
const SORTED = [...BRITISH_TO_US].sort((a, b) => b[0].length - a[0].length);

// ÉRINTHETETLEN SZAKASZOK: KÓD és WEBCÍM.
//
// Kód-blokkot és soron belüli kódot azért nem bántunk, mert ott a szó lehet
// parancs, menünév vagy a felhasználó által bemásolandó prompt.
//
// WEBCÍMET SEM (2026-08-30): a `https://www.gov.uk/licence/centre-for-data-ethics`
// átírva `.../license/center-...` lett — HALOTT LINK. A csere ráadásul a
// publikálás előtti truth-gate link-vadásza UTÁN fut (quality-guard, minden
// CI-futásban, minden cikken), és a fixlog „önjavításként" számol be róla.
// A saját belső linkjeink ugyanígy nem próza: a slug RÖGZÍTETT (`_meta.slug`),
// átírva 404 lesz belőle. Éles kár 2026-08-30-án nem volt (mind a 841 cikk
// végigmérve, 0 érintett URL) — ez LATENS hiba volt, az első brit forrás
// sütötte volna el.
//
// ⚠️ EXPLICIT MINTÁK, NEM „URL-SZERŰ" TALÁLGATÁS. Ugyanaz a szabály, mint a
// szótárnál: ami nem sorolható fel tételesen, azt nem védjük — inkább védjünk
// kevesebbet pontosan, mint sokat pontatlanul (egy túl mohó minta a PRÓZÁT
// hagyná javítatlanul, és azt senki nem venné észre).
//
// HELYŐRZŐ HELYETT SZAKASZOLÁS: a kézenfekvő megoldás (a kódot "0", "1"…
// jelre cserélni, majd visszatenni) azon bukik meg, hogy a helyőrző mintája
// előfordulhat a szövegben is, és akkor a visszahelyettesítés egy kódblokkot
// másolna a cikk közepébe. Itt a védett rész SOSEM hagyja el a helyét: a
// szöveget védett/nem-védett darabokra vágjuk, és csak a nem-védetteken
// cserélünk.
//
// A sorrend SZÁMÍT: a JS a legkorábbi pozíción az ELSŐ illeszkedő ágat
// választja, ezért áll a kódkerítés elöl, és a markdown-cél a puszta webcím
// előtt (`](https://…)` esetén az egész célt egyben akarjuk).
const PROTECTED_RX = new RegExp([
  /```[\s\S]*?```/,                          // kódblokk
  /`[^`\n]+`/,                               // soron belüli kód
  /\]\([^\s)]*/,                             // markdown-link/kép CÉLJA: ](/en/... és ](https://...
  /(?:href|src)\s*=\s*"[^"]*"/,              // nyers HTML-attribútum (relatív útvonalra is)
  /https?:\/\/[^\s<>()[\]"'`]+/,             // abszolút webcím: autolink és [1]: hivatkozás-definíció
  /(?<![\w@./])www\.[^\s<>()[\]"'`]+/        // séma nélküli webcím: www.gov.uk/licence/...
].map(r => r.source).join('|'), 'g');

function mapOutsideProtected(md, fn) {
  let out = '', last = 0;
  for (const m of md.matchAll(PROTECTED_RX)) {
    out += fn(md.slice(last, m.index)) + m[0];
    last = m.index + m[0].length;
  }
  return out + fn(md.slice(last));
}

/**
 * Kisbetűs brit alakok javítása amerikaira.
 * @returns {{text:string, fixed:string[]}} fixed = ["colour→color", ...]
 */
export function toUS(markdown) {
  if (!markdown) return { text: markdown, fixed: [] };
  const counts = {};
  const text = mapOutsideProtected(markdown, part => {
    for (const [br, us] of SORTED) {
      const rx = new RegExp(`\\b${br}\\b`, 'g');   // kisbetűs alak: NINCS 'i' zászló
      const n = (part.match(rx) || []).length;
      if (!n) continue;
      counts[`${br}→${us}`] = (counts[`${br}→${us}`] || 0) + n;
      part = part.replace(rx, us);
    }
    return part;
  });
  const fixed = Object.entries(counts).map(([k, n]) => (n > 1 ? `${k} (${n}×)` : k));
  return { text, fixed };
}

/**
 * NAGYBETŰS brit alakok keresése — csak jelzés, javítás NÉLKÜL.
 * Ezek lehetnek tulajdonnevek, ezért ember/AI dönt róluk.
 * @returns {string[]} pl. ["Centre (2×)"]
 */
export function findBritish(markdown) {
  if (!markdown) return [];
  const counts = {};
  mapOutsideProtected(markdown, part => {
    for (const [br] of SORTED) {
      const Br = br[0].toUpperCase() + br.slice(1);
      const n = (part.match(new RegExp(`\\b${Br}\\b`, 'g')) || []).length;
      if (n) counts[Br] = (counts[Br] || 0) + n;
    }
    return part;
  });
  return Object.entries(counts).map(([k, n]) => (n > 1 ? `${k} (${n}×)` : k));
}
