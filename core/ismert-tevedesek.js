// ===================================================================
// ISMERT TÉVEDÉSEK — hivatalos forrással CÁFOLT állítások mintái (2026-11-01)
// ===================================================================
//
// MIÉRT: a tény-ellenőrző a SAJÁT emlékezetéből ítélt, az pedig régebbi a termékeinknél. 10-29-én
// kiderült, hogy a „Le Chat megszűnt”, „a GPT Store bezárt”, „az OpenAI Playground megszűnt”,
// „az Alexa+ még nincs kint” mind téves volt; 10-31-én pedig, hogy az „Alexa+ fizetős szolgáltatás”
// (az USA-ban a Prime része), a „Mistral Chat” és a „NVIDIA Chat” (kitalált nevek), az
// „Apple Intelligence+” (kitalált csomag), az „iOS 19” (az Apple a 18 után 26-ra váltott) és az
// „Apple Intelligence csak angolul (US)” is az. Ezek a tévedések TANULSÁGKÉNT is terjedtek: a
// memóriába írt „Avoid stating…” / „Do not claim this exists” lecke minden író-promptba visszament.
//
// HÁROM HELYEN VÉD:
//   • a memória (core/memory-manager.js) ilyen leckét nem ment, és a meglévőt nem adja promptba;
//   • a tény-ellenőrző javítása nem mehet ki, ha TÖBB ilyen mondat van benne, mint az eredetiben;
//   • a korpusz-teszt (core/ismert-tevedesek.test.js) az élő cikkekben és fordításaikban keresi.
//
// A MINTA MONDAT-SZINTŰ, és EXPLICIT SZÓALAKOKBÓL áll — a repó szabálya: SOHA előtag-illesztés
// (a mintaillesztés magabiztosan téved: „NVIDIA Chat” ≠ „NVIDIA ChatRTX”, „Prime” ≠ „primero”).
// A szóhatárt Unicode-betűosztállyal nézzük: a \b az ékezetes betűnél (é, ő, ű) téved.
// Új tévedés felvétele: egy elem a TEVEDESEK listába (magyar leírással, a cáfolat forrásával) +
// egy pozitív ÉS egy negatív (helyes megfogalmazású) példa a tesztbe.
// Lemezt nem olvas, semmit nem importál → bárhonnan hívható, körkörös import nélkül.
// ===================================================================

const BETU = '\\p{L}\\p{N}_';
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Pontos szóalak(ok) Unicode-szóhatárral — SOHA előtag. `kis`: kisbetű-érzéketlen. */
function alak(alakok, kis = true) {
  return new RegExp(`(?<![${BETU}])(?:${alakok.map(esc).join('|')})(?![${BETU}])`, kis ? 'iu' : 'u');
}

// ── KÖZÖS ELEMEK ────────────────────────────────────────────────────
const ALEXA_PLUS = /Alexa\+/;
// „Prime” mint önálló szó: a spanyol „primero/primera” NEM az (valódi korpusz-eset) — ezt a Unicode-szóhatár
// fogja meg, nem a nagybetű. 2026-11-02 (kód-átnézés): kisbetű-érzéketlen („prime-tagoknak”, „Amazon prime”).
const PRIME = alak(['Prime'], true);

// „megszűnt / bezárt / kivezették” — EXPLICIT alakok nyelvenként.
const MEGSZUNT = {
  en: alak(['discontinued', 'shut down', 'shuts down', 'no longer exists', 'no longer exist', 'no longer available',
    'was retired', 'has been retired', 'retired the', 'was closed', 'has been closed', 'closed down']),
  hu: alak(['megszűnt', 'megszűntek', 'megszűnik', 'megszüntette', 'megszüntették', 'bezárt', 'bezárta', 'bezárták',
    'bezárult', 'leállították', 'leállította', 'kivezette', 'kivezették', 'kivezetésre került', 'már nem létezik',
    'nem létezik többé', 'már nem érhető el', 'nem érhető el többé', 'már nem elérhető']),
  es: alak(['descontinuado', 'descontinuada', 'discontinuado', 'discontinuada', 'cerró', 'fue cerrado', 'fue cerrada',
    'ha sido cerrado', 'ha sido cerrada', 'ya no existe', 'ya no está disponible', 'dejó de existir', 'dejó de estar disponible',
    'fue retirado', 'fue retirada', 'ha sido retirado', 'ha sido retirada', 'clausuró'])
};
const mindharom = (mind, nem = []) => ({ en: { mind: [...mind, MEGSZUNT.en], nem }, hu: { mind: [...mind, MEGSZUNT.hu], nem }, es: { mind: [...mind, MEGSZUNT.es], nem } });

