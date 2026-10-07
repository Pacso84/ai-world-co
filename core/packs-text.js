// ===================================================================
// A CSOMAG-OLDAL SZÖVEGEI — /packs (2026-09-20; 10-07 óta INGYENES letöltés)
//
// MIÉRT KÜLÖN FÁJLBAN, NEM A build.js UI-TÁBLÁJÁBAN:
// ugyanaz az indok, amiért a téma-nevek a `core/topics.js`-ben laknak, a
// BESOROLÁS mellett: a csomag szövege és a csomag adata együtt mozduljon.
// A `core/packs-data.js` adja a MÉRT számokat (oldal, útmutató), ez a fájl
// az ember írta szöveget. A kettő azonosítója ugyanaz (`id`).
//
// ⚠️ KÉT TÚLÍGÉRÉST MÁR KIVÁGTUNK EBBŐL A TERMÉKBŐL (2026-09-19/20), és a
// `core/packs-page.test.js` őrzi, hogy ne szivárogjanak vissza:
//   1. „reviewed for accuracy and clarity" — NINCS ilyen emberi átnézés.
//   2. „no ads and no cookie banner" — az INGYENES honlapon sincs egyik sem,
//      tehát fizetős előnyként eladni félrevezetés.
// Ha új mondatot írsz ide, a próba az: IGAZ-E AKKOR IS, HA A VEVŐ UTÁNANÉZ?
//
// ⚠️ A MAGYAR OLDALRÓL: a csomagok ANGOLUL és SPANYOLUL léteznek, magyarul
// nem. A magyar oldal ezért magyarul írja le, MI van bennük (hogy érthető
// legyen), és kimondja, hogy a fájl maga angol vagy spanyol. A `packsLangs`
// kulcs ezt viszi, és a teszt megköveteli, hogy a magyar változat eltérjen.
// ===================================================================

