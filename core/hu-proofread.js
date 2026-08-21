// ===================================================================
// MAGYAR HELYESÍRÁS — 2. LÉPCSŐ: a bíró és a döntés-tár
// ===================================================================
//
// A `core/hu-spellcheck.js` ingyen leszűkíti a 2325 szavas cikket néhány
// jelöltre. Itt dől el, melyik közülük valódi hiba.
//
// MIÉRT OLCSÓ: a bíró NEM a cikket kapja, hanem a néhány szót a mondatával —
// pár száz token. Az első lépcső végezte el a nehezét.
//
// AMI EGYSZER KIDERÜLT, AZ TÖBBÉ NEM KERÜL PÉNZBE. Minden ítélet a döntés-
// tárba kerül: a jó szó engedélylistára (többé meg sem kérdezzük), a rossz
// a tiltólistára — azt onnantól a `badFormsIn()` fogja meg, ingyen, AI nélkül.
// Ezért a költség idővel a nullához tart, ahogy a tár telítődik.
//
// ⚠️ A HALLGATÁS A BIZTONSÁGOS IRÁNY. Ha a bíró nem válaszol, értelmetlent
// mond, vagy a hálózat elszáll: NINCS ítélet. Egy téves „rossz" miatt a
// fordítás elbukna, és ANGOL szöveg maradna kint a magyar oldalon — az
// rosszabb, mint a hiba, amit javítunk.
// ===================================================================

import { extractJsonArray } from './extract-json.js';

/** Egy hívásban ennyi szót ítéltetünk meg — a hosszú lista pontatlanná tesz. */
export const BATCH = 40;

export const HU_JUDGE_PROMPT = `You are a Hungarian proofreader. For each word below, decide whether it is a VALID Hungarian word form in its sentence.

A word is INVALID only if it is not a real Hungarian form: a wrong suffix, broken vowel harmony, a missing or wrong accent, a typo, or a made-up inflection.

A word is VALID (ok: true) when it is:
- a correct Hungarian word, however rare or long (compounds count as valid),
- a technical or foreign loanword commonly written this way in Hungarian tech writing,
- an English term quoted inside Hungarian text,
- a product, brand or company name.

Respond with {"words": [{"word": "<exact word as given>", "ok": true|false, "correct": "<the correct Hungarian form>", "sentence": "<the full sentence, rewritten correctly>"}]}.
When ok is false you MUST also return "sentence": repeat the whole sentence you were given, corrected. Change ONLY what is wrong — keep every other word exactly as it was, and do not rephrase.
Write the sentence you would actually publish: if your "correct" form does not fit the grammar of the sentence, fix the form, not the sentence.
Inside "sentence", never use the double-quote character. If the text quotes something, use the guillemets « » instead. A stray double-quote breaks the whole response and every judgement in it is lost.
Include "correct" ONLY when ok is false. Judge every word you were given, and no others.
When unsure, answer ok: true — a wrong "invalid" verdict throws away a good translation.`;

/**
 * MI MENTHETŐ EGY TÖRÖTT VÁLASZBÓL?
 *
 * A JSON-t egyetlen escape-eletlen idézőjel is eltöri, és akkor a `JSON.parse`
 * az EGÉSZ köteget eldobja — mérve 176 megkérdezett szóból 16 ítélet jött
 * vissza, a többiért fizettünk és semmit nem kaptunk. Egy 40-es kötegnél egy
 * hiba 40 ítéletet visz el.
 *
 * Ez a mentés horgonyonként dolgozik: minden „word" mezőtől a következőig
 * terjedő darabból kiszedi, amit lehet. A `sentence` a legsérülékenyebb mező —
 * ha csonkán jön, az nem baj: a hiányos bizonyíték magától „nem igazolt"-at
 * ad, tehát a szó az emberi listára kerül. A rossz irányba dőlés a biztonságos.
 *
 * ⚠️ Nem találunk ki semmit. Ami nem olvasható ki, az kimarad.
 */