/**
 * A cáfolt állítások. Mondatonként: a `mind` MINDEN mintája illeszkedjen, az `egyik` közül LEGALÁBB
 * egy (ha van), a `nem` közül EGY SE. A `*` kulcs minden nyelvre érvényes (terméknév-hibák).
 */
export const TEVEDESEK = [
  {
    id: 'alexa-plus-fizetos',
    leiras: 'Az Alexa+ „fizetős előfizetés / szolgáltatás”, a Prime említése nélkül — az USA-ban a Prime része, Prime nélkül havi 19,99 dollár (aboutamazon.com; 10-29, 10-31).',
    nyelvek: {
      en: { mind: [ALEXA_PLUS], egyik: [alak(['paid subscription', 'paid upgrade', 'paid service', 'paid tier']), /Alexa\+ is a paid(?![\p{L}])/iu], nem: [PRIME] },
      hu: {
        mind: [ALEXA_PLUS],
        egyik: [alak(['fizetős előfizetés', 'fizetős előfizetése', 'fizetős előfizetést', 'fizetős előfizetéses', 'fizetős előfizetésnek',
          'fizetős előfizetésként', 'fizetős előfizetéssel', 'fizetős előfizetésre', 'fizetős szolgáltatás', 'fizetős szolgáltatása',
          'fizetős szolgáltatást', 'fizetős szolgáltatásként', 'fizetős szolgáltatásnak', 'fizetős szolgáltatásra']),
        // „Az Alexa+ egy fizetős csomag” = „Alexa+ is a paid …” (a magyarban nincs „van”) — a „fizetős csomag”
        // ÖNMAGÁBAN a helyes „paid plan” fordítása is („egyes funkciókhoz fizetős csomag kell”), ezért csak így.
        /Alexa\+ egy fizetős(?![\p{L}])/iu],
        nem: [PRIME]
      },
      es: { mind: [ALEXA_PLUS], egyik: [alak(['suscripción de pago', 'servicio de pago', 'mejora de pago', 'nivel de pago'])], nem: [PRIME] }
    }
  },
  {
    id: 'alexa-plus-nincs-kint',
    leiras: 'Az Alexa+ „még nincs széles körben kint” — széles körben elérhető (aboutamazon.com; 10-29).',
    nyelvek: { en: { mind: [ALEXA_PLUS], egyik: [alak(['not been widely released', 'still unreleased or delayed'])] } }
  },
  {
    id: 'mistral-chat-nev',
    leiras: '„Mistral Chat” — kitalált név; a Mistral asszisztense a Vibe (korábban Le Chat) (mistral.ai; 10-31).',
    nyelvek: { '*': { mind: [alak(['Mistral Chat'], false)] } }
  },
  {
    id: 'nvidia-chat-nev',
    leiras: '„NVIDIA Chat” — kitalált név; a valódi a ChatRTX (nvidia.com; 08-31-i élő eset, 10-31). A régi hivatalos „Chat with RTX” név nem hiba.',
    // a 2024-es hivatalos név „NVIDIA Chat with RTX” volt → az nem kitalált
    nyelvek: { '*': { mind: [/(?<![\p{L}\p{N}_])(?:NVIDIA|Nvidia) Chat(?![\p{L}\p{N}_])(?! with RTX)/u] } }
  },
  {
    id: 'apple-intelligence-plusz',
    leiras: '„Apple Intelligence+” — kitalált csomag (apple.com; 10-31).',
    nyelvek: { '*': { mind: [/Apple Intelligence\+/] } }
  },
  {
    id: 'ios-19',
    leiras: '„iOS 19” — nem létező verzió: az Apple a 18 után 26-ra váltott (apple.com; 10-31). A számozás-váltást magyarázó mondat (iOS 26 is benne) nem hiba.',
    nyelvek: { '*': { mind: [/(?<![\p{L}\p{N}_])iOS 19(?![\p{N}])/u], nem: [/(?<![\p{L}\p{N}_])iOS 26(?![\p{N}])/u] } }
  },
  {
    id: 'le-chat-megszunt',
    leiras: 'A Le Chat „megszűnt” — él, csak átnevezték Vibe-ra (mistral.ai; 10-29). Az átnevezést leíró mondat (Vibe is benne) nem hiba.',
    nyelvek: mindharom([alak(['Le Chat'], false)], [alak(['Vibe'], false)])
  },
  {
    id: 'gpt-store-megszunt',
    leiras: 'A GPT Store „bezárt / megszűnt” — működik (chatgpt.com/gpts; 10-29).',
    nyelvek: mindharom([alak(['GPT Store', 'GPT-áruház', 'GPT-áruházat', 'GPT-áruházban', 'Tienda de GPT', 'Tienda de GPTs'])])
  },
  {
    id: 'openai-playground-megszunt',
    leiras: 'Az OpenAI Playground „megszűnt” — létezik (platform.openai.com/playground; 10-29).',
    // A „Playground” önmagában a Picsart AI Playground is → csak az OpenAI-jal egy mondatban.
    nyelvek: mindharom([alak(['OpenAI'], false), alak(['Playground', 'Playgroundot', 'Playgroundja'], false)])
  },
  {
    id: 'apple-intelligence-csak-angol',
    leiras: 'Az Apple Intelligence „csak angolul (US)” működik / a telefon nyelvét angolra (US) kell állítani — sok nyelven elérhető, magyarul és spanyolul is (apple.com; 10-31).',
    // CSAK Apple Intelligence-ről szóló szövegben: a „set your language to English (US)” egy Google-funkciónál IGAZ
    // lehet (a Gmail „Help me write” 10-31-i híre). A lépés-mondat („Tap iPhone Language and select English (US).”)
    // magában nem nevezi meg az Apple Intelligence-t, ezért a feltétel a TELJES szövegre szól, nem a mondatra.
    szovegben: /Apple Intelligence/,
    nyelvek: {
      en: {
        mind: [], egyik: [
          /set (?:your )?(?:device |iPhone |iPad |phone )?language to English \(US\)/i,
          /(?:device|iPhone|iPad|phone) language (?:is |to be )?set to English \(US\)/i,
          /requires English \(US\)/i,
          /(?:device|iPhone|iPad|phone) Language and select English \(US\)/i,
          /English \(US\)["”]? appears as your selected (?:device |iPhone |iPad |phone )?language/i,
          // a spec „only (works|available) in English” mintája CSAK az Apple Intelligence mellett: a Google egyes
          // funkciói valóban csak angolul indulnak (10-31 Slides-hír) — ott ez igaz állítás
          /Apple Intelligence[^.]{0,40}only (?:works|available) in English/i
        ]
      },
      hu: {
        mind: [], egyik: [
          /angol \(amerikai\) nyelvre/i,
          /nyelve angol \(amerikai\)/i,
          /angol \(amerikai\) nyelvet igényel/i,
          /válaszd az angol \(amerikai\)/i,
          /válaszd az Angol \(Egyesült Államok\)/i,
          /Angol \(Egyesült Államok\)["”]? látszik a kiválasztott/i,
          /Apple Intelligence[^.]{0,40}csak angolul (?:működik|érhető el)/i
        ]
      },
      es: {
        mind: [], egyik: [
          /idioma del dispositivo (?:esté|está) (?:configurado )?en inglés \(EE\. ?UU\.\)/i,
          /configura el idioma en inglés \(EE\. ?UU\.\)/i,
          /selecciona (?:el )?Inglés \(EE\. ?UU\.\)/i,
          /requiere inglés \(EE\. ?UU\.\)/i,
          /Inglés \(EE\. ?UU\.\)["”]? como idioma seleccionado/i,
          /Apple Intelligence[^.]{0,40}solo (?:funciona|está disponible) en inglés/i
        ]
      }
    }
  },
  // ── 2026-11-04: a kézi átnézés leletei (user: „jó lenne, ha nem fordulnának elő ezek a hibák még egyszer!”) ──
  // Mind a 11-04-én élő cikkekben talált és javított hiba (200a7731) — az író régi tudásból dolgozik, ezért visszajöhet.
  {
    id: 'chatgpt-regi-cim',
    leiras: 'A ChatGPT címe „chat.openai.com” — a mai cím chatgpt.com (help.openai.com/en/articles/6783457; 11-04-én 11 cikkben javítva).',
    javitas: 'The ChatGPT address is chatgpt.com — never write chat.openai.com (old address).',
    nyelvek: { '*': { mind: [alak(['chat.openai.com'])] } }
  },
  {
    id: 'qwen-regi-cim',
    leiras: 'A Qwen Chat címe „tongyi.aliyun.com” — a mai cím chat.qwen.ai (qwen.ai; 11-02-án javítva).',
    javitas: 'Qwen Chat is at chat.qwen.ai — never write tongyi.aliyun.com (old address).',
    nyelvek: { '*': { mind: [alak(['tongyi.aliyun.com'])] } }
  },
  {
    id: 'chatgpt-team-csomag',
    leiras: 'A ChatGPT „Team” csomag — 2025-08-29 óta Business a neve (help.openai.com/en/articles/8792828; 11-04-én 5 cikkben javítva). A Claude Team csomagja él, az nem hiba; az átnevezést leíró mondat sem.',
    javitas: 'ChatGPT Team was renamed ChatGPT Business on 2025-08-29 — list the ChatGPT plans as Plus, Pro, Business, Enterprise (Claude still has a Team plan; that is fine).',
    // csak ChatGPT/OpenAI-szövegben; a „Plus, Team” csomaglista a ChatGPT-é (a Claude-é „Pro, Max, Team”)
    szovegben: /ChatGPT|OpenAI/,
    nyelvek: { '*': {
      mind: [],
      // 11-05: a `\p{L}` backslash nélkül állt (`[p{L}]` = a p, {, L, } karakterek) → a szóhatár nem működött
      egyik: [/(?<![\p{L}])Plus, (?:Pro, )?Team(?![\p{L}])/u, /(?<![\p{L}])Team, Business(?![\p{L}])/u, /ChatGPT Team(?![\p{L}])/u],
      nem: [/Claude|Anthropic|renamed|rebrand|átnevez|renombr|formerly|korábban|anteriormente/iu]
    } }
  },
  {
    id: 'apple-intelligence-ios-18',
    leiras: 'Az Apple Intelligence-hez „iOS 18” kell — legalább iOS 18.1 / iPadOS 18.1 / macOS Sequoia 15.1 (support.apple.com/en-us/121115; 11-04-én 2 útmutatóban javítva).',
    javitas: 'Apple Intelligence needs at least iOS 18.1 / iPadOS 18.1 / macOS Sequoia 15.1 — never just "iOS 18".',
    // CSAK FELTÉTEL-állítás („needs / running / kell / requiere …”): a „mi változott az iOS 18-ban” hírmondat helyes.
    // A mondatban egy pontos alverzió (18.1, 18.2…) is szerepel → nem hiba („iOS 18 (18.1 or later)”).
    nyelvek: { '*': {
      // 11-05: backslash nélkül állt (`[p{L}]`, `[.d]`, `18.d`) → a szóhatár nem működött, a „con” a „condición”-ban is talált
      mind: [/Apple Intelligence/, /(?<![\p{L}\p{N}_])(?:iOS|iPadOS) 18(?![.\d])/u],
      egyik: [/(?<![\p{L}])(?:needs?|required?|requires|requirement|running|runs on|update to|updated to|or later|or newer)(?![\p{L}])/iu,
        /(?<![\p{L}])(?:kell|szükség|szükséges|fut|futtat|frissítsd|frissíts|vagy újabb)(?![\p{L}])/iu,
        /(?<![\p{L}])(?:necesitas?|necesita|requiere|requisito|con|ejecutando|actualiza|o posterior)(?![\p{L}])/iu],
      nem: [/(?:iOS|iPadOS) 18\.\d/u]
    } }
  },
  {
    id: 'apple-intelligence-nem-pro-iphone',
    leiras: '„Nem Pro iPhone-on nincs Apple Intelligence” — az iPhone 16 / 16e / 17 alapmodellek is támogatják (support.apple.com/en-us/121115; 11-04-én javítva).',
    javitas: 'Do not say Apple Intelligence needs a "Pro" iPhone — iPhone 15 Pro and all iPhone 16 and newer models support it.',
    szovegben: /Apple Intelligence/,
    nyelvek: {
      en: { mind: [/non-Pro iPhone/i] },
      hu: { mind: [/nem Pro iPhone/i] },
      es: { mind: [/iPhone que no sea Pro/i] }
    }
  },
  // ── 2026-11-05: ÁTNEVEZETT TERMÉK (user: „igen” — a súgó-javítás közben derült ki) ──
  // A 09-19-i hírt az író HELYESEN „Gemini Notebook” néven írta, a hitelesség-kapu bírója viszont blokkolta („The product
  // name »Gemini Notebook« is fabricated… actual product is called NotebookLM”), és az átírás a RÉGI névvel ment ki.
  // 11-05-én 6 cikkben (3 nyelven 231 helyen) javítva; a bíró hiteles-név listájában (website/tool-links.json) mostantól
  // a „Gemini Notebook” áll.
  {
    id: 'notebooklm-regi-nev',
    leiras: 'A „NotebookLM” név — a Google 2026-07-16-án Gemini Notebookra nevezte át (blog.google/innovation-and-ai/products/gemini-notebook/notebooklm-gemini-notebook/; a régi cím a notebook.google.com-ra irányít). A „korábbi nevén NotebookLM” megjegyzés nem hiba.',
    javitas: 'NotebookLM was renamed Gemini Notebook on 2026-07-16 (blog.google) — call it Gemini Notebook; you may add "(formerly NotebookLM)" once.',
    nyelvek: { '*': {
      // kisbetű-ÉRZÉKENY: a cikk-URL-ek („…-in-notebooklm”) és a címkék kisbetűsek, azok nem élő terméknév
      mind: [alak(['NotebookLM'], false)],
      nem: [
        /(?<![\p{L}])(?:formerly|previously|korábbi nevén|korábban|antes|anteriormente)(?: (?:called|known as|named|llamado|conocido como))? NotebookLM/iu,
        /NotebookLM(?:-et)? (?:is now|was renamed|has been renamed|became|ahora es|pasó a llamarse|fue renombrado|új neve)/iu,
        /(?<![\p{L}])(?:renamed|átnevezte|átnevezték|renombró)(?![\p{L}])[^.]{0,30}NotebookLM/iu
      ]
    } }
  }
];

export const NYELVEK = ['en', 'hu', 'es'];

// ── MONDATBONTÁS ────────────────────────────────────────────────────
// Soronként, a soron belül mondatvégi írásjel (+ záró idézőjel/zárójel) + szóköz + nagybetű/idézőjel
// mentén. A rövidítésnél NEM vág: a spanyol „inglés (EE. UU.)” különben két mondatra esne, és a minta
// egyikben sem illeszkedne. A frontmatter (title:, subtitle:) is élő szöveg (a cím az oldalon), ezért
// NEM dobjuk el. A markdown-kiemelés (**, __, *) kimarad: „set to **English (US)**” is a minta alá essen.
const ROVIDITES = /(?<![\p{L}])(?:EE|UU|U\.S|e\.g|i\.e|etc|vs|approx|Dr|Mr|Mrs|Ms|St|Sr|Sra|pl|kb|stb|ill|ld|vö)\.$/u;
export function mondatokra(szoveg) {
  const ki = [];
  for (const sor of String(szoveg || '').split(/\r?\n/)) {
    const s = sor.replace(/\*\*|__|\*/g, '').trim();
    if (!s) continue;
    let eleje = 0;
    for (const m of s.matchAll(/[.!?…]["”’»)\]]*\s+(?=[\p{Lu}¿¡"„“'«(\[])/gu)) {
      if (ROVIDITES.test(s.slice(Math.max(eleje, m.index - 5), m.index + 1))) continue;
      const vege = m.index + m[0].replace(/\s+$/, '').length;
      ki.push(s.slice(eleje, vege).trim());
      eleje = m.index + m[0].length;
    }
    const maradek = s.slice(eleje).trim();
    if (maradek) ki.push(maradek);
  }
  return ki;
}

// A KIVÉTEL (`nem`) a SZOMSZÉD mondatokban is érvényes (2026-11-02, kód-átnézés): „Alexa+ is a paid subscription.
// It is included with Prime.” helyes — a Prime a következő mondatban áll. Az állítás (`mind`/`egyik`) mondatonként.
function illeszkedik(szabaly, mondat, kornyezet = mondat) {
  if (!szabaly) return false;
  if (!(szabaly.mind || []).every(rx => rx.test(mondat))) return false;
  if ((szabaly.egyik || []).length && !szabaly.egyik.some(rx => rx.test(mondat))) return false;
  if (!(szabaly.mind || []).length && !(szabaly.egyik || []).length) return false;
  return !(szabaly.nem || []).some(rx => rx.test(kornyezet));
}

/**
 * Az ismert tévedések a szövegben, mondatonként (egy mondat több tévedést is hordozhat).
 * @param {string} szoveg
 * @param {'en'|'hu'|'es'} [nyelv]  megadva: annak a nyelvnek a mintái + a nyelvfüggetlenek;
 *                                    elhagyva: MINDEN nyelv mintája (pl. ismeretlen nyelvű lecke)
 * @returns {{id: string, mondat: string}[]}
 */
export function tevedesekASzovegben(szoveg, nyelv) {
  const nyelvek = NYELVEK.includes(nyelv) ? [nyelv] : NYELVEK;
  const teljes = String(szoveg || '');
  const szabalyok = TEVEDESEK.filter(t => !t.szovegben || t.szovegben.test(teljes));
  const ki = [];
  const mm = mondatokra(teljes);
  mm.forEach((mondat, i) => {
    const kornyezet = [mm[i - 1], mondat, mm[i + 1]].filter(Boolean).join(' ');
    for (const t of szabalyok) {
      if (illeszkedik(t.nyelvek['*'], mondat, kornyezet) || nyelvek.some(ny => illeszkedik(t.nyelvek[ny], mondat, kornyezet))) ki.push({ id: t.id, mondat });
    }
  });
  return ki;
}

// ── A LECKE FORDÍTOTT ALAKJA (2026-11-01) ───────────────────────────
// A tény-ellenőrző leckéje „Avoid stating (may be removed/false): <állítás>” vagy „Do not claim this exists …”
// — vagyis a benne álló állítás az, amit az író NE írjon le. A 10-29-i kár pont így terjedt: „Avoid stating:
// Le Chat also has mobile apps”, „Avoid stating: ChatRTX application (entire tool name - rebranded)” — a cáfolt
// tévedés itt nem a mondatban áll, hanem a TILTÁSBAN. Ezért a tiltó lecke akkor is téves, ha egy hivatalos
// forrással megerősítetten ÉLŐ terméket nevez meg (a 10-29-én tévesen „megszűntnek / nem létezőnek” hitt nevek).
// A többi tiltó lecke marad (a 3 ember által megerősített „nem létezik” lecke — Home-recept, Naptár-összefoglaló,
// Outlook — egyik nevet sem tartalmazza).
const TILTO_LECKE = /^\s*(?:Avoid stating|Do not claim this exists)(?![\p{L}])/iu;
// ⚠️ A ChatRTX-et az NVIDIA 2026-01-21-én MEGSZÜNTETTE (github.com/NVIDIA/ChatRTX) — mégis itt marad: ez a lista a
// „ChatRTX-et átnevezték NVIDIA Chatre” típusú (08-31-i, HAMIS) tiltó leckét tartja távol a promptoktól. Hogy róla ne
// szülessen új útmutató, azt a core/megszunt-eszkozok.js intézi (2026-11-04).
export const ELO_TERMEKEK = ['Le Chat', 'GPT Store', 'OpenAI Playground', 'Alexa+', 'ChatRTX'];
const ELO_TERMEK = alak(ELO_TERMEKEK, false);

/**
 * Ismert (hivatalos forrással cáfolt) tévedést hordoz-e a lecke szövege? (→ ne mentsük, ne adjuk promptba)
 * Igaz, ha (a) bármelyik nyelv tévedés-mintája illeszkedik egy mondatára, vagy (b) tiltó lecke („Avoid stating…”,
 * „Do not claim this exists…”), amely megerősítetten élő terméket nevez meg.
 */
// A HELYES FIGYELMEZTETÉS nem téves lecke (2026-11-02, kód-átnézés): „Never write ‘Mistral Chat’ — the assistant is
// Vibe (formerly Le Chat).” épp a tévedés ELLEN szól, eddig mégis kiesett. Csak a kifejezett írás-tiltás számít — az
// „Avoid stating …” NEM: az a tény-ellenőrző gépi alakja, amelynek tartalma a 10-29-i kárnál épp a téves állítás volt.
const FIGYELMEZTETES = /(?<![\p{L}])(?:never|do not|don['’]t|nem szabad|ne)\s+(?:write|writing|call|calling|use|using|say|saying|name|naming|refer to|írd|írj|hívd|nevezd|használd)(?![\p{L}])/iu;
const NEV_SZABALY = new Set(TEVEDESEK.filter(t => t.nyelvek['*']).map(t => t.id));

export function tevesLecke(szoveg) {
  const s = String(szoveg || '');
  if (!s.trim()) return false;
  // CSAK a kitalált-NÉV szabályoknál ('*': Mistral Chat, NVIDIA Chat, Apple Intelligence+, iOS 19) — a „Le Chat was
  // discontinued — do not use it” lecke maga a tévedés, az nem mentesülhet.
  const talalat = tevedesekASzovegben(s).filter(x => !(NEV_SZABALY.has(x.id) && FIGYELMEZTETES.test(x.mondat)));
  return talalat.length > 0 || (TILTO_LECKE.test(s) && ELO_TERMEK.test(s));
}

/**
 * A javítás ÚJ ismert tévedései: ha a javított szövegben TÖBB a találat, mint az eredetiben, azok a
 * javított szöveg találatai, amelyek mondata az eredetiben nem volt tévedés. Üres tömb = mehet.
 */
export function ujTevedesek(eredeti, javitott, nyelv = 'en') {
  const regi = tevedesekASzovegben(eredeti, nyelv), uj = tevedesekASzovegben(javitott, nyelv);
  if (uj.length <= regi.length) return [];
  const regiMondat = new Set(regi.map(x => x.id + '|' + x.mondat));
  const ki = uj.filter(x => !regiMondat.has(x.id + '|' + x.mondat));
  return ki.length ? ki : uj.slice(regi.length);
}

/**
 * ELLENŐRZŐ-KAPU (2026-11-04, user: „jó lenne, ha nem fordulnának elő ezek a hibák még egyszer!”): eddig a lista csak a
 * memóriát, a tény-ellenőrző javítását és a korpusz-tesztet védte — az ÚJ cikk ismert tévedéssel is kimehetett, és csak
 * utólag derült ki. Most az ellenőrző ELUTASÍT (KNOWN_FALSE_CLAIM, core/auto-check-codes.js), és az átdolgozás a
 * `javitas` szöveget kapja útmutatónak.
 * @param {string} markdown  a cikk teljes markdownja (frontmatterrel)
 * @param {'en'|'hu'|'es'} [nyelv='en']
 * @returns {string|null} „KNOWN_FALSE_CLAIM: …” vagy null
 */
export function tevedesJelzes(markdown, nyelv = 'en') {
  const talalat = tevedesekASzovegben(markdown, nyelv);
  if (!talalat.length) return null;
  const idk = [...new Set(talalat.map(x => x.id))];
  const utmutatas = idk.map(id => {
    const x = TEVEDESEK.find(e => e.id === id);
    return x?.javitas || x?.leiras || id;
  });
  return `KNOWN_FALSE_CLAIM: ${talalat.length} ismert, hivatalos forrással cáfolt állítás (${talalat.slice(0, 2).map(x => `"${x.mondat.slice(0, 90)}"`).join('; ')}). `
    + 'Fix: ' + utmutatas.join(' | ');
}

export default { TEVEDESEK, NYELVEK, ELO_TERMEKEK, mondatokra, tevedesekASzovegben, tevesLecke, ujTevedesek, tevedesJelzes };
