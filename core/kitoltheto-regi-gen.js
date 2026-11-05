// ===================================================================
// RÉGI PROMPTOK KITÖLTHETŐVÉ TÉTELE — A NAPI GENERÁTOR (2026-10-29)
// ===================================================================
// A biztonságos mag: core/kitoltheto-regi.js (kód-biztosíték + megjelenítés). Ez a futtató: útmutatónként
// EGY modell-hívás, amely az útmutató beírandó promptjaiban megjelöli a személyre szabható példaszavakat
// (max. 3/prompt). A válasz a mezokEllenoriz-en megy át; ami nem biztonságos, kiesik.
//
// A MÉRCE IRÁNYA: a hibás mező rosszabb, mint a kimaradt mező; a költség is.
//   • SAJÁT NAPI PLAFON (NAPI_PLAFON) és az összes napi költésre is határ (NAPI_HATAR) — mint a „Ha elakadsz”;
//   • futásonként legfeljebb FUTASONKENT_MAX útmutató + belső időkeret (--max-minutes);
//   • egy útmutató EGYSZER kapja meg a hívást: az eredmény (akár üres mezőlistával) a fájlba kerül, és a promptról
//     szóló bejegyzés a prompt SZÖVEGÉNEK hash-éhez kötött — ha az író átírja a promptot, magától újra sorra kerül;
//   • a modell nem válaszolt (átmeneti) → nem írunk fájlt, a következő futás újrapróbálja;
//   • REGI_KITOLTHETO_BE=false → semmi sem fut, a modell sincs meghívva.
// Tárolás: content/kitoltheto/<slug>.json = { slug, keszult, promptok: { <kulcs>: [{eredeti, hely}] }, promptok_hu, promptok_es }
// 🇭🇺🇪🇸 2026-11-05: a magyar és a spanyol fordítás promptjai is (külön hívás nyelvenként, a felirat az oldal
// nyelvén, tegezve; a kód-biztosíték nyelvi szabályokkal: egész szó — magyar rag! —, nem angol/magázó felirat).
// Állapot a riportnak: memory/kitoltheto-regi-state.json.
//
// FIGYELEM: a közvetlen futtatás (node core/kitoltheto-regi-gen.js) FIZETŐS hívást végez és fájlt ír — csak a CI.
// ===================================================================
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REGI_KITOLTHETO_BE, MAX_MEZO, NYELVEK, mezoKulcs, promptKulcs, marKitoltheto, promptokKinyer, mezokEllenoriz } from './kitoltheto-regi.js';
import { latogatasok } from './guide-prune.js';
import { utmutatoE } from './guide-kind.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ARTICLES = join(ROOT, 'content', 'articles');
const TRANSLATIONS = join(ROOT, 'content', 'translations');
const KI_DIR = join(ROOT, 'content', 'kitoltheto');
const ALLAPOT = join(ROOT, 'memory', 'kitoltheto-regi-state.json');

export const NAPI_PLAFON = 0.05;      // csak ennek a generátornak a napi költsége (USD)
export const NAPI_HATAR = 0.60;       // az ÖSSZES napi költés ennél több → ma nem generálunk
export const FUTASONKENT_MAX = 12;    // útmutató / futás
export const FUTAS_PERC = 4;          // belső időkeret
export const MAX_PROMPT_HOSSZ = 700;  // ennél hosszabb promptot nem küldünk (drága és megbízhatatlan)

export function keretOk({ napiOsszes, generatorMa }) {
  return (Number(napiOsszes) || 0) < NAPI_HATAR && (Number(generatorMa) || 0) < NAPI_PLAFON;
}

