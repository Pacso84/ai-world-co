// ===================================================================
// ÚTMUTATÓ-ÁLLÍTÁSOK — amit FORRÁS NÉLKÜL írtunk le tényként
// ===================================================================
//
// ELŐZMÉNY (2026-08-17, user-lelet: „az útmutatóknál valami nem stimmel"):
// három élő útmutatóban volt hamis tartalom, MINDHÁROM ugyanabból a gyökérből:
// az útmutatók FORRÁS NÉLKÜL készülnek, így a modell olyan felületet ír le,
// amit sosem látott. Mérve a publikált korpuszon (324 útmutató):
//     324 / 324 (100%) útmutatónak NINCS `_meta.source_link`-je
//     155 / 324  (48%) konkrét felület-elemet is megnevez
//
// A HÁROM BUKÁS:
//   1. Genie One (Databricks) — kitalált gombnevek („Related questions",
//      „Explore further", „Share" ikon) ÉS céges termék kezdőknek ajánlva.
//   2. Midjourney-grafikák — a webappra küld, majd a DISCORD-bot U1–U4 /
//      V1–V4 gombjait írja le.
//   3. Midjourney-profilképek — „there might be very limited free trials
//      sometimes", holott 2023 márciusa óta nincs ingyenes próba. Ugyanezen
//      az oldalon a másik Midjourney-útmutató az ELLENKEZŐJÉT írta.
//
// ⚠️ MIND A HÁROM JELZÉS TANÁCSADÓ (nincs a BLOCKING_CODES listán). A user
// szabálya erre az osztályra: „tanuljon, de ne utasítson el" — az elutasítás
// FIZETŐS újraírást indít, a lecke ingyen javítja a KÖVETKEZŐ cikket.
//
// ⚠️ AMIT NEM ÉPÍTETTEM MEG, ÉS MIÉRT — a mérés a fájl alján, a
//    `MIÉRT NINCS KERESZT-ELLENTMONDÁS ÉS FELÜLET-EGYEZÉS KAPU` szakaszban.
// ===================================================================

/** Ennyi MAGABIZTOS, termék-specifikus felirat-állítástól szólunk. Kalibráció lentebb. */
export const UI_CLAIM_MIN = 3;
/** Ennyi FÜGGETLEN céges-hozzáférés jeltől szólunk. Kalibráció lentebb. */
export const ACCESS_SIGNAL_MIN = 2;

// -------------------------------------------------------------------
// KÖZÖS ELŐKÉSZÍTÉS
// -------------------------------------------------------------------