export function salvageVerdicts(text) {
  const t = String(text == null ? '' : text);
  const out = [];
  const helyek = [...t.matchAll(/"word"\s*:\s*"([^"]+)"/g)];
  for (let i = 0; i < helyek.length; i++) {
    const word = helyek[i][1];
    const kezd = helyek[i].index + helyek[i][0].length;
    const veg = i + 1 < helyek.length ? helyek[i + 1].index : t.length;
    const darab = t.slice(kezd, veg);

    const okM = darab.match(/"ok"\s*:\s*(true|false)/);
    if (!okM) continue;
    if (okM[1] === 'true') { out.push({ word, ok: true }); continue; }

    const cM = darab.match(/"correct"\s*:\s*"([^"]*)"/);
    if (!cM || !cM[1]) continue;
    const sM = darab.match(/"sentence"\s*:\s*"([\s\S]*?)"\s*\}/);
    out.push({ word, ok: false, correct: cM[1], sentence: sM ? sM[1] : '' });
  }
  return out;
}

/**
 * A BÍRÓNAK KÜLDHETŐ MONDAT.
 *
 * MÉRVE (2026-08-21): a 202 megítélendő mondatból 32-ben (16%) van EGYENES
 * idézőjel. Amióta a bírótól a teljes javított mondatot is kérjük, ezt vissza
 * kell írnia a JSON-válaszba — és ha nem escape-eli, az EGÉSZ köteg
 * értelmezhetetlen lesz. Élesben pontosan ez történt: 40 szó, 4647 kifizetett
 * token, NULLA ítélet.
 *
 * Az irány nem az, hogy a modelltől várjunk fegyelmet, hanem hogy ne adjunk
 * neki elrontható karaktert. Ingyen megtehetjük: a sentenceConfirms csak a
 * SZAVAKAT hasonlítja, az írásjel nem számít. A magyar „idézőjel” maradhat.
 */
export function safeContext(t) {
  return String(t == null ? '' : t)
    .split('\\').join(' ')
    .split('\"').join('”');
}

const SZAVAK = /[A-Za-zÁÉÍÓÖŐÚÜŰáéíóöőúüű]+(?:-[A-Za-zÁÉÍÓÖŐÚÜŰáéíóöőúüű]+)*/g;

/**
 * IGAZOLJA-E A MONDAT A SZÓ-SZINTŰ JAVÍTÁST?
 *
 * MIÉRT LÉTEZIK (2026-08-21, user-döntés). A bíró a SZÓT nézi, a nyelvtan
 * viszont a MONDATÉ — élesben ezért adott „anny" → „annyit"-ot, amiből
 * „annyit ideig tartott" lett volna. Emiatt CSAK az ékezet-helyreállítás
 * javulhatott magától, és 222 nyilvánvaló elgépelés („adddig", „remej",
 * „rlapon") kint maradt az élő oldalon egy listán, amit senki nem néz át.
 *
 * A megoldás nem lazább zár, hanem KEMÉNYEBB BIZONYÍTÁS: a bírónak le kell
 * írnia a teljes kijavított mondatot. Ha abban PONTOSAN a mi szavunk változott
 * és semmi más, akkor a javítás igazoltan belefér a mondatba. Az „anny"-csapda
 * így magától kiesik: a bíró a mondatba „annyi"-t ír, az pedig nem egyezik a
 * saját szó-javaslatával („annyit") → nem javítunk.
 *
 * ⚠️ A MONDATOT NEM CSERÉLJÜK VISSZA. A bíró prózát lát (a toProse leszedi a
 * markdown-jelölőket), a fájlban viszont markdown van — a javított mondat nem
 * illeszthető vissza. A mondat itt BIZONYÍTÉK, nem javítás; a cserét továbbra
 * is a szóhatáros applyFixes végzi.
 *
 * Az írásjelek és a szóközök nem számítanak: szavakat hasonlítunk, nem
 * formázást. Ugyanannak a hibának a többszöri előfordulása igazolás, nem zaj.
 */
