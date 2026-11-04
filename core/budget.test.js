// ===================================================================
// TESZT — költségkeret-figyelő (core/budget.js) hibatűrése
// ===================================================================
// INGYENES, hálózat nélküli. Fut: node core/run-tests.js
//
// MIÉRT VAN EZ A FÁJL (2026-08-30):
// a `load()` catch-ága NÉMÁN nullázta a teljes költés-történetet, a `save()`
// pedig NÉMÁN nyelte az írás hibáját, ráadásul az írás NEM volt atomi.
// Egyetlen félbevágott állapotfájl (a 07-31-i futást menet közben megölte az
// időkorlát) elég volt ahhoz, hogy a napi $1 ÉS a havi $25 plafon EGYSZERRE
// kikapcsoljon a hónap végéig — és mindez OLCSÓ NAPNAK LÁTSZOTT: a riport
// $0.00-t mutatott volna, ami megnyugtató, nem riasztó.
//
// A TESZT A TÜNETET MÉRI, NEM A MEGVALÓSÍTÁST: nem azt nézi, hogy van-e
// átmeneti fájl vagy `renameSync`, hanem hogy egy MENET KÖZBEN MEGÖLT írás
// után az előző állapot ép marad-e, és hogy a sérülés hagy-e nyomot.
//
// ⚠️ AZ ÉLES `core/budget-state.json` GIT-KÖVETETT ÉS VALÓDI PÉNZT SZÁMOL.
// A teszt hozzá sem nyúl: `BUDGET_STATE_PATH`-szal ideiglenes mappába tereli
// az állapotot, gyerekfolyamatokban futtat, a végén pedig ELLENŐRZI, hogy az
// éles fájl (és a memory/budget-guard.json) változatlan — ha mégsem, azt
// hangosan kiírja és visszaállítja.
// ===================================================================

import assert from 'assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync, readdirSync } from 'fs';
import { spawnSync } from 'child_process';
import { tmpdir } from 'os';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const BUDGET_JS = join(__dirname, 'budget.js');
const LIMITS = JSON.parse(readFileSync(join(ROOT, 'config.json'), 'utf-8')).limits || {};

// ── Az ÉLES fájlok pillanatképe (a végén ellenőrizzük, hogy változatlanok) ──
const ELES_ALLAPOT = join(__dirname, 'budget-state.json');
const ELES_JEL = join(ROOT, 'memory', 'budget-guard.json');
const ELES_ALLAPOT_MENTES = existsSync(ELES_ALLAPOT) ? readFileSync(ELES_ALLAPOT, 'utf-8') : null;
const ELES_JEL_MENTES = existsSync(ELES_JEL) ? readFileSync(ELES_JEL, 'utf-8') : null;

// ── Ideiglenes munkaterület ────────────────────────────────────────────
const TMP = mkdtempSync(join(tmpdir(), 'budget-teszt-'));
const ALLAPOT = join(TMP, 'budget-state.json');
const JEL = join(TMP, 'budget-guard.json');

const MA = new Date().toISOString().slice(0, 10);
const HO = MA.slice(0, 7);
const MASIK_NAP = `${HO}-${MA.endsWith('-01') ? '02' : '01'}`;
const REGI_NAP = '2020-01-05';      // biztosan NEM a futó hónap
const CSONKA_NAP = '2099-12-31';    // ezt vágja el a csonkolás

let pass = 0;
const t = (nev, fn) => { fn(); pass++; console.log('  ✅ ' + nev); };

// ── Segédek ────────────────────────────────────────────────────────────
function takarit() {
  for (const f of readdirSync(TMP)) {
    if (f.startsWith('budget-state.json') || f === 'budget-guard.json') rmSync(join(TMP, f), { force: true });
  }
}
function irAllapot(days) {
  writeFileSync(ALLAPOT, JSON.stringify({ days }, null, 2), 'utf-8');
}
/** Előre gyártott preload-szkript (CJS), ami a `fs.writeFileSync`-et cseréli. */
function preload(nev, torzs) {
  const p = join(TMP, nev);
  writeFileSync(p, torzs, 'utf-8');
  return p;
}
/**
 * A budget.js-t GYEREKFOLYAMATBAN futtatja — így a konzolt és a folyamat
 * halálát is meg tudjuk mérni, és minden eset tiszta modul-állapotból indul.
 */