/** A cikk törzse: frontmatter, kódblokk és inline kód nélkül. */
export function articleBody(markdown) {
  const raw = String(markdown == null ? '' : markdown);
  const m = raw.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/);
  return (m ? m[1] : raw)
    .replace(/```[\s\S]*?```/g, ' ')     // a példa-promptok NEM felület-állítások
    .replace(/`[^`\n]*`/g, ' ');
}

// ===================================================================
// TAGMONDAT, NEM MONDAT — itt dőlt el a „magabiztos vs. őszinte" kérdés
// ===================================================================
// A hedge CSAK azt az állítást menti, amelyik MELLETT áll. Mondat-szinten
// mérve a „tap the 'Send' button, often represented by a paper plane" is
// hedgeltnek látszana, pedig az „often" az IKONRA vonatkozik, nem arra, hogy
// létezik-e ilyen feliratú gomb. Ezért tagmondatra bontunk.
// ⚠️ A VESSZŐ-SZABÁLY NEM DÍSZ: az első változat csak kötőszó előtt vágott, és
// a fenti Genie One-mondatot EGYBEN hagyta — vagyis a modul a saját indoklásának
// mondott ellent (a teszt fogta meg). Vessző + utólagos módosító („, often …",
// „, which might …") ezért külön tagmondat. Sima felsorolás-vesszőn NEM vágunk:
// a „buttons labeled **U1, U2, U3, U4**" egyetlen felirat-állítás.
const CLAUSE_SPLIT = /[.!?;\n]+|\s+[—–]\s+|\s+-\s+|,\s*(?=(?:but|or|though|although|which|while|often|usually|typically|generally|normally|sometimes|probably|likely|depending|unless|if)\b)/i;

export function clauses(text) {
  return String(text || '').split(CLAUSE_SPLIT).map(s => s.trim()).filter(Boolean);
}

// ===================================================================
// 1. FELÜLET-ÁLLÍTÁS (UI_CLAIMS_UNSOURCED)
// ===================================================================
// A MÉRCE: nem „említ-e felületet", hanem ÁLLÍTJA-E, HOGY EGY KONKRÉT
// FELIRAT OTT VAN A KÉPERNYŐN. Ez a különbség menti meg a jó útmutatót:
//
//   „Midjourney updates its layout often, but the prompt box is always
//    near the center of the screen."          → NEM állítás: nincs felirat
//   „you'll see a row of small buttons labeled U1, U2, U3, U4"
//                                             → ÁLLÍTÁS: konkrét felirat
//
// A „prompt box" helyzetet ír le, nem feliratot — ezért egyik mintára sem
// illeszkedik. A U1–U4 viszont egy szó szerinti képernyő-felirat, amit
// forrás nélkül senki nem tud igazolni (és éppen ez volt a 2. bukás).

const UI_NOUN = 'button|tab|menu|icon|toggle|checkbox|dropdown|drop-down|field|box|panel|pane|sidebar|option|switch|section|link';
// FELIRAT: idézőjelben vagy félkövéren áll — így jelöli a szerző, hogy ez a
// képernyőn látható szöveg. (A backtick-es alak kódnak számít, azt kivágtuk.)
const LABEL = String.raw`(?:\*\*([^*\n]{1,40})\*\*|"([^"\n]{1,40})"|'([^'\n]{1,40})'|“([^”\n]{1,40})”)`;
// …vagy jelöletlenül, de NAGYBETŰVEL — „buttons labeled U1", „the Sources panel".
const CAPS = String.raw`([A-Z][A-Za-z0-9+]{0,20}(?:\s+[A-Z][A-Za-z0-9+]{0,20}){0,2})`;

const UI_CLAIM_RX = [
  new RegExp(String.raw`(?:${UI_NOUN})s?\s+(?:labell?ed|called|named|marked|that says|saying)\s+${LABEL}`, 'g'),
  new RegExp(String.raw`\b(?:the|a|an)\s+${LABEL}\s+(?:${UI_NOUN})\b`, 'g'),
  new RegExp(String.raw`\b(?:[Cc]lick|[Tt]ap|[Pp]ress|[Ss]elect|[Cc]hoose|[Hh]it)\s+(?:on\s+)?(?:the\s+)?${LABEL}`, 'g'),
  new RegExp(String.raw`(?:${UI_NOUN})s?\s+(?:labell?ed|called|named|marked)\s+${CAPS}`, 'g'),
  new RegExp(String.raw`\bthe\s+${CAPS}\s+(?:${UI_NOUN})\b`, 'g')
];

// ŐSZINTE HEDGE: a szerző elismeri, hogy a képernyő MÁS LEHET, és utat ad
// tovább. Ez az, amit a jó útmutató csinál — ezt nem büntetjük.
const HEDGE_RX = /\b(usually|often|typically|generally|normally|likely|probably|might|may|could|sometimes|somewhere|or similar|something like|look(?:ing)? for|looks? different|if you (?:don'?t|can'?t|do not|cannot)|if it|if the|varies|vary|depend|in most|your screen|instead|check)\b/i;

