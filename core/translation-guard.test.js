// ===================================================================
// CÍM-FORDÍTÁS VÉDELEM TESZT — futtatás: node core/translation-guard.test.js
//
// A teszt-esetek NEM kitaláltak: mind a 611 élő fordítás átméréséből valók
// (2026-08-04). A három "angolul maradt" eset az, amit a napi ellenőrzés
// talált; a két "csak úgy néz ki" eset az, amit a mérés HAMISAN jelzett,
// amíg a küszöb 0.7 volt. A teszt tehát egyszerre méri, mit KELL megfogni
// és mit NEM SZABAD.
// ===================================================================
import { strict as assert } from 'assert';
import {
  titleLooksUntranslated,
  bodyLooksUntranslated,
  stripNonProse,
  UNTRANSLATED_BODY_THRESHOLD
} from './translation-guard.js';

// ── 1) ANGOLUL MARADT — ezeket MEG KELL fognia (élő esetek) ──────────
const UNTRANSLATED = [
  ['What Is a Voice Agent Builder, and Could It Help Your Small Business?',
   'What Is a Voice Agent Builder, and Could It Help Your Small Business?'],
  ['Interactive AI Avatars: What They Are and How You Might Use Them',
   'Interactive AI Avatars: What They Are and How You Might Use Them'],
  // Ez a legalattomosabb: NEM betű szerint azonos (más kisbetűzés, hiányzó
  // "A"), csak ANGOL. Az egyszerű string-egyezés ezt átengedte volna.
  ['Plan a Family Weekend Getaway with DeepSeek: A Step-by-Step Guide',
   'Plan a family weekend getaway with DeepSeek: step-by-step guide']
];
for (const [en, tr] of UNTRANSLATED) {
  assert.equal(titleLooksUntranslated(en, tr), true,
    'angolul maradt címet meg kell fognia: ' + tr.slice(0, 50));
}

// ── 2) VALÓDI FORDÍTÁS — ezeket NEM szabad megfognia ─────────────────
// A két első a mérés HAMIS RIASZTÁSA volt 0.7-es küszöbnél (71% és 75%):
// spanyol mondat, sok terméknévvel.
const TRANSLATED = [
  ['Get started with Microsoft Copilot in Word, Excel and Outlook',
   'Empieza a usar Microsoft Copilot en Word, Excel y Outlook'],
  ['Introduction to Alibaba\'s Qwen chatbot',
   'Introducción al chatbot Qwen de Alibaba'],
  ['How to spot AI-generated scam messages before you click or reply',
   'Cómo detectar mensajes de estafa generados con IA antes de hacer clic o responder'],
  ['Write a polite complaint email to a company with DeepSeek',
   'Escribe un correo de reclamación educado a una empresa con DeepSeek'],
  ['Plan a Family Weekend Getaway with DeepSeek: A Step-by-Step Guide',
   'Planifica una escapada familiar de fin de semana con DeepSeek: guía paso a paso'],
  ['How to practise a job interview out loud with ChatGPT voice mode',
   'Cómo practicar una entrevista de trabajo en voz alta con el modo de voz de ChatGPT']
];
for (const [en, tr] of TRANSLATED) {
  assert.equal(titleLooksUntranslated(en, tr), false,
    'valódi fordítást NEM szabad megfognia: ' + tr.slice(0, 50));
}

// ── 3) RÖVID CÍM — nem ítélünk (a terméknév jogosan azonos) ──────────
{
  assert.equal(titleLooksUntranslated('Gemini 3 Pro', 'Gemini 3 Pro'), false,
    'rövid, terméknév-címnél nem ítélünk');
  assert.equal(titleLooksUntranslated('', 'bármi'), false, 'üres angol címnél nem ítélünk');
  assert.equal(titleLooksUntranslated('valami', ''), false, 'üres fordításnál nem ítélünk');
}

// ── 4) MAGYAR is átmegy (a mérés szerint hu-ban 0 hiba volt) ─────────
{
  assert.equal(titleLooksUntranslated(
    'Turn on two-factor authentication on your phone',
    'Kapcsold be a kétlépcsős azonosítást a telefonodon'), false);
}

// ===================================================================
// TÖRZS-OLDAL — 2026-08-10
// ===================================================================
// A 2026-08-09-i heti összefoglaló magyar fordítása HATSZOR bukott el
// némán (memory/translation-failures.json: "…This_Week_in_AI.json|hu": 6),
// és a cikk magyarul ANGOLUL ment ki. A spanyol átment.
//
// OK: a nem-fordítás védelem (2026-07-25) a saját URL-jeinket is beleszámolta
// a szövegbe. A slugjaink angol szavakból állnak:
//     /article/how-people-are-really-using-chatgpt-and-what-that-means
// Élesben mérve a spanyol digesten: 54 angol találat — MIND az URL-ekből,
// a tényleges spanyol prózában NULLA. A spanyol 0.0584-gyel épp elcsúszott
// a 0.06 alatt; a magyar tömörebb (kevesebb szó, ugyanannyi URL), így a
// hányados fölé ment, és a JÓ fordítást dobta el.
//
// A heti összefoglaló a legsérülékenyebb: 10 belső link van benne.
// ===================================================================