/** Az útmutató jelölendő promptjai: beírandó, még nem kitölthető, nincs róla bejegyzés, elég rövid. */
export function jelolendoPromptok(bodyMd, fajl, nyelv = 'en') {
  const kesz = fajl?.[mezoKulcs(nyelv)] || {};
  const ki = [], latott = new Set();
  for (const p of promptokKinyer(bodyMd)) {
    const kulcs = promptKulcs(p.szoveg);
    if (latott.has(kulcs)) continue;
    latott.add(kulcs);
    if (kulcs in kesz || marKitoltheto(p.szoveg) || p.szoveg.length > MAX_PROMPT_HOSSZ || p.szoveg.trim().length < 12) continue;
    ki.push({ kulcs, szoveg: p.szoveg });
  }
  return ki;
}

// A mező felirata nyelvenként (a magyar oldal tegez, a spanyol „tú”); a hu/es szöveg ragozott → egész szót kérünk.
const FELIRAT_SZABALY = {
  en: '2-4 plain words, lowercase, in English (e.g. "your city", "your job title", "your topic")',
  hu: '1-4 plain words, lowercase, in Hungarian, informal second person (tegező) possessive (e.g. "a városod", "a munkaköröd", "a témád"); never English, never formal "Ön"',
  es: '1-4 plain words, lowercase, in Spanish, informal "tú" (e.g. "tu ciudad", "tu puesto", "tu tema"); never English, never "usted"',
};
const NYELV_NEV = { en: 'English', hu: 'Hungarian', es: 'Spanish' };

export function promptEpit(cim, promptok, nyelv = 'en') {
  const felirat = FELIRAT_SZABALY[nyelv] || FELIRAT_SZABALY.en;
  const egesz = nyelv === 'en' ? '' : `
The prompts are in ${NYELV_NEV[nyelv]}. Words carry endings: "eredeti" must be WHOLE words including their endings (pick the full word as written, never part of a word).
"hely" DESCRIBES what to type (a label), it is never another example value and never contains a number; two picks of the same kind get distinct labels (e.g. "${nyelv === 'hu' ? 'az első szín' : 'el primer color'}", "${nyelv === 'hu' ? 'a második szín' : 'el segundo color'}").`;
  const rendszer = `You prepare copy-paste prompts from step-by-step AI guides to become fill-in-the-blank templates for readers.
For each numbered prompt, pick up to ${MAX_MEZO} SHORT personalizable details that are concrete EXAMPLE values the author invented: a city, a person's role, a topic, a product, a number of people, a time span, a name. Do NOT pick instructions, verbs, tone words, format words, or anything the prompt would stop working without.
For each pick give:
- "eredeti": the EXACT characters from the prompt (case and spacing identical; it must occur exactly once in that prompt),
- "hely": what the reader should type instead, ${felirat}.
If a prompt has nothing worth personalizing, give an empty list. Never rewrite or shorten the prompt. Never pick text inside brackets.${egesz}
Reply with ONLY a JSON array: [{"i": 0, "mezok": [{"eredeti": "...", "hely": "..."}]}, ...]`;
  const felhasznalo = `Guide: ${cim}\n\n` + promptok.map((p, i) => `PROMPT ${i}:\n${p.szoveg}`).join('\n\n');
  return { rendszer, felhasznalo };
}

/** A modell válasza → {i: [mezok]} (érvénytelen válasznál null). A BIZTONSÁGI ellenőrzést a hívó végzi (mezokEllenoriz). */
export function valaszErtelmez(szoveg) {
  const s = String(szoveg || '').trim();
  const burok = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const nyers = burok ? burok[1] : s;
  const a = nyers.indexOf('['), b = nyers.lastIndexOf(']');
  if (a < 0 || b <= a) return null;
  let t; try { t = JSON.parse(nyers.slice(a, b + 1)); } catch { return null; }
  if (!Array.isArray(t)) return null;
  const ki = {};
  for (const x of t) if (Number.isInteger(x?.i) && Array.isArray(x.mezok)) ki[x.i] = x.mezok;
  return ki;
}