// ===================================================================
// EGYETEMES FELIRATOK — ezeket nem lehet „kitalálni"
// ===================================================================
// A korpuszon 573 különböző feliratot mértem; 455 (79%) csak EGYETLEN
// útmutatóban fordul elő, vagyis a ritkaság önmagában nem szűr. Ami viszont
// szűr: a leggyakoribbak (new chat 70×, enter 59×, send 56×, copy 43×,
// save 20×) minden alkalmazásban ott vannak — ha ezekben tévedünk, az olvasó
// magától megtalálja a helyeset. A KOCKÁZAT a termék-specifikus feliratban
// van („U1", „Related questions", „Purchase Reserved Capacity").
// A lista EXPLICIT szóalakokból áll, SOHA nem előtag-illesztésből — ugyanaz
// a szabály, mint a core/us-spelling.js-ben (az analysis→analyzis csapda).
const COMMON_LABELS = new Set(`enter,esc,escape,tab,space,delete,backspace,return,shift,command,
ctrl+c,ctrl+v,ctrl+a,ctrl + c,ctrl + v,ctrl + a,cmd+c,cmd+v,
send,send message,save,save as,copy,copy link,paste,cut,share,edit,done,cancel,ok,okay,next,back,
close,open,add,remove,search,settings,help,home,profile,account,about,history,
sign in,sign up,signin,signup,sign out,log in,login,log out,logout,
submit,continue,download,upload,install,create,new,new chat,new file,new folder,more,menu,
allow,accept,deny,yes,no,run,start,stop,play,pause,print,export,import,refresh,reply,file,
select all,generate,chat,apply,confirm,finish,got it,skip,retry,try again,view,preview,
undo,redo,filter,sort,upgrade,go,ask,+`
  .split(/[,\n]/).map(s => s.trim()).filter(Boolean));