export function sentenceConfirms(eredeti, javitott, szo, helyes) {
  const bont = t => String(t == null ? '' : t).match(SZAVAK) || [];
  const a = bont(eredeti), b = bont(javitott);
  if (!a.length || !b.length) return false;
  // Eltérő szószám = a bíró hozzátett vagy elvett — az már nem szó-csere.
  if (a.length !== b.length) return false;

  const cel = String(szo == null ? '' : szo).toLowerCase();
  const jo = String(helyes == null ? '' : helyes).toLowerCase();
  if (!cel || !jo || cel === jo) return false;

  let elteres = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i].toLowerCase(), y = b[i].toLowerCase();
    if (x === y) continue;
    // Bármi MÁS változott a mondatban → nem a mi javításunkat igazolja.
    if (x !== cel || y !== jo) return false;
    elteres++;
  }
  return elteres > 0;
}

/**
 * Hány egykarakteres lépés visz az egyik alakból a másikba? (Levenshtein)
 *
 * MIÉRT KELL (2026-08-21, 34 éles ítéleten mérve). A mondat-bizonyíték az
 * ÖNELLENTMONDÁST fogja meg — azt, ha a bíró mást ír a mondatba, mint amit a
 * szóra javasolt. A MAGABIZTOS TÉVEDÉST viszont nem: az „anny → annyit”, épp
 * az a csapda, ami ellen az egészet építettük, átment rajta, mert a bíró a
 * saját mondatába is „annyit”-ot írt.
 *
 * A kézi átnézés éles mintát mutatott: a kis távolságú javítás ELGÉPELÉS-
 * javítás, a nagy távolságú viszont SZÓCSERE — a bíró a szövegkörnyezetből
 * kitalál egy másik szót („hetéd” → „önéletrajzodat”). Mérve:
 *   táv ≤ 1 → 15 javítás, 1 hibás (az is ártalmatlan: tasmán→tasman)
 *   táv ≤ 2 → 25 javítás, 4 hibás (anny→annyit, pineld→pinned, méröd→méri…)
 * Innen a küszöb.
 */
export function editDistance(a, b) {
  const x = String(a == null ? '' : a).toLowerCase();
  const y = String(b == null ? '' : b).toLowerCase();
  let sor = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    let atlos = sor[0];
    sor[0] = i;
    for (let j = 1; j <= y.length; j++) {
      const elozo = sor[j];
      sor[j] = Math.min(sor[j] + 1, sor[j - 1] + 1, atlos + (x[i - 1] === y[j - 1] ? 0 : 1));
      atlos = elozo;
    }
  }
  return sor[y.length];
}

/** Ennyi karakternyi eltérésig hisszük el, hogy elgépelés-javítás és nem szócsere. */
export const MAX_TAVOLSAG = 1;

/**
 * Csak az ÉKEZETEKBEN tér el a két alak?
 *
 * ⚠️ EZ A LEGSZIGORÚBB ZÁR, és ez dönti el, mihez nyúlhat a gép magától.
 * Az ékezet-helyreállítás bizonyíthatóan ártalmatlan: ugyanaz a szó, ugyanaz a
 * rag, csak a vesszők hiányoztak („kezdo" → „kezdő"). Bármi más a MONDATOT is
 * érintheti, és a bíró csak a szót látja — élesben ilyet adott:
 *   „anny" → „annyit"   → „annyit ideig tartott" (rossz)
 *   „biokra" → „biogra" → nem is szó
 * A fordítónk mért fő hibája épp az ékezet-vesztés, tehát ez a szűk kapu a
 * valódi hibák 59%-át fedi le.
 */
export function isAccentOnly(a, b) {
  const le = w => String(w == null ? '' : w).toLowerCase()
    .replace(/[áa]/g, 'a').replace(/[ée]/g, 'e').replace(/[íi]/g, 'i')
    .replace(/[óöőo]/g, 'o').replace(/[úüűu]/g, 'u');
  const x = le(a), y = le(b);
  return !!x && x === y;
}

/** Üres döntés-tár. `fix` = biztonsággal cserélhető, `review` = emberi szem kell. */
export function emptyStore() { return { ok: [], fix: {}, review: {} }; }

