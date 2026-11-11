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

// Más MI-eszköz / levelező neve — a szomszéd mondatban álló név esetén a gemkapocs NEM a Claude-é (2026-11-09).
const MAS_ESZKOZ = alak(['ChatGPT', 'Gemini', 'Copilot', 'Perplexity', 'Le Chat', 'Mistral', 'DeepSeek', 'Grok', 'Meta AI',
  'Gmail', 'Outlook', 'WhatsApp', 'Hugging Face', 'Cohere', 'Qwen'], false);

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
    leiras: 'A GPT Store „bezárt / megszűnt” — működik (chatgpt.com/gpts; 10-29). LEJÁR 2026-12-11: az OpenAI ekkor kivezeti az egyedi GPT-ket (help.openai.com/en/articles/20001519), onnantól a „megszűnt” IGAZ.',
    lejar: '2026-12-11',
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
  },
  // ── 2026-11-08: KITALÁLT FELÜLET (user: „szeretném hogy a javitott hibák többet ne forduljanak elö!”) ──
  // A 0b903e26 + 3995fd66 kézi átnézésben 17 útmutatóból javított, hivatalos súgóval CÁFOLT képernyő-részletek. Az
  // író nem látja az appot, ezért „emlékezetből” üdvözlést, fület, gombfeliratot talál ki — és ugyanezt fogja újra
  // tenni. A pozitív teszt-esetek a javítás ELŐTTI élő mondatok (git: 0b903e26~1, 3995fd66~1).
  {
    id: 'google-fotok-kitalalt-felulet',
    leiras: 'Google Fotók: „Library → Utilities” menüút, öt alsó ikon „…Utilities és Library”, „Unknown 1” arccsoport-cím, „From your groups” albumgomb — a Google Fotók súgójában egyik sincs (support.google.com/photos/answer/6128838, 6128849, 6131416; 11-08-án javítva).',
    javitas: 'Google Photos: do not write a "Library → Utilities" path, a "five icons … Utilities, Library" tab bar, "Unknown 1" face-group titles or a "From your groups" button — use only the steps in the official Google Photos help (support.google.com/photos).',
    szovegben: /Google (?:Photos|Fotók|Fotos)/,
    nyelvek: {
      '*': { mind: [], egyik: [alak(['Unknown 1', 'Unknown 2', 'From your groups'], false), /Library[^.\n]{0,40}Utilities|Utilities[^.\n]{0,40}Library/u] },
      hu: { mind: [], egyik: [alak(['Ismeretlen 1', 'Ismeretlen 2', 'Ismeretlen 1-re', 'A csoportjaidból'], false), /Könyvtár[^.\n]{0,40}Segédeszközök|Segédeszközök[^.\n]{0,40}Könyvtár/u] },
      es: { mind: [], egyik: [alak(['Desconocido 1', 'Desconocido 2', 'De tus grupos'], false), /Biblioteca[^.\n]{0,40}Utilidades|Utilidades[^.\n]{0,40}Biblioteca/u] }
    }
  },
  {
    id: 'meta-ai-kitalalt-ikon',
    leiras: 'Meta AI a WhatsAppban: „zöld kör csillogó ikonnal”, „csillogó gomb”, „robotszerű avatár” — a WhatsApp súgója a Meta AI gombot és a keresést írja le, ilyen ikont nem (faq.whatsapp.com/666767195111959; 11-08-án javítva).',
    javitas: 'Meta AI in WhatsApp: never describe a "green circle with a sparkle", a "sparkle button" or a "robot-like avatar" — say "tap the Meta AI button in Chats, or search for Meta AI" (faq.whatsapp.com).',
    // a Gemini ikonja VALÓBAN csillag-szerű (sparkle) — a Geminit is említő mondat nem ez a hiba
    szovegben: /Meta AI/,
    nyelvek: {
      en: { mind: [], egyik: [/green[^.\n]{0,40}(?:sparkle|star)|sparkle[^.\n]{0,20}green/iu, /(?<![\p{L}])sparkle(?: or [^.\n]{0,25})? (?:button|icon)(?![\p{L}])/iu, /robot-like avatar/iu], nem: [alak(['Gemini'], false)] },
      hu: { mind: [], egyik: [/zöld[^.\n]{0,40}csillog|csillog[^.\n]{0,20}zöld/iu, /(?<![\p{L}])csillogó(?: vagy [^.\n]{0,25})? (?:gomb|ikon)/iu, /robotra emlékeztető/iu], nem: [alak(['Gemini'], false)] },
      es: { mind: [], egyik: [/verde[^.\n]{0,40}destellos|destellos[^.\n]{0,20}verde/iu, /(?<![\p{L}])(?:botón|icono) (?:verde )?de destellos/iu, /parecido a un robot/iu], nem: [alak(['Gemini'], false)] }
    }
  },
  {
    id: 'kitalalt-chatbot-udvozles',
    leiras: 'Kitalált chatbot-képernyőszöveg: „How can I help (you) today?” (Claude, ChatGPT, Qwen), „Welcome to ChatGPT.”, „Meet Gemini.”, „What’s the first tweet about?” (Grok), „Generating response...” (Grok), „Ask Copilot anything…”, „Ask me anything about this document.” — egyik sem szerepel a gyártó súgójában (help.openai.com, support.google.com/gemini, support.microsoft.com; 11-08-án 9 útmutatóban javítva).',
    javitas: 'Never quote an AI app\'s greeting, placeholder, welcome title or status line ("How can I help you today?", "Welcome to ChatGPT.", "Meet Gemini.", "Ask Copilot anything…", "Generating response...") — you cannot see the screen. Describe it instead: "the chat opens with an empty message box at the bottom".',
    nyelvek: {
      '*': { mind: [], egyik: [
        // a TELEFONOS / hangos ügyfélszolgálat „how can I help you today?” mondata nem képernyőszöveg (07-31-i hír)
        /^(?![^\n]*(?:voice|phone|call cent))[^\n]*How can I help (?:you )?today/iu, /Welcome to ChatGPT/u, /["“„]Meet Gemini[.!]?["”]/u,
        /What[’']s the first tweet about/iu, /Generating (?:response|answer)(?:\.\.\.|…)/iu, /Ask Copilot anything/iu,
        /Ask me anything about this document/iu
      ] },
      hu: { mind: [], egyik: [/^(?![^\n]*(?:telefon|hangos))[^\n]*(?:Miben|Hogyan) segíthetek ma/iu, /Miről szóljon az első tweet/iu, /Válasz generálása(?:\.\.\.|…)/iu] },
      es: { mind: [], egyik: [/^(?![^\n]*(?:teléfono|llamada|voz))[^\n]*Cómo puedo ayudarte hoy/iu, /Generando respuesta(?:\.\.\.|…)/iu] }
    }
  },
  {
    id: 'alexa-rutin-kitalalt-felulet',
    leiras: 'Alexa-rutin: „Your Routines” képernyő, „Add trigger” gomb, „Enter phrase” mező, a spanyolban a francia „déclenchee” szó, és az „Alexa” szó BEÍRÁSA a rutin-mondatba — az Amazon súgója szerint „When this happens” → Voice, a mondatot az „Alexa” nélkül kell beírni (amazon.com/gp/help/customer/display.html?nodeId=G2PYLKJN3XVZ55EQ; 11-08-án javítva).',
    javitas: 'Alexa routines: there is no "Your Routines" screen, "Add trigger" button or "Enter phrase" field — follow amazon.com/alexa-routines ("When this happens" → Voice). When typing the phrase, leave out the word "Alexa" (type "good morning", then say "Alexa, good morning").',
    szovegben: /Alexa/,
    nyelvek: {
      '*': { mind: [], egyik: [alak(['Your Routines', 'Add trigger', 'Enter phrase'], false), /déclench/iu] },
      // Az ige NE a kimondott parancs része legyen (`Di "Alexa, escribe un correo…"` — 11-08 korpusz-eset), és az „Alexa,”
      // idézőjel vagy „such as / például / como” után álljon (a „Type a phrase you'll say to Alexa, for example:” nem hiba).
      en: { mind: [/(?<!Alexa, )(?<![\p{L}])(?:type|enter|typing)(?![\p{L}])[^.\n]{0,50}(?:["“`']|(?:such as|like|e\.g\.) )Alexa,/iu], nem: [/(?<![\p{L}])(?:without|leave out|don['’]t type|do not type|wake word)(?![\p{L}])/iu] },
      hu: { mind: [], egyik: [alak(['Kifejezés megadása'], false), /(?<!Alexa, )(?<![\p{L}])(?:írd be|gépeld be|beírod|beírni)(?![\p{L}])[^.\n]{0,50}(?:["„“`']|(?:például|mint) )Alexa,/iu], nem: [/(?<![\p{L}])(?:nélkül|hagyd ki|ne írd|ébresztőszó)(?![\p{L}])/iu] },
      es: { mind: [/(?<!Alexa, )(?<![\p{L}])(?:escribe|introduce|teclea|escribir)(?![\p{L}])[^.\n]{0,50}(?:["“«`']|(?:como|por ejemplo) )Alexa,/iu], nem: [/(?<![\p{L}])(?:sin|omite|no escribas|palabra de activación)(?![\p{L}])/iu] }
    }
  },
  {
    id: 'parancsok-kitalalt-felulet',
    leiras: 'Apple Parancsok (Shortcuts): „Untitled Shortcut” cím, „Type a name or choose an action” kereső, „Tap to add action” vonal, a kártyák közötti „kis kör” áthúzása, az „Add to Siri” felvétel, az „Apple Intelligence check” lépés és az Óra-ébresztő, amely „magától megnyitja a parancsot” — az Apple Parancsok-útmutatója szerint az új parancs „New Shortcut”, Siri a parancs NEVÉRE indít, időzítés automatizálással (support.apple.com/guide/shortcuts; 11-08-án javítva).',
    javitas: 'Apple Shortcuts: a new shortcut is called "New Shortcut" (rename via Rename); Siri runs a shortcut when you say its name (no "Add to Siri" recording); actions run top to bottom (no dragging circles between cards); a scheduled run is a personal automation (Time of Day / Alarm), not the Clock app. Do not invent an "Apple Intelligence check" step — the real action is "Use Model" (support.apple.com/guide/shortcuts).',
    nyelvek: {
      '*': { mind: [], egyik: [alak(['Untitled Shortcut', 'Type a name or choose an action', 'Tap to add action', 'Névtelen parancs', 'Atajo sin título'], false),
        /Apple Intelligence check(?![-\p{L}])/u] },
      en: { mind: [], egyik: [/drag the small circle/iu, /(?<![\p{L}])tap(?:ped)? (?:the )?Add to Siri/iu,
        /alarm[^.\n]{0,40}(?:rings|goes off)[^.\n]{0,40}(?:opens|runs|launches) the shortcut/iu], nem: [/Automation/u] },
      hu: { mind: [], egyik: [/(?<![\p{L}])húzd[^.\n]{0,60}kis kört/iu, /ébresztő megszólal[^.\n]{0,40}(?:megnyitja|elindítja|futtatja) a parancsot/iu], nem: [/automatizál/iu] },
      es: { mind: [], egyik: [/arrastra el círculo pequeño/iu, /(?<![\p{L}])toca(?:do)? (?:el botón )?\**Add to Siri/iu,
        /suene la alarma[^.\n]{0,40}(?:abra|abre|ejecute|ejecuta|lance|lanza) el atajo/iu], nem: [/Automatizaci/iu] }
    }
  },
  {
    id: 'vscode-elonezeti-sav',
    leiras: 'VS Code „alsó előnézeti sávja”, amely a weboldal címét mutatja — a VS Code-ban nincs ilyen sáv; a HTML-t a böngészőben kell megnyitni (code.visualstudio.com/docs; 11-08-án javítva).',
    javitas: 'VS Code has no built-in "preview bar" for HTML — to see the page, open the .html file in a web browser (code.visualstudio.com/docs).',
    szovegben: /VS Code|Visual Studio Code/,
    nyelvek: {
      en: { mind: [/(?<![\p{L}])preview bar(?![\p{L}])/iu] },
      hu: { mind: [/előnézeti sáv/iu] },
      es: { mind: [/barra (?:inferior )?de vista previa/iu] }
    }
  },
  // ── KITALÁLT IKON-LEÍRÁSOK (2026-11-09, a 4. rész kézi átnézéséből) ──────────────────────────────────────────
  // A pozitív teszt-esetek a javítás ELŐTTI élő mondatok (git: b51eb6bc~1).
  {
    id: 'chatgpt-hangmod-mikrofon',
    leiras: 'ChatGPT: „a mikrofon ikon indítja a hang módot”, „koppints ismét a mikrofonra”, „oldalsó menü → Voice mode beállítás” — az OpenAI súgója szerint a beszélgetést a Voice ikon indítja az üzenetsávban, a mikrofon a DIKTÁLÁS (help.openai.com/en/articles/8400625-voice-mode-faq; 11-09-én 2 útmutatóban javítva).',
    javitas: 'ChatGPT voice: tell readers to tap the Voice icon in the message bar (help.openai.com voice mode FAQ). The microphone is Dictation — it turns one recording into text and does not talk back. There is no "Voice mode" setting in the side menu; voice options live under Settings → Voice.',
    szovegben: /ChatGPT/,
    nyelvek: {
      en: { mind: [], egyik: [
        /(?<![\p{L}])(?:microphone|mic)(?: icon| button)?[^.\n]{0,40}(?:to start|to open|to turn on|starts|opens|launches) (?:the )?voice (?:mode|chat|conversation)/iu,
        /(?<![\p{L}])(?:tap|press|click)(?:ping)? (?:the )?mic(?:rophone)?(?: icon| button)? (?:once|again)(?![\p{L}])/iu,
        /side menu[^.\n]{0,120}Voice (?:mode|chat)/iu
      ], nem: [/Dictation/iu] },
      hu: { mind: [], egyik: [
        /mikrofon(?: ikonra| ikont| gombra)?[^.\n]{0,40}hang ?mód[^.\n]{0,20}(?:indít|bekapcsol)/iu,
        /koppints (?:egyszer|ismét|újra) a mikrofon(?:ra| ikonra)|koppints a mikrofon(?:ra| ikonra) (?:egyszer|ismét|újra)/iu,
        /oldalsó menü[^.\n]{0,120}Voice (?:mode|chat)/iu
      ], nem: [/diktál/iu] },
      es: { mind: [], egyik: [
        /micrófono[^.\n]{0,40}(?:activar|iniciar|abrir|empezar) el modo (?:de )?voz/iu,
        /vuelve a tocar el micr(?:o|ófono)(?![\p{L}])|toca el micr(?:o|ófono) una vez/iu,
        /menú lateral[^.\n]{0,120}Voice (?:mode|chat)/iu
      ], nem: [/dictado/iu] }
    }
  },
  {
    id: 'claude-gemkapocs-ikon',
    leiras: 'Claude: „gemkapocs ikon” a csatoláshoz — a Claude súgója szerint a csevegőmező bal alsó sarkában lévő „+” gomb → „Add files or photos”, vagy áthúzás / képbeillesztés (support.claude.com/en/articles/8241126; 11-09-én 7 útmutatóban javítva).',
    javitas: 'Claude: to attach a file, click the "+" button in the lower-left corner of the chat box and choose "Add files or photos" (or drag the file into the chat). Do not describe a paperclip icon (support.claude.com/en/articles/8241126).',
    // csak a Claude-ról szóló útmutató (frontmatter `tool:`) — egy „bármelyik MI-asszisztens” útmutatóban a gemkapocs más eszközé lehet
    szovegben: /^tool: ["']?Claude/m,
    nyelvek: {
      en: { mind: [], egyik: [alak(['paperclip', 'paper clip', 'paper-clip']), /📎/u], nem: [MAS_ESZKOZ] },
      hu: { mind: [], egyik: [alak(['gemkapocs', 'gemkapcsot', 'gemkapoccsal', 'gemkapocsra', 'gemkapcsok', 'gemkapocsikon', 'gemkapocsikont',
        'gemkapocsikonra']), /📎/u], nem: [MAS_ESZKOZ] },
      // a spanyol „clip” videóklip is lehet → csak az ikon/gomb alakok
      es: { mind: [], egyik: [alak(['icono de clip', 'icono del clip', 'botón del clip', 'botón de clip', 'forma de clip', 'clip de papel', 'el clip',
        'un clip']), /📎/u], nem: [MAS_ESZKOZ, /(?<![\p{L}])(?:vídeo|video|audio)(?![\p{L}])/iu] }
    }
  },
  {
    id: 'apple-intelligence-elesit',
    leiras: '„Az Apple Intelligence élesíti / kitisztítja a homályos fotót” — az Apple Intelligence a Fotókban keres, és a Clean Up eszközzel tárgyat távolít el, élesítő funkciója nincs; az Auto-javítás és az élesség-csúszka nem Apple Intelligence (support.apple.com/guide/iphone/xy0grrlxue5w; 11-09-én a „Clear Up Blurry iPhone Photos with Apple Intelligence” útmutató 301-gyel levéve).',
    javitas: 'Apple Intelligence does not sharpen or unblur photos. In Photos it offers natural-language search and Clean Up (removes distracting objects) — see support.apple.com/guide/iphone/xy0grrlxue5w. Do not present Auto-Enhance or the Sharpness slider as Apple Intelligence.',
    szovegben: /Apple Intelligence/,
    nyelvek: {
      en: { mind: [alak(['Apple Intelligence'], false), /(?<![\p{L}])(?:sharpen\w*|deblur\w*|unblur\w*|clear(?:s|ing)? up (?:a |your |those )?(?:blurry|fuzzy)|fix(?:es|ing)? (?:the )?blur\w*)(?![\p{L}])/iu],
        nem: [/(?<![\p{L}])(?:not|doesn['’]t|does not|can['’]t|cannot|won['’]t|isn['’]t|no)(?![\p{L}])/iu] },
      hu: { mind: [alak(['Apple Intelligence'], false), /(?<![\p{L}])(?:élesít\p{L}*|homályos fotó\p{L}*[^.\n]{0,30}(?:javít|kitisztít|tisztít)\p{L}*)/iu],
        nem: [/(?<![\p{L}])(?:nem|ne|nincs)(?![\p{L}])/iu] },
      es: { mind: [alak(['Apple Intelligence'], false), /(?<![\p{L}])(?:enfoca\p{L}*|nitidez|desenfoque|desenfocad\p{L}*|borros\p{L}*)/iu],
        nem: [/(?<![\p{L}])(?:no|nunca|sin)(?![\p{L}])/iu] }
    }
  },
  {
    id: 'gmail-gemini-csillag-ikon',
    leiras: 'Gmail: „Gemini csillag ikon” / „csillag alakú ikon a tárgysor mellett” — a Gmailben a csillag az üzenet megcsillagozása; a Google súgója szerint a Gemini a jobb felső „Ask Gemini” gombbal nyílik, a szál tetején „Summarize this email” (support.google.com/mail/answer/14355636; 11-09-én javítva).',
    javitas: 'Gemini in Gmail: click "Ask Gemini" at the top right of Gmail (or "Summarize this email" at the top of a thread) — never call it a "star icon": in Gmail the star marks a message as starred (support.google.com/mail/answer/14355636).',
    szovegben: /Gmail/,
    nyelvek: {
      // „Gemini starts typing” nem ez — a szóhatár kell; a Docs-os mondat más felület
      en: { mind: [], egyik: [/Gemini star(?![\p{L}])/iu, /star[‑-]shaped (?:icon|button)/iu], nem: [/(?<![\p{L}])Docs(?![\p{L}])/u] },
      hu: { mind: [], egyik: [/Gemini csillag(?: ikon| gomb)/iu, /csillag alakú (?:ikon|gomb)/iu], nem: [/(?<![\p{L}])Docs/u] },
      es: { mind: [], egyik: [/estrella de Gemini/iu, /(?:icono|botón) (?:pequeño )?con forma de estrella/iu], nem: [/(?<![\p{L}])Docs(?![\p{L}])/u] }
    }
  },
  {
    id: 'whatsapp-meta-ai-kek-buborek',
    leiras: 'Meta AI a WhatsAppban: „kék kör ikon (csevegőbuborék csillogással)” — a WhatsApp súgója szerint a Meta AI ikonja a Csevegések fülön egy többszínű gyűrű (néhol rózsaszín-lila vagy kék-lila kör), csillogó buborék nincs (faq.whatsapp.com/666767195111959; 11-09-én javítva).',
    javitas: 'Meta AI in WhatsApp: the icon on the Chats tab is a multicolored ring (on some phones pink-and-purple or blue-and-purple); you can also tap the search field at the top of Chats and tap Ask (faq.whatsapp.com/666767195111959). Never describe a blue chat bubble with a sparkle.',
    szovegben: /Meta AI/,
    nyelvek: {
      en: { mind: [], egyik: [/blue (?:icon|circle|bubble)[^.\n]{0,60}sparkle/iu], nem: [alak(['Gemini'], false)] },
      hu: { mind: [], egyik: [/kék (?:kör|ikon|buborék)[^.\n]{0,60}csillag/iu], nem: [alak(['Gemini'], false)] },
      es: { mind: [], egyik: [/(?:icono|círculo|bocadillo) (?:circular )?azul[^.\n]{0,60}destello/iu], nem: [alak(['Gemini'], false)] }
    }
  },
  {
    id: 'alexa-rutin-hangvalasztas',
    leiras: 'Alexa-rutin: „a rutinban válaszd ki Alexa hangját (Matthew, Emma)” — az Amazon rutin-súgójában (esemény + művelet + mentés) rutinonkénti hangválasztás nincs; az „Alexa’s Voice” eszközbeállítás, nem rutin-lépés (amazon.com/gp/help/customer/display.html?nodeId=G2PYLKJN3XVZ55EQ; 11-09-én javítva).',
    javitas: 'Alexa routines: a routine is an event (Add an event) plus actions (Add an action), then Save (Amazon help G2PYLKJN3XVZ55EQ). There is no per-routine voice picker — never tell readers to choose "Alexa\'s Voice", "Matthew" or "Emma" inside a routine.',
    szovegben: /Alexa/,
    nyelvek: {
      en: { mind: [], egyik: [/Alexa['’]s Voice[^.\n]{0,120}(?:Matthew|Emma|routine)/iu, /routine[^.\n]{0,120}Alexa['’]s Voice/iu] },
      hu: { mind: [], egyik: [/(?:Alexa[- ]hang\p{L}*|Alexa['’]s Voice)[^.\n]{0,120}(?:Matthew|Emma|rutin)/iu, /rutin[^.\n]{0,120}(?:Alexa[- ]hang\p{L}*|Alexa['’]s Voice)/iu] },
      es: { mind: [], egyik: [/(?:voz (?:\p{L}+ )?de Alexa|Alexa['’]s Voice)[^.\n]{0,120}(?:Matthew|Emma|rutina)/iu, /rutina[^.\n]{0,120}(?:voz (?:\p{L}+ )?de Alexa|Alexa['’]s Voice)/iu] }
    }
  },
  {
    id: 'alexa-megbeszeles-rogzites',
    leiras: 'Alexa+: „végighallgatja a megbeszélést az Echón, rögzíti, ami elhangzott, és kiszedi a teendőket” — az Amazon szerint az Alexa+ azt jegyzi meg, amit KÉRSZ tőle (Remember This), és a VELE folytatott beszélgetést tudja összefoglalni; megbeszélés-jegyzőkönyvet nem vezet (amazon.com/gp/help/customer/display.html?nodeId=TyCw3gp8fy2WzKtWxi, aboutamazon.com/news/devices/new-alexa-top-features; 11-09-én javítva).',
    javitas: 'Alexa+ does not listen to or record a whole meeting — it only hears what is said to it after the wake word. Describe what Amazon documents instead: "Alexa, remember that…" (Remember This), "Alexa, add … to my to-do list", reminders, and asking Alexa+ to recap your conversation with it and send it to the Alexa app or email.',
    szovegben: /Alexa/,
    nyelvek: {
      en: { mind: [], egyik: [/(?:listen|listens|listening) (?:in )?to (?:your|the) (?:whole |entire )?meeting/iu, /capture what was said/iu], nem: [/(?:does not|doesn['’]t|cannot|can['’]t|won['’]t) (?:listen|record)/iu] },
      hu: { mind: [], egyik: [/(?:végighallgatja|meghallgatja|hallgatja|figyeli) a (?:teljes |egész )?(?:megbeszélés|meeting)/iu, /rögzíti, (?:amit|ami) (?:elhangzott|elhangzik)/iu], nem: [/nem (?:hallgatja|rögzíti|figyeli)/iu] },
      es: { mind: [], egyik: [/escucha(?:r)? (?:tu|la|toda tu|toda la) reunión/iu, /captura(?:r)? lo que se dij/iu], nem: [/no (?:escucha|graba)/iu] }
    }
  },
  {
    id: 'copilot-outlook-negymezos-ikon',
    leiras: 'Copilot az Outlookban: „Copilot gomb egy kis színes, négymezős ikonnal, jobb felül; mobilon a profilikon alatti Apps/Tools menüben” — a Microsoft súgója szerint a Copilot gomb az Outlook-ablak felső részén van (a csevegés munkahelyi/iskolai fiókkal), a levélszál tetején a „Summary by Copilot” doboz, telefonon az eszköztár Copilot ikonja; négymezős ikon nincs, az a Microsoft-/Windows-logó (support.microsoft.com/en-us/copilot-outlook, support.microsoft.com/office/a79873f2-396b-46dc-b852-7fe5947ab640; 11-11-én javítva).',
    javitas: 'Copilot in Outlook: select the Copilot button in the upper part of the Outlook window (the chat needs a work or school account); to summarize a thread, select the Summary by Copilot box at the top of it (it may say Summarize); on iOS and Android, open the thread and tap the Copilot icon in the toolbar (support.microsoft.com/en-us/copilot-outlook). Never describe a four-pane or four-square Copilot icon.',
    szovegben: /Copilot/,
    nyelvek: {
      en: { mind: [], egyik: [/Copilot[^.\n]{0,80}four[- ](?:pane|square|panel|tile)[^.\n]{0,30}icon/iu, /four[- ](?:pane|square|panel|tile)[^.\n]{0,30}icon[^.\n]{0,60}Copilot/iu], nem: [/Windows (?:logo|icon|key|button)/iu] },
      hu: { mind: [], egyik: [/Copilot[^.\n]{0,80}(?:négymezős|négyablakos|négynégyzetes|négy(?:\s|-)(?:mezős|ablakos|négyzetes|paneles))[^.\n]{0,20}ikon/iu], nem: [/Windows[- ](?:logó|ikon|billentyű|gomb)/iu] },
      es: { mind: [], egyik: [/Copilot[^.\n]{0,80}icono[^.\n]{0,30}de cuatro (?:paneles|cuadrados|cuadros|ventanas)/iu], nem: [/(?:logotipo|icono|tecla|botón) de Windows/iu] }
    }
  },
  {
    id: 'qwen-chat-konzol-widget',
    leiras: 'Qwen: „az Alibaba Cloud konzolban keresd a Qwen Chat szolgáltatást, hozz létre bot-projektet, és tedd ki widgetként a webshopodra” — a Qwen Chat a fogyasztói csevegő (chat.qwen.ai); saját Qwen-alapú asszisztenst az Alibaba Cloud Model Studióban lehet építeni (agent application → Publish), „Qwen Chat” konzol-szolgáltatás és kész webshop-widget nincs (help.aliyun.com/en/model-studio/single-agent-application; 11-11-én az útmutató 301-gyel levéve).',
    javitas: 'Qwen Chat is the consumer chat app at chat.qwen.ai. A custom Qwen-based assistant is built in Alibaba Cloud Model Studio (agent applications, then Publish) — there is no "Qwen Chat" service in the Alibaba Cloud console and no ready-made Qwen Chat widget for online shops, so never write setup steps for one.',
    szovegben: /Qwen/,
    nyelvek: {
      en: { mind: [], egyik: [/console[^.\n]{0,80}["“]?Qwen Chat/iu, /Qwen Chat[^.\n]{0,40}(?:widget|service page)/iu, /widget[^.\n]{0,40}Qwen Chat/iu], nem: [/\b(?:no|not|never|isn['’]t|cannot|can['’]t)\b/iu] },
      hu: { mind: [], egyik: [/konzol[^.\n]{0,80}[„"“]?Qwen Chat/iu, /Qwen Chat[^.\n]{0,40}(?:widget|szolgáltatási oldal|szolgáltatásoldal)/iu], nem: [/\b(?:nem|nincs|sosem)\b/iu] },
      es: { mind: [], egyik: [/consola[^.\n]{0,80}[«"“]?Qwen Chat/iu, /(?:página del servicio|widget de)[^.\n]{0,20}Qwen Chat/iu], nem: [/\b(?:no|nunca)\b/iu] }
    }
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
// LEJÁRAT (2026-11-08): egy cáfolat csak addig igaz, amíg a termék él. A `lejar` napjától (YYYY-MM-DD, UTC) a szabály
// nem fut — a GPT Store 2026-12-11-én tényleg megszűnik, onnan a „bezárt” mondat helyes. `ma` a teszthez adható meg.
export const maiNap = () => new Date().toISOString().slice(0, 10);
export const ervenyes = (t, ma = maiNap()) => !t.lejar || ma < t.lejar;

export function tevedesekASzovegben(szoveg, nyelv, ma = maiNap()) {
  const nyelvek = NYELVEK.includes(nyelv) ? [nyelv] : NYELVEK;
  const teljes = String(szoveg || '');
  const szabalyok = TEVEDESEK.filter(t => ervenyes(t, ma) && (!t.szovegben || t.szovegben.test(teljes)));
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
// a GPT Store 2026-12-11-én megszűnik (help.openai.com/en/articles/20001519) → onnan a „ne állítsd, hogy van” lecke helyes
const ELO_TERMEK_LEJAR = { 'GPT Store': '2026-12-11' };
const eloTermek = (ma = maiNap()) => alak(ELO_TERMEKEK.filter(n => !ELO_TERMEK_LEJAR[n] || ma < ELO_TERMEK_LEJAR[n]), false);

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

export function tevesLecke(szoveg, ma = maiNap()) {
  const s = String(szoveg || '');
  if (!s.trim()) return false;
  // CSAK a kitalált-NÉV szabályoknál ('*': Mistral Chat, NVIDIA Chat, Apple Intelligence+, iOS 19) — a „Le Chat was
  // discontinued — do not use it” lecke maga a tévedés, az nem mentesülhet.
  const talalat = tevedesekASzovegben(s, undefined, ma).filter(x => !(NEV_SZABALY.has(x.id) && FIGYELMEZTETES.test(x.mondat)));
  return talalat.length > 0 || (TILTO_LECKE.test(s) && eloTermek(ma).test(s));
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

export default { TEVEDESEK, NYELVEK, ELO_TERMEKEK, mondatokra, tevedesekASzovegben, tevesLecke, ujTevedesek, tevedesJelzes, ervenyes, maiNap };