/** A felirat egységes alakja (záró írásjel, idézőjel nélkül, kisbetűs). */
function normalizeLabel(s) {
  return String(s || '')
    .replace(/[.,;:!?"'“”…]+$/g, '')
    .replace(/^[.,;:!?"'“”\s]+/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * FELIRAT-LISTA SZÉTBONTÁSA (2026-08-17).
 *
 * A `**U1, U2, U3, U4**` NÉGY feliratot állít, nem egyet. Az első változat
 * egyetlen „u1, u2, u3, u4" címkét csinált belőle, és emiatt pont a MOTIVÁLÓ
 * ESET — a Midjourney-útmutató, ami a webre küldött, de a Discord gombjait
 * írta le — csúszott át a küszöb alatt. A kapu a saját szülőokát engedte át.
 *
 * ⚠️ CSAK akkor bontunk, ha MINDEN darab rövid (max 3 szó). Különben egy
 * vesszős mondatrészt („the Settings menu, which you reach from the sidebar")
 * tépnénk apró álcímkékre, és a kapu hamis riasztásokba fulladna.
 */
function splitLabelList(label) {
  if (!/,|\band\b/.test(label)) return [label];
  const parts = label.split(/\s*,\s*|\s+and\s+/).map(s => s.trim()).filter(Boolean);
  if (parts.length < 2) return [label];
  if (!parts.every(p => p.split(/\s+/).length <= 3)) return [label];
  return parts;
}

/**
 * MAGABIZTOS, termék-specifikus felirat-állítások a szövegben.
 *
 * KÜLÖNBÖZŐ feliratot számolunk, nem előfordulást: ha ugyanaz a gomb hatszor
 * szerepel, az EGY állítás — különben egy bőbeszédű, de helyes útmutató
 * ugyanoda kerülne, mint egy kitalálós.
 *
 * @param {string} markdown
 * @returns {{count:number, labels:string[]}}
 */
export function confidentUiClaims(markdown) {
  const labels = new Set();
  for (const c of clauses(articleBody(markdown))) {
    // ⚠️ A HEDGE-VIZSGÁLAT A FELIRATOK NÉLKÜLI SZÖVEGRE FUT (2026-08-17).
    // A HEDGE_RX-ben benne van a `vary` („the layout may vary") — a Midjourney
    // gombja viszont SZÓ SZERINT „Vary". Emiatt egy létező gombnév az EGÉSZ
    // tagmondatot hedgeltnek mutatta, és a kapu néma maradt rá. Egy felirat
    // BELSEJÉBEN álló szó nem bizonytalanság, hanem tulajdonnév.
    const hedgeProbe = c.replace(/\*\*[^*]+\*\*/g, ' ').replace(/["'“”‘’]([^"'“”‘’]{1,40})["'“”‘’]/g, ' ');
    if (HEDGE_RX.test(hedgeProbe)) continue;      // őszinte hedge → nem állítás
    for (const rx of UI_CLAIM_RX) {
      rx.lastIndex = 0;
      for (const m of c.matchAll(rx)) {
        const label = normalizeLabel(m[1] || m[2] || m[3] || m[4] || m[5]);
        for (const part of splitLabelList(label)) {
          if (part.length < 2) continue;
          if (COMMON_LABELS.has(part)) continue;  // egyetemes felirat → nem kockázat
          labels.add(part);
        }
      }
    }
  }
  return { count: labels.size, labels: [...labels] };
}

// ===================================================================
// 2. ROMLANDÓ PÉNZ-TÉNY (PRICE_CLAIM_UNSOURCED)
// ===================================================================
// A 3. bukás pontosan ez volt: „there might be very limited free trials
// sometimes". A HEDGE ITT NEM MENT — sőt. Az olvasó a pénztárcáját tervezi
// rá; egy bizonytalan pénz-állítás azt jelenti, hogy a szerző nem tudta.
//
// MIÉRT EZ A SZŰK HALMAZ (mérve, 324 útmutató):
//     free tier            58 (18%)   ← SZERKEZETI leírás, ritkán fordul át
//     free plan            51 (16%)   ←     „
//     free version         29  (9%)   ←     „
//     free trial(s)        11  (3%)   ← IDŐSZAKOS ajánlat: ez járt le
//     $ összeg             41 (13%)   ← szám, ami mozog
//     no free plan/tier     2  (1%)   ← abszolút állítás
//     completely free       3  (1%)   ←     „
//   ─────────────────────────────────
//   tág halmaz (mindegyik)  176 (54%) → a korpusz TÖBBSÉGE, vagyis haszontalan
//   SZŰK halmaz (lejáró)     54 (17%) → ez a kapu
//
// A „free tier"/„free plan" kimarad: a cikkek 40%-ában szerepel, és rendszerint
// hatókörrel („the free tier is enough for this guide"). Ami LEJÁR: az akciós
// próba, az abszolút „teljesen ingyenes", és a konkrét összeg.
const EXPIRING_MONEY_RX = [
  /\bfree trials?\b/i,
  /\bfree credits?\b/i,
  /\b(?:completely|totally|entirely|100%) free\b/i,
  /\bfree forever\b/i,
  /\bno free (?:plan|tier|trial|option|version)\b/i,
  /\$\s?\d[\d.,]*/,
  /\b\d+\s?(?:usd|dollars)\b/i
];

// A KIVEZETŐ ÚT: ha a cikk a HIVATALOS ÁRLAPRA küldi az olvasót, akkor a
// romlandó tény mellé odatette a forrást is — nincs mit tanítani rajta.
const PRICING_POINTER_RX = [
  /\bpricing page\b/i,
  /\bcheck (?:the |their |its )?(?:current )?(?:price|pricing|plans?|cost)/i,
  /\bcurrent (?:pricing|price|plans?|rates?)\b/i,
  /\b(?:prices?|pricing|plans?|tiers?) (?:can |may |might |do )?(?:change|vary|shift)/i,
  /\bas of (?:this writing|today|\w+ \d{4})\b/i,
  /\bat the time of writing\b/i
];

/**
 * Lejáró pénz-tények és az árlapra mutatás.
 * @returns {{claims:string[], pointsAtPricing:boolean}}
 */
export function expiringMoneyClaims(markdown) {
  const body = articleBody(markdown);
  const claims = [];
  for (const rx of EXPIRING_MONEY_RX) {
    const m = body.match(rx);
    if (m) claims.push(m[0].trim().toLowerCase());
  }
  return { claims, pointsAtPricing: PRICING_POINTER_RX.some(rx => rx.test(body)) };
}

// ===================================================================
// 3. NEM ÖNKISZOLGÁLÓ HOZZÁFÉRÉS (ACCESS_NOT_SELF_SERVE)
// ===================================================================
// Az 1. bukás MÁSIK fele — és ezt a felület-kapu SOHA nem fogta volna meg.
// A Genie One-cikk minden kitalált gombnevét gondosan hedgelte („look for",
// „often", „or similar"), tehát magabiztos állítást alig tett. Ami viszont
// feketén-fehéren ott állt a SAJÁT előfeltétel-listájában:
//     „This app is usually provided and set up by your workplace."
//     „Your company login details: your standard work username and password"
//     „unless your IT team has specifically configured it"
// Vagyis az olvasónk — hétköznapi ember — el sem tud indulni. Az alcím mégis
// azt ígérte neki, hogy „empower your business decisions… right from your
// mobile device".
//
// KALIBRÁCIÓ (324 útmutató): 1 jelre 10 cikk (3%) akadna fenn, de a hetéből
// mind MELLÉKES EMLÍTÉS („your IT admin may have turned this off", „enterprise
// agreement") — ott az olvasó simán el tud indulni. 2 FÜGGETLEN jelre 3 cikk
// (0,9%) marad, és mind a három valódi: céges Copilot, céges postafiók,
// munkahelyi biztonsági kulcs. A Genie One 4 jelet ad (a korpusz maximuma,
// holtversenyben a biztonsági-kulcs útmutatóval). Ezért a küszöb 2.
//
// ⚠️ AZ „ask your manager" MINTA SZÁNDÉKOSAN NEM SZEREPEL: az első változatban
// benne volt, és egy FELMONDÓLEVÉL-útmutatót jelölt meg. A főnök megkérdezése
// nem hozzáférés-korlát.
const EMPLOYER_ACCESS_RX = [
  /\bprovided (?:and set up )?by your (?:workplace|employer|company|organi[sz]ation|IT)\b/i,
  /\byour (?:company|work|corporate|organi[sz]ation'?s?)\s+(?:login|credentials|account|sign-?in|username|password)\b/i,
  /\byour (?:standard )?work (?:username|password|email account|login|sign-?in)\b/i,
  /\byour IT (?:team|department|admin(?:istrator)?)\b/i,
  /\bask your (?:IT|admin|administrator|employer)\b/i,
  /\benterprise (?:plan|tier|only|customers?|licen[cs]e|edition|agreement)\b/i,
  /\bcontact (?:the )?sales\b/i,
  /\b(?:business|work(?:place)?|corporate|company) account (?:is )?(?:required|needed)\b/i,
  /\badmin(?:istrator)? (?:must|has to|needs to|will need to)\b/i
];

/** Céges/IT-osztott hozzáférésre utaló FÜGGETLEN jelek. */
export function employerOnlyAccess(markdown) {
  const body = articleBody(markdown);
  const signals = [];
  for (const rx of EMPLOYER_ACCESS_RX) {
    const m = body.match(rx);
    if (m) signals.push(m[0].trim().toLowerCase());
  }
  return { signals };
}

// ===================================================================
// A KAPU
// ===================================================================
// A FELTÉTEL A GYÖKÉROK: nincs mihez mérni a leírtakat. Ma ez pontosan a
// 324 útmutatót jelenti (100%) és a 404 hírből nullát — a hír mindig
// forrásból készül. Ha egyszer az útmutatók is kapnak forrást, ez a kapu
// MAGÁTÓL elhallgat rajtuk; nem kell majd kivenni.
//
// ⚠️ A `source_link` szóközzel körbevéve is előfordul (3 hír-cikkben mérve),
// ezért trimmelünk — enélkül azok némán ide esnének.
export function hasUsableSource(meta) {
  return /^https?:\/\/\S+/i.test(String(meta?.source_link || '').trim());
}

/**
 * A három TANÁCSADÓ jelzés — „KÓD: emberi szöveg" alakban, a ház szokása szerint.
 * A jelzés VÁLTOZÓ része (feliratok, összegek) a naplóé; a tanítható LECKE
 * a core/auto-check-codes.js-ben él, ÁLLANDÓ szöveggel.
 *
 * @param {string} markdown
 * @param {object} meta       a cikk `_meta`-ja (source_link, type)
 * @returns {string[]}
 */
export function guideClaimIssues(markdown, meta = {}) {
  const issues = [];
  if (hasUsableSource(meta)) return issues;      // van mihez mérni — nincs mit tanítani

  const ui = confidentUiClaims(markdown);
  if (ui.count >= UI_CLAIM_MIN) {
    issues.push(`UI_CLAIMS_UNSOURCED: ${ui.count} konkrét képernyő-feliratot állít tényként forrás nélkül `
      + `(${ui.labels.slice(0, 4).map(l => `"${l}"`).join(', ')}${ui.labels.length > 4 ? ', …' : ''}). `
      + `Vagy nézd meg a hivatalos oldalon, vagy írd hedge-elve ("if you don't see…").`);
  }

  const money = expiringMoneyClaims(markdown);
  if (money.claims.length && !money.pointsAtPricing) {
    issues.push(`PRICE_CLAIM_UNSOURCED: lejáró pénz-állítás forrás és árlap-hivatkozás nélkül `
      + `(${money.claims.slice(0, 3).map(c => `"${c}"`).join(', ')}). `
      + `A Midjourney-próba 2023 márciusa óta nem létezik, mégis kiment egy cikkünkben.`);
  }

  const access = employerOnlyAccess(markdown);
  if (access.signals.length >= ACCESS_SIGNAL_MIN) {
    issues.push(`ACCESS_NOT_SELF_SERVE: ${access.signals.length} jel arra, hogy az olvasónak céges/IT-hozzáférés kell `
      + `(${access.signals.slice(0, 3).map(s => `"${s}"`).join(', ')}) — a hétköznapi olvasónk el sem tud indulni.`);
  }

  return issues;
}

// ===================================================================
// MIÉRT NINCS KERESZT-ELLENTMONDÁS ÉS FELÜLET-EGYEZÉS KAPU (2026-08-17)
// ===================================================================
// Mindkettőt megmértem a korpuszon, és mindkettő MEGBUKOTT. Rossz szabályt
// szállítani rosszabb, mint nem szállítani: a tanácsadó jelzés is LECKÉT ír
// az Író promptjába, és a hamis lecke ott marad.
//
// 1) KERESZT-ELLENTMONDÁS (két útmutató ugyanarról az eszközről ellentétet
//    állít az árról). Ez a VALÓDI kár volt: az egyik Midjourney-cikk „no free
//    option", a másik „there might be very limited free trials". Mégsem
//    építettem meg — három, méréssel igazolt ok:
//    • HOZZÁRENDELÉS: az útmutató 2–6 eszközt említ. A javítás ELŐTTI
//      grafikus cikk az én szigorú osztályozómnál „VAN ingyenes" oldalra
//      került — egy CANVÁ-ról szóló mondat miatt („open it in a free tool
//      like Canva (the free tier is enough)"). Az eszköz-hozzárendelés
//      szövegből nem megbízható.
//    • HATÓKÖR: a 18 többútmutatós eszközből 4-nél jött ki „ellentmondás",
//      és mind a négy HAMIS: „creating your own custom GPT requires Plus"
//      vs. „the guide works on the free tier" — mindkettő IGAZ, csak más
//      funkcióra. Az olvasót semmi nem téveszti meg.
//    • ÖNCÁFOLAT: a MÁR KIJAVÍTOTT profilkép-útmutató a szigorú osztályozónál
//      „VAN ingyenes"-re fordul, mert a tagadó mondatban is ott a szó:
//      „Midjourney ended its free trial in March 2023." Egy kapu, ami a
//      javított cikkre fordítva sül el, rosszabb a semminél.
//    Amit ehelyett teszünk: a PRICE_CLAIM_UNSOURCED mindkét cikkre szól, és
//    ugyanazt tanítja — pénz-tényt csak az árlappal együtt.
//
// 2) FELÜLET-EGYEZÉS (webre küld, de Discord/asztali felületet ír le).
//    A 324 útmutatóból ÖSSZESEN 3 említi a Discordot, ebből 2 a két
//    Midjourney-cikk — vagyis a szabály n=2-re illeszkedne, és semmire nem
//    általánosítana. Ráadásul a grafikus cikkben az EGYETLEN Discord-említés
//    egy HELYES mondat („Log in with … Google, Discord, or email"), a valódi
//    hiba pedig a U1–U4 gombnév — annak Discord-voltát csak TERMÉKISMERETBŐL
//    lehet tudni, kódból nem. Az a hiba a UI_CLAIMS_UNSOURCED-be esik, ahol
//    a helye van.
// ===================================================================

export default {
  UI_CLAIM_MIN, ACCESS_SIGNAL_MIN,
  articleBody, clauses, confidentUiClaims, expiringMoneyClaims,
  employerOnlyAccess, hasUsableSource, guideClaimIssues
};