/**
 * Behelyettesíthető-e a javaslat?
 *
 * ⚠️ EZ A BIZTONSÁGI ZÁR. Ami ide bekerül, azt a gép MAGÁTÓL kicseréli az élő
 * szövegben. Ezért szigorú: egyetlen szó, csak betűkből — se szóköz, se
 * idézőjel, se „vagy". Élesben mindhárom előfordult már az első 80 ítéletben
 * (2026-08-20): «askolsz vagy „túl tág kérdéseket teszel fel».
 */
export function isFixable(correct) {
  const c = String(correct == null ? '' : correct).trim();
  if (!c || c.length > 40) return false;
  if (/\s/.test(c)) return false;
  if (/\bvagy\b|\bor\b/i.test(c)) return false;
  if (/[^A-Za-zÁÉÍÓÖŐÚÜŰáéíóöőúüű-]/.test(c)) return false;
  return true;
}

/**
 * A jelöltek megítélése.
 * @returns {Promise<{verdicts: {word,ok,correct?}[], costUsd: number}>} hibánál ÜRES
 */
export async function judgeWords({ candidates, ask, enabled = true, batch = BATCH, isKnownWord = null }) {
  const ures = { verdicts: [], costUsd: 0 };

  // 🔌 VÉSZKAPCSOLÓ. A core/ai-router.js NEM nézi az agents.<név>.enabled
  // mezőt — a configban álló „enabled: false" magától SEMMIT nem kapcsol ki
  // (2026-08-19). Ezért itt, a core oldalán, teszttel őrizve.
  if (enabled === false) return ures;

  const lista = (Array.isArray(candidates) ? candidates : []).filter(c => c && c.word).slice(0, batch);
  if (!lista.length || typeof ask !== 'function') return ures;

  const kerdezett = new Set(lista.map(c => String(c.word)));
  // A mondatát a bíró VÁLASZÁHOZ kell majd hasonlítani — a válasz sorrendje
  // viszont nem garantált, ezért szó szerint keressük vissza.
  const eredetiMondat = new Map(lista.map(c => [String(c.word), safeContext(c.context).slice(0, 200)]));
  const felsorolas = lista
    .map((c, i) => `${i + 1}. "${c.word}" — sentence: ${safeContext(c.context).slice(0, 200)}`)
    .join('\n');

  let valasz;
  try {
    valasz = await ask(`Judge these ${lista.length} Hungarian words.\n\n${felsorolas}`,
      { agentName: 'proofread', systemPrompt: HU_JUDGE_PROMPT, maxTokens: 6000, jsonMode: true });
  } catch { return ures; }
  if (!valasz) return ures;

  // A tokent akkor is kifizettük, ha a válasz használhatatlan.
  const costUsd = Number(valasz.costUsd) || 0;
  let nyers;
  // ⚠️ A NÉMA BUKÁS A LEGDRÁGÁBB (2026-08-21). Amikor egy idézőjel eltörte a
  // JSON-t, a napló csak annyit írt: „0 ítélet" — pedig 4647 tokent
  // kifizettünk. Ha egy hívásért fizettünk és semmit nem kaptunk, azt KI KELL
  // MONDANI, különben a hibát a költség-görbén kellene észrevenni.
  try { nyers = extractJsonArray(valasz.text); } catch (e) {
    // MENTÉS SORONKÉNT. Egy escape-eletlen idézőjel az EGÉSZ választ eldobná:
    // mérve 176 megkérdezett szóból 16 ítélet jött vissza, a többiért fizettünk
    // és semmit nem kaptunk. A mentés kiolvassa, ami ép — a csonkán maradt
    // mondat pedig magától „nem igazolt"-tá teszi a szót, tehát emberi listára
    // kerül. A rossz irányba dőlés itt is a biztonságos.
    nyers = salvageVerdicts(valasz.text);
    console.log('   ⚠️  [proofread] törött válasz (' + e.message.slice(0, 45) + ') — '
      + nyers.length + ' ítélet kimentve, ' + '$' + costUsd.toFixed(4) + ' kifizetve');
    if (!nyers.length) return { verdicts: [], costUsd };
  }

  const verdicts = [];
  for (const v of Array.isArray(nyers) ? nyers : []) {
    if (!v || typeof v !== 'object') continue;
    const word = String(v.word || '');
    // Csak arról fogadunk el döntést, amit KÉRDEZTÜNK — a modell kitalálhat szavakat.
    if (!kerdezett.has(word)) continue;
    if (v.ok === true) { verdicts.push({ word, ok: true }); continue; }
    const correct = String(v.correct || '').trim();
    // Javaslat nélküli „rossz" ítélettel nem tudunk mit kezdeni. Eldobjuk.
    if (v.ok !== false || !correct || correct.toLowerCase() === word.toLowerCase()) continue;
    // AUTO-JAVÍTHATÓ-E? Élesben a bíró ilyet is adott:
    //   asksz → «askolsz vagy „túl tág kérdéseket teszel fel»
    // Ezt behelyettesíteni értelmetlen szöveget adna. Az ilyen a `review`
    // vödörbe megy: jelezzük, de magunktól nem nyúlunk hozzá.
    // A MONDAT MINT BIZONYÍTÉK (2026-08-21). Két feltétel, mindkettő kell:
    //   • a bíró leírta a javított mondatot, és abban PONTOSAN ez az egy szó
    //     változott — a nyelvtani egyeztetés tehát stimmel;
    //   • a javasolt alak létező magyar szó. Ez öli meg a „biokra → biogra"
    //     félét, ami nem is szó. Szótár nélkül ez a feltétel kimarad.
    const mondatOk = sentenceConfirms(eredetiMondat.get(word), v.sentence, word, correct);
    const szoOk = typeof isKnownWord === 'function' ? !!isKnownWord(correct) : true;
    verdicts.push({ word, ok: false, correct, fixable: isFixable(correct), verified: mondatOk && szoOk });
  }
  return { verdicts, costUsd };
}