/** Egy útmutató feldolgozása. ctx: { ask, keret, koltseg }. → { fajl, uj } | { atmeneti: true } | { kihagyva: true } */
export async function feldolgoz({ slug, cim, bodyMd, fajl, ctx, now = Date.now(), nyelv = 'en' }) {
  const jel = jelolendoPromptok(bodyMd, fajl, nyelv);
  if (!jel.length) return { kihagyva: true };
  if (!ctx.keret()) return { atmeneti: true, ok: 'keret' };
  const { rendszer, felhasznalo } = promptEpit(cim, jel, nyelv);
  const r = await ctx.ask(felhasznalo, { agentName: 'kitoltheto-regi', systemPrompt: rendszer, maxTokens: 2500 });
  if (!r) return { atmeneti: true, ok: 'modell' };
  ctx.koltseg(Number(r.costUsd) || 0);
  const v = valaszErtelmez(r.text);
  if (!v) return { atmeneti: true, ok: 'válasz' };      // használhatatlan válasz → holnap újra (nem jegyezzük „üresnek”)
  const kulcs = mezoKulcs(nyelv);
  const promptok = { ...(fajl?.[kulcs] || {}) };
  let mezoDb = 0;
  jel.forEach((p, i) => {
    const jo = mezokEllenoriz(p.szoveg, v[i] || [], { nyelv });
    promptok[p.kulcs] = jo;
    mezoDb += jo.length;
  });
  // a fájl többi nyelvének jelölése érintetlen marad
  return { fajl: { ...(fajl || {}), slug, keszult: new Date(now).toISOString(), [kulcs]: promptok }, uj: true, mezoDb, promptDb: jel.length };
}

function irAtomi(ut, szoveg) {
  mkdirSync(dirname(ut), { recursive: true });
  writeFileSync(ut + '.tmp', szoveg, 'utf-8');
  renameSync(ut + '.tmp', ut);
}
const olvasJson = ut => { try { return existsSync(ut) ? JSON.parse(readFileSync(ut, 'utf-8')) : null; } catch { return null; } };

/** Egy útmutató nyelvenkénti törzsei: az angol cikk + a fordítás-fájl hu/es markdownja (ami hiányzik, kimarad). */
export function nyelviTorzsek(cikk, forditas) {
  const ki = [];
  for (const nyelv of NYELVEK) {
    const md = nyelv === 'en' ? cikk?.article_markdown : forditas?.[nyelv];
    if (typeof md === 'string' && md.trim()) ki.push({ nyelv, bodyMd: md });
  }
  return ki;
}

/** A sorrend: a legolvasottabbak elöl (60 nap), azonos olvasottságnál az újabb. */
export function sorrend(utmutatok, latogatas) {
  return [...utmutatok].sort((a, b) => (latogatas.get(b.slug) || 0) - (latogatas.get(a.slug) || 0) || String(b.published_at).localeCompare(String(a.published_at)));
}

