// ===================================================================
// NAPI ÖNJELENTÉS — a cég reggel magától beszámol Telegramon
// ===================================================================
//
// User-ötlet (2026-07-07): "jó érzés lenne kávé mellé olvasni, mit csinált
// éjjel a cég". A cron minden futáskor meghívja, de csak NAPONTA EGYSZER
// küld, és csak a 07-15 UTC sávban (≈ dél körül ér a userhez) — így a
// hajnali futás nem ébreszt, az esti nem duplikál.
//
// Tartalom: új tartalom (24h), FB-posztok, költés (tegnap + havi),
// fordítás-hiány, kvóta-tiltások, várólistás forrás-javaslatok.
//
// FUTTATÁS:  node core/daily-report.js            (sáv+dedup őrrel)
//            node core/daily-report.js --force    (azonnal, teszthez)
// ===================================================================

import 'dotenv/config';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { sendMessage } from './telegram.js';
import { canonicalChip } from './quality-guard.js';
import { summarizeRuns, describeFailures } from './make-health.js';
import { describePosts, describeRepeat, describeTranslationGaps } from './report-lines.js';
import { bodyLooksUntranslated } from './translation-guard.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const STATE_PATH = join(ROOT, 'memory', 'daily-report-state.json');
const FORCE = process.argv.includes('--force');
// Havi vész-stop — A BUDGET.JS-TŐL kérdezzük, nem a nyers config-mezőből.
// 2026-08-01: a riport a `monthly_budget_usd_hard_cap`-et olvasta közvetlenül
// (=50), miközben a cég valójában 40-nél áll le, mert a hónapra bontott
// felülírás (`..._by_month`) augusztus 1-jén életbe lépett. A user tehát egy
// olyan keretet látott, ami nem az, ami tényleg megállítja a céget.
// TANULSÁG: ha egy értéknek van kiszámított, hiteles forrása, a jelentés NE
// számolja ki újra — kérdezze meg. A duplikált logika addig néma, amíg a két
// eredmény véletlenül egyezik, és pont a váltás pillanatában hazudik.
let HARD_CAP = 40, DAY_CAP = null;
try {
  const bs = (await import('./budget.js')).budgetStatus();
  HARD_CAP = bs.monthHardCap ?? HARD_CAP;
  DAY_CAP = bs.dayHardCap ?? null;
} catch { /* marad az alap */ }

function today() { return new Date().toISOString().slice(0, 10); }

// ── FORDÍTÁSI HÁTRALÉK VÁRHATÓ KÖLTSÉGE (2026-08-01) ────────────────
// User kérdése: "miért volt tegnap a napi költés az átlaghoz képest drasztikus?"
// Válasz: egy tömeges cikkjavítás (137 szivárgó sablon-címke) TÖRÖLTE 136 cikk
// fordítás-gyorsítótárát — helyesen, hiszen az angol szöveg megváltozott —,
// és ezzel 544 újrafordítást indított. A napi költés $0,60-ról $2,51-re ugrott,
// és SEMMI nem szólt előre. A riport eddig csak a darabszámot mutatta ("86 pár"),
// ami egy nem-technikus olvasónak nem mond semmit a pénzről.
//
// Mostantól: ha a hátralék szokatlanul nagy, a riport odaírja, mibe fog kerülni.
// Az egy fordításra jutó árat a fordító méri (memory/translation-cost.json,
// gördülő átlag) — beégetett konstans némán elavulna.
//
// KÜSZÖB: a napi rendes termés ~35 fordítás (2 élő nyelv × ~17 cikk). A 100
// fölötti hátralék tehát már nem a szokásos menet, hanem valami tömeges dolog.
const FORECAST_MIN = 100;
function translationForecast(missing) {
  if (!missing || missing < FORECAST_MIN) return '';
  try {
    const s = JSON.parse(readFileSync(join(ROOT, 'memory', 'translation-cost.json'), 'utf-8'));
    const avg = s.avg_usd_per_translation;
    if (!avg) return '';
    return ` · ⏳ várható költség kb. $${(missing * avg).toFixed(2)}`;
  } catch { return ''; }
}

