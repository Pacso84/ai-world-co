// 🧰 INGYENES ESZKÖZÖK — a felület szövegei 3 nyelven (2026-10-21). A logika: core/ingyenes-eszkozok.js.
// A „[szögletes]” rész a kitöltendő hely — ugyanúgy, mint a Prompt-tárban. A mintaszövegek adatai
// kitaláltak: example.com (RFC 2606), 4111… a kártyakibocsátók nyilvános tesztszáma.

const GOALS = {
  en: [
    { id: 'email', label: '✉️ Write an email', desc: 'Complaint, request, cancellation', feladat: 'Write an email to [who] about [what you want].', formatum: 'an email with a subject line', hangnem: 'polite and formal' },
    { id: 'summary', label: '📝 Summarize something', desc: 'Long email, article, document', feladat: 'Summarize this text: [paste the text]', formatum: 'a bulleted list', hossz: 'short (under 100 words)' },
    { id: 'explain', label: '💡 Explain simply', desc: 'A term, a bill, a letter', feladat: 'Explain [topic] in simple words.', kinek: 'someone hearing about it for the first time', hossz: 'short (under 100 words)' },
    { id: 'plan', label: '🗓️ Make a plan', desc: 'Trip, week, project', feladat: 'Make a plan for [goal] over [time period].', formatum: 'step-by-step instructions' },
    { id: 'ideas', label: '✨ Brainstorm ideas', desc: 'Gifts, names, dinners', feladat: 'Give me 10 ideas for [topic].', formatum: 'a bulleted list' },
    { id: 'fix', label: '✏️ Fix my text', desc: 'Spelling, tone, clarity', feladat: 'Fix the spelling and grammar and make it read more smoothly, but keep the meaning: [paste your text]', formatum: 'the corrected text, then a short list of changes' }
  ],
  hu: [
    { id: 'email', label: '✉️ E-mail megírása', desc: 'Panasz, kérés, lemondás', feladat: 'Írj egy e-mailt [kinek] arról, hogy [mit szeretnél].', formatum: 'e-mail tárgysorral', hangnem: 'udvarias, hivatalos' },
    { id: 'summary', label: '📝 Összefoglalás', desc: 'Hosszú levél, cikk, irat', feladat: 'Foglald össze ezt a szöveget: [illeszd be a szöveget]', formatum: 'pontokba szedve', hossz: 'rövid (100 szó alatt)' },
    { id: 'explain', label: '💡 Egyszerű magyarázat', desc: 'Fogalom, számla, levél', feladat: 'Magyarázd el egyszerű szavakkal, mi az a [téma].', kinek: 'valaki, aki most hall róla először', hossz: 'rövid (100 szó alatt)' },
    { id: 'plan', label: '🗓️ Terv készítése', desc: 'Utazás, hét, projekt', feladat: 'Készíts tervet erre: [cél], [időszak] alatt.', formatum: 'lépésről lépésre' },
    { id: 'ideas', label: '✨ Ötletelés', desc: 'Ajándék, név, vacsora', feladat: 'Adj 10 ötletet erre: [téma].', formatum: 'pontokba szedve' },
    { id: 'fix', label: '✏️ Szövegjavítás', desc: 'Helyesírás, hangnem, érthetőség', feladat: 'Javítsd ki a helyesírást és a nyelvtant, és tedd gördülékenyebbé a szöveget, de a jelentése maradjon ugyanaz: [illeszd be a szöveged]', formatum: 'a javított szöveg, alatta a változások rövid listája' }
  ],
  es: [
    { id: 'email', label: '✉️ Escribir un correo', desc: 'Queja, petición, baja', feladat: 'Escribe un correo a [quién] sobre [lo que quieres].', formatum: 'un correo con línea de asunto', hangnem: 'educado y formal' },
    { id: 'summary', label: '📝 Resumir algo', desc: 'Correo largo, artículo, documento', feladat: 'Resume este texto: [pega el texto]', formatum: 'una lista con viñetas', hossz: 'corto (menos de 100 palabras)' },
    { id: 'explain', label: '💡 Explicar fácil', desc: 'Un término, una factura, una carta', feladat: 'Explica [tema] con palabras sencillas.', kinek: 'alguien que oye hablar de ello por primera vez', hossz: 'corto (menos de 100 palabras)' },
    { id: 'plan', label: '🗓️ Hacer un plan', desc: 'Viaje, semana, proyecto', feladat: 'Haz un plan para [objetivo] en [periodo de tiempo].', formatum: 'instrucciones paso a paso' },
    { id: 'ideas', label: '✨ Lluvia de ideas', desc: 'Regalos, nombres, cenas', feladat: 'Dame 10 ideas para [tema].', formatum: 'una lista con viñetas' },
    { id: 'fix', label: '✏️ Corregir mi texto', desc: 'Ortografía, tono, claridad', feladat: 'Corrige la ortografía y la gramática y haz que se lea con más fluidez, sin cambiar el significado: [pega tu texto]', formatum: 'el texto corregido y debajo una lista breve de cambios' }
  ]
};