/** A 9 bolti tétel neve és egymondatos ígérete, nyelvenként. */
export const CSOMAG_SZOVEG = {
  work: {
    en: { cim: 'Work and Email: The AI Pack',
          igeret: 'Email replies, meeting notes, resumes, and interview practice, step by step.' },
    hu: { cim: 'Munka és email — az AI-csomag',
          igeret: 'Email-válaszok, jegyzőkönyvek, önéletrajz és állásinterjú-gyakorlás, lépésről lépésre.' },
    es: { cim: 'Trabajo y correo: el pack de IA',
          igeret: 'Correos, notas de reuniones, currículums y práctica de entrevistas, paso a paso.' }
  },
  home: {
    en: { cim: 'Home and Family: The AI Pack',
          igeret: 'Meals, trips, birthdays, and the family admin that eats your weekends.' },
    hu: { cim: 'Otthon és család — az AI-csomag',
          igeret: 'Étkezés, utazás, szülinapok és az a családi ügyintézés, ami elviszi a hétvégédet.' },
    es: { cim: 'Hogar y familia: el pack de IA',
          igeret: 'Comidas, viajes, cumpleaños y la gestión familiar que se come tus fines de semana.' }
  },
  learn: {
    en: { cim: 'First Steps with AI: The Beginner Pack',
          igeret: 'Your first hour with AI, and how to study with it after.' },
    hu: { cim: 'Első lépések az AI-jal — kezdő csomag',
          igeret: 'Az első órád az AI-jal, és hogyan tanulj vele utána.' },
    es: { cim: 'Primeros pasos con la IA: el pack para principiantes',
          igeret: 'Tu primera hora con la IA, y cómo estudiar con ella después.' }
  },
  create: {
    en: { cim: 'Photos and Images: The AI Pack',
          igeret: 'Make your first AI image, then fix the photos you already have.' },
    hu: { cim: 'Fotók és képek — az AI-csomag',
          igeret: 'Készítsd el az első AI-képedet, aztán hozd rendbe a meglévő fotóidat.' },
    es: { cim: 'Fotos e imágenes: el pack de IA',
          igeret: 'Crea tu primera imagen con IA y arregla las fotos que ya tienes.' }
  },
  explain: {
    en: { cim: 'Understand Anything: The AI Pack',
          igeret: 'Turn long documents, jargon, and viral claims into plain English.' },
    hu: { cim: 'Érts meg bármit — az AI-csomag',
          igeret: 'Hosszú iratok, szakzsargon és vírusként terjedő állítások — közérthetően.' },
    es: { cim: 'Entiende cualquier cosa: el pack de IA',
          igeret: 'Convierte documentos largos, jerga y afirmaciones virales en lenguaje claro.' }
  },
  automate: {
    en: { cim: 'Set It Up Once: The AI Automation Pack',
          igeret: 'Set an AI up once so it handles the thing you repeat weekly.' },
    hu: { cim: 'Állítsd be egyszer — AI-automatizálás',
          igeret: 'Állíts be egy AI-t egyszer, és intézze azt, amit hetente újra megcsinálsz.' },
    es: { cim: 'Configúralo una vez: el pack de automatización con IA',
          igeret: 'Configura una IA una sola vez para que se encargue de lo que repites cada semana.' }
  },
  safe: {
    en: { cim: 'Scams, Deepfakes and Privacy: The AI Safety Pack',
          igeret: 'Spot AI scams and deepfakes, and control what AI keeps about you.' },
    hu: { cim: 'Átverések, deepfake és adatvédelem — AI-biztonsági csomag',
          igeret: 'Ismerd fel az AI-s átveréseket és a deepfake-et, és szabd meg, mit tart rólad az AI.' },
    es: { cim: 'Estafas, deepfakes y privacidad: el pack de seguridad frente a la IA',
          igeret: 'Detecta estafas y deepfakes creados con IA, y controla lo que la IA guarda sobre ti.' }
  },
  money: {
    en: { cim: 'Money and Paperwork: The AI Pack',
          igeret: 'Budgets, confusing bills, contracts, and the money talks you dread.' },
    hu: { cim: 'Pénz és papírmunka — az AI-csomag',
          igeret: 'Költségvetés, érthetetlen számlák, szerződések és a pénzügyi beszélgetések, amiktől tartasz.' },
    es: { cim: 'Dinero y papeleo: el pack de IA',
          igeret: 'Presupuestos, facturas confusas, contratos y las conversaciones de dinero que evitas.' }
  },
  all: {
    en: { cim: 'The Complete Everyday AI Collection',
          igeret: 'All eight packs in one file: every subject, one download.' },
    hu: { cim: 'A teljes hétköznapi AI-gyűjtemény',
          igeret: 'Mind a nyolc csomag egyetlen fájlban: minden téma, egy letöltés.' },
    es: { cim: 'La colección completa de IA para el día a día',
          igeret: 'Los ocho packs en un solo archivo: todos los temas, una descarga.' }
  }
};

/**
 * Egy csomag szövege a kért nyelven; ha hiányzik, az angol.
 * ⚠️ A néma angolra esés a `tr()` ismert csapdája — itt SZÁNDÉKOS tartalék,
 * de a teszt megköveteli, hogy mind a 9 × 3 valóban ki legyen töltve.
 */
export function csomagSzoveg(id, nyelv) {
  const s = CSOMAG_SZOVEG[id];
  if (!s) return null;
  return s[nyelv] || s.en;
}

/**
 * Az oldal keretszövegei — a build.js UI-táblájába olvadnak be.
 *
 * 🆓 INGYENES KIADÁS (2026-10-07, user: „tegyük fel a könyveinket ingyen").
 * A bolt 10-01-én megszűnt; a PDF-ek a honlapról tölthetők le, CC BY-NC 4.0
 * licenccel. A cél a LINK: aki átveszi, forrást jelöl. A fizetős korszak
 * mondatai (Ko-fi, PayPal, „nincs visszatérítés", „miért fizessek") kikerültek
 * — a `core/packs-page.test.js` őrzi, hogy ne jöjjenek vissza.
 */
