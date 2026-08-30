// ===================================================================
// KÖLTSÉGKERET-FIGYELŐ (budget guard)
// ===================================================================
// Számon tartja a napi/havi AI-költést providerenként, és eldönti, mikor
// kell a FIZETŐS (metered) kulcsokról a FREE kulcsokra váltani.
//
//   - A free tier 429-cel jelez (azt a router quota-state-je kezeli).
//   - A FIZETŐS terv (pl. Gemini paid, Anthropic) NEM jelez — ott PÉNZ fogy.
//     Ezért itt követjük a költést, és ha eléri a napi keretet, a metered
//     providereket kihagyjuk → a router a free kulcsokra vált.
//
// Állapot: core/budget-state.json  { days: { "YYYY-MM-DD": { total, byProvider } } }
//
// ===================================================================
// 🧯 A NÉMA NULLÁZÁS (2026-08-30, javítva)
// ===================================================================
// EDDIG: `load()` bármilyen JSON-hibára `{ days: {} }`-t adott vissza, `save()`
// pedig `catch { /* ignore */ }`-szel nyelte az írás hibáját, ráadásul az írás
// NEM VOLT ATOMI (writeFileSync egyenesen az éles fájlra).
//
// MI KÖVETKEZETT EBBŐL: egy félbevágott állapotfájl (2026-07-31: a jobot MENET
// KÖZBEN ölte meg az időkorlát) elég volt ahhoz, hogy a teljes költés-történet
// eltűnjön — és a következő `recordSpend` ezt a nullát ÍRTA VISSZA. Ezzel a
// napi $1 ÉS a havi $25 plafon EGYSZERRE kikapcsolt a hónap végéig.
// 🔑 A kár azért nagy, mert OLCSÓ NAPNAK LÁTSZIK: a napi riport $0.00-t mutat,
// ami megnyugtató, nem riasztó. A hiba pont ott néma, ahol a user néz.
//
// MOST: (1) az írás atomi (ideiglenes fájl → renameSync), tehát egy megölt
// futás nem hagy félbevágott állapotot; (2) sérülésnél félretesszük a sérült
// tartalmat, KIMENTJÜK belőle, ami menthető (a napi totálokat), HANGOSAN
// szólunk, és jelet hagyunk a napi riportnak; (3) az írás hibája sem néma.
//
// A NAPI RIPORTBA MAJD EZ A SOR KELL (core/daily-report.js — a bekötést MÁS
// javítja, ide csak az állapotfájl készül el, a többi őrszem mintájára):
//
//   try {
//     const bg = JSON.parse(readFileSync(join(ROOT, 'memory', 'budget-guard.json'), 'utf-8'));
//     for (const p of bg.problems || []) {
//       if (p.code === 'BUDGET_STATE_CORRUPT')
//         lines.push(`🧯 KÖLTSÉG-ŐRSZEM: SÉRÜLT a költés-nyilvántartás (${p.at.slice(0, 10)}, ${p.count}×) — `
//           + `${p.recoveredDays} nap mentve ($${p.recoveredMonth} a futó hónapban), a sérült fájl: ${p.backup}. `
//           + `Amíg ez tartott, a napi/havi plafon HIÁNYOS adatból számolt.`);
//       else if (p.code === 'BUDGET_STATE_WRITE_FAILED')
//         lines.push(`🧯 KÖLTSÉG-ŐRSZEM: NEM SIKERÜLT menteni a költést (${p.error}) — `
//           + `a nyilvántartás megállt, a napi/havi plafon NEM SÜL EL, amíg ez tart.`);
//     }
//   } catch { /* még nem volt baj — nem baj */ }
//
// A jel 7 nap után magától kiesik (kell ÚT VISSZA A NULLÁHOZ is), de amíg a
// baj ismétlődik, a `count` nő és a bejegyzés frissül.
//
// ⚠️ AMI EZZEL SEM OLDÓDIK MEG: a párhuzamos futás. A beolvasás-módosítás-írás
// nem zárolt, tehát két egyszerre futó folyamatnál az utolsó írás nyer (a
// fordító `--concurrency 5`-tel megy). Az atomi írás annyit garantál, hogy a
// fájl SOSEM lesz félkész — nem azt, hogy egyetlen tétel sem veszhet el.
// ===================================================================