/**
 * Az ítéletek beolvasztása a tárba. Tiszta függvény: ugyanaz be, ugyanaz ki.
 * A jó szó engedélylistára; a rossz vagy az AUTO-JAVÍTÓ térképbe, vagy —
 * ha a javaslat nem behelyettesíthető — az emberi szemet kérő listára.
 */
export function applyVerdicts(store, verdicts) {
  // ⚠️ A SZÉTSZÓRÁS SZÁNDÉKOS (2026-08-21). Három függvény építi újra a tár
  // alakját — loadStore, saveStore és ez —, és a `scan` bélyeg MINDHÁROMBÓL
  // kiesett, mert mindegyik csak a három ismert mezőt sorolta fel. A CLAUDE.md
  // szabálya („ami több helyre van kimásolva, szétcsúszik") itt nem számra,
  // hanem ADATALAKRA érvényes. Így a KÖVETKEZŐ mező is túléli, magától.
  const s = {
    ...(store || {}),
    ok: [...new Set((store?.ok || []).map(w => String(w).toLowerCase()))],
    fix: { ...(store?.fix || {}) },
    review: { ...(store?.review || {}) }
  };
  const ma = new Date().toISOString().slice(0, 10);
  for (const v of Array.isArray(verdicts) ? verdicts : []) {
    if (!v || !v.word) continue;
    const w = String(v.word).toLowerCase();
    if (v.ok === true) {
      if (!s.fix[w] && !s.review[w] && !s.ok.includes(w)) s.ok.push(w);
      continue;
    }
    if (!v.correct) continue;
    // ⚠️ CSAK az ékezet-helyreállítás javul MAGÁTÓL. Minden más emberi szemet kér.
    // Élesben, MIELŐTT lefutott volna: „anny" → „annyit" a mondatból
    // „annyit ideig tartott"-ot csinált volna, a „biokra" → „biogra" pedig
    // nem is szó. A bíró a SZÓT nézi, a nyelvtan viszont a MONDATÉ.
    // KÉT ÚT VEZET AZ AUTOMATIKUS JAVÍTÁSHOZ, és mindkettő BIZONYÍTÁS:
    //
    //   • ÉKEZET-helyreállítás — ugyanaz a szó, ugyanaz a rag. Mechanikus,
    //     bizonyíthatóan ártalmatlan, ezért távolság-korlát sincs rajta:
    //     négy hiányzó ékezet is ugyanaz a szó.
    //
    //   • MONDAT + TÁVOLSÁG együtt. A mondat azt igazolja, hogy a javítás
    //     belefér a nyelvtanba; a távolság azt, hogy ELGÉPELÉST javítunk és
    //     nem SZÓT CSERÉLÜNK. Egyik sem elég önmagában — mérve: a mondat
    //     átengedte az „anny → annyit”-ot (a bíró a saját mondatába is a rossz
    //     alakot írta), a puszta távolság pedig a „terveztel → tervezted”-et
    //     engedné (más nyelvtani alak, ugyanolyan közel).
    //
    // Bizonyíték nélkül a gép NEM nyúl az élő szöveghez.
    const igazolt = isAccentOnly(v.word, v.correct)
      || (v.verified === true && editDistance(v.word, v.correct) <= MAX_TAVOLSAG);
    const cel = (v.fixable === true && igazolt) ? s.fix : s.review;
    // EGY SZÓ = EGY VÖDÖR. Újraítéléskor a szó átkerülhet a másik oldalra; ha
    // a régi bejegyzés bent ragadna, a riport emberi szemet kérne olyasmire,
    // ami már megjavult — vagy a gép javítana tovább valamit, amit közben
    // visszaminősítettünk.
    delete (cel === s.fix ? s.review : s.fix)[w];
    // `mondattal`: ezt a szót MÁR megkérdeztük a mondat-bizonyítékos bíróval.
    // A --rejudge ezeket kihagyja, különben minden futásban újra fizetnénk
    // ugyanazért a ~200 szóért — és a költés CSENDES, ez csak a havi számlán
    // látszana meg. A jelöletlen (régi, mondat nélkül ítélt) bejegyzés viszont
    // megérdemel még egy esélyt.
    cel[w] = { correct: String(v.correct), at: ma };
    if (v.verified !== undefined) cel[w].mondattal = true;
    const i = s.ok.indexOf(w);
    if (i >= 0) s.ok.splice(i, 1);        // egy szó nem lehet egyszerre jó és rossz
  }
  return s;
}