// ── EGYENLEG-ŐR (2026-08-01) ────────────────────────────────────────
// User: "ennyi a keretünk, most töltöttem fel, és vidd le a havi keretet
// 25-re, ez kb elég lesz egy hónapra" — majd: "az egyenleg minden hónap
// elsején újra kezdődik" (havonta tölt fel).
//
// A HAVI KERET ÉS AZ EGYENLEG NEM UGYANAZ A KORLÁT. A keret egy szabály,
// amit mi tartunk be; az egyenleg fizikai valóság. Ha a költés megugrik,
// a pénz elfogy, és a havi keret SOSEM sül el — a cég némán elhallgat
// (a fizetős hívások elhasalnak, a vészháló gyengébb ingyenes modellekre
// esik, a minőség leromlik) anélkül, hogy bármi szólna róla.
//
// AMIT KÉRDEZÜNK: nem az, hogy "hány napra elég" — az absztrakt szám nem
// mond semmit. Havi feltöltésnél a valódi kérdés, hogy ELÉR-E A KÖVETKEZŐ
// FELTÖLTÉSIG. Egy hó eleji "20 napra elég" nyugtatónak hangzik, pedig ha
// 30 nap van hátra, akkor baj van; egy hó végi "3 napra elég" ijesztő,
// pedig épp elég. Ezért a hónap végéhez mérünk.
//
// Read-only hívás, $0. Kulcs nélkül (helyi futás) csendben kimarad.
async function openrouterBalance(burnPerDay) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return '';
  try {
    const r = await fetch('https://openrouter.ai/api/v1/credits', {
      headers: { Authorization: 'Bearer ' + key }, signal: AbortSignal.timeout(15000)
    });
    if (!r.ok) return '';
    const d = (await r.json()).data || {};
    const left = Number(d.total_credits) - Number(d.total_usage);
    if (!isFinite(left)) return '';
    if (!(burnPerDay > 0.005)) return `🏦 Egyenleg: $${left.toFixed(2)}`;

    // A SÜRGŐSSÉGHEZ IGAZODÓ HANG (2026-08-02).
    //
    // Eddig a mérce az volt, hogy "eléri-e a hónap végét" — ezért MINDEN NAP
    // ugyanazt kiabálta ("NEM ÉRI EL"), akkor is, amikor még 19 nap volt hátra.
    // Egy figyelmeztetés, ami mindennap szól, egy hét alatt láthatatlanná válik,
    // és pont azon a napon nem nézzük meg, amikor tényleg számít.
    //
    // Az új mérce a HÁTRALÉVŐ NAPOK SZÁMA, három hangerővel — és a DÁTUM is
    // kimegy, mert a user azt tudja összevetni a fizetése napjával; a "19 nap"
    // ehhez fejben számolást kér, a "augusztus 21." nem.
    const days = Math.floor(left / burnPerDay);
    const out = new Date(Date.now() + days * 86400000);
    const HU_MONTH = ['jan.', 'febr.', 'márc.', 'ápr.', 'máj.', 'jún.', 'júl.', 'aug.', 'szept.', 'okt.', 'nov.', 'dec.'];
    const when = `${HU_MONTH[out.getMonth()]} ${out.getDate()}.`;

    if (days <= 5) {
      return `🚨 *EGYENLEG: $${left.toFixed(2)} — kb. ${days} nap múlva ELFOGY (${when})*, utána megáll a termelés. Tölts fel!`;
    }
    if (days <= 13) {
      return `⚠️ Egyenleg: $${left.toFixed(2)} — kb. ${days} napra elég (${when}), érdemes feltölteni.`;
    }
    return `🏦 Egyenleg: $${left.toFixed(2)} — kb. ${days} napra elég (${when}).`;
  } catch { return ''; }
}

function guard() {
  if (FORCE) return true;
  const h = new Date().getUTCHours();
  if (h < 7 || h > 15) { console.log(`⏭️  Napi jelentés: ${h}h UTC a sávon kívül (7-15) — kihagyom.`); return false; }
  try {
    const s = JSON.parse(readFileSync(STATE_PATH, 'utf-8'));
    if (s.last_sent === today()) { console.log('⏭️  Napi jelentés: ma már ment — kihagyom.'); return false; }
  } catch { /* nincs állapot — mehet */ }
  return true;
}