import { readFileSync, writeFileSync, existsSync, renameSync, unlinkSync, mkdirSync, readdirSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, basename } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
// A `BUDGET_STATE_PATH` CSAK a tesztnek van (core/budget.test.js): az éles
// nyilvántartás git-követett és valódi pénzt számol, oda egy teszt nem írhat.
const STATE_PATH = process.env.BUDGET_STATE_PATH || join(__dirname, 'budget-state.json');
// A jel, amit a napi riport beolvas. Ha az állapot ideiglenes útvonalon van
// (teszt), a jel is oda kerül mellé — így az éles memory/ mappa érintetlen.
const GUARD_PATH = process.env.BUDGET_STATE_PATH
  ? join(dirname(STATE_PATH), 'budget-guard.json')
  : join(__dirname, '..', 'memory', 'budget-guard.json');
const CONFIG = JSON.parse(readFileSync(join(__dirname, '..', 'config.json'), 'utf-8'));
const LIMITS = CONFIG.limits || {};

// Mely providerek FIZETŐSEK (metered)? Ezeket fékezi a költségőr.
// A free kulcsok (groq, cerebras, mistral, openrouter:free, cloudflare) sosem.
// OPENROUTER VEGYES (2026-07-15): a ':free' végű modellek ingyenesek, minden
// más FIZETŐS (pl. minimax/minimax-m3) — ezért modell-szinten döntünk.
const METERED = new Set(['google', 'anthropic', 'openai', 'deepseek', 'perplexity']);
export function isMetered(provider, model = '') {
  if (METERED.has(provider)) return true;
  if (provider === 'openrouter' && model && !/:free$/.test(model)) return true;
  return false;
}

function today() { return new Date().toISOString().slice(0, 10); }       // YYYY-MM-DD
function month() { return new Date().toISOString().slice(0, 7); }        // YYYY-MM

// ===================================================================
// IDŐZÍTETT KERET-VÁLTÁS (2026-07-30)
// ===================================================================
// A hard cap a FUTÓ HÓNAP költésével van összevetve. Ezért egy tervezett
// csökkentést (júl. 50 → aug. 40) NEM lehet előre beírni: ha ma állítanám
// 40-re, július pedig már $41,91-nél tart, a cég AZONNAL LEÁLLNA a hónap
// hátralévő részére.
//
// Eddig ez emberi emlékezeten múlt ("augusztus 1-jén állítsd át"). Most a
// config megadhatja HÓNAPRA BONTVA is (monthly_budget_usd_hard_cap_by_month),
// és a váltás magától megtörténik a hónapfordulón — senkinek nem kell rá
// emlékeznie, és nincs az a veszély, hogy túl korán lép életbe.
function capForMonth(m) {
  const byMonth = LIMITS.monthly_budget_usd_hard_cap_by_month;
  if (byMonth && typeof byMonth === 'object') {
    // A LEGKÉSŐBBI olyan bejegyzés, ami már életbe lépett (így elég egyszer
    // beírni: onnantól minden későbbi hónapra az érvényes, amíg nincs újabb).
    const keys = Object.keys(byMonth).filter(k => k <= m).sort();
    if (keys.length) return Number(byMonth[keys[keys.length - 1]]);
  }
  return Number(LIMITS.monthly_budget_usd_hard_cap ?? 80);
}

const MONTH_HARD_CAP = capForMonth(month());
const MONTH_TARGET = Number(LIMITS.monthly_budget_usd_target ?? 30);

// ── NAPI HARD CAP (2026-08-01, user: "legyen egy napi korlát ami 1 dollár,
// ez sokba kerül ezek a javítások így") ─────────────────────────────
// ELŐZMÉNY: 07-31-én a napi költés $0,60-ról $2,51-re ugrott, mert egy
// tömeges cikkjavítás 136 cikk fordítás-gyorsítótárát törölte → 544
// újrafordítás. A havi keret ezt nem fogta meg: $2,51 még bőven belefér
// $40-ba, csak épp EGY NAP alatt viszi el a havi keret 6%-át.
//
// A KORÁBBI ELV ("nincs napi plafon") ezzel felülírva — user-döntés.
// A napi és a havi keret KÜLÖNBÖZŐ dolog ellen véd: a havi a hónap végi
// számla ellen, a napi egy hirtelen elszabaduló nap ellen. $1/nap × 31 =
// $31, ami pont a $30-as havi CÉL körül van, tehát a kettő összhangban van.
//
// MI TÖRTÉNIK A KORLÁTNÁL: ugyanaz, mint a havinál — a fizetős agentek
// SZÜNETELNEK (nem esnek gyenge ingyenes modellre, mert az rontaná a
// minőséget), a munka a következő napra csúszik. A napi számláló éjfélkor
// (UTC) magától nullázódik, tehát nem kell semmit visszakapcsolni.
//
// SORREND-SZERENCSE: a drága fordítás a futásban a cikkírás UTÁN van, így
// ha a keret betelik, az a fordítást állítja meg, nem a napi tartalmat.
const DAY_HARD_CAP = Number(LIMITS.daily_budget_usd_hard_cap ?? 0) || null;