/**
 * A MÁR MEGÍTÉLT hibák javítása a szövegben — ingyen, AI nélkül, idempotensen.
 *
 * MIÉRT JAVÍTUNK ÉS NEM BLOKKOLUNK (2026-08-20): a blokkolás azt jelentené,
 * hogy a fordítás elbukik és újrapróbál — és ha újra elbukik, ANGOL szöveg
 * marad kint a magyar oldalon. Az rosszabb, mint a hiba, amit javítunk.
 * A csere viszont mindig sikerül, és a régi cikkeket is rendbe teszi.
 * Ugyanez a ház bevált mintája a brit→amerikai helyesírásnál (us-spelling.js).
 *
 * ⚠️ SZÓHATÁRON cserél, SOHA nem előtagra. A helyesírás-szótárnál ez a csapda
 * KÉTSZER megfogott (az „analysis"-ből „analyzis" lett): az „almafa" nem az
 * „alma" hibája.
 *
 * @returns {{text: string, fixed: {word: string, correct: string}[]}}
 */
export function applyFixes(text, store) {
  const eredeti = String(text == null ? '' : text);
  const fix = store?.fix;
  if (!eredeti || !fix) return { text: eredeti, fixed: [] };

  let t = eredeti;
  const eredetiKis = eredeti.toLowerCase();
  const fixed = [];
  for (const [w, adat] of Object.entries(fix)) {
    const correct = adat?.correct;
    if (!correct) continue;
    // ⚠️ AZ EREDETI szöveghez mérünk, nem a menet közben javítotthoz. Ha a már
    // elvégzett cseréinket is beleszámolnánk, a MI javításunk tiltaná le a
    // következőt: a „hetédből és hetedbol" első fele javulna, a második nem.
    if (szandekos(eredetiKis, w, correct)) continue;
    let db = 0, kis = t.toLowerCase(), i = kis.indexOf(w);
    while (i >= 0) {
      if (!betu(kis[i - 1]) && !betu(kis[i + w.length])) {
        // A nagy kezdőbetűt megtartjuk: mondat elején is jó maradjon.
        const csere = /^[A-ZÁÉÍÓÖŐÚÜŰ]/.test(t[i])
          ? correct.charAt(0).toUpperCase() + correct.slice(1)
          : correct;
        t = t.slice(0, i) + csere + t.slice(i + w.length);
        kis = t.toLowerCase();
        db++;
        i = kis.indexOf(w, i + csere.length);
      } else {
        i = kis.indexOf(w, i + 1);
      }
    }
    if (db) fixed.push({ word: w, correct });
  }
  return { text: t, fixed };
}