function gyerek(kod, preloadUt = null) {
  const script = join(TMP, 'futtat.mjs');
  writeFileSync(script,
    `import { readFileSync } from 'fs';\n` +
    `import * as B from ${JSON.stringify(pathToFileURL(BUDGET_JS).href)};\n${kod}\n`, 'utf-8');
  const args = preloadUt ? ['--require', preloadUt, script] : [script];
  const r = spawnSync(process.execPath, args, {
    encoding: 'utf-8',
    env: { ...process.env, BUDGET_STATE_PATH: ALLAPOT }
  });
  const ki = (r.stdout || '') + (r.stderr || '');
  const sor = ki.split(/\r?\n/).find(s => s.startsWith('#OUT#'));
  return { ki, kilepes: r.status, ki_json: sor ? JSON.parse(sor.slice(5)) : null };
}
const jelProblemak = () => (existsSync(JEL) ? JSON.parse(readFileSync(JEL, 'utf-8')).problems || [] : []);
const masolatok = () => readdirSync(TMP).filter(f => f.includes('.corrupt-'));

console.log('🧪 költségkeret-figyelő — hibatűrés\n');

try {
  // =================================================================
  // 1. ÉP FÁJL → VÁLTOZATLAN VISELKEDÉS (a javítás nem ronthat el semmit)
  // =================================================================
  t('ép állapotfájl: a számok és a plafonok változatlanok', () => {
    takarit();
    irAllapot({
      [REGI_NAP]: { total: 0.5, byProvider: { google: 0.5 } },
      [MASIK_NAP]: { total: 0.3, byProvider: { openrouter: 0.3 } },
      [MA]: { total: 0.42, byProvider: { openrouter: 0.4, google: 0.02 } }
    });
    const r = gyerek(`console.log('#OUT#' + JSON.stringify(B.budgetStatus()));`);
    const s = r.ki_json;
    assert.ok(s, 'nem jött kimenet: ' + r.ki);
    assert.equal(s.today, 0.42);
    assert.equal(s.month, 0.72, 'a más havi nap NEM számít bele');
    assert.deepEqual(s.byProviderToday, { openrouter: 0.4, google: 0.02 });
    assert.equal(s.meteredBlocked.blocked, false);
    // ── A PLAFONOK: A USER KEMÉNY SZABÁLYÁT ŐRIZZÜK, NEM A KÓD MÁSOLATÁT ──
    // 2026-09-01, NAPTÁRI HATÁRON ROMLOTT EL. Ez a két sor korábban ÚJRA-
    // SZÁMOLTA a plafont a configból — csak egyszerűbben, mint a
    // `capForMonth()`: pontos hónap-kulcsra keresett
    // (`..._by_month[HO] ?? ..._hard_cap`). A KÓD viszont a LEGKÉSŐBBI, MÁR
    // ÉLETBE LÉPETT bejegyzést viszi tovább, tehát a 2026-08-as $25 szeptem-
    // berben is érvényes; a teszt szeptemberre nem talált kulcsot, visszaesett
    // a csupasz $50-re, és elbukott. A két logika AUGUSZTUSBAN VÉLETLENÜL
    // EGYEZETT — pont a hónapfordulón vált el. A kód volt a jó, a teszt a rossz.
    //
    // 🔑 TANULSÁG (ugyanaz, amit a core/daily-report.js már megtanult 08-01-én):
    // a tesztbe MÁSOLT logika elcsúszik a kódtól, és addig néma, amíg a két
    // eredmény véletlenül egyezik. Ezért itt nem a KÉPLET áll, hanem a SZABÁLY,
    // ami a képletnél tartósabb: a user kemény kerete napi $1 + havi $25.
    // Ez akkor is meg fog szólalni, ha valaki visszaemeli a plafont 50-re.
    const NAPI_FELSO_HATAR = 1;    // user-döntés, 2026-08-01
    const HAVI_FELSO_HATAR = 25;   // user-döntés
    assert.ok(s.dayHardCap > 0 && s.dayHardCap <= NAPI_FELSO_HATAR,
      `a napi plafon $${s.dayHardCap} — a user kemény kerete legfeljebb $${NAPI_FELSO_HATAR}/nap`);
    assert.ok(s.monthHardCap > 0 && s.monthHardCap <= HAVI_FELSO_HATAR,
      `a havi plafon $${s.monthHardCap} — a user kemény kerete legfeljebb $${HAVI_FELSO_HATAR}/hó`);
    // A CSAPDA, amit külön kell őrizni: a `..._by_month` blokk egy nap
    // kikerülhet a configból (elavult hónap-kulcsok takarítása), és akkor a
    // csupasz `..._hard_cap` lép életbe — NÉMÁN. Ezért az ALAPÉRTÉK maga sem
    // lehet 25-nél nagyobb: így a blokk törlése a keretet nem duplázza meg.
    assert.ok(Number(LIMITS.monthly_budget_usd_hard_cap) <= HAVI_FELSO_HATAR,
      `a config CSUPASZ havi alapértéke $${LIMITS.monthly_budget_usd_hard_cap} — `
      + `a by_month blokk törlésekor ez lépne életbe, tehát legfeljebb $${HAVI_FELSO_HATAR} lehet`);
    // Ép fájlnál NINCS se jel, se sérült-másolat, se ottfelejtett átmeneti fájl.
    assert.equal(existsSync(JEL), false, 'ép fájlra is jelet hagyott');
    assert.equal(masolatok().length, 0);
  });

  t('ép állapotfájl: a napi plafon ugyanúgy elsül', () => {
    takarit();
    irAllapot({ [MA]: { total: 1.2, byProvider: { openrouter: 1.2 } } });
    const r = gyerek(`console.log('#OUT#' + JSON.stringify(B.meteredBlocked()));`);
    assert.equal(r.ki_json.blocked, true);
    assert.equal(r.ki_json.daily, true);
  });

  t('ép állapotfájl: a recordSpend hozzáad és NEM veszít el napot', () => {
    takarit();
    irAllapot({
      [MASIK_NAP]: { total: 0.3, byProvider: { openrouter: 0.3 } },
      [MA]: { total: 0.42, byProvider: { openrouter: 0.42 } }
    });
    const r = gyerek(`B.recordSpend('openrouter', 0.08); console.log('#OUT#' + JSON.stringify({ma: B.spentToday(), ho: B.spentThisMonth()}));`);
    assert.equal(r.ki_json.ma, 0.5);
    assert.equal(r.ki_json.ho, 0.8);
    const lemez = JSON.parse(readFileSync(ALLAPOT, 'utf-8'));
    assert.equal(lemez.days[MA].total, 0.5);
    assert.equal(lemez.days[MASIK_NAP].total, 0.3, 'a korábbi nap eltűnt');
    // Nem hagy szemetet a mappában (a CI `git add -A`-t futtat).
    assert.deepEqual(readdirSync(TMP).filter(f => f.startsWith('budget-state.json.')), []);
  });

  // =================================================================
  // 2. SÉRÜLT JSON → NEM NULLÁZ NÉMÁN
  // =================================================================
  t('sérült (félbevágott) fájl: a plafon NEM kapcsol ki, marad a menthető történet', () => {
    takarit();
    const teljes = JSON.stringify({
      days: {
        [REGI_NAP]: { total: 0.5, byProvider: { google: 0.5 } },
        [MASIK_NAP]: { total: 0.3, byProvider: { openrouter: 0.3 } },
        [MA]: { total: 1.2, byProvider: { openrouter: 1.2 } },
        [CSONKA_NAP]: { total: 9.99, byProvider: { google: 9.99 } }
      }
    }, null, 2);
    // Pontosan úgy vágjuk el, ahogy egy megölt írás tenné: az utolsó nap
    // nyitó kapcsos zárójele után. Az első három nap ÉP a fájlban.
    const csonka = teljes.slice(0, teljes.indexOf(`"${CSONKA_NAP}"`) + `"${CSONKA_NAP}": {`.length);
    writeFileSync(ALLAPOT, csonka, 'utf-8');

    const r = gyerek(`console.log('#OUT#' + JSON.stringify(B.budgetStatus()));`);

    const s = r.ki_json;
    assert.ok(s, 'nem jött kimenet: ' + r.ki);
    // EZ A LÉNYEG: a régi kód itt 0-t adott → a napi ÉS a havi plafon kikapcsolt.
    assert.equal(s.today, 1.2, 'a mai költés elveszett — a napi plafon kikapcsolt');
    assert.equal(s.month, 1.5, 'a havi költés elveszett — a havi plafon kikapcsolt');
    assert.equal(s.meteredBlocked.blocked, true, 'sérülés után a plafon némán KINYÍLT');
    assert.deepEqual(s.byProviderToday, { openrouter: 1.2 }, 'a providerbontás nem menekült meg');
    // A fájl a futás után ismét ÉP, és pontosan a menthető napokat tartja
    // (a félbevágott utolsó nap odaveszett — de tudunk róla, lásd a jelet).
    const lemez = JSON.parse(readFileSync(ALLAPOT, 'utf-8'));
    assert.deepEqual(Object.keys(lemez.days).sort(), [REGI_NAP, MASIK_NAP, MA].sort());
  });

  t('sérült fájl: HANGOS figyelmeztetés + jel a napi riportnak + másolat a sérült fájlról', () => {
    // (ugyanaz az állapot, mint az előző esetben — azt hagytuk a lemezen)
    const p = jelProblemak();
    assert.equal(p.length, 1, 'nem hagyott jelet a napi riportnak');
    assert.equal(p[0].code, 'BUDGET_STATE_CORRUPT');
    assert.ok(p[0].at, 'nincs időbélyeg a jelen');
    assert.ok(p[0].backup, 'a jel nem mondja meg, hova került a sérült fájl');
    const m = masolatok();
    assert.equal(m.length, 1, 'nem mentette félre a sérült tartalmat');
    assert.ok(readFileSync(join(TMP, m[0]), 'utf-8').endsWith(`"${CSONKA_NAP}": {`), 'a másolat nem a sérült tartalom');
  });

  t('sérült fájl: a figyelmeztetés a KONZOLRA is kimegy', () => {
    takarit();
    writeFileSync(ALLAPOT, '{"days": {"' + MA + '": {"total": 0.7', 'utf-8');
    const r = gyerek(`console.log('#OUT#' + JSON.stringify(B.spentToday()));`);
    assert.ok(r.ki.includes('BUDGET_STATE_CORRUPT'), 'a konzolon nincs nyoma a sérülésnek:\n' + r.ki);
    assert.ok(/⚠️|🧯/.test(r.ki), 'a figyelmeztetés nem feltűnő:\n' + r.ki);
    assert.equal(r.ki_json, 0.7, 'a félbevágott utolsó nap totálja is menthető volt');
  });

  t('sérült fájl: a javítás után a következő recordSpend a MENTETT összegre épít', () => {
    takarit();
    writeFileSync(ALLAPOT, '{"days": {"' + MA + '": {"total": 0.7, "byProvider": {"openrouter": 0.7}}', 'utf-8');
    const r = gyerek(`B.recordSpend('openrouter', 0.05); console.log('#OUT#' + JSON.stringify(B.spentToday()));`);
    assert.equal(r.ki_json, 0.75, 'a mentett történetet felülírta a nulláról induló');
    const lemez = JSON.parse(readFileSync(ALLAPOT, 'utf-8'));   // dob, ha nem lett ép a fájl
    assert.equal(lemez.days[MA].total, 0.75);
    // Egy sérülés → EGY másolat, nem hívásonként egy.
    assert.equal(masolatok().length, 1, 'hívásonként másolta a sérült fájlt');
    // A fájl MEG IS GYÓGYULT: a következő FUTÁS már nem talál sérülést.
    // (Enélkül minden későbbi futás újra másolna és újra jelet írna.)
    const r2 = gyerek(`console.log('#OUT#' + JSON.stringify(B.spentToday()));`);
    assert.ok(!r2.ki.includes('BUDGET_STATE_CORRUPT'), 'a sérült fájl a futás után is sérült maradt');
    assert.equal(r2.ki_json, 0.75);
    assert.equal(masolatok().length, 1);
  });

  // =================================================================
  // 3. MENET KÖZBEN MEGÖLT ÍRÁS → AZ ELŐZŐ ÁLLAPOT ÉP MARAD
  // =================================================================
  t('félbevágott írás: az előző állapot ép marad (nem lesz csonka a fájl)', () => {
    takarit();
    irAllapot({
      [MASIK_NAP]: { total: 0.3, byProvider: { openrouter: 0.3 } },
      [MA]: { total: 0.9, byProvider: { openrouter: 0.9 } }
    });
    const elotte = readFileSync(ALLAPOT, 'utf-8');

    // A CI 07-31-i esete: a folyamatot MENET KÖZBEN ölte meg az időkorlát.
    // A tartalom fele kiment, aztán a folyamat meghalt.
    const ut = preload('felbevagas.cjs', `const fs = require('fs');
const eredeti = fs.writeFileSync;
fs.writeFileSync = function (p, data, ...a) {
  if (String(p).includes('budget-state.json')) {
    const s = String(data);
    eredeti.call(fs, p, s.slice(0, Math.floor(s.length / 2)), 'utf-8');
    process.exit(9);            // mintha a futtató megölte volna
  }
  return eredeti.call(fs, p, data, ...a);
};
`);
    const r = gyerek(`B.recordSpend('openrouter', 0.05); console.log('#OUT#"nem-halt-meg"');`, ut);
    assert.equal(r.kilepes, 9, 'a szimulált halál nem történt meg — a teszt nem azt méri, amit hisz');

    const utana = readFileSync(ALLAPOT, 'utf-8');
    assert.equal(utana, elotte, 'a megölt írás ELRONTOTTA az előző állapotot');
    JSON.parse(utana);   // dob, ha csonka lett
    // És a következő futás számára tényleg ép: a plafon számol tovább.
    const r2 = gyerek(`console.log('#OUT#' + JSON.stringify(B.spentThisMonth()));`);
    assert.equal(r2.ki_json, 1.2);
    assert.equal(masolatok().length, 0, 'sérülésként észlelte azt, ami nem sérült');
  });

  // =================================================================
  // 4. AZ ÍRÁS HIBÁJA SEM NÉMA
  // =================================================================
  t('sikertelen írás: hangos figyelmeztetés + jel (a nyilvántartás megállt)', () => {
    takarit();
    irAllapot({ [MA]: { total: 0.42, byProvider: { openrouter: 0.42 } } });
    const ut = preload('irashiba.cjs', `const fs = require('fs');
const eredeti = fs.writeFileSync;
fs.writeFileSync = function (p, ...a) {
  if (String(p).includes('budget-state.json')) { const e = new Error('EACCES: permission denied'); e.code = 'EACCES'; throw e; }
  return eredeti.call(fs, p, ...a);
};
`);
    const r = gyerek(`B.recordSpend('openrouter', 0.05); console.log('#OUT#' + JSON.stringify(B.spentToday()));`, ut);
    assert.ok(r.ki.includes('BUDGET_STATE_WRITE_FAILED'), 'az írás hibája NÉMA maradt:\n' + r.ki);
    assert.ok(/⚠️|🧯/.test(r.ki), 'a figyelmeztetés nem feltűnő:\n' + r.ki);
    const p = jelProblemak();
    assert.equal(p.length, 1, 'nem hagyott jelet a napi riportnak');
    assert.equal(p[0].code, 'BUDGET_STATE_WRITE_FAILED');
    assert.ok(p[0].at);
    // A régi fájl NEM sérülhet meg attól, hogy az új írás elbukott.
    assert.equal(JSON.parse(readFileSync(ALLAPOT, 'utf-8')).days[MA].total, 0.42);
  });

  t('sikertelen írás: sok hívás is EGY jelet hagy (nem ír teli riportot)', () => {
    takarit();
    irAllapot({ [MA]: { total: 0.42, byProvider: { openrouter: 0.42 } } });
    const ut = join(TMP, 'irashiba.cjs');
    const r = gyerek(`for (let i = 0; i < 25; i++) B.recordSpend('openrouter', 0.01); console.log('#OUT#0');`, ut);
    assert.equal(jelProblemak().length, 1, 'hívásonként írt egy bejegyzést');
    assert.ok(r.ki.split('BUDGET_STATE_WRITE_FAILED').length - 1 <= 2, 'a konzolt is telesírta');
  });

  console.log(`\n✅ ${pass} teszt rendben`);
} finally {
  // ── Takarítás + AZ ÉLES FÁJLOK ÉRINTETLENSÉGÉNEK ELLENŐRZÉSE ──────────
  try { rmSync(TMP, { recursive: true, force: true }); } catch { /* mindegy */ }

  const mostAllapot = existsSync(ELES_ALLAPOT) ? readFileSync(ELES_ALLAPOT, 'utf-8') : null;
  if (mostAllapot !== ELES_ALLAPOT_MENTES) {
    console.log('❌ A TESZT BELEÍRT AZ ÉLES core/budget-state.json-BA — visszaállítva.');
    if (ELES_ALLAPOT_MENTES !== null) writeFileSync(ELES_ALLAPOT, ELES_ALLAPOT_MENTES, 'utf-8');
    else rmSync(ELES_ALLAPOT, { force: true });
    process.exitCode = 1;
  }
  const mostJel = existsSync(ELES_JEL) ? readFileSync(ELES_JEL, 'utf-8') : null;
  if (mostJel !== ELES_JEL_MENTES) {
    console.log('❌ A TESZT BELEÍRT AZ ÉLES memory/budget-guard.json-BA — visszaállítva.');
    if (ELES_JEL_MENTES !== null) writeFileSync(ELES_JEL, ELES_JEL_MENTES, 'utf-8');
    else rmSync(ELES_JEL, { force: true });
    process.exitCode = 1;
  }
}