export const PACKS_UI = {
  en: {
    packsNav: 'Free PDFs',
    packsPill: 'Free downloads',
    packsTitle: 'Our guides as <em>free PDF packs</em>',
    packsLead: 'We publish step-by-step guides for using AI in ordinary life: writing the awkward email, planning a week of dinners, checking whether that text message is a scam. All of them are free to read here. The packs are those same guides, selected, ordered and put into one PDF you can download free, print and share.',
    packsUnitGuides: 'guides',
    packsUnitPages: 'pages',
    packsBuy: 'Download the free PDF',
    packsShopAll: 'See all packs',
    packsSoon: 'Coming soon',
    packsLangs: 'The packs are available in English and Spanish.',
    packsFreePrice: 'Free',

    packsBuildH: 'How a guide is built',
    packsBuildP: 'Every guide follows the same shape, because that is the shape that works when you are stuck. It opens with what you need before you start: which account, which app, how long it will take. Then numbered steps, each one telling you what to look for and how to know it worked. Then the mistakes people actually make. Then a short, honest close about what this changes, and what it does not. Most guides include an example prompt you can copy. Most guides say in that first box whether you need a free or a paid plan, not in step four.',

    packsAiH: 'Written by AI, and labeled that way',
    packsAiP: 'This whole site is written by AI. The guides, the news articles and most of the pictures are generated, and the support chat is an AI too. Automated quality gates check every piece before it goes out, and no human editor reads the text. A human owner runs the system, reads the feedback and keeps tightening the rules. We say this on every article and on every pack, because you should be able to decide what that is worth to you.',

    packsFaqH: 'Questions',
    packsQ1: 'What do I get, exactly?',
    packsA1: 'A PDF. A subject pack collects the guides on one theme — each card above shows exactly how many. The complete collection holds all eight packs in a single file with a clickable table of contents. No subscription, no app, no sign-up.',
    packsQ2: 'How do I get it?',
    packsA2: 'Click the download button. The PDF opens straight away — no account, no email address, no payment. The file is yours to keep, print and read offline.',
    packsQ3: 'Can I share it?',
    packsA3: 'Yes. The packs are licensed under Creative Commons Attribution-NonCommercial 4.0 (CC BY-NC 4.0): copy, print and share them with your class, your library or your team, as long as you credit AI World HQ with a link to aiworldhq.com and do not sell them. Questions? Email support@aiworldhq.com.',
    packsQ4: 'Why a PDF, if the guides are free on the site anyway?',
    packsA4: 'For the reading order and for offline use. Everything in the packs is on this site, free, and will stay there. The PDF puts one subject into one searchable file you can read on a plane, on a phone with no signal, or printed on paper. If you prefer reading here, that is completely fine.',
    packsQ5: 'Who wrote these?',
    packsA5: 'AI agents did, start to finish. They pass automated fact and quality checks before publication, but no human editor reviews the text. That is the deal, stated up front, on the site and inside the files.',

    packsMetaTitle: 'Free AI guide PDFs',
    packsMetaDesc: 'Our step-by-step AI guides, grouped by subject into free PDFs you can download, print and share. No sign-up.',
    packsFromSupport: 'Prefer it offline? Our guides are also free as PDF packs.',
    packsFromSupportLink: 'See the packs',
    packsFootPre: 'Prefer it in one file?',
    packsFootLink: 'Get this subject as a free PDF',
    packsFootMore: '{name} ({n} guides, free printable PDF)'
  },

  hu: {
    packsNav: 'Ingyenes PDF-ek',
    packsPill: 'Ingyenes letöltés',
    packsTitle: 'Az útmutatóink <em>ingyenes PDF-csomagokban</em>',
    packsLead: 'Lépésről lépésre szóló útmutatókat írunk arról, hogyan használd az AI-t a hétköznapokban: hogyan írd meg a kellemetlen emailt, hogyan tervezz egy hét vacsorát, hogyan derítsd ki, átverés-e az az SMS. Mind ingyen olvasható itt. A csomagok ugyanezek az útmutatók: kiválogatva, sorba rendezve, egyetlen PDF-ben, amit ingyen letölthetsz, kinyomtathatsz és megoszthatsz.',
    packsUnitGuides: 'útmutató',
    packsUnitPages: 'oldal',
    packsBuy: 'Ingyenes PDF letöltése',
    packsShopAll: 'Az összes csomag',
    packsSoon: 'Hamarosan',
    packsLangs: 'A csomagok angolul és spanyolul érhetők el (magyarul nem).',
    packsFreePrice: 'Ingyenes',

    packsBuildH: 'Hogyan épül fel egy útmutató',
    packsBuildP: 'Minden útmutató ugyanazt az alakot követi, mert ez az az alak, ami akkor segít, amikor elakadtál. Azzal kezdődik, mi kell hozzá: melyik fiók, melyik alkalmazás, mennyi idő. Utána számozott lépések, mindegyik megmondja, mit keress, és miről ismered fel, hogy sikerült. Aztán a hibák, amiket tényleg el szoktak követni. Végül egy rövid, őszinte zárás arról, min változtat ez — és min nem. A legtöbb útmutatóban van egy másolható példa-prompt. A legtöbb útmutató már az első dobozban megmondja, hogy ingyenes vagy fizetős csomag kell-e, nem a negyedik lépésben.',

    packsAiH: 'AI írta, és ezt ki is írjuk',
    packsAiP: 'Ezt az egész oldalt AI írja. Az útmutatók, a hírek és a képek nagy része gépi, és az ügyfélszolgálati csevegő is AI. Automatikus minőség-kapuk minden darabot ellenőriznek a megjelenés előtt, de emberi szerkesztő nem olvassa át a szöveget. Egy ember üzemelteti a rendszert, olvassa a visszajelzéseket, és folyamatosan szigorítja a szabályokat. Ezt minden cikken és minden csomagon kiírjuk, mert neked kell eldöntened, mennyit ér ez így.',

    packsFaqH: 'Kérdések',
    packsQ1: 'Mit kapok pontosan?',
    packsA1: 'Egy PDF-et. Egy téma-csomag egyetlen téma útmutatóit gyűjti össze — hogy pontosan hányat, az ott áll minden kártyán. A teljes gyűjteményben mind a nyolc csomag egyetlen fájlban, kattintható tartalomjegyzékkel. Nincs előfizetés, nincs alkalmazás, nincs regisztráció.',
    packsQ2: 'Hogyan kapom meg?',
    packsA2: 'Kattints a letöltés gombra. A PDF azonnal megnyílik — fiók, email-cím és fizetés nélkül. A fájl a tiéd: megtarthatod, kinyomtathatod, offline is olvashatod.',
    packsQ3: 'Megoszthatom?',
    packsA3: 'Igen. A csomagok Creative Commons Nevezd meg! - Ne add el! 4.0 (CC BY-NC 4.0) licencűek: másolhatod, kinyomtathatod és megoszthatod őket az osztályoddal, a könyvtáraddal vagy a csapatoddal, ha megjelölöd az AI World HQ-t egy aiworldhq.com linkkel, és nem árulod őket. Kérdésed van? Írj a support@aiworldhq.com címre.',
    packsQ4: 'Miért PDF, ha az útmutatók amúgy is ingyen fent vannak?',
    packsA4: 'Az olvasási sorrend és az offline olvasás miatt. Minden, ami a csomagokban van, fent van ezen az oldalon ingyen, és ott is marad. A PDF egy témát egyetlen kereshető fájlba tesz, amit repülőn, térerő nélküli telefonon vagy kinyomtatva is elolvashatsz. Ha inkább itt olvasol, az is teljesen rendben van.',
    packsQ5: 'Ki írta ezeket?',
    packsA5: 'AI-ügynökök, elejétől a végéig. Automatikus tény- és minőség-ellenőrzésen mennek át a megjelenés előtt, de emberi szerkesztő nem nézi át a szöveget. Ez az alku, és előre kimondjuk — az oldalon és a fájlokban is.',

    packsMetaTitle: 'Ingyenes AI-útmutató PDF-ek',
    packsMetaDesc: 'A lépésről lépésre szóló AI-útmutatóink téma szerint csomagolva, ingyen letölthető, nyomtatható és megosztható PDF-ként. Regisztráció nélkül.',
    packsFromSupport: 'Offline olvasnád? Az útmutatóink ingyenes PDF-csomagban is megvannak.',
    packsFromSupportLink: 'Megnézem a csomagokat',
    packsFootPre: 'Egyben is jó lenne?',
    packsFootLink: 'Ez a téma ingyenes PDF-ben',
    packsFootMore: '{name} ({n} útmutató, ingyenes, nyomtatható PDF)'
  },

  es: {
    packsNav: 'PDF gratis',
    packsPill: 'Descargas gratis',
    packsTitle: 'Nuestras guías en <em>packs PDF gratuitos</em>',
    packsLead: 'Publicamos guías paso a paso para usar la IA en la vida diaria: escribir ese correo incómodo, planificar una semana de cenas, comprobar si ese mensaje es una estafa. Todas se pueden leer gratis aquí. Los packs son esas mismas guías: seleccionadas, ordenadas y reunidas en un PDF que puedes descargar gratis, imprimir y compartir.',
    packsUnitGuides: 'guías',
    packsUnitPages: 'páginas',
    packsBuy: 'Descargar el PDF gratis',
    packsShopAll: 'Ver todos los packs',
    packsSoon: 'Muy pronto',
    packsLangs: 'Los packs están disponibles en inglés y español.',
    packsFreePrice: 'Gratis',

    packsBuildH: 'Cómo se construye una guía',
    packsBuildP: 'Todas las guías siguen la misma forma, porque es la que funciona cuando te has atascado. Empiezan por lo que necesitas antes de ponerte a ello: qué cuenta, qué aplicación, cuánto tiempo te llevará. Después, pasos numerados: cada uno te dice qué buscar y cómo saber que ha funcionado. Luego, los errores que la gente comete de verdad. Y al final, un cierre breve y honesto sobre qué cambia esto y qué no. La mayoría incluye un prompt de ejemplo que puedes copiar. La mayoría de las guías indican ya en el primer recuadro si necesitas un plan gratuito o de pago, no en el paso cuatro.',

    packsAiH: 'Escrito por IA, y así lo indicamos',
    packsAiP: 'Todo este sitio lo escribe una IA. Las guías, las noticias y la mayoría de las imágenes se generan, y el chat de soporte también es una IA. Unos controles de calidad automáticos comprueban cada pieza antes de publicarla, y ningún editor humano lee el texto. Una persona gestiona el sistema, lee los comentarios y va ajustando las reglas. Lo decimos en cada artículo y en cada pack, porque eres tú quien debe decidir cuánto vale eso.',

    packsFaqH: 'Preguntas',
    packsQ1: '¿Qué recibo exactamente?',
    packsA1: 'Un PDF. Un pack temático agrupa las guías de un mismo tema; cada tarjeta de arriba dice cuántas. La colección completa reúne los ocho packs en un solo archivo con índice interactivo. Sin suscripción, sin aplicación y sin registro.',
    packsQ2: '¿Cómo lo recibo?',
    packsA2: 'Pulsa el botón de descarga. El PDF se abre al momento: sin cuenta, sin correo y sin pago. El archivo es tuyo: puedes guardarlo, imprimirlo y leerlo sin conexión.',
    packsQ3: '¿Puedo compartirlo?',
    packsA3: 'Sí. Los packs tienen licencia Creative Commons Atribución-NoComercial 4.0 (CC BY-NC 4.0): puedes copiarlos, imprimirlos y compartirlos con tu clase, tu biblioteca o tu equipo, siempre que cites a AI World HQ con un enlace a aiworldhq.com y no los vendas. ¿Dudas? Escribe a support@aiworldhq.com.',
    packsQ4: '¿Por qué un PDF, si las guías ya son gratis en el sitio?',
    packsA4: 'Por el orden de lectura y para leer sin conexión. Todo lo que hay en los packs está en este sitio, gratis, y ahí seguirá. El PDF reúne un tema en un único archivo en el que puedes buscar y que puedes leer en un avión, en un móvil sin cobertura o impreso en papel. Si prefieres leer aquí, no hay ningún problema.',
    packsQ5: '¿Quién ha escrito esto?',
    packsA5: 'Agentes de IA, de principio a fin. Pasan controles automáticos de hechos y de calidad antes de publicarse, pero ningún editor humano revisa el texto. Ese es el trato, dicho por delante, en el sitio y dentro de los archivos.',

    packsMetaTitle: 'PDF gratis de guías de IA',
    packsMetaDesc: 'Nuestras guías de IA paso a paso, agrupadas por tema en PDF gratuitos que puedes descargar, imprimir y compartir. Sin registro.',
    packsFromSupport: '¿Prefieres leer sin conexión? Nuestras guías también están gratis en packs PDF.',
    packsFromSupportLink: 'Ver los packs',
    packsFootPre: '¿Lo prefieres en un solo archivo?',
    packsFootLink: 'Este tema en PDF gratis',
    packsFootMore: '{name} ({n} guías, PDF gratuito e imprimible)'
  }
};