/** Amit a gép NEM javíthat magától — ez megy a napi riportba. */
export function needsReview(store) {
  return Object.entries(store?.review || {}).map(([word, d]) => ({ word, correct: d?.correct || '' }));
}

/**
 * Szó része-e ez a karakter?
 *
 * A magyar ékezetes betűk IS azok — enélkül a szóhatár félrevágna.
 * ⚠️ A KÖTŐJEL IS SZÓ RÉSZE (2026-08-20, éles lelet): a bíró a „PDF-jéből"
 * szóból a „jéből" TÖREDÉKET kapta, és arra azt mondta, „PDF-ből". Ha a
 * kötőjelet szóhatárnak vennénk, a javítás „PDF-PDF-ből"-t csinálna belőle.
 */
function betu(ch) {
  return !!ch && /[-A-Za-zÁÉÍÓÖŐÚÜŰáéíóöőúüű]/.test(ch);
}

/** A közvetlen környezet, amiben egy szemben állítás még egy mondatnyi. */
const KORNYEZET = 120;

/**
 * SZÁNDÉKOS-E ITT AZ ELGÉPELÉS?
 *
 * ÉLES LELET (2026-08-21, az alkalmazás előtti előnézet fogta meg): az egyik
 * útmutatónk MAGÁRÓL az elgépelésről szól, és példaként idézi a rossz alakot:
 *   «Majdnem jó elgépelések — „verfication" a „verification" helyett»
 * A javítás ebből «„verification" a „verification" helyett»-et csinált volna
 * — értelmetlen mondatot egy élő oldalon.
 *
 * A minta általános: ha a HELYES alak is ott áll a rossz mellett, a szöveg a
 * kettő KÜLÖNBSÉGÉRŐL beszél, nem hibázik. A hallgatás itt is a biztonságos
 * irány: a szó a listán marad, csak ezen az egy helyen nem cseréljük.
 *
 * ⚠️ SZÓHATÁRON keresünk. A helyes alak sokszor RÉSZLETE a hibásnak
 * („adatokat" az „aadatokat"-ban) — ha azt találatnak vennénk, egyetlen ilyen
 * hibát sem javítanánk ki soha.
 */
function szandekos(kisSzoveg, hibas, helyes) {
  const cel = String(helyes || '').toLowerCase();
  if (!cel || cel === hibas) return false;

  for (let i = kisSzoveg.indexOf(hibas); i >= 0; i = kisSzoveg.indexOf(hibas, i + 1)) {
    if (betu(kisSzoveg[i - 1]) || betu(kisSzoveg[i + hibas.length])) continue;

    const eleje = Math.max(0, i - KORNYEZET);
    const ablak = kisSzoveg.slice(eleje, i + hibas.length + KORNYEZET);
    const sajatKezdet = i - eleje;

    for (let j = ablak.indexOf(cel); j >= 0; j = ablak.indexOf(cel, j + 1)) {
      // A hibás szó SAJÁT betűi nem számítanak külön előfordulásnak.
      if (j >= sajatKezdet && j < sajatKezdet + hibas.length) continue;
      if (!betu(ablak[j - 1]) && !betu(ablak[j + cel.length])) return true;
    }
  }
  return false;
}

export default {
  BATCH, HU_JUDGE_PROMPT, emptyStore, isFixable, isAccentOnly,
  safeContext, sentenceConfirms, salvageVerdicts, editDistance, MAX_TAVOLSAG,
  judgeWords, applyVerdicts, applyFixes, needsReview
};