// ===================================================================
// HIBATŰRÉS — atomi írás, hangos sérülés-kezelés, jel a napi riportnak
// ===================================================================

// Egy folyamaton belül kódonként EGYSZER szólunk (a recordSpend futásonként
// több százszor fut — a második azonos figyelmeztetés már csak zaj).
const mar_szolt = new Set();
let ideiglenesek_takaritva = false;

/**
 * ATOMI ÍRÁS: előbb egy ideiglenes fájlba, aztán `renameSync` a helyére.
 * A rename a fájlrendszer szintjén oszthatatlan, tehát egy megölt futás
 * legrosszabb esetben egy félkész `.tmp-<pid>` fájlt hagy — a nyilvántartás
 * maga sosem lesz csonka. A `.tmp-<pid>` NÉV KELL: két párhuzamos folyamat
 * nem írhat ugyanabba az ideiglenes fájlba.
 */
function atomiIras(ut, szoveg) {
  const ideiglenes = `${ut}.tmp-${process.pid}`;
  try {
    writeFileSync(ideiglenes, szoveg, 'utf-8');
    renameSync(ideiglenes, ut);
  } catch (e) {
    try { if (existsSync(ideiglenes)) unlinkSync(ideiglenes); } catch { /* mindegy */ }
    throw e;
  }
}

/**
 * Egy megölt futás után ottmaradhat egy `.tmp-<pid>` fájl. A CI `git add -A`-t
 * futtat, tehát ez idővel becommitolt szemét lenne. Folyamatonként EGYSZER
 * takarítunk, és csak az 1 óránál régebbieket — egy párhuzamosan futó
 * folyamat éppen írásban lévő fájljához nem nyúlunk.
 */
function regiIdeiglenesek() {
  if (ideiglenesek_takaritva) return;
  ideiglenesek_takaritva = true;
  try {
    const mappa = dirname(STATE_PATH), elotag = basename(STATE_PATH) + '.tmp-';
    for (const f of readdirSync(mappa)) {
      if (!f.startsWith(elotag)) continue;
      const p = join(mappa, f);
      if (Date.now() - statSync(p).mtimeMs > 3600e3) unlinkSync(p);
    }
  } catch { /* nem kritikus */ }
}

/** A sérült fájlból kimenthető napi totálok. Lásd `menthetoNapok`. */
function providerBontas(reszlet) {
  const ki = {};
  // Csak a SAJÁT napjának blokkjában keresünk: a következő dátum-kulcsnál vége.
  const kov = /"\d{4}-\d{2}-\d{2}"\s*:/.exec(reszlet.slice(1));
  const blokk = kov ? reszlet.slice(0, kov.index + 1) : reszlet;
  const m = /"byProvider"\s*:\s*\{([^{}]*)\}/.exec(blokk);
  if (!m) return ki;                       // félbevágott bontás → csak a totál marad
  const re = /"([^"]+)"\s*:\s*(-?\d+(?:\.\d+)?)/g;
  let p;
  while ((p = re.exec(m[1]))) ki[p[1]] = Number(p[2]);
  return ki;
}

/**
 * AMI MENTHETŐ, AZ MENEKÜLJÖN. A tipikus sérülés csonkolás (megölt írás), ott
 * a fájl ELEJE ép: a napi totálok kiolvashatók akkor is, ha a JSON egésze nem
 * parse-olható. Ez tartja fegyverben a plafont — enélkül a sérülés = szabad
 * költés a hónap végéig.
 * ⚠️ Szándékosan SZŰK a minta: csak `"YYYY-MM-DD": { … "total": <szám>`
 * alakot fogad el. Amit nem ismer fel, azt elveszettnek jelenti — inkább
 * hiányos szám, mint kitalált.
 */
