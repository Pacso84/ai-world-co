// ===================================================================
// AZ ELADÓ OLDAL SZÖVEGEI — /packs (2026-09-20)
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
          igeret: 'All eight packs in one file: every subject, one download, one price.' },
    hu: { cim: 'A teljes hétköznapi AI-gyűjtemény',
          igeret: 'Mind a nyolc csomag egyetlen fájlban: minden téma, egy letöltés, egy ár.' },
    es: { cim: 'La colección completa de IA para el día a día',
          igeret: 'Los ocho packs en un solo archivo: todos los temas, una descarga, un precio.' }
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

/** Az oldal keretszövegei — a build.js UI-táblájába olvadnak be. */
export const PACKS_UI = {
  en: {
    packsNav: 'Packs',
    packsPill: 'The packs',
    packsTitle: 'Our guides, <em>grouped into one file</em>',
    packsLead: 'We publish step-by-step guides for using AI in ordinary life: writing the awkward email, planning a week of dinners, checking whether that text message is a scam. All of them are free to read here, and they stay free. The packs are those same guides, selected, ordered, and put into one PDF you can keep.',
    packsUnitGuides: 'guides',
    packsUnitPages: 'pages',
    packsBuy: 'See it in the shop',
    packsShopAll: 'Open the shop',
    packsSoon: 'Coming to the shop shortly',
    packsLangs: 'The packs are available in English and Spanish.',

    packsBuildH: 'How a guide is built',
    packsBuildP: 'Every guide follows the same shape, because that is the shape that works when you are stuck. It opens with what you need before you start: which account, which app, how long it will take. Then numbered steps, each one naming the button you are looking for and telling you how to know it worked. Then the mistakes people actually make. Then a short, honest close about what this changes, and what it does not. Most guides include an example prompt you can copy. If a guide needs paid software, it says so in the first box, not in step four.',

    packsAiH: 'Written by AI, and labeled that way',
    packsAiP: 'This whole site is written by AI. The guides, the news articles and most of the pictures are generated, and the support chat is an AI too. Automated quality gates check every piece before it goes out, and no human editor reads the text. A human owner runs the system, reads the feedback and keeps tightening the rules. We say this on every article and on every pack, because you should be able to decide what that is worth to you.',

    packsFaqH: 'Questions',
    packsQ1: 'What do I get, exactly?',
    packsA1: 'A PDF. A subject pack collects the guides on one theme — each card above shows exactly how many. The complete collection holds all eight packs in a single file with a clickable table of contents. No subscription and no app.',
    packsQ2: 'How do I get it?',
    packsA2: 'Through our Ko-fi shop. You pay by card or PayPal, and the download appears right after checkout. Ko-fi also emails you a receipt with a link to the download page, and it may offer to set up a free Ko-fi account for you. The file is yours to keep, print and read offline.',
    packsQ3: 'Can I get a refund?',
    packsA3: 'Yes — within 30 days, no questions asked. Email support@aiworldhq.com and we will refund the full amount. There is nothing to send back, so we will not ask you to.',
    packsQ4: 'Why pay for something that is free on the site?',
    packsA4: 'You are not paying for secret information. Everything in the packs is on this site right now, free, and will stay there. You are paying for the selection, the reading order, and one searchable file you can read offline — on a plane, on a phone with no signal, or printed on paper. If that is not worth it to you, read them free here instead. The link is not going anywhere.',
    packsQ5: 'Who wrote these?',
    packsA5: 'AI agents did, start to finish. They pass automated fact and quality checks before publication, but no human editor reviews the text. That is the deal, stated up front, on the site and inside the files.',

    packsMetaTitle: 'Guide packs',
    packsMetaDesc: 'Our step-by-step AI guides, grouped by subject into PDFs you can keep. Everything in them is also free to read on the site.',
    packsFromSupport: 'Prefer something in return? We also sell our guides as PDF packs.',
    packsFromSupportLink: 'See the packs',
    packsFootPre: 'Prefer it in one file?',
    packsFootLink: 'Get this subject as a PDF pack'
  },

  hu: {
    packsNav: 'Csomagok',
    packsPill: 'A csomagok',
    packsTitle: 'Az útmutatóink, <em>egyetlen fájlba rendezve</em>',
    packsLead: 'Lépésről lépésre szóló útmutatókat írunk arról, hogyan használd az AI-t a hétköznapokban: hogyan írd meg a kellemetlen emailt, hogyan tervezz egy hét vacsorát, hogyan derítsd ki, átverés-e az az SMS. Mind ingyen olvasható itt, és az is marad. A csomagok ugyanezek az útmutatók: kiválogatva, sorba rendezve, egyetlen megtartható PDF-ben.',
    packsUnitGuides: 'útmutató',
    packsUnitPages: 'oldal',
    packsBuy: 'Megnézem a boltban',
    packsShopAll: 'Irány a bolt',
    packsSoon: 'Hamarosan a boltban',
    packsLangs: 'A csomagok angolul és spanyolul érhetők el.',

    packsBuildH: 'Hogyan épül fel egy útmutató',
    packsBuildP: 'Minden útmutató ugyanazt az alakot követi, mert ez az az alak, ami akkor segít, amikor elakadtál. Azzal kezdődik, mi kell hozzá: melyik fiók, melyik alkalmazás, mennyi idő. Utána számozott lépések, mindegyik megnevezi a gombot, amit keresel, és megmondja, miről ismered fel, hogy sikerült. Aztán a hibák, amiket tényleg el szoktak követni. Végül egy rövid, őszinte zárás arról, min változtat ez — és min nem. A legtöbb útmutatóban van egy másolható példa-prompt. Ha fizetős szoftver kell hozzá, az az első dobozban áll, nem a negyedik lépésben.',

    packsAiH: 'AI írta, és ezt ki is írjuk',
    packsAiP: 'Ezt az egész oldalt AI írja. Az útmutatók, a hírek és a képek nagy része gépi, és az ügyfélszolgálati csevegő is AI. Automatikus minőség-kapuk minden darabot ellenőriznek a megjelenés előtt, de emberi szerkesztő nem olvassa át a szöveget. Egy ember üzemelteti a rendszert, olvassa a visszajelzéseket, és folyamatosan szigorítja a szabályokat. Ezt minden cikken és minden csomagon kiírjuk, mert neked kell eldöntened, mennyit ér ez így.',

    packsFaqH: 'Kérdések',
    packsQ1: 'Mit kapok pontosan?',
    packsA1: 'Egy PDF-et. Egy téma-csomag egyetlen téma útmutatóit gyűjti össze — hogy pontosan hányat, az ott áll minden kártyán. A teljes gyűjteményben mind a nyolc csomag egyetlen fájlban, kattintható tartalomjegyzékkel. Nincs előfizetés és nincs alkalmazás.',
    packsQ2: 'Hogyan kapom meg?',
    packsA2: 'A Ko-fi boltunkon keresztül. Kártyával vagy PayPallal fizetsz, és a letöltés rögtön a fizetés után megjelenik. A Ko-fi emailben is küld egy visszaigazolást a letöltő oldal linkjével, és felajánlhatja, hogy készít neked egy ingyenes Ko-fi fiókot. A fájl a tiéd: megtarthatod, kinyomtathatod, offline is olvashatod.',
    packsQ3: 'Kaphatok pénzvisszatérítést?',
    packsA3: 'Igen — 30 napon belül, kérdés nélkül. Írj a support@aiworldhq.com címre, és a teljes összeget visszatérítjük. Visszaküldeni nincs mit, tehát nem is fogjuk kérni.',
    packsQ4: 'Miért fizessek azért, ami ingyen is megvan az oldalon?',
    packsA4: 'Nem titkos tudásért fizetsz. Minden, ami a csomagokban van, most is fent van ezen az oldalon ingyen, és ott is marad. A válogatásért, az olvasási sorrendért és egyetlen kereshető fájlért fizetsz, amit offline is elolvasol — repülőn, térerő nélküli telefonon vagy kinyomtatva. Ha ez neked nem ér annyit, olvasd el itt ingyen. A link nem megy sehova.',
    packsQ5: 'Ki írta ezeket?',
    packsA5: 'AI-ügynökök, elejétől a végéig. Automatikus tény- és minőség-ellenőrzésen mennek át a megjelenés előtt, de emberi szerkesztő nem nézi át a szöveget. Ez az alku, és előre kimondjuk — az oldalon és a fájlokban is.',

    packsMetaTitle: 'Útmutató-csomagok',
    packsMetaDesc: 'A lépésről lépésre szóló AI-útmutatóink téma szerint csomagolva, megtartható PDF-ként. Minden, ami bennük van, ingyen is olvasható az oldalon.',
    packsFromSupport: 'Inkább kapnál valamit cserébe? Az útmutatóinkat PDF-csomagban is áruljuk.',
    packsFromSupportLink: 'Megnézem a csomagokat',
    packsFootPre: 'Egyben is jó lenne?',
    packsFootLink: 'Ez a téma PDF-csomagban'
  },

  es: {
    packsNav: 'Packs',
    packsPill: 'Los packs',
    packsTitle: 'Nuestras guías, <em>reunidas en un solo archivo</em>',
    packsLead: 'Publicamos guías paso a paso para usar la IA en la vida diaria: escribir ese correo incómodo, planificar una semana de cenas, comprobar si ese mensaje es una estafa. Todas se pueden leer gratis aquí, y seguirán siendo gratis. Los packs son esas mismas guías: seleccionadas, ordenadas y reunidas en un PDF que puedes guardar.',
    packsUnitGuides: 'guías',
    packsUnitPages: 'páginas',
    packsBuy: 'Verlo en la tienda',
    packsShopAll: 'Ir a la tienda',
    packsSoon: 'Muy pronto en la tienda',
    packsLangs: 'Los packs están disponibles en inglés y español.',

    packsBuildH: 'Cómo se construye una guía',
    packsBuildP: 'Todas las guías siguen la misma forma, porque es la que funciona cuando te has atascado. Empiezan por lo que necesitas antes de ponerte a ello: qué cuenta, qué aplicación, cuánto tiempo te llevará. Después, pasos numerados: cada uno nombra el botón que buscas y te dice cómo saber que ha funcionado. Luego, los errores que la gente comete de verdad. Y al final, un cierre breve y honesto sobre qué cambia esto y qué no. La mayoría incluye un prompt de ejemplo que puedes copiar. Si una guía necesita software de pago, lo dice en el primer recuadro, no en el paso cuatro.',

    packsAiH: 'Escrito por IA, y así lo indicamos',
    packsAiP: 'Todo este sitio lo escribe una IA. Las guías, las noticias y la mayoría de las imágenes se generan, y el chat de soporte también es una IA. Unos controles de calidad automáticos comprueban cada pieza antes de publicarla, y ningún editor humano lee el texto. Una persona gestiona el sistema, lee los comentarios y va ajustando las reglas. Lo decimos en cada artículo y en cada pack, porque eres tú quien debe decidir cuánto vale eso.',

    packsFaqH: 'Preguntas',
    packsQ1: '¿Qué recibo exactamente?',
    packsA1: 'Un PDF. Un pack temático agrupa las guías de un mismo tema; cada tarjeta de arriba dice cuántas. La colección completa reúne los ocho packs en un solo archivo con índice interactivo. Sin suscripción y sin aplicación.',
    packsQ2: '¿Cómo lo recibo?',
    packsA2: 'A través de nuestra tienda de Ko-fi. Pagas con tarjeta o PayPal y la descarga aparece justo después del pago. Ko-fi también te envía por correo un recibo con el enlace a la página de descarga, y puede ofrecerte crear una cuenta gratuita de Ko-fi. El archivo es tuyo: puedes guardarlo, imprimirlo y leerlo sin conexión.',
    packsQ3: '¿Puedo pedir un reembolso?',
    packsA3: 'Sí, dentro de los 30 días y sin preguntas. Escribe a support@aiworldhq.com y te devolvemos el importe completo. No hay nada que devolver, así que no te lo pediremos.',
    packsQ4: '¿Por qué pagar por algo que es gratis en el sitio?',
    packsA4: 'No pagas por información secreta. Todo lo que hay en los packs está ahora mismo en este sitio, gratis, y ahí seguirá. Pagas por la selección, por el orden de lectura y por un único archivo en el que puedes buscar y que puedes leer sin conexión: en un avión, en un móvil sin cobertura o impreso en papel. Si eso no te compensa, léelas gratis aquí. El enlace no se va a ninguna parte.',
    packsQ5: '¿Quién ha escrito esto?',
    packsA5: 'Agentes de IA, de principio a fin. Pasan controles automáticos de hechos y de calidad antes de publicarse, pero ningún editor humano revisa el texto. Ese es el trato, dicho por delante, en el sitio y dentro de los archivos.',

    packsMetaTitle: 'Packs de guías',
    packsMetaDesc: 'Nuestras guías de IA paso a paso, agrupadas por tema en PDF que puedes guardar. Todo lo que contienen también se puede leer gratis en el sitio.',
    packsFromSupport: '¿Prefieres recibir algo a cambio? También vendemos nuestras guías en packs PDF.',
    packsFromSupportLink: 'Ver los packs',
    packsFootPre: '¿Lo prefieres en un solo archivo?',
    packsFootLink: 'Este tema en pack PDF'
  }
};