// A valódi digest szerkezete: minden hírhez egy kép és egy "teljes cikk" link,
// a linkek célja pedig mindig ANGOL slug — bármelyik nyelven olvassuk.
const DIGEST_LINKEK = `
![Your Teen and AI Chatbots](/assets/images/ai-and-your-teen-what-families-should-know.jpg)
[Olvasd el a teljes cikket](https://aiworldhq.com/article/ai-and-your-teen-what-families-should-know)
![What People Actually Use ChatGPT For](/assets/images/how-people-are-really-using-chatgpt.jpg)
[Olvasd el a teljes cikket](https://aiworldhq.com/article/how-people-are-really-using-chatgpt-and-what-that-means)
![AI Video Tools Are Getting Real](/assets/images/ai-video-generators-like-seedance.jpg)
[Olvasd el a teljes cikket](https://aiworldhq.com/article/ai-video-generators-like-seedance-in-pictures)
`;

// ── 5) A JÓ MAGYAR FORDÍTÁST NEM SZABAD ELDOBNI ──────────────────────
{
  const magyarProza = `
Ezen a héten öt olyan hír történt, ami tényleg számít neked. Nem a szokásos
szakzsargon, hanem az, ami a mindennapjaidra hatással lehet. Végigvesszük,
hogy melyik eszköz mit tud most, és melyiket érdemes kipróbálnod, ha eddig
csak nézelődtél. Az első téma a tinédzserek és a csevegőrobotok kapcsolata,
mert egyre több szülő kérdezi, hogy ez mennyire biztonságos. Utána megnézzük,
mire használják az emberek valójában a mesterséges intelligenciát, és ez
meglepő lehet. A harmadik hír a videókészítő eszközökről szól, amelyek most
értek el oda, hogy hétköznapi felhasználóként is van értelme elindítani őket.
A negyedik téma a munkahelyeket érinti, az ötödik pedig azt, hogyan védheted
meg a saját adataidat. Minden szakaszban megtalálod a teljes cikkre mutató
linket, ha valamelyik téma közelebbről is érdekel téged.
`;
  assert.equal(bodyLooksUntranslated(magyarProza + DIGEST_LINKEK), false,
    'a tiszta magyar próza nem bukhat el a saját URL-jeinktől');
}

// ── 6) A VÉDELEM TOVÁBBRA IS FOG ─────────────────────────────────────
// Enélkül a javítás kinyitná a kaput, amit 2026-07-25-ben pont azért
// zártunk be, mert 10 cikk angolul csúszott a fordítás-helyre.
{
  const angolulMaradt = `
Every week we look at the five stories that matter for you and your family.
This is what you can expect from the tools that are changing how you work.
The first story is about teenagers and chatbots, and what parents should know
when their children are using them. Then we look at what people are really
doing with these assistants, and how that differs from what you would think.
The third story is about video tools that are finally good enough for you to
try at home, and the fourth is about how this will change the work that you do.
` + DIGEST_LINKEK;
  assert.equal(bodyLooksUntranslated(angolulMaradt), true,
    'a valóban angolul maradt törzs továbbra is elbukik');
}

// ── 7) Az URL-kivágás a link SZÖVEGÉT megtartja ──────────────────────
// A link szövege fordítandó tartalom. Ha azt is kivágnánk, egy angolul
// hagyott linkgyűjtemény észrevétlenül átcsúszna a szűrőn.
{
  const t = stripNonProse('Nézd meg [ezt a friss cikket](https://aiworldhq.com/article/how-to-use-ai) ma.');
  assert.ok(t.includes('ezt a friss cikket'), 'a link szövege bent marad');
  assert.ok(!t.includes('how-to-use-ai'), 'a link CÉLJA kikerül');
  assert.ok(!t.includes('https'), 'a csupasz URL is kikerül');
}

// ── 8) Képútvonal és kódblokk sem próza ──────────────────────────────
{
  const t = stripNonProse('Kép: ![alt](/assets/images/what-you-can-do-with-ai.jpg)\n\n```\nconst the = "and";\n```\n');
  assert.ok(!t.includes('/assets/'), 'a képútvonal kikerül');
  assert.ok(!t.includes('const the'), 'a kódblokk kikerül');
}

// ── 9) Rövid szövegre nem ítélünk ────────────────────────────────────
{
  assert.equal(bodyLooksUntranslated('The AI tool that you can use.'), false,
    'rövid szövegnél nincs ítélet');
  assert.equal(bodyLooksUntranslated(''), false, 'üres szöveg nem ítélhető');
  assert.equal(bodyLooksUntranslated(null), false, 'hiányzó szöveg nem ítélhető');
}

// ── 10) A küszöb marad, ahol a 2026-07-25-ös kalibráció hagyta ───────
assert.equal(UNTRANSLATED_BODY_THRESHOLD, 0.06);

console.log('✅ translation-guard.test: minden átment');