function collect() {
  const now = Date.now();
  const h24 = 24 * 3600e3;

  // Új tartalom — NAPTÁRI NAP szerint (2026-07-23 fix, user: "nincs 16 hír mára").
  // Régen 24 ÓRÁS gördülő ablak volt, ami "most"-hoz képest nézett vissza — így
  // átnyúlt a TEGNAP ESTI futásba, és a napi 8-as plafon ellenére 16-ot mutatott
  // (7 tegnap este + 9 ma). A user "Napi jelentés — MA" fejlécet olvas, tehát a
  // szám a MAI napra vonatkozzon. (A dél körül futó jelentés a mai éjszakai +
  // reggeli futást fogja; a délutáni futás tartalma az oldalon ott van.)
  const dayStr = today();
  let news = 0, guides = 0; const titles = [];
  const artDir = join(ROOT, 'content', 'articles');
  if (existsSync(artDir)) {
    for (const f of readdirSync(artDir).filter(x => x.endsWith('.json'))) {
      try {
        const d = JSON.parse(readFileSync(join(artDir, f), 'utf-8'));
        if ((d._meta?.published_at || '').slice(0, 10) !== dayStr) continue;
        // Útmutató: a _meta.type MINDIG megbízható a guide-oknál; a hír-cikkeknek
        // nincs type mezőjük — a fájlnév-előtag a biztos tartalék (2026-07-23).
        (d._meta?.type === 'guide' || f.startsWith('ARTICLE_GUIDE')) ? guides++ : news++;
        if (titles.length < 3) {
          let title = d.original_title || f;
          try {
            const hu = JSON.parse(readFileSync(join(ROOT, 'content', 'translations', f), 'utf-8')).hu || '';
            const m = hu.match(/^title:\s*["']?(.+?)["']?\s*$/m);
            if (m) title = m[1];
          } catch { /* marad az angol, ha még nincs fordítás */ }
          titles.push(title);
        }
      } catch { /* skip */ }
    }
  }

  // FB-posztok (24 óra)
  let fbPosts = 0;
  const socDir = join(ROOT, 'content', 'social');
  if (existsSync(socDir)) {
    for (const f of readdirSync(socDir).filter(x => x.endsWith('.json'))) {
      try {
        const p = JSON.parse(readFileSync(join(socDir, f), 'utf-8'));
        if (p.posted_fb === true && p.posted_at && (now - new Date(p.posted_at).getTime()) < h24) fbPosts++;
      } catch { /* skip */ }
    }
  }

  // Költés (budget-state: days)
  let spentYesterday = 0, spentMonth = 0, spentToday = 0, burnPerDay = 0;
  try {
    const b = JSON.parse(readFileSync(join(ROOT, 'core', 'budget-state.json'), 'utf-8'));
    const days = b.days || {};
    const y = new Date(now - h24).toISOString().slice(0, 10);
    const month = today().slice(0, 7);
    spentYesterday = days[y]?.total || 0;
    spentToday = days[today()]?.total || 0;        // a napi kerethez (2026-08-01)
    for (const [d, v] of Object.entries(days)) if (d.startsWith(month)) spentMonth += v.total || 0;
    // Napi tempó a 7 LEGUTÓBBI TELJES napból (a mai félkész nap kihagyva).
    // KÖZÉPÉRTÉK, NEM ÁTLAG: egyetlen rendellenes nap az átlagot elviszi —
    // a 07-31-i $2,51 (tömeges újrafordítás) a hetes átlagot $0,40-ról
    // $0,85-re emelte, vagyis a maradék pénzt feleannyi napra becsülte
    // volna. A középértéket egy kilengő nap nem mozdítja el.
    const full = Object.entries(days).filter(([d]) => d < today()).sort().slice(-7);
    if (full.length) {
      const v = full.map(([, x]) => x.total || 0).sort((a, b) => a - b);
      burnPerDay = v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
    }
  } catch { /* skip */ }

  // Fordítás-hiány
  // 2026-08-10: a szám mellé a NEVEK is kellenek. A 08-09-i heti összefoglaló
  // magyarul üresen maradt és angolul ment ki; a riport ezt "1 pár"-ként írta
  // le, és a hibát végül a user vette észre az oldalon, nem a rendszer.
  // Azóta a TARTALMAT is nézzük: a megléte nem jelenti, hogy le is fordult.
  let missing = 0;
  const gaps = [];
  if (existsSync(artDir)) {
    for (const f of readdirSync(artDir).filter(x => x.endsWith('.json'))) {
      let t = {};
      try { t = JSON.parse(readFileSync(join(ROOT, 'content', 'translations', f), 'utf-8')); } catch { /* nincs */ }
      let slug = f, kiemelt = false;
      try {
        const en = JSON.parse(readFileSync(join(artDir, f), 'utf-8'));
        slug = en._meta?.slug || f;
        kiemelt = /weekly-digest/.test(en.article_markdown || '');
      } catch { /* a fájlnév is elég azonosítónak */ }
      // CSAK AZ ÉLŐ NYELVEK (2026-08-01). A de/fr 2026-07-31-én kivezetve —
      // a számláló viszont tovább kereste őket, és minden reggel 86-90 "hiányzó
      // párt" jelentett a usernek. Mérve: az élő nyelveken a hiány NULLA volt,
      // vagyis a riport hónapokig létező lemaradást mutatott volna ott, ahol a
      // munka valójában hibátlan. Forrás: agents/translator/agent.js LANGS
      // (onnan importálni nem lehet: a modul betöltéskor elindítja a fordítást).
      for (const l of ['hu', 'es']) {
        const md = t[l];
        if (!md) { missing++; gaps.push({ slug, lang: l, ok: 'ÜRES', kiemelt }); continue; }
        const body = String(md).replace(/^---[\s\S]*?---/, '');
        if (bodyLooksUntranslated(body)) {
          missing++; gaps.push({ slug, lang: l, ok: 'angolul maradt', kiemelt });
        }
      }
    }
  }

  // ÚJ eszköz/cég HIVATALOS LINK nélkül (2026-07-12, "model-bővítés legyen
  // automatikus"): ha egy guide tool-jához ÉS cégéhez sincs link a térképben,
  // a gomb nem jelenik meg — ilyenkor itt szólunk, hogy 1 sor bővítés kell.
  let missingLinks = [];
  try {
    const tl = JSON.parse(readFileSync(join(ROOT, 'website', 'tool-links.json'), 'utf-8'));
    const seen = new Set();
    for (const f of readdirSync(artDir).filter(x => x.endsWith('.json'))) {
      try {
        const d = JSON.parse(readFileSync(join(artDir, f), 'utf-8'));
        if (d._meta?.type !== 'guide') continue;
        const md = d.article_markdown || '';
        const strip = (s) => (s || '').trim().replace(/^["']+|["']+$/g, '').trim();
        // Frontmatter az elsődleges — a build is azt mutatja; kanonikus névvel
        // keresünk linket, hogy ne legyen hamis "nincs link" riasztás (2026-07-13)
        const comp = strip((md.match(/^company:\s*(.*)$/m) || [])[1] || d._meta?.company);
        const tool = canonicalChip((md.match(/^tool:\s*(.*)$/m) || [])[1] || d._meta?.tool, comp);
        if ((tl.ignore || []).includes(tool) || (tl.ignore || []).includes(comp)) continue;
        if (!tl.tools[tool] && !tl.companies[comp]) {
          const key = tool || comp;
          if (key && !seen.has(key)) { seen.add(key); missingLinks.push(key); }
        }
      } catch { /* skip */ }
    }
  } catch { /* nincs térkép-fájl */ }

  // Aktív kvóta-tiltások + várólistás forrás-javaslatok
  let bans = 0, pendingSources = 0;
  try {
    const q = JSON.parse(readFileSync(join(ROOT, 'core', 'quota-state.json'), 'utf-8'));
    bans = Object.values(q).filter(v => new Date(v.until) > new Date()).length;
  } catch { /* skip */ }
  try {
    pendingSources = (JSON.parse(readFileSync(join(ROOT, 'agents', 'source-scout', 'discovered-sources.json'), 'utf-8')).discovered_sources || []).length;
  } catch { /* skip */ }

  return { news, guides, titles, fbPosts, spentYesterday, spentToday, spentMonth, burnPerDay, missing, gaps, bans, pendingSources, missingLinks };
}

// Hány FB-poszt MENT KI valóban az elmúlt 24 órában? A saját jelölésünk
// (posted_fb) csak annyit tud, hogy a Make ÁTVETTE a kérést — a tényleges
// megjelenést a Make futási naplója mondja meg. null = nincs adat.
async function deliveredPosts(scenarioId) {
  const token = (process.env.MAKE_API_TOKEN || '').trim();
  if (!token) return null;
  try {
    const r = await fetch(`https://eu1.make.com/api/v2/scenarios/${scenarioId}/logs`, {
      headers: { Authorization: 'Token ' + token }, signal: AbortSignal.timeout(15000)
    });
    if (!r.ok) return null;
    const j = await r.json().catch(() => ({}));
    const since = new Date(Date.now() - 24 * 3600e3).toISOString();
    return summarizeRuns(j.scenarioLogs || j.logs || [], since).ok;
  } catch { return null; }
}

async function main() {
  if (!guard()) return;
  const r = collect();
  const fbDelivered = await deliveredPosts('6452490');

  const lines = [
    `📊 *Napi jelentés — ${today()}*`,
    ``,
    `📰 Új tartalom ma: ${r.news} hír + ${r.guides} útmutató`,
    ...r.titles.map(t => `   • ${t.slice(0, 60)}`),
    describePosts(r.fbPosts, fbDelivered),
    // A NAPI keret is látszik (2026-08-01) — a user maga kérte a korlátot,
    // tehát látnia kell, hol tart benne, ne csak akkor derüljön ki, ha betelt.
    // A keret a MAI költés mellé kerül, nem a tegnapi mellé: a "$2.51 / $1"
    // úgy olvasódna, mintha tegnap megsértettük volna a keretet.
    `💰 Tegnap: $${r.spentYesterday.toFixed(2)} · ma: $${r.spentToday.toFixed(2)}${DAY_CAP ? ` / $${DAY_CAP}` : ''} · e havi: $${r.spentMonth.toFixed(2)} / $${HARD_CAP}`,
    // A hiányzó fordításokat MEGNEVEZZÜK (2026-08-10) — a puszta szám nem
    // mondja meg, mit kell megnézni, és így csúszott ki egy angol heti
    // összefoglaló a magyar főoldal tetejére.
    (describeTranslationGaps(r.gaps) || '🌍 Fordítás: hiánytalan')
      + `${r.bans ? ` · 🚦 kvóta-tiltás: ${r.bans}` : ''}${translationForecast(r.missing)}`,
  ];
  const bal = await openrouterBalance(r.burnPerDay);
  if (bal) lines.push(bal);
  if (r.pendingSources > 0) lines.push(`🔭 Jóváhagyásra váró forrás-javaslat: ${r.pendingSources} (írd: "mik a javaslatok?")`);
  if (r.missingLinks?.length) lines.push(`🔗 Hivatalos link nélküli új eszköz: ${r.missingLinks.join(', ')} — a fejlesztő 1 sorral pótolja (tool-links.json)`);
  // Minőség-őr összegzés (chip-szabályok + duplikált linkek) — ha talál valamit
  try {
    const { qualityFindings } = await import('./quality-guard.js');
    const qf = qualityFindings();
    if (qf.length) lines.push(`🧹 Minőség-őr: ${qf.length} találat (pl. ${qf[0].slice(0, 70)}…) — szólj a fejlesztőnek!`);
  } catch { /* az őr hibája ne állítsa meg a jelentést */ }
  // Önjavító napló (2026-07-13): amit a cég MAGÁTÓL kijavított, arról csak
  // beszámol — ehhez már nem kell emberi kéz.
  try {
    const flog = JSON.parse(readFileSync(join(ROOT, 'memory', 'quality-fix-log.json'), 'utf-8'));
    const tf = flog[today()] || [];
    if (tf.length) lines.push(`🔧 Önjavító: ${tf.length} hibát magamtól kijavítottam (pl. ${tf[0].slice(0, 60)}…)`);
  } catch { /* még nincs javítás-napló */ }
  // HAVI VÉSZFÉK-ÁLLAPOT (2026-07-19, user-döntés: cap-nél tiszta szünet):
  // ha a havi keret betelt, a riport mondja meg, mi van és mikor indul újra.
  try {
    const { meteredBlocked } = await import('./budget.js');
    const mb = meteredBlocked();
    if (mb.blocked && mb.hard) {
      // KÉTFÉLE STOP, KÉTFÉLE ÜZENET (2026-08-01). A napi keret bevezetéséig
      // minden hard-block havi volt, ezért a riport egy NAPI stopra is azt
      // írta volna, hogy "a cég SZÜNETEL a hónap végéig" — hamis és ijesztő.
      // Egy órányi várakozás és egy hónapnyi leállás nem ugyanaz.
      if (mb.daily) {
        lines.push(`⏸️ Napi keret elérve ($${DAY_CAP}) — a mai munka szünetel, holnap magától folytatódik. Az oldal él, semmi nem veszett el.`);
      } else {
        const nextMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toISOString().slice(0, 10);
        lines.push(`⛔ Havi költségkeret elérve ($${HARD_CAP}) — a cég SZÜNETEL a hónap végéig. Az oldal él; ${nextMonth}-én magától újraindul (MiniMax-tervvel olcsóbban).`);
      }
    }
  } catch { /* budget-őr nélkül is megy a riport */ }
  // KÖZELI-TÉMA-ŐR összegzés (2026-07-18): hány ismétlődő útmutató-témát
  // szűrtünk ki, mielőtt megíródott volna.
  try {
    const dlog = JSON.parse(readFileSync(join(ROOT, 'memory', 'topic-dedup-log.json'), 'utf-8'));
    const dd = dlog[today()] || [];
    if (dd.length) lines.push(`🔁 Ismétlődő téma kiszűrve: ${dd.length} (pl. „${(dd[0].rejected || '').slice(0, 45)}” ≈ „${(dd[0].closest || '').slice(0, 45)}”)`);
  } catch { /* még nincs dedup-napló */ }
  // HITELESSÉG-KAPU összegzés (2026-07-16): mit fogott a publikálás előtti
  // hallucináció-szűrő — blokk = rejected-be ment, hold = bíró-hiba, várakozik.
  try {
    const tlog = JSON.parse(readFileSync(join(ROOT, 'memory', 'truth-gate-log.json'), 'utf-8'));
    const tt = tlog[today()] || [];
    const blocked = tt.filter(x => x.action === 'block'), held = tt.filter(x => x.action === 'hold');
    if (blocked.length || held.length) {
      const sample = (blocked[0] || held[0])?.reasons?.[0] || '';
      lines.push(`🛡️ Hitelesség-kapu: ${blocked.length} blokkolva · ${held.length} visszatartva (pl. ${sample.slice(0, 70)}…)`);
    }
  } catch { /* még nincs kapu-napló */ }
  // MAKE-ŐRSZEM (2026-07-15, a 9 napos néma FB-leállás tanulsága): a webhook
  // válaszából NEM látszik, ha a Make-forgatókönyv áll (200-zal nyeli a sorba) —
  // ezért közvetlenül a Make API-tól kérdezzük. Csak BAJ esetén szól.
  // 2026-07-27 BŐVÍTÉS: az "aktív?" kérdés NEM elég. A Pinterest-forgatókönyv
  // AKTÍV volt, de CSAK a webhook-modult tartalmazta — a Make 200-zal nyelte a
  // pineket, amiket mi "kiküldve"-nek jelöltünk, és 38 pin némán elveszett.
  // A `usedPackages` mező elárulja, mi van benne: ["gateway"] = csak a webhook,
  // kimeneti modul nélkül. Ezt is figyeljük, mindkét csatornán.
  try {
    if (process.env.MAKE_API_TOKEN) {
      // A PINTEREST KIKERÜLT INNEN (2026-08-09): a csatornát leállítottuk
      // (0 látogató 189 pinből, miközben a Make-keret 62%-át vitte). Ha itt
      // maradt volna, a riport MINDEN NAP "⛔ PINTEREST-POSZTOLÓ LEÁLLT"
      // vészjelzést küldött volna egy szándékosan kikapcsolt csatornáról —
      // pontosan az a fajta valótlan sor, amit 08-06-án kigyomláltunk.
      // Új csatorna felvétele ide: egy sor, ha megvan a Make-forgatókönyv azonosítója.
      const WATCH = [
        { id: '6452490', pkg: 'facebook-pages', name: 'FB-POSZTOLÓ', fix: 'Facebook Pages → Upload a Photo' },
        ...(process.env.THREADS_MAKE_SCENARIO_ID
          ? [{ id: process.env.THREADS_MAKE_SCENARIO_ID, pkg: 'threads', name: 'THREADS-POSZTOLÓ', fix: 'Threads → Create a Thread' }] : []),
        ...(process.env.X_MAKE_SCENARIO_ID
          ? [{ id: process.env.X_MAKE_SCENARIO_ID, pkg: 'twitter', name: 'X-POSZTOLÓ', fix: 'X (Twitter) → Create a Post' }] : [])
      ];
      for (const w of WATCH) {
        const mr = await fetch(`https://eu1.make.com/api/v2/scenarios/${w.id}`, { headers: { Authorization: 'Token ' + process.env.MAKE_API_TOKEN }, signal: AbortSignal.timeout(15000) });
        const mj = await mr.json().catch(() => ({}));
        if (!mr.ok || !mj.scenario) continue;
        const s = mj.scenario;
        if (s.isActive === false || s.isPaused === true) {
          lines.push(`⛔ ${w.name} LEÁLLT (Make-forgatókönyv inaktív)! Kapcsold vissza: eu1.make.com → Scenarios → kapcsoló a sor végén.`);
        } else if (!(s.usedPackages || []).includes(w.pkg)) {
          lines.push(`⛔ ${w.name}: a Make-forgatókönyv HIÁNYOS — nincs benne kimeneti modul (csak: ${(s.usedPackages || []).join(', ') || '—'}). A webhook 200-at ad, de SEMMI nem megy ki! Javítás: eu1.make.com → a forgatókönyv → + → ${w.fix} → mentés.`);
        }

        // 2026-08-05 BŐVÍTÉS: a FUTÓ forgatókönyv is veszíthet posztot.
        // A Pinterest 8 pint bukott el egyetlen napon ("could not fetch the
        // image"), miközben aktív volt ÉS megvolt benne a kimeneti modul —
        // az "áll-e?" és a "teljes-e?" kérdés egyikre sem világít rá.
        // Mi mindet "kiküldve"-nek jelöltük, tehát soha nem próbáljuk újra.
        // A napi bukás-számot ezért külön nézzük, a futási naplóból.
        try {
          const lr = await fetch(`https://eu1.make.com/api/v2/scenarios/${w.id}/logs`, {
            headers: { Authorization: 'Token ' + process.env.MAKE_API_TOKEN },
            signal: AbortSignal.timeout(15000)
          });
          if (lr.ok) {
            const lj = await lr.json().catch(() => ({}));
            const since = new Date(Date.now() - 24 * 3600e3).toISOString();
            const line = describeFailures(w.name, summarizeRuns(lj.scenarioLogs || lj.logs || [], since));
            if (line) lines.push(line);
          }
        } catch { /* a napló hiánya nem némítja el a többi őrszemet */ }
      }
    }
  } catch { /* a Make-őr hibája nem állítja meg a jelentést */ }
  // SEO-ŐRSZEM (2026-07-27): a kanonikus URL / rögzített slug / sitemap
  // visszaesését jelezzük. Csendes, ha nincs baj — a user így tudja, hogy a
  // Search Console-ban jelzett hibák nem jönnek vissza észrevétlenül.
  try {
    const seo = JSON.parse(readFileSync(join(ROOT, 'memory', 'seo-guard.json'), 'utf-8'));
    if (seo.problems?.length) {
      lines.push(`🔍 SEO-ŐRSZEM: ${seo.problems.length} lelet — ${seo.problems.slice(0, 2).map(p => p.code).join(', ')}${seo.problems.length > 2 ? '…' : ''}. Részletek a futás naplójában.`);
    }
  } catch { /* még nincs SEO-lelet vagy nem futott — nem baj */ }

  // ÉLŐ-ŐRSZEM (2026-07-31): a kintről-befelé nézés leletei. Csendes, ha
  // minden rendben; hangos, ha az ÉLŐ oldal máshogy viselkedik, mint amit
  // gyártottunk (www/http, 404, canonical, H1, sitemap). Ez a réteg fogja
  // meg a kiszolgálói-beállítás szintű hibákat, amiket a fájl-alapú őrök nem.
  try {
    const lg = JSON.parse(readFileSync(join(ROOT, 'memory', 'live-guard.json'), 'utf-8'));
    if (lg.problems?.length) {
      lines.push(`🌐 ÉLŐ-ŐRSZEM: ${lg.problems.length} lelet — ${lg.problems.slice(0, 2).map(p => p.code).join(', ')}${lg.problems.length > 2 ? '…' : ''}`);
    }
  } catch { /* még nem futott — nem baj */ }

  // I18N-ŐRSZEM (2026-08-10). Ez az őrszem 2026-07-06 óta fut, és 08-09-én
  // PONTOSAN azt látta, amit kellett: a magyar heti összefoglaló 161 angol
  // jellel ment ki. Csakhogy egyedül a CI naplójába írt, oda pedig senki nem
  // néz — a hibát a user vette észre az oldalon, egy nappal később.
  // A "FORDITATLAN_CIKK" a legdrágább lelet: egy TELJES cikk idegen nyelven.
  try {
    const i18n = JSON.parse(readFileSync(join(ROOT, 'memory', 'i18n-guard.json'), 'utf-8'));
    const p = i18n.problems || [];
    if (p.length) {
      const cikkek = p.filter(x => x.code === 'FORDITATLAN_CIKK');
      lines.push(cikkek.length
        ? `🈳 I18N-ŐRSZEM: ${cikkek.length} cikk ANGOLUL ment ki — ${cikkek.slice(0, 2).map(x => `${x.lang}: ${x.page.split('/').pop()}`).join(', ')}${cikkek.length > 2 ? '…' : ''}`
        : `🈳 I18N-ŐRSZEM: ${p.length} felület-folt — ${p.slice(0, 2).map(x => `${x.lang}: ${x.detail}`).join(', ')}${p.length > 2 ? '…' : ''}`);
    }
  } catch { /* még nem futott — nem baj */ }

  // BORÍTÓKÉP-ŐRSZEM (2026-08-14). A user vette észre a főoldalon, hogy a
  // CÍMLAPSZTORI borítója üres bézs felület — a képfájl nem létezett, mert a
  // Cloudflare kivezette a width/height paramétert, és a designer 400-at kapott.
  // A designer ezt BE IS ÍRTA: a CI naplójába, ahová senki nem néz.
  // A címlapsztori külön kiemelve: azt MINDEN látogató elsőként látja.
  try {
    const ig = JSON.parse(readFileSync(join(ROOT, 'memory', 'image-guard.json'), 'utf-8'));
    const p = ig.problems || [];
    if (p.length) {
      const cimlap = p.find(x => x.cimlap);
      lines.push(`🖼️ BORÍTÓKÉP-ŐRSZEM: ${p.length} friss cikknek nincs képe — ${p.slice(0, 2).map(x => x.slug.slice(0, 34)).join(', ')}${p.length > 2 ? '…' : ''}`
        + (cimlap ? ' ⚠️ ebből a CÍMLAPSZTORI — az a főoldal tetején van!' : ''));
    }
  } catch { /* még nem futott — nem baj */ }

  // ÁTIRÁNYÍTÁS-ŐRSZEM (2026-08-15). A _redirects a Cloudflare 2100-as kemény
  // plafonja felé kúszott (1755-nél tartott, napi +22 sorral), és a build
  // vágás-figyelmeztetése CSAK a CI naplójába ment volna. Itt 75%-nál szólal
  // meg, nem a szakadéknál — a lényeg, hogy legyen idő reagálni.
  try {
    const rg = JSON.parse(readFileSync(join(ROOT, 'memory', 'redirect-guard.json'), 'utf-8'));
    for (const p of rg.problems || []) {
      if (p.code === 'REDIRECTS_TRUNCATED') {
        lines.push(`🔀 ÁTIRÁNYÍTÁS-ŐRSZEM: ${p.count} szabály > ${p.cap} — a lista VÁGVA, a leggyengébb 301-ek kimaradtak.`);
      } else {
        lines.push(`🔀 ÁTIRÁNYÍTÁS-ŐRSZEM: ${p.count}/${p.cap} szabály (${p.pct}%) — közelít a Cloudflare-plafonhoz.`);
      }
    }
  } catch { /* még nem futott — nem baj */ }

  // HÁZMESTER (2026-07-30): mit takarított el, és hízik-e valami vissza.
  // CSENDES a hétköznapokon: napi pár régi napló törlése nem hír. Csak akkor
  // szólal meg, ha ÉRDEMI takarítás történt (kép/fordítás/embedding), vagy ha
  // a beépített őrszem szerint valami újra nőni kezdett — ez utóbbi a fontos,
  // mert pont az a hiba, ami fél évig észrevétlen marad.
  try {
    const hk = JSON.parse(readFileSync(join(ROOT, 'memory', 'housekeeping.json'), 'utf-8'));
    const worth = (hk.actions || []).filter(a => !a.startsWith('📄'));
    if (worth.length) lines.push('🧹 HÁZMESTER: ' + worth.join(' · '));
  } catch { /* nem futott — nem baj */ }

  // FORRÁS-BIZONYÍTVÁNY (2026-07-22): a külön lépés által kiírt osztályzatokból.
  // Csendes, ha nincs teendő; hangos, ha forrást kapcsoltunk ki vagy elavultból írunk.
  try {
    const { reportLineFromFile } = await import('./source-report-card.js');
    const srcLine = reportLineFromFile();
    if (srcLine) lines.push(srcLine);
  } catch { /* a riport ettől még kimegy */ }

  // ÜGYFÉLSZOLGÁLAT (2026-07-20): napi darabszámok a Workerből (💬 sor).
  // Csak akkor szól, ha volt forgalom — csendes, ha 0.
  try {
    const exportKey = (process.env.FEEDBACK_EXPORT_KEY || '').trim();
    if (exportKey) {
      const cr = await fetch('https://aiworld-telegram.pacsi84.workers.dev/feedback-export',
        { headers: { 'X-Export-Key': exportKey }, signal: AbortSignal.timeout(15000) });
      if (cr.ok) {
        const cs = (await cr.json()).__cs || {};
        const total = (cs.chat || 0) + (cs.mail || 0);
        if (total + (cs.esc || 0) > 0) lines.push(`💬 Ügyfélszolgálat ma: ${cs.chat || 0} chat-válasz · ${cs.mail || 0} email · ${cs.esc || 0} emberi kézbe adva`);
      }
    }
  } catch { /* a riport ettől még kimegy */ }

  // Hierarchia-műszerfal (2026-07-13): visszaadások + főnöki döntések + tanulságok
  try {
    const { handbackStats } = await import('./handback.js');
    const hb = handbackStats();
    if (hb.open + hb.deliveredToday + hb.escalated > 0)
      lines.push(`↩️ Visszaadott munkák: ${hb.deliveredToday} kézbesítve ma · ${hb.open} nyitott · ${hb.escalated} a Főnök asztalán`);
  } catch { /* iroda nélkül is megy */ }
  try {
    const dlog = JSON.parse(readFileSync(join(ROOT, 'memory', 'ceo-desk-log.json'), 'utf-8'));
    const td = dlog[today()] || [];
    if (td.length) lines.push(`👔 Főnöki döntés ma: ${td.length} (pl. ${td[0].slice(0, 70)}…)`);
  } catch { /* még nincs asztal-napló */ }
  try {
    const store = JSON.parse(readFileSync(join(ROOT, 'memory', 'store.json'), 'utf-8'));
    const todays = (store.items || []).filter(it => (it.created || '').startsWith(today())).length;
    if (todays) lines.push(`📖 Új tanulság ma: ${todays} — a cég minden tagja látja a következő munkájánál`);
    // ♻️ ISMÉTLŐDŐ HIBA (2026-07-19, user: "ne forduljon elő még egyszer —
    // nem költséghatékony"): ha egy hiba a MÁR MEGLÉVŐ lecke ellenére ma újra
    // megtörtént, az a jel, hogy kemény kód-szabály kell — szólunk hangosan.
    // 2026-08-06 (user: "ne küldjön valótlan adatokat"): a régi sor a lecke
    // TELJES élettartamára vonatkozó ismétlés-számot írta ki úgy, mintha az
    // MA történt volna ("legmakacsabb 4×"), és minden alkalommal kemény
    // szabályt sürgetett. Élesben: 4 előfordulás 34 nap alatt — az a
    // minőségkapu normál működése, nem vészhelyzet. Most az IDŐTÁV is
    // kimegy, a sürgetés pedig heti ütemhez kötött.
    const rep = (store.items || []).filter(it => (it.lastRepeat || '').startsWith(today()));
    const repLine = describeRepeat(rep, rep.length, today());
    if (repLine) lines.push(repLine);
  } catch { /* könyv nélkül is megy */ }
  lines.push(``, `Minden megy magától. ✅`);

  // A TELJES riport a CI-naplóba is (2026-07-31, user: "te is olvasd el
  // mindig a telegramot, ne csak a rendszert ellenőrizd"). Eddig csak az
  // "elküldve" sor látszott a naplóban — a fejlesztő-asszisztens a nyers
  // állapotfájlokat nézte, nem azt, amit a user TÉNYLEGESEN kap. Mostantól
  // a napló őrzi a szó szerinti üzenetet, így visszaolvasható.
  console.log('── A MA KIKÜLDÖTT RIPORT ──────────────────────────');
  console.log(lines.join('\n'));
  console.log('───────────────────────────────────────────────────');

  await sendMessage(lines.join('\n'));
  try { writeFileSync(STATE_PATH, JSON.stringify({ last_sent: today() }, null, 2), 'utf-8'); } catch { /* nem kritikus */ }
  console.log('✅ Napi jelentés elküldve.');
}

main().then(() => process.exit(0)).catch(e => { console.error('💥 NAPI JELENTÉS HIBA:', e); process.exit(1); });