export const ESZKOZ_SZ = {
  en: {
    beta: 'Beta · still being improved', betaTip: 'We are adding more kinds of personal details. If something is missed, add it by hand.',
    vissza: 'Back to the Prompt Library', promptokH: 'Ready-made prompts',
    nav: 'Free tools', local: 'Runs in your browser · nothing is uploaded', open: 'Open the tool',
    labels: { email: 'EMAIL', telefon: 'PHONE', kartya: 'CARD', iban: 'IBAN', szamla: 'ACCOUNT', azonosito: 'ID NUMBER', szuletes: 'BIRTH DATE', cim: 'ADDRESS', nev: 'NAME', sajat: 'HIDDEN', rendszam: 'PLATE', ip: 'IP ADDRESS', link: 'PRIVATE LINK' },
    sp: {
      lepesek: ['Paste your text', 'The AI sees only markers', 'Get your details back'], stamp: '{n} details hidden', stampNone: 'Nothing hidden yet',
      demo: { sorok: [['Hi ', 'nev', ','], ['Call me: ', 'telefon', ''], ['Email: ', 'email', '']], ertek: { nev: 'Anna Kovacs', telefon: '+1 212 555 0123', email: 'anna@example.com' } },
      name: 'Safe Paste', emoji: '🛡️', h1: 'Hide personal details before you paste text into AI',
      lead: 'Paste an email, a letter or a message. Names, phone numbers, emails, card numbers and addresses are swapped for neutral markers, so the AI never sees them. When the answer comes back, put your real details back in one click.',
      meta: 'Free tool: hide names, emails, phone and card numbers before you paste text into ChatGPT, Gemini or Claude, then put them back in the answer. Runs in your browser.',
      card: 'Hide names, emails, phone and card numbers before you paste into ChatGPT, then put them back in the answer.',
      s1: 'Paste your text', s1ph: 'Paste an email, a letter or any text here…', example: 'Try an example', clear: 'Clear',
      custom: 'Also hide these words', customPh: 'A company, a street, a nickname… separate with commas',
      javaslatH: 'Maybe a name?', javaslatTip: 'Tap to hide it too', found: 'Hidden', unhide: 'Tap a detail to show it again', shown: 'Shown', none: 'Nothing found yet. Read the text yourself too.',
      s2: 'What the AI will see', empty2: 'Your safe text appears here.', copy: 'Copy safe text', copied: 'Copied ✓',
      warn: 'Read it before you paste. The tool can miss things, like unusual names or details written in words.',
      s3: 'Put your details back', s3lead: 'Paste the AI’s answer. Every [NAME 1]-style marker turns back into your real detail, right here on your device.',
      s3ph: 'Paste the AI’s answer here…', restore: 'Put my details back', restored: '{n} details put back', copyRes: 'Copy answer',
      priv: 'Nothing leaves your browser. We don’t save, upload or log your text, and closing the page forgets everything.',
      sample: 'Hi Anna Kovacs,\n\nThanks for your order. We will call you at +1 212 555 0123 or email anna.kovacs@example.com.\nCard on file: 4111 1111 1111 1111. Delivery: 742 Maple Street.\n\nBest regards,\nDavid Miller'
    },
    pb: {
      chatH: 'How the AI will get it', ero: 'Prompt strength', eroSzint: ['empty', 'weak', 'fair', 'good', 'great'], te: 'You', hianyzik: 'Make it stronger:',
      name: 'Prompt Builder', emoji: '🧩', h1: 'Build a clear prompt in a minute',
      lead: 'Answer a few short questions and we turn them into a prompt that tells the AI exactly what you need. Then copy it into ChatGPT, Gemini, Claude or any assistant.',
      meta: 'Free prompt builder: answer a few questions and get a clear, ready-to-copy prompt for ChatGPT, Gemini or Claude. Learn what makes a good prompt as you go.',
      card: 'Answer a few questions and get a clear, ready-to-copy prompt for ChatGPT, Gemini or Claude.',
      goalsH: 'What do you need?', goals: GOALS.en,
      feladat: 'What should the AI do?', feladatPh: 'Write a short email to my landlord about the broken heater.',
      hatter: 'Background', hatterPh: 'Who are you, what happened, what matters? I’ve lived here 3 years and always pay on time.',
      kinek: 'Who is it for?', kinekPh: 'My landlord, a 10-year-old, my team…',
      hangnem: 'Tone', tones: ['friendly', 'polite and formal', 'simple and clear', 'short and to the point', 'warm and encouraging'],
      formatum: 'Format', formats: ['a bulleted list', 'step-by-step instructions', 'short paragraphs', 'a table', 'an email with a subject line', 'the corrected text, then a short list of changes'],
      hossz: 'Length', lengths: ['short (under 100 words)', 'medium (about 200 words)', 'detailed'],
      any: 'Any', opt: 'optional', kerdezz: 'Ask me questions first if something is missing',
      outH: 'Your prompt', empty: 'Start with what the AI should do. Your prompt builds up here as you type.',
      ingH: 'What your prompt has', ing: { feladat: 'Task', hatter: 'Background', kinek: 'Audience or tone', formatum: 'Format' },
      copy: 'Copy prompt', copied: 'Copied ✓', tipFill: 'Swap the [brackets] for your own details before you send it.',
      pii: 'Your prompt contains personal details: {list}. Hide them before you paste it into AI.', piiBtn: 'Hide them with Safe Paste',
      rows: { hatter: 'Background', kinek: 'Audience', hangnem: 'Tone', formatum: 'Format', kerdezz: 'If anything is unclear or missing, ask me 1–3 questions before you start.' },
      library: 'Prefer ready-made prompts? Browse the Prompt Library'
    }
  },
  hu: {
    beta: 'Béta · fejlesztés alatt', betaTip: 'Folyamatosan bővítjük, milyen adatokat ismer fel. Ha valamit kihagy, add hozzá kézzel.',
    vissza: 'Vissza a Prompt-tárhoz', promptokH: 'Kész promptok',
    nav: 'Ingyenes eszközök', local: 'A böngésződben fut · semmit nem töltünk fel', open: 'Megnyitom',
    labels: { email: 'E-MAIL', telefon: 'TELEFON', kartya: 'KÁRTYA', iban: 'IBAN', szamla: 'SZÁMLASZÁM', azonosito: 'AZONOSÍTÓ', szuletes: 'SZÜLETÉSI DÁTUM', cim: 'CÍM', nev: 'NÉV', sajat: 'REJTETT', rendszam: 'RENDSZÁM', ip: 'IP-CÍM', link: 'PRIVÁT LINK' },
    sp: {
      lepesek: ['Beilleszted a szöveget', 'Az AI csak jeleket lát', 'Visszakapod az adataidat'], stamp: '{n} adat elrejtve', stampNone: 'Még nincs mit elrejteni',
      demo: { sorok: [['Kedves ', 'nev', '!'], ['Hívjon: ', 'telefon', ''], ['E-mail: ', 'email', '']], ertek: { nev: 'Kovács Anna', telefon: '+36 30 123 4567', email: 'anna@example.com' } },
      name: 'Biztonságos bemásolás', emoji: '🛡️', h1: 'Rejtsd el a személyes adataidat, mielőtt az AI-nak adod a szöveget',
      lead: 'Illessz be egy e-mailt, levelet vagy üzenetet. A neveket, telefonszámokat, e-mail-címeket, kártyaszámokat és lakcímeket semleges jelekre cseréljük, így az AI nem látja őket. Amikor megjön a válasz, egy kattintással visszakapod a valódi adatokat.',
      meta: 'Ingyenes eszköz: rejtsd el a neveket, e-mail-címeket, telefon- és kártyaszámokat, mielőtt szöveget másolsz a ChatGPT-be, a Geminibe vagy a Claude-ba, aztán tedd vissza őket a válaszba. A böngésződben fut.',
      card: 'Rejtsd el a neveket, e-mail-címeket, telefon- és kártyaszámokat, mielőtt a ChatGPT-be másolsz, aztán tedd vissza őket a válaszba.',
      s1: 'Illeszd be a szöveget', s1ph: 'Illessz be ide egy e-mailt, levelet vagy bármilyen szöveget…', example: 'Kipróbálom egy példán', clear: 'Törlés',
      custom: 'Ezeket a szavakat is rejtsd el', customPh: 'Cégnév, utca, becenév… vesszővel elválasztva',
      javaslatH: 'Lehet, hogy név?', javaslatTip: 'Koppints rá, ha ezt is elrejtenéd', found: 'Elrejtve', unhide: 'Koppints egy adatra, ha mégis látszódjon', shown: 'Látható marad', none: 'Még nincs találat. Olvasd át te is a szöveget.',
      s2: 'Ezt látja az AI', empty2: 'Ide kerül a biztonságos szöveg.', copy: 'Biztonságos szöveg másolása', copied: 'Kimásolva ✓',
      warn: 'Bemásolás előtt olvasd át. A gép kihagyhat valamit, például szokatlan nevet vagy betűvel kiírt adatot.',
      s3: 'Tedd vissza az adataidat', s3lead: 'Illeszd be az AI válaszát. Minden [NÉV 1]-féle jel visszaváltozik a valódi adatodra, itt helyben, a gépeden.',
      s3ph: 'Illeszd be ide az AI válaszát…', restore: 'Visszateszem az adataimat', restored: '{n} adat visszatéve', copyRes: 'Válasz másolása',
      priv: 'Semmi nem hagyja el a böngésződet. A szöveget nem mentjük, nem töltjük fel és nem naplózzuk; ha bezárod az oldalt, minden elvész.',
      sample: 'Kedves Kovács Anna!\n\nKöszönjük a rendelését. Hívjuk a +36 30 123 4567 számon, vagy írunk az anna.kovacs@example.com címre.\nA kártyája: 4111 1111 1111 1111. Szállítási cím: Petőfi Sándor utca 12.\n\nÜdvözlettel:\nNagy Péter'
    },
    pb: {
      chatH: 'Így kapja meg az AI', ero: 'Prompt-erő', eroSzint: ['üres', 'gyenge', 'közepes', 'jó', 'kiváló'], te: 'Te', hianyzik: 'Tedd erősebbé:',
      name: 'Promptépítő', emoji: '🧩', h1: 'Rakj össze egy világos promptot egy perc alatt',
      lead: 'Válaszolj néhány rövid kérdésre, és mi olyan prompttá alakítjuk, amely pontosan elmondja az AI-nak, mire van szükséged. Utána másold be a ChatGPT-be, a Geminibe, a Claude-ba vagy bármelyik asszisztensbe.',
      meta: 'Ingyenes promptépítő: válaszolj néhány kérdésre, és kapsz egy világos, bemásolható promptot a ChatGPT-hez, a Geminihez vagy a Claude-hoz. Közben megtanulod, mitől jó egy prompt.',
      card: 'Válaszolj néhány kérdésre, és kapsz egy világos, bemásolható promptot a ChatGPT-hez, a Geminihez vagy a Claude-hoz.',
      goalsH: 'Miben segítsen az AI?', goals: GOALS.hu,
      feladat: 'Mit csináljon az AI?', feladatPh: 'Írj egy rövid e-mailt a főbérlőmnek az elromlott fűtésről.',
      hatter: 'Háttér', hatterPh: 'Ki vagy, mi történt, mi a fontos? 3 éve lakom itt, és mindig időben fizetek.',
      kinek: 'Kinek szól?', kinekPh: 'A főbérlőmnek, egy 10 évesnek, a csapatomnak…',
      hangnem: 'Hangnem', tones: ['barátságos', 'udvarias, hivatalos', 'egyszerű, közérthető', 'rövid, lényegre törő', 'kedves, bátorító'],
      formatum: 'Formátum', formats: ['pontokba szedve', 'lépésről lépésre', 'rövid bekezdések', 'táblázat', 'e-mail tárgysorral', 'a javított szöveg, alatta a változások rövid listája'],
      hossz: 'Hossz', lengths: ['rövid (100 szó alatt)', 'közepes (kb. 200 szó)', 'részletes'],
      any: 'Mindegy', opt: 'nem kötelező', kerdezz: 'Kérdezzen vissza, ha hiányzik valami',
      outH: 'A promptod', empty: 'Kezdd azzal, mit csináljon az AI. A promptod itt épül fel, ahogy gépelsz.',
      ingH: 'Ami már benne van', ing: { feladat: 'Feladat', hatter: 'Háttér', kinek: 'Kinek / hangnem', formatum: 'Formátum' },
      copy: 'Prompt másolása', copied: 'Kimásolva ✓', tipFill: 'Küldés előtt cseréld ki a [szögletes] részeket a saját adataidra.',
      pii: 'A promptodban személyes adat van: {list}. Rejtsd el, mielőtt az AI-nak adod.', piiBtn: 'Elrejtem a Biztonságos bemásolással',
      rows: { hatter: 'Háttér', kinek: 'Kinek szól', hangnem: 'Hangnem', formatum: 'Formátum', kerdezz: 'Ha valami nem egyértelmű vagy hiányzik, mielőtt nekikezdesz, tegyél fel nekem 1–3 kérdést.' },
      library: 'Inkább kész promptot keresel? Nézd meg a Prompt-tárat'
    }
  },
  es: {
    beta: 'Beta · en desarrollo', betaTip: 'Seguimos ampliando los tipos de datos que reconoce. Si se le escapa algo, añádelo a mano.',
    vissza: 'Volver a la Biblioteca de prompts', promptokH: 'Prompts listos',
    nav: 'Herramientas gratis', local: 'Funciona en tu navegador · no se sube nada', open: 'Abrir la herramienta',
    labels: { email: 'CORREO', telefon: 'TELÉFONO', kartya: 'TARJETA', iban: 'IBAN', szamla: 'CUENTA', azonosito: 'DOCUMENTO', szuletes: 'FECHA DE NACIMIENTO', cim: 'DIRECCIÓN', nev: 'NOMBRE', sajat: 'OCULTO', rendszam: 'MATRÍCULA', ip: 'DIRECCIÓN IP', link: 'ENLACE PRIVADO' },
    sp: {
      lepesek: ['Pegas tu texto', 'La IA solo ve marcas', 'Recuperas tus datos'], stamp: '{n} datos ocultos', stampNone: 'Aún no hay nada oculto',
      demo: { sorok: [['Hola, ', 'nev', ':'], ['Llámame: ', 'telefon', ''], ['Correo: ', 'email', '']], ertek: { nev: 'María López', telefon: '+34 600 000 000', email: 'maria@example.com' } },
      name: 'Pegado seguro', emoji: '🛡️', h1: 'Oculta tus datos personales antes de pegar un texto en la IA',
      lead: 'Pega un correo, una carta o un mensaje. Cambiamos nombres, teléfonos, correos, números de tarjeta y direcciones por marcas neutras, así la IA no los ve. Cuando llegue la respuesta, recupera tus datos reales con un clic.',
      meta: 'Herramienta gratis: oculta nombres, correos, teléfonos y números de tarjeta antes de pegar un texto en ChatGPT, Gemini o Claude, y luego devuélvelos a la respuesta. Funciona en tu navegador.',
      card: 'Oculta nombres, correos, teléfonos y tarjetas antes de pegar en ChatGPT, y devuélvelos luego a la respuesta.',
      s1: 'Pega tu texto', s1ph: 'Pega aquí un correo, una carta o cualquier texto…', example: 'Probar con un ejemplo', clear: 'Borrar',
      custom: 'Oculta también estas palabras', customPh: 'Una empresa, una calle, un apodo… separados por comas',
      javaslatH: '¿Quizá un nombre?', javaslatTip: 'Toca para ocultarlo también', found: 'Ocultos', unhide: 'Toca un dato para volver a mostrarlo', shown: 'Visible', none: 'Aún no hay nada. Revisa tú también el texto.',
      s2: 'Lo que verá la IA', empty2: 'Aquí aparece tu texto seguro.', copy: 'Copiar texto seguro', copied: 'Copiado ✓',
      warn: 'Léelo antes de pegarlo. La herramienta puede pasar algo por alto, como nombres poco comunes o datos escritos con letras.',
      s3: 'Devuelve tus datos', s3lead: 'Pega la respuesta de la IA. Cada marca tipo [NOMBRE 1] vuelve a ser tu dato real, aquí mismo, en tu dispositivo.',
      s3ph: 'Pega aquí la respuesta de la IA…', restore: 'Devolver mis datos', restored: '{n} datos devueltos', copyRes: 'Copiar respuesta',
      priv: 'Nada sale de tu navegador. No guardamos, subimos ni registramos tu texto; al cerrar la página se olvida todo.',
      sample: 'Hola, María López:\n\nGracias por tu pedido. Te llamaremos al +34 600 000 000 o te escribiremos a maria.lopez@example.com.\nTu tarjeta: 4111 1111 1111 1111. Dirección de entrega: Calle Mayor 12.\n\nUn saludo,\nJuan García'
    },
    pb: {
      chatH: 'Así lo recibe la IA', ero: 'Fuerza del prompt', eroSzint: ['vacío', 'débil', 'regular', 'bueno', 'excelente'], te: 'Tú', hianyzik: 'Hazlo más fuerte:',
      name: 'Creador de prompts', emoji: '🧩', h1: 'Crea un prompt claro en un minuto',
      lead: 'Responde unas preguntas cortas y las convertimos en un prompt que le dice a la IA exactamente lo que necesitas. Luego cópialo en ChatGPT, Gemini, Claude o cualquier asistente.',
      meta: 'Creador de prompts gratis: responde unas preguntas y obtén un prompt claro y listo para copiar en ChatGPT, Gemini o Claude. Aprende de paso qué hace bueno a un prompt.',
      card: 'Responde unas preguntas y obtén un prompt claro y listo para copiar en ChatGPT, Gemini o Claude.',
      goalsH: '¿Qué necesitas?', goals: GOALS.es,
      feladat: '¿Qué debe hacer la IA?', feladatPh: 'Escribe un correo breve a mi casero sobre la calefacción averiada.',
      hatter: 'Contexto', hatterPh: '¿Quién eres, qué pasó, qué importa? Vivo aquí desde hace 3 años y siempre pago a tiempo.',
      kinek: '¿Para quién es?', kinekPh: 'Mi casero, un niño de 10 años, mi equipo…',
      hangnem: 'Tono', tones: ['cercano', 'educado y formal', 'sencillo y claro', 'breve y directo', 'cálido y alentador'],
      formatum: 'Formato', formats: ['una lista con viñetas', 'instrucciones paso a paso', 'párrafos cortos', 'una tabla', 'un correo con línea de asunto', 'el texto corregido y debajo una lista breve de cambios'],
      hossz: 'Extensión', lengths: ['corto (menos de 100 palabras)', 'medio (unas 200 palabras)', 'detallado'],
      any: 'Cualquiera', opt: 'opcional', kerdezz: 'Que me pregunte si falta algo',
      outH: 'Tu prompt', empty: 'Empieza por lo que debe hacer la IA. Tu prompt se va formando aquí mientras escribes.',
      ingH: 'Lo que ya tiene tu prompt', ing: { feladat: 'Tarea', hatter: 'Contexto', kinek: 'Público o tono', formatum: 'Formato' },
      copy: 'Copiar prompt', copied: 'Copiado ✓', tipFill: 'Antes de enviarlo, cambia los [corchetes] por tus propios datos.',
      pii: 'Tu prompt contiene datos personales: {list}. Ocúltalos antes de pegarlo en la IA.', piiBtn: 'Ocultarlos con Pegado seguro',
      rows: { hatter: 'Contexto', kinek: 'Público', hangnem: 'Tono', formatum: 'Formato', kerdezz: 'Si algo no está claro o falta, hazme de 1 a 3 preguntas antes de empezar.' },
      library: '¿Prefieres prompts ya hechos? Mira la Biblioteca de prompts'
    }
  }
};

/** A megjelenítés nyelvének szövegei (ismeretlen nyelvre angol). */
export const eszkozSzoveg = nyelv => ESZKOZ_SZ[nyelv] || ESZKOZ_SZ.en;
