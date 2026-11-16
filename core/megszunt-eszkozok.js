// ===================================================================
// 🪦 MEGSZŰNT ESZKÖZÖK — ezekről NEM írunk új útmutatót
// ===================================================================
// MIÉRT (2026-11-04): az NVIDIA a ChatRTX-et 2026-01-21-én megszüntette
// („As of 1/21/2026, this project has been deprecated. ChatRTX is not maintained
// anymore.” — github.com/NVIDIA/ChatRTX, a tároló archiválva), mi mégis 10-30-án
// és 10-31-én is írtunk hozzá új útmutatót: a témalista (guides/guide-topics.json)
// 20+ ChatRTX-témát tartalmazott, a cég-kiegyenlítés pedig újakat kért hozzá.
// A „Getting started” útmutatóban kitalált parancssori lépések is voltak
// (install.bat, „chatrtx pull/run --port”) — hivatalos forrásban egyik sincs.
//
// HASZNÁLAT: agents/guide/agent.js — a témaválasztó (pickTopics) kihagyja,
// az ötletelő/kiegyenlítő nem veszi fel. Új megszűnt eszköz: ide egy sor
// HIVATALOS forrással + a tesztben egy eset.
// ===================================================================

export const MEGSZUNT_ESZKOZOK = [
  {
    nev: 'ChatRTX',
    minta: /\bchat\s*-?\s*rtx\b/i,
    datum: '2026-01-21',
    forras: 'https://github.com/NVIDIA/ChatRTX'
  },
  {
    // 2026-11-08 (user: „igen ved le”): „Custom GPTs are scheduled to retire on Dec 11, 2026.” — az OpenAI pluginokra
    // költözteti őket. Kivezetés ALATT álló eszközről sem írunk új útmutatót: egy hónap múlva halott lenne. Az élő
    // útmutató (how-to-set-up-a-custom-gpt-in-chatgpt-for-tasks-you-repeat-weekly) 301-gyel levéve.
    // A minta CSAK az egyedi GPT-re szól: a GPT-5, „ChatGPT”, „GPT-4o” stb. nem illeszkedik.
    nev: 'Custom GPTs (ChatGPT)',
    minta: /\bcustom\s+GPTs?\b|\bGPT\s+(?:Store|builder)\b|\b(?:Explore|My)\s+GPTs\b|\b(?:build|create|make|set\s+up)\s+(?:your\s+own\s+|a\s+(?:simple\s+|custom\s+)?)?GPTs?\b(?![-\d])/i,
    datum: '2026-12-11',
    forras: 'https://help.openai.com/en/articles/20001519-custom-gpt-retirement-and-migration-faq'
  }
];

// ⏸️ SZÜNETELŐ ESZKÖZÖK — az eszköz él, de a USER DÖNTÉSE szerint nem írunk róla új útmutatót.
// Ugyanazokon a kapukon akad fenn, mint a megszűnt (témaválasztó, ötletelő, kiegyenlítő, cég-lefedettségi extra hely),
// DE az író-promptba NEM kerül „end of life” jelzéssel (az a MEGSZUNT_ESZKOZOK listából épül) — az eszköz nem szűnt meg.
// Visszakapcsolás: a sor törlése (+ a teszt esete) — CSAK user-döntéssel.
export const SZUNETELO_ESZKOZOK = [
  {
    // 2026-11-16 (user: „alexa ne maradjon elég volt!”): 41 Alexa+ útmutató készült (10-09-től a napi fókusz-hely,
    // az Amazon-partnerlink miatt; a link 11-15 óta KI, d9311e3e). A fókusz 10-23-án lejárt, de a témasor és a
    // kiegyenlítő tovább hozta (11-08, 11-09, 11-10). A meglévő Alexa-útmutatók MARADNAK.
    nev: 'Alexa+ (Amazon)',
    minta: /\balexa\b/i,
    datum: '2026-11-16',
    forras: 'user-döntés'
  }
];

/** Megszűnt VAGY (user-döntésre) szünetelő eszközről szól-e a téma (eszköz, cím vagy szög alapján)? */
export function megszuntTema(t) {
  if (!t) return null;
  const szoveg = [t.tool, t.title, t.angle].filter(Boolean).join(' ');
  return MEGSZUNT_ESZKOZOK.find(e => e.minta.test(szoveg)) || SZUNETELO_ESZKOZOK.find(e => e.minta.test(szoveg)) || null;
}