function menthetoNapok(nyers) {
  const days = {};
  if (typeof nyers !== 'string') return days;
  const re = /"(\d{4}-\d{2}-\d{2})"\s*:\s*\{[^{}]*?"total"\s*:\s*(-?\d+(?:\.\d+)?)/g;
  let m;
  while ((m = re.exec(nyers))) {
    const total = Number(m[2]);
    if (!Number.isFinite(total) || total < 0) continue;
    days[m[1]] = { total, byProvider: providerBontas(nyers.slice(m.index)) };
  }
  return days;
}

/** Jel a napi riportnak: memory/budget-guard.json { at, problems:[…] }. */
function jeletHagy(problem) {
  try {
    mkdirSync(dirname(GUARD_PATH), { recursive: true });
    let elozo = [];
    if (existsSync(GUARD_PATH)) {
      try { elozo = JSON.parse(readFileSync(GUARD_PATH, 'utf-8')).problems || []; } catch { elozo = []; }
    }
    const regi = elozo.find(p => p && p.code === problem.code);
    problem.count = (regi?.count || 0) + 1;
    problem.firstAt = regi?.firstAt || problem.at;
    // 7 napnál régebbi bejegyzés kiesik: egy megoldott bajnak legyen ÚTJA
    // VISSZA A NULLÁHOZ, különben a riport örökké ugyanazt sírja.
    const hatar = Date.now() - 7 * 24 * 3600e3;
    const problems = [
      ...elozo.filter(p => p && p.code !== problem.code && p.at && Date.parse(p.at) >= hatar),
      problem
    ].slice(-20);
    atomiIras(GUARD_PATH, JSON.stringify({ at: new Date().toISOString(), problems }, null, 2));
  } catch { /* a konzol-figyelmeztetés akkor is kiment */ }
}

/** A sérült tartalom félretétele: `<fájl>.corrupt-<időbélyeg>`. */
function felrementes(nyers) {
  if (!nyers) return null;         // olvashatatlan fájl: nincs mit félretenni
  try {
    const ut = `${STATE_PATH}.corrupt-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    writeFileSync(ut, nyers, 'utf-8');
    // A legutóbbi 5 elég; a régebbi már csak hely.
    try {
      const mappa = dirname(STATE_PATH), elotag = basename(STATE_PATH) + '.corrupt-';
      const regiek = readdirSync(mappa).filter(f => f.startsWith(elotag)).sort();
      for (const f of regiek.slice(0, Math.max(0, regiek.length - 5))) unlinkSync(join(mappa, f));
    } catch { /* mindegy */ }
    return ut;
  } catch { return null; }
}

function havi(days) {
  const m = month();
  return Object.entries(days).filter(([d]) => d.startsWith(m)).reduce((s, [, v]) => s + (v.total || 0), 0);
}

/**
 * SÉRÜLT ÁLLAPOT. NEM nullázunk némán: félreteszünk, mentünk, szólunk, jelet
 * hagyunk — és a menthető állapotot vissza is írjuk, hogy a következő olvasás
 * már ép fájlt találjon (különben a legelső `recordSpend` írná felül a
 * történetet a nullával, épp ez volt az eredeti hiba).
 */
function serultAllapot(nyers, hiba) {
  const days = menthetoNapok(nyers);
  const db = Object.keys(days).length;
  if (!mar_szolt.has('BUDGET_STATE_CORRUPT')) {
    mar_szolt.add('BUDGET_STATE_CORRUPT');
    const masolat = felrementes(nyers);
    console.log('');
    console.log('🧯 ⚠️  KÖLTSÉG-ŐRSZEM [BUDGET_STATE_CORRUPT] — SÉRÜLT A KÖLTÉS-NYILVÁNTARTÁS');
    console.log(`      fájl:  ${STATE_PATH}`);
    console.log(`      ok:    ${String(hiba?.message || hiba).slice(0, 160)}`);
    console.log(`      sérült másolat: ${masolat || '(nem sikerült félretenni!)'}`);
    console.log(`      menthető: ${db} nap, ebből a futó hónapban $${havi(days).toFixed(4)}`);
    console.log('      ⚠️  A NAPI ÉS A HAVI PLAFON EDDIG EBBŐL AZ ADATBÓL SZÁMOL — nézd meg!');
    console.log('');
    jeletHagy({
      code: 'BUDGET_STATE_CORRUPT',
      at: new Date().toISOString(),
      backup: masolat ? basename(masolat) : null,
      recoveredDays: db,
      recoveredMonth: +havi(days).toFixed(4),
      error: String(hiba?.message || hiba).slice(0, 200)
    });
    save({ days });     // a fájl legyen újra ép, a mentett történettel
  }
  return { days };
}

function load() {
  if (!existsSync(STATE_PATH)) return { days: {} };
  let nyers = null;
  try { nyers = readFileSync(STATE_PATH, 'utf-8'); }
  catch (e) { return serultAllapot('', e); }          // olvashatatlan ≠ nincs költés
  try {
    const s = JSON.parse(nyers);
    if (!s || typeof s !== 'object' || !s.days || typeof s.days !== 'object') {
      throw new Error('hiányzó vagy hibás `days` mező');
    }
    return s;
  } catch (e) {
    return serultAllapot(nyers, e);
  }
}

function save(s) {
  // Csak az utolsó ~45 napot tartjuk meg
  const days = Object.keys(s.days || {}).sort();
  if (days.length > 45) for (const d of days.slice(0, days.length - 45)) delete s.days[d];
  try {
    atomiIras(STATE_PATH, JSON.stringify(s, null, 2));
    regiIdeiglenesek();
    return true;
  } catch (e) {
    // AZ ÍRÁS HIBÁJA NEM APRÓSÁG: innentől a költés nincs számon tartva,
    // tehát a napi/havi plafon SOHA NEM SÜL EL. Ez nem lehet néma.
    if (!mar_szolt.has('BUDGET_STATE_WRITE_FAILED')) {
      mar_szolt.add('BUDGET_STATE_WRITE_FAILED');
      console.log('');
      console.log('🧯 ⚠️  KÖLTSÉG-ŐRSZEM [BUDGET_STATE_WRITE_FAILED] — NEM SIKERÜLT MENTENI A KÖLTÉST');
      console.log(`      fájl: ${STATE_PATH}`);
      console.log(`      ok:   ${String(e?.message || e).slice(0, 160)}`);
      console.log('      ⚠️  A NYILVÁNTARTÁS MEGÁLLT: a napi/havi plafon nem sül el, amíg ez tart.');
      console.log('');
      jeletHagy({
        code: 'BUDGET_STATE_WRITE_FAILED',
        at: new Date().toISOString(),
        error: String(e?.message || e).slice(0, 200)
      });
    }
    return false;
  }
}

// Egy sikeres hívás költségének rögzítése
export function recordSpend(provider, costUsd) {
  const c = Number(costUsd) || 0;
  if (c <= 0) return;
  const s = load();
  const d = today();
  s.days[d] = s.days[d] || { total: 0, byProvider: {} };
  s.days[d].total = +(s.days[d].total + c).toFixed(6);
  s.days[d].byProvider[provider] = +((s.days[d].byProvider[provider] || 0) + c).toFixed(6);
  save(s);
}

export function spentToday() {
  const s = load();
  return s.days[today()]?.total || 0;
}
export function spentThisMonth() {
  const s = load(); const m = month();
  return Object.entries(s.days || {}).filter(([d]) => d.startsWith(m)).reduce((sum, [, v]) => sum + (v.total || 0), 0);
}
export function byProviderToday() {
  return load().days[today()]?.byProvider || {};
}

// A FŐ DÖNTÉS: ki kell-e hagyni MOST a fizetős (metered) providereket?
// FILOZÓFIA: használjuk a fizetős kulcsot, AMÍG BÍRJA — a kimerülést (rate/kvóta
// limit) a router 429-kezelése érzékeli és vált free-re. Itt NINCS napi
// dollár-plafon; csak a havi HARD CAP a végső biztosíték, hogy egy hiba ne
// fusson el a számlával.
export function meteredBlocked() {
  const month = spentThisMonth();
  if (month >= MONTH_HARD_CAP) return { blocked: true, reason: `havi hard cap elérve ($${month.toFixed(2)}/$${MONTH_HARD_CAP}) — végső biztosíték`, hard: true };
  // A NAPI keret a szűkebb: egy elszabaduló nap ellen véd (lásd DAY_HARD_CAP).
  // Éjfélkor (UTC) magától felenged — nincs mit visszakapcsolni.
  if (DAY_HARD_CAP) {
    const day = spentToday();
    if (day >= DAY_HARD_CAP) return { blocked: true, reason: `napi keret elérve ($${day.toFixed(2)}/$${DAY_HARD_CAP}) — a munka holnap folytatódik`, hard: true, daily: true };
  }
  return { blocked: false };
}

// Olvasható állapot a jelentésekhez / Telegramhoz
export function budgetStatus() {
  const day = spentToday(), mon = spentThisMonth();
  return {
    today: +day.toFixed(4), dayHardCap: DAY_HARD_CAP,
    month: +mon.toFixed(4), monthTarget: MONTH_TARGET, monthHardCap: MONTH_HARD_CAP,
    byProviderToday: byProviderToday(),
    meteredBlocked: meteredBlocked()
  };
}

export default { recordSpend, spentToday, spentThisMonth, byProviderToday, meteredBlocked, budgetStatus, isMetered };