async function main() {
  if (!REGI_KITOLTHETO_BE) { console.log('🧩 Régi promptok kitölthetővé tétele: kikapcsolva'); return; }
  const li = process.argv.indexOf('--limit');
  const limit = li > 0 && Number(process.argv[li + 1]) > 0 ? Math.floor(Number(process.argv[li + 1])) : FUTASONKENT_MAX;
  const mi = process.argv.indexOf('--max-minutes');
  const perc = mi > 0 && Number(process.argv[mi + 1]) > 0 ? Number(process.argv[mi + 1]) : FUTAS_PERC;
  const [{ ask }, { spentToday }, { loadLog }] = await Promise.all([import('./ai-router.js'), import('./budget.js'), import('./traffic-log.js')]);

  const now = Date.now(), hatarido = now + perc * 60000, ma = new Date(now).toISOString().slice(0, 10);
  const elozo = olvasJson(ALLAPOT);
  const allapot = { nap: ma, koltseg: elozo?.nap === ma ? Number(elozo.koltseg) || 0 : 0, uj: elozo?.nap === ma ? Number(elozo.uj) || 0 : 0, mezo: elozo?.nap === ma ? Number(elozo.mezo) || 0 : 0, kimaradt: '' };
  // 🇭🇺🇪🇸 nyelvenként hány útmutató-változat kapott ma jelölést (a riport-sor bontása)
  allapot.nyelvek = Object.fromEntries(NYELVEK.map(n => [n, elozo?.nap === ma ? Number(elozo?.nyelvek?.[n]) || 0 : 0]));
  const keret = () => keretOk({ napiOsszes: spentToday(), generatorMa: allapot.koltseg });

  const utmutatok = [], cikkek = {};
  for (const f of readdirSync(ARTICLES)) {
    if (!f.endsWith('.json')) continue;
    let j; try { j = JSON.parse(readFileSync(join(ARTICLES, f), 'utf-8')); } catch { continue; }
    const slug = j?._meta?.slug;
    if (!slug || !utmutatoE(f, j)) continue;
    utmutatok.push({ slug, published_at: j._meta.published_at || '', f });
    cikkek[slug] = j;
  }
  const naplo = loadLog(), napok = Object.keys(naplo).sort();
  const lat = napok.length ? latogatasok(naplo, napok[napok.length - 1], 60) : new Map();

  let hely = 0, kimaradt = '';
  // Útmutatónként sorban mindhárom nyelv (en → hu → es); minden tényleges hívás egy helyet visz a futás keretéből.
  let stop = false;
  for (const u of sorrend(utmutatok, lat)) {
    if (stop || hely >= limit) break;
    const j = cikkek[u.slug];
    for (const { nyelv, bodyMd } of nyelviTorzsek(j, olvasJson(join(TRANSLATIONS, u.f)))) {
      if (hely >= limit) break;
      if (Date.now() >= hatarido) { kimaradt = 'idő'; stop = true; console.log('   ⏱️ az időkeret elfogyott — a többi a következő futásra marad'); break; }
      const fajl = olvasJson(join(KI_DIR, u.slug + '.json'));   // frissen: az előző nyelv épp írhatta
      const nev = u.slug + ' [' + nyelv + ']';
      try {
        const e = await feldolgoz({ slug: u.slug, cim: j.original_title || u.slug, bodyMd, fajl, nyelv, ctx: { ask, keret, koltseg: usd => { allapot.koltseg += usd; } }, now });
        if (e.kihagyva) continue;
        hely++;
        if (e.atmeneti) { kimaradt = e.ok; if (e.ok === 'keret') { stop = true; break; } console.log('   ⚠️ ' + nev + ': ' + e.ok + ' — holnap újra'); continue; }
        irAtomi(join(KI_DIR, u.slug + '.json'), JSON.stringify(e.fajl, null, 2));
        allapot.uj++; allapot.mezo += e.mezoDb; allapot.nyelvek[nyelv]++;
        console.log('   ✅ ' + nev + ': ' + e.promptDb + ' prompt, ' + e.mezoDb + ' mező');
      } catch (err) { hely++; console.log('   ⚠️ ' + nev + ': ' + String(err.message || err).slice(0, 120)); }
      allapot.koltseg = +allapot.koltseg.toFixed(6);
      irAtomi(ALLAPOT, JSON.stringify(allapot, null, 2));   // minden hívás után: a költség ne vesszen el
    }
  }
  allapot.kimaradt = kimaradt; allapot.koltseg = +allapot.koltseg.toFixed(6);
  irAtomi(ALLAPOT, JSON.stringify(allapot, null, 2));
  console.log(`🧩 Régi promptok: ${allapot.uj} útmutató-változat (en ${allapot.nyelvek.en} · hu ${allapot.nyelvek.hu} · es ${allapot.nyelvek.es}), ${allapot.mezo} mező, $${allapot.koltseg.toFixed(4)} (kimaradt: ${kimaradt || 'semmi'})`);
}

if (process.argv[1] && process.argv[1].endsWith('kitoltheto-regi-gen.js')) {
  main().catch(e => { console.log('🧩 Régi promptok hiba: ' + (e.message || e)); });
}
