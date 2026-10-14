# Trendkutató + nézetlen útmutatók törlése — építési terv

> **Agenteknek:** KÖTELEZŐ al-skill: superpowers:subagent-driven-development (ajánlott) vagy superpowers:executing-plans. A lépések jelölőnégyzetesek (`- [ ]`).

**Cél:** a 60 napja olvasatlan útmutatók automatikus, teljes törlése, és egy ingyenes, napi trendkutató, amely a hírek sorrendjét és napi 1 útmutató témáját a felkapott témák felé tereli.

**Architektúra:** két új, tiszta (hálózat nélkül tesztelhető) modul a `core/`-ban: `core/guide-prune.js` (törlés-döntés) és `core/trend-kutato.js` (gyűjtés, szűrés, pontozás, sorrend, riport, mérés). A meglévő folyamatokba csak vékony bekötés kerül: Házmester, IndexNow, Író, Útmutató-agent, napi riport, CI.

**Technológia:** Node.js ESM (Node 24), saját mini-tesztkeret (`t()` + `assert/strict`), GitHub Actions, Cloudflare Pages.

**Spec:** `docs/superpowers/specs/2026-10-14-trendkutato-es-utmutato-torles-design.md` — olvasd el MIELŐTT nekiállsz.

## Globális szabályok (minden feladatra érvényes)

**Mit nem szabad futtatni vagy importálni:**
- Az `agents/` alatt SEMMIT nem importálsz és nem futtatsz.
- Ugyanez érvényes erre a hét fájlra: `core/daily-report.js`, `core/search-report.js`, `core/housekeeping.js`, `core/video-compose.js`, `core/seo-guard.js`, `website/build.js`, `core/share-images.js`.
- **Szerkeszteni szabad őket**, ellenőrzés: `node --check <fájl>`. A bekötést FORRÁS-ALAPÚ teszt igazolja (a fájl szövegét olvassa, lásd `core/reel-queue.test.js` mintáit).

**Tesztek:**
- Futtatás: `node core/run-tests.js > "$SCRATCH/tests.out" 2>&1; echo $?`. Soha nem csővezetékkel. A `$SCRATCH` a session scratchpad-könyvtára.
- Egy fájl futtatása: `node core/<nev>.test.js > "$SCRATCH/x.out" 2>&1; echo $?`.
- Tesztben nincs hálózat és nincs fizetős AI-hívás: a `fetch` beadható paraméter.
- Tesztben nincs meghajtóbetűs útvonal (a `test-hygiene` teszt tiltja).

**Fájlkezelés:**
- **Sorvégek megőrzése.** CRLF: `core/housekeeping.js`, `core/daily-report.js`, `core/reel-post.js`. LF: `core/indexnow.js`, `agents/iro/agent.js`, `agents/guide/agent.js`, `config.json`, `.github/workflows/auto.yml`, `core/guard-registry.test.js` (ellenőrizd: `file <fájl>`).
- Az új fájlok LF-esek. Szerkesztéshez az Edit eszközt használd, ne sed-et vagy `node -e`-t.
- **`memory/*.json`-t csak a CI ír.** Helyben a CLI-ket csak `--dry` kapcsolóval futtasd. Ha mégis keletkezik `memory/` változás: `git checkout -- memory/`.

**Commit és szöveg:**
- **Commit:** feladatonként egy commit, magyar üzenet, utolsó sora: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. **NEM pusholsz** — a vezérlő pushol a végén.
- **Kommentek** magyarul, a környező kód stílusában (miért, dátummal, a user szavával).
- **Tartalmi szabály:** összehasonlítás TILOS (a trendszűrő kiveszi). Költség: a trendkutató $0 (nincs AI-hívás). Az útmutató-ötletelő legfeljebb napi 1 kis AI-hívással bővül.

## Review Focus

1. **A forgalmi napló útvonal-formátuma megváltozik** (pl. `/guides/…`): minden útmutató „olvasatlannak” látszik. Elvárt viselkedés: NEM töröl, a riportba ⚠️ kerül. → Task 1: a „0 cikk-látogatás az ablakban” és a „jelöltek > 60%” kapu tesztje.
2. **Linkkivétel csak pontos slugra hathat:**
   - a `slug-a` törlése nem bántja a `slug-a-b` linkjét;
   - abszolút, relatív és nyelvi URL-alakra is hat;
   - a JSON más mezőit nem rontja.
   → Task 1 és Task 2 tesztek.
3. **A Google-javaslat végpont rossz választ ad** (HTML egyetértés-oldalt, 429-et, hálózati hibát): nem dob kivételt, a többi forrás megy, a `hibak` kitöltve. → Task 3 teszt.
4. **Elavult trendlista** (a CI-lépés napokig nem fut): 48 óra után nincs trendhatás, és a riport szól. → Task 3 és Task 5 teszt.
5. **Az ötletelő 0 témát ad a trendre:** ugyanazon a napon NEM próbálkozik újra (különben napi 3 fölösleges AI-hívás). → Task 4 teszt (`trend_proba`).

---

### Task 1: `core/guide-prune.js` — a törlés-döntés (tiszta modul)

**Fájlok:**
- Létrehoz: `core/guide-prune.js`
- Teszt (létrehoz): `core/guide-prune.test.js`

**Interfészek:**
- Felhasznál: `halottLinkTorles(md, urlek) → { md, db }` a `core/guide-links.js`-ből (megvan; `[szöveg](url)` → `szöveg`, az URL után opcionális `/`).
- Előállít (a Task 2 és 3 ezekre épít):
  - `SITE = 'https://aiworldhq.com'`
  - `pruneBeallitas(cfg) → { be: boolean, napok: number, max: number }`
  - `latogatasok(days, ig: 'YYYY-MM-DD', ablakNap) → Map<slug, number>`
  - `lefedettseg(days, now: ms, ablakNap) → { ok, ok_ok: string, ig: string|null }`
  - `torlendok({ cikkek: {file, slug, published_at}[], days, now, ablakNap, max }) → { ok, ok_ok, jeloltek, torlendo }`
  - `linkAlakok(slug, site?) → string[]`
  - `linkekKi(md, slugok, site?) → { md, db }`
  - `toroltListaFrissit(lista, ujSlugok, now, megorzesNap = 30) → {slug, at}[]`
  - `toroltUrlek(lista, site, nyelvek: string[], now, oraHatar = 48) → string[]`

- [ ] **1. lépés: a bukó teszt** — `core/guide-prune.test.js`:

```js
// core/guide-prune.js — a 60 napja olvasatlan útmutatók törlés-döntése (2026-10-14, user:
// „ha 60 napig nem volt olvasó, minek tartjuk!"). Ingyenes, hálózat nélküli.
import assert from 'node:assert/strict';
import {
  SITE, pruneBeallitas, latogatasok, lefedettseg, torlendok,
  linkAlakok, linkekKi, toroltListaFrissit, toroltUrlek
} from './guide-prune.js';

let pass = 0;
const t = (n, f) => { f(); pass++; console.log('  ✅ ' + n); };
console.log('🧪 guide-prune\n');

const NAP = 864e5;
const MOST = Date.parse('2026-10-14T12:00:00Z');
const d = n => new Date(MOST - n * NAP).toISOString().slice(0, 10);
// Teljes, 70 napos napló: minden napon 1 „zaj" sor, a megadott slugok látogatásaival.
const naplo = (latogatott = {}) => {
  const days = {};
  for (let i = 1; i <= 70; i++) days[d(i)] = [{ path: '/', visits: 5, views: 6 }, { path: '/article/zaj-hir', visits: 1, views: 1 }];
  for (const [path, nap] of Object.entries(latogatott)) days[d(nap)].push({ path, visits: 1, views: 1 });
  return days;
};
const ut = (slug, korNap) => ({ file: `ARTICLE_GUIDE_${slug}.json`, slug, published_at: new Date(MOST - korNap * NAP).toISOString() });

t('beállítás: alap 60 nap / 25 db; csak a kifejezett false kapcsol ki; 30 nap alá nem engedünk', () => {
  assert.deepEqual(pruneBeallitas({}), { be: true, napok: 60, max: 25 });
  assert.deepEqual(pruneBeallitas({ content: { guide_prune: { enabled: false } } }).be, false);
  assert.equal(pruneBeallitas({ content: { guide_prune: { days: 6 } } }).napok, 60, '🔴 egy elgépelt 6 nap tömeges törlést indítana');
  assert.equal(pruneBeallitas({ content: { guide_prune: { days: 90, max_per_run: 10 } } }).napok, 90);
  assert.equal(pruneBeallitas({ content: { guide_prune: { max_per_run: 5000 } } }).max, 100);
});

t('látogatás: a 3 nyelvi útvonal együtt számít, az ablakon kívüli nap nem', () => {
  const days = naplo({ '/hu/article/a': 3, '/es/article/b': 10, '/article/c': 65 });
  const v = latogatasok(days, d(1), 60);
  assert.equal(v.get('a'), 1);
  assert.equal(v.get('b'), 1);
  assert.equal(v.get('c'), undefined, 'a 65 napja volt látogatás az ablakon kívül esik');
});

t('🔴 lefedettség-kapu: hiányzó nap, üres nap, elavult vagy üres napló → NINCS törlés', () => {
  assert.equal(lefedettseg(naplo(), MOST, 60).ok, true);
  const lyukas = naplo(); delete lyukas[d(30)];
  assert.equal(lefedettseg(lyukas, MOST, 60).ok, false);
  assert.match(lefedettseg(lyukas, MOST, 60).ok_ok, /hiányzó nap/);
  const ures = naplo(); ures[d(10)] = [];
  assert.equal(lefedettseg(ures, MOST, 60).ok, false);
  const regi = {}; for (const [k, v] of Object.entries(naplo())) if (k <= d(5)) regi[k] = v;
  assert.match(lefedettseg(regi, MOST, 60).ok_ok, /elavult/);
  assert.equal(lefedettseg({}, MOST, 60).ok, false);
  assert.equal(lefedettseg(null, MOST, 60).ok, false);
});

t('jelölt: legalább 60 napos ÉS 60 napja 0 olvasó; a legrégebbi előre; futásonként max', () => {
  const cikkek = [ut('olvasott', 100), ut('ures-regi', 120), ut('ures-uj', 30), ut('ures-kozep', 80), ut('datum-nelkul', 0), ut('olvasott2', 90)];
  cikkek[4].published_at = '';
  // 4 régi útmutatóból 2 olvasatlan (50%) — a 60%-os gyanú-kapu alatt marad
  const days = naplo({ '/article/olvasott': 20, '/hu/article/olvasott2': 5 });
  const r = torlendok({ cikkek, days, now: MOST, ablakNap: 60, max: 1 });
  assert.equal(r.ok, true);
  assert.deepEqual(r.jeloltek.map(x => x.slug), ['ures-regi', 'ures-kozep'], '🔴 olvasott, fiatal vagy dátum nélküli útmutató is törlődne');
  assert.deepEqual(r.torlendo.map(x => x.slug), ['ures-regi']);
});

t('🔴 Review Focus 1: ha a naplóban egyetlen cikk-látogatás sincs (útvonal-formátum változott) → nincs törlés', () => {
  const days = {};
  for (let i = 1; i <= 70; i++) days[d(i)] = [{ path: '/guides/valami', visits: 3, views: 3 }];
  const r = torlendok({ cikkek: [ut('a', 100), ut('b', 100)], days, now: MOST, ablakNap: 60, max: 25 });
  assert.equal(r.ok, false);
  assert.match(r.ok_ok, /egyetlen cikk-látogatás/);
});

t('🔴 Review Focus 1: ha a régi útmutatók több mint 60%-a jelölt → gyanús, nincs törlés', () => {
  const cikkek = [ut('a', 100), ut('b', 100), ut('c', 100), ut('d', 100), ut('e', 100)];
  const r = torlendok({ cikkek, days: naplo({ '/article/a': 3 }), now: MOST, ablakNap: 60, max: 25 });
  assert.equal(r.ok, false, '4 az 5-ből (80%) olvasatlan — ez mérési hibára utal');
  assert.match(r.ok_ok, /60%/);
  const rendben = torlendok({ cikkek, days: naplo({ '/article/a': 3, '/article/b': 3, '/article/c': 3 }), now: MOST, ablakNap: 60, max: 25 });
  assert.equal(rendben.ok, true);
  assert.equal(rendben.jeloltek.length, 2);
});

t('linkkivétel: abszolút, relatív és nyelvi alak; a hasonló, hosszabb slug linkje MARAD', () => {
  assert.deepEqual(linkAlakok('x'), [
    `${SITE}/article/x`, '/article/x', `${SITE}/hu/article/x`, '/hu/article/x', `${SITE}/es/article/x`, '/es/article/x'
  ]);
  const md = 'A [régi](https://aiworldhq.com/article/slug-a) és [rel](/hu/article/slug-a/) meg [más](/article/slug-a-b) link.';
  const r = linkekKi(md, ['slug-a']);
  assert.equal(r.md, 'A régi és rel meg [más](/article/slug-a-b) link.');
  assert.equal(r.db, 2);
  assert.deepEqual(linkekKi('', ['x']), { md: '', db: 0 });
});

t('törölt-lista: új bejegyzés be, 30 napnál régebbi ki; IndexNow csak a 48 órán belülit kéri', () => {
  const regi = [{ slug: 'nagyon-regi', at: new Date(MOST - 40 * NAP).toISOString() }, { slug: 'tegnapi', at: new Date(MOST - NAP).toISOString() }];
  const l = toroltListaFrissit(regi, ['mai'], MOST);
  assert.deepEqual(l.map(x => x.slug), ['tegnapi', 'mai']);
  assert.deepEqual(toroltListaFrissit(null, [], MOST), []);
  const urlek = toroltUrlek([{ slug: 'mai', at: new Date(MOST).toISOString() }, { slug: 'regi', at: new Date(MOST - 3 * NAP).toISOString() }], SITE, ['', '/es'], MOST, 48);
  assert.deepEqual(urlek, [`${SITE}/article/mai`, `${SITE}/es/article/mai`]);
});

console.log('\n✅ guide-prune.test: mind a ' + pass + ' eset rendben');
```

- [ ] **2. lépés: futtasd, bukjon el.**
  Parancs: `node core/guide-prune.test.js > "$SCRATCH/gp.out" 2>&1; echo $?`
  Elvárt: `1`, a kimenetben „Cannot find module …guide-prune.js”.

- [ ] **3. lépés: a megvalósítás** — `core/guide-prune.js`:

```js
// ===================================================================
// NÉZETLEN ÚTMUTATÓK TÖRLÉSE — a DÖNTÉS (2026-10-14, user: „ha 60 napig nem volt
// olvasó, akkor minek tartjuk!" · „ne csak átirányítás legyen, teljes törlés!")
// ===================================================================
// A törlést a Házmester végzi (core/housekeeping.js pruneUnreadGuides), a hírtörlés
// mintájára. Ez a modul csak SZÁMOL, hálózat és lemez nélkül — ezért tesztelhető.
//
// 🔑 A LEGFONTOSABB A HÁROM KAPU. A törlés nem vonható vissza egyszerűen, és egy
// mérési hiba itt MINDENT vinne: ha a forgalmi napló hiányos, vagy megváltozik az
// útvonal-formátum, a gép minden útmutatót „olvasatlannak" látna. Ilyenkor INKÁBB
// NEM TÖRÖL — egy kimaradt nap semmibe nem kerül, a tömeges törlés igen.
//   1. lefedettség: az ablak minden napja megvan, és a napló friss;
//   2. van egyáltalán cikk-látogatás az ablakban (különben a mérés vak);
//   3. a régi útmutatóknak legfeljebb 60%-a lehet jelölt (10-14-én 37% volt).
// Terv: docs/superpowers/specs/2026-10-14-trendkutato-es-utmutato-torles-design.md
// ===================================================================
import { halottLinkTorles } from './guide-links.js';

export const SITE = 'https://aiworldhq.com';
const NAP = 864e5;
const UTVONAL_RX = /^\/(?:hu\/|es\/)?article\/([^/?#]+)/;
const GYANUS_ARANY = 0.6;
const datum = t => new Date(t).toISOString().slice(0, 10);

/** config.json content.guide_prune → { be, napok, max }. Csak a kifejezett false kapcsol ki. */
export function pruneBeallitas(cfg) {
  const p = cfg?.content?.guide_prune || {};
  // 30 nap alá NEM engedünk: egy elgépelt „6" egy futás alatt mindent vinne.
  const napok = Number.isFinite(p.days) && p.days >= 30 ? p.days : 60;
  const max = Number.isFinite(p.max_per_run) && p.max_per_run > 0 ? Math.min(p.max_per_run, 100) : 25;
  return { be: p.enabled !== false, napok, max };
}

/** Az `ig` napig visszamenő `ablakNap` nap belépői slugonként — a 3 nyelvi útvonal EGYÜTT. */
export function latogatasok(days, ig, ablakNap) {
  const tol = datum(Date.parse(ig) - (ablakNap - 1) * NAP);
  const v = new Map();
  for (const [nap, sorok] of Object.entries(days || {})) {
    if (nap < tol || nap > ig) continue;
    for (const r of Array.isArray(sorok) ? sorok : []) {
      const m = String(r?.path || '').match(UTVONAL_RX);
      if (m) v.set(m[1], (v.get(m[1]) || 0) + (Number(r.visits) || 0));
    }
  }
  return v;
}

/** Megbízható-e a napló az utolsó `ablakNap` napra? (a napló utolsó napjától visszafelé) */
export function lefedettseg(days, now, ablakNap) {
  const napok = Object.keys(days || {}).sort();
  if (!napok.length) return { ok: false, ok_ok: 'üres a forgalmi napló', ig: null };
  const ig = napok[napok.length - 1];
  if (ig < datum(now - 2 * NAP)) return { ok: false, ok_ok: `a forgalmi napló elavult (utolsó nap: ${ig})`, ig };
  for (let i = 0; i < ablakNap; i++) {
    const nap = datum(Date.parse(ig) - i * NAP);
    if (!Array.isArray(days[nap]) || !days[nap].length) return { ok: false, ok_ok: `hiányzó nap a forgalmi naplóban: ${nap}`, ig };
  }
  return { ok: true, ok_ok: '', ig };
}

/**
 * Mely útmutatók törlendők? A `cikkek` CSAK útmutató legyen (a hívó szűr: utmutatoE).
 * @returns {{ok: boolean, ok_ok: string, jeloltek: object[], torlendo: object[]}}
 */
export function torlendok({ cikkek, days, now = Date.now(), ablakNap = 60, max = 25 }) {
  const ures = { jeloltek: [], torlendo: [] };
  const lf = lefedettseg(days, now, ablakNap);
  if (!lf.ok) return { ok: false, ok_ok: lf.ok_ok, ...ures };
  const v = latogatasok(days, lf.ig, ablakNap);
  if (!v.size) return { ok: false, ok_ok: 'a forgalmi naplóban egyetlen cikk-látogatás sincs az ablakban (útvonal-formátum változott?)', ...ures };
  const korHatar = now - ablakNap * NAP;
  const regiek = (cikkek || []).filter(c => {
    const t = Date.parse(c?.published_at || '');
    return c?.slug && Number.isFinite(t) && t <= korHatar;
  });
  const jeloltek = regiek.filter(c => !(v.get(c.slug) > 0))
    .sort((a, b) => String(a.published_at).localeCompare(String(b.published_at)));
  if (regiek.length && jeloltek.length / regiek.length > GYANUS_ARANY) {
    return { ok: false, ok_ok: `a régi útmutatók ${Math.round(100 * jeloltek.length / regiek.length)}%-a lenne törlendő (határ: 60%) — mérési hibára gyanús`, ...ures };
  }
  return { ok: true, ok_ok: '', jeloltek, torlendo: jeloltek.slice(0, max) };
}

/** A slug minden URL-alakja, amivel más cikkek hivatkozhatnak rá. */
export function linkAlakok(slug, site = SITE) {
  const ki = [];
  for (const ny of ['', '/hu', '/es']) ki.push(`${site}${ny}/article/${slug}`, `${ny}/article/${slug}`);
  return ki;
}

/** A törölt útmutatókra mutató linkek kivétele egy markdownból — a linkszöveg marad. */
export function linkekKi(md, slugok, site = SITE) {
  return halottLinkTorles(md, (slugok || []).flatMap(s => linkAlakok(s, site)));
}

/** A törölt-lista frissítése: az új bejegyzések be, a `megorzesNap`-nál régebbiek ki. */
export function toroltListaFrissit(lista, ujSlugok, now = Date.now(), megorzesNap = 30) {
  const hatar = now - megorzesNap * NAP;
  const regi = (Array.isArray(lista) ? lista : []).filter(x => x?.slug && Date.parse(x.at) >= hatar);
  const at = new Date(now).toISOString();
  return [...regi, ...(ujSlugok || []).map(slug => ({ slug, at }))];
}

/** IndexNow-hoz: az utóbbi `oraHatar` órában törölt útmutatók URL-jei, nyelvi előtagonként. */
export function toroltUrlek(lista, site, nyelvek, now = Date.now(), oraHatar = 48) {
  const hatar = now - oraHatar * 3600e3;
  const ki = [];
  for (const x of Array.isArray(lista) ? lista : []) {
    if (!x?.slug || !(Date.parse(x.at) >= hatar)) continue;
    for (const lp of nyelvek || []) ki.push(`${site}${lp}/article/${x.slug}`);
  }
  return ki;
}
```

- [ ] **4. lépés: futtasd, menjen át.**
  Parancs: `node core/guide-prune.test.js > "$SCRATCH/gp.out" 2>&1; echo $?`
  Elvárt: `0`, „✅ guide-prune.test: mind a 8 eset rendben”.

- [ ] **5. lépés: a teljes tesztkészlet, majd commit.**
  Futtatás: `node core/run-tests.js > "$SCRATCH/tests.out" 2>&1; echo $?` — elvárt: `0`.

```bash
git add core/guide-prune.js core/guide-prune.test.js
git commit -m "Útmutató-takarító: döntés-modul (60 nap, 3 hibakapu, linkkivétel) — core/guide-prune.js

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Bekötés — Házmester, config, IndexNow, őrszem-nyilvántartás

**Fájlok:**
- Módosít: `core/housekeeping.js` (CRLF): új import, új `pruneUnreadGuides()` + segédje, hívás a `main()`-ben
- Módosít: `config.json` (`content.guide_prune` blokk)
- Módosít: `core/indexnow.js` (törölt URL-ek bejelentése)
- Módosít: `core/guard-registry.test.js` (`NEM_ORSZEM`: `torolt-utmutatok.json`)
- Teszt: `core/guide-prune.test.js` (bekötés-esetek hozzáadása)

**Interfészek:**
- Felhasznál: a Task 1 összes exportját.
- Előállít:
  - a `memory/torolt-utmutatok.json` fájlt (`[{slug, at}]`);
  - a Házmester riportsorát: `🗑️ nézetlen útmutató törölve: …`.

- [ ] **1. lépés: a bukó bekötés-tesztek** — a `core/guide-prune.test.js` végére, a záró `console.log` ELÉ:

```js
// ── BEKÖTÉS (forrás-alapú: a housekeeping.js és az indexnow.js NEM importálható) ──
import { readFileSync } from 'node:fs';
const forras = p => readFileSync(new URL('../' + p, import.meta.url), 'utf-8').replace(/\r\n/g, '\n');

t('🔌 Házmester: a hírtörlés UTÁN, az árva-takarítás ELŐTT fut; a 3 kaput a modul adja', () => {
  const hk = forras('core/housekeeping.js');
  assert.match(hk, /import \{ pruneBeallitas, torlendok, linkekKi, toroltListaFrissit \} from '\.\/guide-prune\.js';/);
  assert.match(hk, /pruneOldNews\(\);\n\s*pruneUnreadGuides\(\);/, '🔴 a takarító nincs bekötve, vagy rossz helyen fut');
  const fn = hk.slice(hk.indexOf('function pruneUnreadGuides()'), hk.indexOf('function linkekKiMindenhol('));
  assert.ok(fn.length > 100, 'nincs pruneUnreadGuides()');
  assert.match(fn, /torlendok\(\{ cikkek, days, now: Date\.now\(\), ablakNap: b\.napok, max: b\.max \}\)/);
  assert.match(fn, /if \(!r\.ok\) \{ report\.push\(`⚠️ nézetlen útmutató-törlés kihagyva: \$\{r\.ok_ok\}`\); return; \}/);
  assert.match(fn, /utmutatoE\(f, d\)/, 'csak útmutató törlődhet');
  assert.match(fn, /lejartCeluakNelkul\(/, 'a rá mutató átirányítások maradnának');
  assert.match(fn, /linkekKiMindenhol\(slugok\)/, 'a többi cikkben halott link maradna');
  assert.match(fn, /toroltListaFrissit\(/, 'az IndexNow nem tudna a törlésről');
  assert.match(fn, /if \(!DRY\)/, 'a --dry próba is törölne');
});

t('🔌 config: content.guide_prune be, 60 nap, 25/futás', () => {
  const cfg = JSON.parse(forras('config.json'));
  assert.deepEqual(pruneBeallitas(cfg), { be: true, napok: 60, max: 25 });
});

t('🔌 IndexNow: a 48 órán belül törölt útmutatókat is bejelenti', () => {
  const ix = forras('core/indexnow.js');
  assert.match(ix, /import \{ toroltUrlek \} from '\.\/guide-prune\.js';/);
  assert.match(ix, /toroltUrlek\(lista, site, LANGS, now, FRESH_HOURS\)/);
});
```

- [ ] **2. lépés: futtasd, bukjon el.**
  Parancs: `node core/guide-prune.test.js > "$SCRATCH/gp.out" 2>&1; echo $?`
  Elvárt: `1`, a „🔌 Házmester” eset bukik.

- [ ] **3. lépés: Házmester** (`core/housekeeping.js`, CRLF — csak Edit eszközzel):
  - **a)** Az importok közé, a `lejartCeluakNelkul` import sora UTÁN:

```js
import { pruneBeallitas, torlendok, linkekKi, toroltListaFrissit } from './guide-prune.js';
```

  - **b)** A `pruneOldNews()` függvény záró `}`-je UTÁN, a `// ── 3. ÁRVA BORÍTÓKÉPEK` blokk ELÉ:

```js
// ── 2b. NÉZETLEN ÚTMUTATÓK (2026-10-14, user: „ha 60 napig nem volt olvasó, akkor minek
// tartjuk!" · „ne csak átirányítás legyen, teljes törlés!") ────────────────────────
// A DÖNTÉS a core/guide-prune.js-é (3 hibakapu + futásonkénti korlát) — itt csak a törlés
// történik, a hírtörlés mintájára. A képet és a fordítást a lenti árva-takarítók viszik el
// UGYANEBBEN a futásban (ezért fut ez előttük). Az oldal a következő buildben már nem
// készül el → 404, és kimarad a webhelytérképből; az IndexNow a törölt-listából szól.
function pruneUnreadGuides() {
  if (!existsSync(ARTICLES)) return;
  let cfg = {};
  try { cfg = JSON.parse(readFileSync(join(ROOT, 'config.json'), 'utf-8')); } catch { /* alapértékek */ }
  const b = pruneBeallitas(cfg);
  if (!b.be) return;
  let days = null;
  try { days = JSON.parse(readFileSync(join(ROOT, 'memory', 'traffic-log.json'), 'utf-8')).days; } catch { /* a kapu kezeli */ }
  const cikkek = [];
  for (const f of readdirSync(ARTICLES).filter(x => x.startsWith('ARTICLE_') && x.endsWith('.json'))) {
    let d; try { d = JSON.parse(readFileSync(join(ARTICLES, f), 'utf-8')); } catch { continue; }
    if (!utmutatoE(f, d)) continue;
    cikkek.push({ file: f, slug: d._meta?.slug || '', published_at: d._meta?.published_at || '' });
  }
  const r = torlendok({ cikkek, days, now: Date.now(), ablakNap: b.napok, max: b.max });
  if (!r.ok) { report.push(`⚠️ nézetlen útmutató-törlés kihagyva: ${r.ok_ok}`); return; }
  if (!r.torlendo.length) return;

  const slugok = r.torlendo.map(x => x.slug);
  let social = 0;
  for (const { file, slug } of r.torlendo) {
    if (!DRY) { try { unlinkSync(join(ARTICLES, file)); } catch { /* jövő körben */ } }
    const s = join(ROOT, 'content', 'social', `${slug}.json`);
    if (existsSync(s)) { social++; if (!DRY) { try { unlinkSync(s); } catch { /* jövő körben */ } } }
  }
  let atir = 0;
  try {
    const hp = join(ROOT, 'content', 'slug-history.json');
    const toroltek = new Set(slugok);
    if (existsSync(hp)) {
      const h = lejartCeluakNelkul(JSON.parse(readFileSync(hp, 'utf-8')), s => !toroltek.has(s));
      atir = h.torolt.length;
      if (atir && !DRY) writeFileSync(hp, JSON.stringify(h.tortenet, null, 2) + '\n', 'utf-8');
    }
  } catch { /* az átirányítás-takarítás hibája ne állítsa meg a házmestert */ }
  let linkDb = 0;
  if (!DRY) linkDb = linkekKiMindenhol(slugok);
  if (!DRY) {
    try {
      const p = join(ROOT, 'memory', 'torolt-utmutatok.json');
      let lista = [];
      try { lista = JSON.parse(readFileSync(p, 'utf-8')); } catch { /* első törlés */ }
      writeFileSync(p, JSON.stringify(toroltListaFrissit(lista, slugok), null, 2) + '\n', 'utf-8');
    } catch { /* az IndexNow-bejelentés elmarad, a 404 akkor is kiveszi a keresőből */ }
  }
  const maradek = r.jeloltek.length - r.torlendo.length;
  report.push(`🗑️ nézetlen útmutató törölve: ${r.torlendo.length} db (${b.napok} napja 0 olvasó)`
    + `${social ? ` + ${social} közösségi poszt` : ''}${atir ? ` + ${atir} átirányítás` : ''}`
    + `${linkDb ? ` + ${linkDb} rá mutató link` : ''}${maradek > 0 ? ` — még ${maradek} vár` : ''}`);
}

// A törölt útmutatókra mutató linkek kivétele a többi cikkből ÉS a fordításokból (a szöveg
// marad). Cikk: article_markdown; fordítás: minden szöveg-mező (hu, es).
function linkekKiMindenhol(slugok) {
  let db = 0;
  for (const [dir, mezok] of [[ARTICLES, ['article_markdown']], [TRANSLATIONS, null]]) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter(x => x.endsWith('.json'))) {
      let d; try { d = JSON.parse(readFileSync(join(dir, f), 'utf-8')); } catch { continue; }
      let valt = 0;
      for (const k of mezok || Object.keys(d)) {
        if (typeof d[k] !== 'string') continue;
        const r = linkekKi(d[k], slugok);
        if (r.db) { d[k] = r.md; valt += r.db; }
      }
      if (valt) { db += valt; try { writeFileSync(join(dir, f), JSON.stringify(d, null, 2), 'utf-8'); } catch { /* jövő körben */ } }
    }
  }
  return db;
}
```

  - **c)** A `main()`-ben a `pruneOldNews();` sor UTÁN egy új sor:

```js
  pruneUnreadGuides();
```

  - **d)** A `pruneOldNews()` riportsorának végén a régi `— az útmutatók érintetlenek` szöveg mostantól hamis. Cseréld erre: `— az útmutatókat külön szabály kezeli (60 nap olvasó nélkül)`.

  - **Ellenőrzés:** `node --check core/housekeeping.js` és `file core/housekeeping.js` (CRLF maradjon).

- [ ] **4. lépés: config** (`config.json`) — a `"content"` blokkban a `"guide_focus": {…}` objektum záró `},` sora UTÁN:

```json
    "guide_prune": {
      "_comment": "2026-10-14 — user: „ha 60 napig nem volt olvasó, akkor minek tartjuk!” · „teljes törlés”. A legalább 60 napos, 60 napja 0 olvasós (en+hu+es együtt) útmutató TELJESEN törlődik (core/guide-prune.js → core/housekeeping.js). Hibavédelem: hiányos/elavult forgalmi napló, 0 cikk-látogatás vagy >60% jelölt → nincs törlés; futásonként max_per_run. enabled:false = azonnal ki.",
      "enabled": true,
      "days": 60,
      "max_per_run": 25
    },
```

  - **Ellenőrzés:** `node -e "JSON.parse(require('fs').readFileSync('config.json','utf8'))"` hiba nélkül fut.

- [ ] **5. lépés: IndexNow** (`core/indexnow.js`, LF):
  - **a)** Az importok közé: `import { toroltUrlek } from './guide-prune.js';`
  - **b)** A `submitIndexNow`-ban a friss cikkeket gyűjtő `if (existsSync(ARTICLES_DIR)) { … }` blokk UTÁN, a `// Ha van friss tartalom, a listaoldalak is változtak` ELÉ:

```js
  // TÖRÖLT ÚTMUTATÓK (2026-10-14, core/guide-prune.js): a megszűnt címet is bejelentjük — az
  // IndexNow-nál ez azt jelenti: „nézd meg újra", a kereső 404-et talál, és kiveszi a találatai közül.
  try {
    const lista = JSON.parse(readFileSync(join(ROOT, 'memory', 'torolt-utmutatok.json'), 'utf-8'));
    for (const u of toroltUrlek(lista, site, LANGS, now, FRESH_HOURS)) urls.add(u);
  } catch { /* nincs törölt útmutató — nem baj */ }
```

  - **Ellenőrzés:** `grep -n "const ROOT\|FRESH_HOURS =" core/indexnow.js` mindkettőt mutatja (léteznek). `node --check core/indexnow.js`.

- [ ] **6. lépés: őrszem-nyilvántartás** (`core/guard-registry.test.js`) — a `NEM_ORSZEM` objektumba, ábécérendben a `'topic-dedup-log.json'` ELÉ:

```js
  'torolt-utmutatok.json': 'a törölt útmutatók 30 napos listája az IndexNow-bejelentéshez (core/housekeeping.js → core/indexnow.js) — munkasor; a törlést a Házmester riportsora jelzi',
```

- [ ] **7. lépés: futtasd a teszteket, menjenek át.**
  - `node core/guide-prune.test.js > "$SCRATCH/gp.out" 2>&1; echo $?` → `0`, 11 eset.
  - `node core/run-tests.js > "$SCRATCH/tests.out" 2>&1; echo $?` → `0`. Különösen a `guard-registry.test.js` és a `redirect-chain.test.js` legyen zöld.

- [ ] **8. lépés: commit**

```bash
git add core/housekeeping.js core/indexnow.js config.json core/guard-registry.test.js core/guide-prune.test.js
git commit -m "Útmutató-takarító bekötve: Házmester törli a 60 napja olvasatlant (25/futás), linkek ki, IndexNow szól

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `core/trend-kutato.js` — gyűjtés, szűrés, pontozás, CLI, Bing-lista

**Fájlok:**
- Létrehoz: `core/trend-kutato.js`
- Létrehoz: `content/trend-bing.json` (a 10-14-i Bing AI Performance adat)
- Módosít: `config.json` (`content.trends` blokk)
- Módosít: `core/guard-registry.test.js` (`NEM_ORSZEM`: `trendek.json`)
- Teszt (létrehoz): `core/trend-kutato.test.js`

**Interfészek:**
- Előállít (a Task 4 és 5 ezekre épít):
  - `trendBeallitas(cfg) → { be, seeds: string[] }`
  - `normal(s) → string`
  - `szavak(s) → Set<string>`
  - `eszkozBenne(kifejezes, eszkozok) → string`
  - `marMegirt(kifejezes, cimek) → boolean`
  - `szuro(kifejezes, { eszkozok, magok, meglevoCimek, rss }) → { ok, ok_ok, eszkoz }`
  - `rssTetelek(xml) → { kifejezes, forgalom, hirek[] }[]`
  - `googleJavaslatok(magok, opts) → Promise<{ talalat: {kifejezes, hely, mag}[], hiba }>`
  - `googleFelkapott(opts) → Promise<{ tetelek, hiba }>`
  - `sajatTopEszkozok(days, cikkMeta: Map<slug,{tool}>, now, napok = 14, db = 10) → string[]` (kisbetűs eszköznevek)
  - `osszesit({ javaslatok, felkapott, bing, sajatEszkozok, eszkozok, magok, meglevoCimek }) → tema[]`, ahol `tema = { kifejezes, forras: string[], pont, eszkoz }`
  - `gyujt({ beall, fetchFn, alvas, ora, root }) → Promise<trendek>`, ahol `trendek = { at, datum, temak: tema[], hibak: string[], bing_frissitve }`
  - `trendekBetolt(ut?) → trendek|null`
  - `bingListaBetolt(ut?) → object|null`
  - `frissE(trendek, now) → boolean`
  - `aktivTrendek({ now, cfg, trendek }) → trendek|null` (null, ha ki van kapcsolva vagy 48 óránál régebbi)
  - `TRENDEK_UT`, `BING_UT`, `FORRAS_NEV`

- [ ] **1. lépés: a bukó teszt** — `core/trend-kutato.test.js`:

```js
// core/trend-kutato.js — a napi, ingyenes trendkutató (2026-10-14, user ötlete). Hálózat nélkül:
// a fetch beadott hamisítvány.
import assert from 'node:assert/strict';
import {
  trendBeallitas, normal, eszkozBenne, marMegirt, szuro, rssTetelek, googleJavaslatok,
  googleFelkapott, sajatTopEszkozok, osszesit, frissE, aktivTrendek
} from './trend-kutato.js';

let pass = 0;
const t = (n, f) => { f(); pass++; console.log('  ✅ ' + n); };
const ta = async (n, f) => { await f(); pass++; console.log('  ✅ ' + n); };
console.log('🧪 trend-kutato\n');

const ESZK = ['ChatGPT', 'Claude', 'Gemini', 'Microsoft Copilot', 'Alexa+', 'NotebookLM'];
const NAP = 864e5;
const MOST = Date.parse('2026-10-14T12:00:00Z');

t('beállítás: alapból be; csak a kifejezett false kapcsol ki; legfeljebb 40 alapkérdés', () => {
  assert.equal(trendBeallitas({}).be, true);
  assert.equal(trendBeallitas({ content: { trends: { enabled: false } } }).be, false);
  const sok = Array.from({ length: 60 }, (_, i) => 'q' + i);
  assert.equal(trendBeallitas({ content: { trends: { seeds: sok } } }).seeds.length, 40);
});

t('eszköz-felismerés: szóhatáron, a „+" nélkül is; részszó nem', () => {
  assert.equal(eszkozBenne('how to use alexa for cooking', ESZK), 'Alexa+');
  assert.equal(eszkozBenne('chatgpt paraphrase', ESZK), 'ChatGPT');
  assert.equal(eszkozBenne('claudette recipes', ESZK), '');
});

t('🔴 szűrő: összehasonlítás, tiltott, szám/ár-kérdés, nem angol, navigációs és ismeretlen márka KI', () => {
  const o = { eszkozok: ESZK, magok: ['ai photo trend'] };
  for (const [k, ok] of [
    ['supergrok vs chatgpt', /összehasonlítás/], ['Microsoft Copilot vs ChatGPT vs Claude comparison', /összehasonlítás/],
    ['difference between AI copilots and traditional automation tools', /összehasonlítás/],
    ['best ai photo app', /összehasonlítás/], ['ai undress app', /nem nekünk való/],
    ['how much does grok ai cost', /szám/], ['copilot adoption rate 2026', /szám/],
    ['copilot ai gratis', /nem angol/], ['gemini (bot conversacional)', /nem angol/],
    ['gpt chat', /csak márkanév/], ['anthropic ai claude', /csak márkanév/],
    ['lovable ai', /ismeretlen márka/], ['viral air fryer', /nem AI-téma/],
    ['sci-bot', /egyszavas/], ['ai photo trend', /alapkérdés/],
    ['according to this training how can chatgpt be used by someone in operations and administration', /túl hosszú/]
  ]) {
    const r = szuro(k, o);
    assert.equal(r.ok, false, k);
    assert.match(r.ok_ok, ok, k + ' → ' + r.ok_ok);
  }
});

t('szűrő: ami ÁTMEGY — eszköz + feladat, vagy AI + feladat', () => {
  const o = { eszkozok: ESZK, magok: [] };
  assert.deepEqual(szuro('chatgpt paraphrase', o), { ok: true, ok_ok: '', eszkoz: 'ChatGPT' });
  assert.equal(szuro('claude record a skill', o).ok, true);
  assert.equal(szuro('can ai help with daily tasks', o).ok, true);
  assert.equal(szuro('gemini trending photo prompt for girls', o).eszkoz, 'Gemini');
});

t('már megírt: a kifejezés szavai benne vannak egy meglévő útmutató címében → KI', () => {
  const cimek = ['How to Paraphrase Text with ChatGPT in 5 Minutes'];
  assert.equal(marMegirt('chatgpt paraphrase', cimek), true);
  assert.equal(marMegirt('chatgpt identify pictures', cimek), false);
  assert.equal(szuro('chatgpt paraphrase', { eszkozok: ESZK, meglevoCimek: cimek }).ok_ok, 'már van ilyen útmutatónk');
});

t('RSS: tételek, forgalom és hírcímek; a felkapott szó lehet egyszavas', () => {
  const xml = '<rss><channel><title>Daily Search Trends</title><item><title>nano banana</title><ht:approx_traffic>200+</ht:approx_traffic>'
    + '<ht:news_item><ht:news_item_title>Gemini&#39;s new AI image trend</ht:news_item_title></ht:news_item></item>'
    + '<item><title>fenerbahçe</title><ht:approx_traffic>500+</ht:approx_traffic></item></channel></rss>';
  const r = rssTetelek(xml);
  assert.deepEqual(r[0], { kifejezes: 'nano banana', forgalom: '200+', hirek: ["Gemini's new AI image trend"] });
  assert.equal(r.length, 2);
  assert.equal(szuro('whalefall', { eszkozok: ESZK, rss: true }).ok, true, 'a felkapott listánál egy szó is mehet');
});

await ta('🔴 Review Focus 3: Google-javaslat — 429-nél megáll, HTML-re és hálózati hibára sem dob', async () => {
  const valasz = (status, body) => async () => ({ status, ok: status === 200, text: async () => body });
  const alvas = async () => {};
  const jo = await googleJavaslatok(['ai photo trend'], { fetchFn: valasz(200, JSON.stringify(['ai photo trend', ['ai photo trend prompt', 'ai photo trend free']])), alvas });
  assert.deepEqual(jo.talalat.map(x => [x.kifejezes, x.hely]), [['ai photo trend prompt', 0], ['ai photo trend free', 1]]);
  assert.equal(jo.hiba, '');
  let hivas = 0;
  const tiltott = await googleJavaslatok(['a', 'b', 'c'], { fetchFn: async () => { hivas++; return { status: 429, ok: false, text: async () => '' }; }, alvas });
  assert.equal(hivas, 1, '🔴 a tiltás után is tovább bombázza a Google-t');
  assert.match(tiltott.hiba, /429/);
  const html = await googleJavaslatok(['a'], { fetchFn: valasz(200, '<html>consent</html>'), alvas });
  assert.deepEqual(html.talalat, []);
  const halo = await googleJavaslatok(['a'], { fetchFn: async () => { throw new Error('ECONNRESET'); }, alvas });
  assert.match(halo.hiba, /hálózati hiba/);
  const felk = await googleFelkapott({ fetchFn: async () => { throw new Error('x'); } });
  assert.deepEqual(felk.tetelek, []);
  assert.match(felk.hiba, /hálózati hiba/);
});

t('saját adat: az utolsó 14 nap legolvasottabb cikkeinek eszközei (kisbetűvel)', () => {
  const nap = n => new Date(MOST - n * NAP).toISOString().slice(0, 10);
  const days = { [nap(1)]: [{ path: '/article/a', visits: 9 }, { path: '/hu/article/b', visits: 4 }], [nap(30)]: [{ path: '/article/c', visits: 99 }] };
  const meta = new Map([['a', { tool: 'Gemini' }], ['b', { tool: '' }], ['c', { tool: 'Claude' }]]);
  assert.deepEqual(sajatTopEszkozok(days, meta, MOST), ['gemini']);
});

t('összesítés: pontozás, összevonás azonos szókészletre, saját bónusz, top 10, összehasonlítás kiesik', () => {
  const temak = osszesit({
    javaslatok: [
      { kifejezes: 'gemini trending photo prompt', hely: 0, mag: 'gemini trend' },
      { kifejezes: 'gemini trending photo prompt', hely: 3, mag: 'ai photo trend' },
      { kifejezes: 'chatgpt vs gemini', hely: 0, mag: 'x' }
    ],
    felkapott: [{ kifejezes: 'nano banana', forgalom: '200+', hirek: ['Gemini AI image trend'] }, { kifejezes: 'fenerbahçe', hirek: [] }],
    bing: { lehetosegek: [{ kifejezes: 'claude record a skill', sav: '101-500' }, { kifejezes: 'record a skill claude', sav: '101-500' }] },
    sajatEszkozok: ['gemini'], eszkozok: ESZK, magok: [], meglevoCimek: []
  });
  assert.deepEqual(temak.map(x => x.kifejezes), ['nano banana', 'gemini trending photo prompt', 'claude record a skill']);
  assert.equal(temak[1].pont, 10 + 5 + 10, 'első hely 10 + második alapkérdés 5 + saját Gemini-bónusz 10');
  assert.deepEqual(temak[1].forras, ['google-javaslat']);
  assert.equal(temak[2].pont, 10, 'a két szórendű Bing-kifejezés EGY téma, nem kettő');
  assert.ok(temak.length <= 10);
});

t('🔴 Review Focus 4: frissesség — 20 órán belül nem gyűjt újra; 48 óra után nincs trendhatás; kikapcsolva sincs', () => {
  const tr = { at: new Date(MOST - 5 * 3600e3).toISOString(), temak: [{ kifejezes: 'x y', forras: [], pont: 1 }] };
  assert.equal(frissE(tr, MOST), true);
  assert.equal(frissE({ at: new Date(MOST - 21 * 3600e3).toISOString() }, MOST), false);
  assert.equal(frissE(null, MOST), false);
  assert.equal(aktivTrendek({ now: MOST, cfg: {}, trendek: tr }), tr);
  assert.equal(aktivTrendek({ now: MOST + 2 * NAP, cfg: {}, trendek: tr }), null);
  assert.equal(aktivTrendek({ now: MOST, cfg: { content: { trends: { enabled: false } } }, trendek: tr }), null);
  assert.equal(normal('  Gemini  (Bot)!! '), 'gemini bot');
});

console.log('\n✅ trend-kutato.test: mind a ' + pass + ' eset rendben');
```

- [ ] **2. lépés: futtasd, bukjon el.**
  Parancs: `node core/trend-kutato.test.js > "$SCRATCH/tk.out" 2>&1; echo $?`
  Elvárt: `1`, „Cannot find module”.

- [ ] **3. lépés: a megvalósítás** — `core/trend-kutato.js`:

```js
// ===================================================================
// TRENDKUTATÓ (2026-10-14, user ötlete: „csináljunk egy AI trendkutatót, és így
// csinálnánk cikkeket és útmutatókat") — mi érdekli MOST az embereket?
// ===================================================================
// Naponta EGYSZER gyűjt (a CI napi 3 futásából az első dolgozik, a többi a 20 órás
// kapun kihagy), ingyen, AI-hívás NÉLKÜL:
//   1. Google keresési javaslatok — mit gépelnek be az emberek. NEM hivatalos végpont,
//      ezért lassan (1 mp szünet) és keveset (max 40) kérünk; tiltásnál (403/429) aznap
//      kimarad, a többi forrás megy tovább.
//   2. Google napi felkapott lista (USA) — csak az AI-hoz kapcsolódó tételek.
//   3. A saját legolvasottabb cikkeink eszközei (memory/traffic-log.json, 14 nap) — bónusz.
//   4. A Bing AI Performance „Top Opportunity Queries" listája (content/trend-bing.json) —
//      havonta KÉZZEL frissül (Claude a user böngészőjéből olvassa, vagy a user letölti).
//
// 🔑 A TRENDKUTATÓ CSAK TÉMÁT VÁLASZT. A tények továbbra is csak hivatalos forrásból
// jönnek, a trendből írt cikk ugyanazokon a kapukon megy át (tény, hitelesség, név).
// Mért alap (10-14): az eszköz NÉPSZERŰSÉGE nálunk nem számít (népszerű 4,1 vs kevésbé
// ismert 4,3 belépő/7 nap), a „mindenki ezt csinálja" téma igen (Save Yourself AI Photo
// Trend: 27 belépő, az átlag ~4) — ezért nincs Bing-keresésszám és Wikipedia.
// Terv: docs/superpowers/specs/2026-10-14-trendkutato-es-utmutato-torles-design.md
// ===================================================================
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { utmutatoE } from './guide-kind.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NAP = 864e5;
const UA = 'Mozilla/5.0 (compatible; aiworldhq-trends/1.0; +https://aiworldhq.com)';
export const TRENDEK_UT = join(ROOT, 'memory', 'trendek.json');
export const BING_UT = join(ROOT, 'content', 'trend-bing.json');
export const FRISS_ORA = 20;          // ennyi órán belül nem gyűjtünk újra
export const AKTIV_ORA = 48;          // ennél régebbi listának nincs hatása (a CI-lépés napok óta nem fut)
export const MAX_LEKERES = 40;
export const SZUNET_MS = 1000;
export const LEKERES_IDO_MS = 8000;
export const OSSZ_IDO_MS = 120000;    // a CI-lépés 3 perces kerete alatt
export const TOP_DB = 10;
export const MAX_SZO = 10;
export const BING_ELAVULT_NAP = 45;
export const FORRAS_NEV = { 'google-javaslat': 'Google-javaslat', 'google-felkapott': 'Google felkapott', 'bing-lehetoseg': 'Bing' };
const BING_PONT = { '100K-500K': 30, '10K-50K': 25, '5K-10K': 20, '1K-5K': 15, '500-1K': 12, '101-500': 10, '51-100': 8, '11-50': 6, '0-10': 4 };

// ── SZŰRŐK ──────────────────────────────────────────────────────────
// Összehasonlítás TILOS (user 09-26; core/no-comparison-rules.test.js) — a „best X" is az.
export const OSSZEHASONLITAS_RX = /\b(vs\.?|versus|compar\w*|alternatives?|better than|best|top \d+|differen\w*)\b/i;
export const TILTOTT_RX = /\b(nsfw|nude|naked|porn\w*|sex\w*|onlyfans|undress\w*|casino|gambl\w*|betting|lottery|trump|biden|harris|election\w*|politic\w*|democrat\w*|republican\w*)\b/i;
// Szám-, ár- és statisztika-kérdés: csak hivatalos adattal írható, a trendből nem lesz cikk.
export const TENY_RX = /\b(cost|costs|price|prices|pricing|no longer free|benchmark\w*|adoption|daily active|users|subscribers?|subscription numbers|how many|market share|revenue|stock|context window|launched|release date)\b/i;
const NEM_ANGOL_RX = /\b(gratis|aziendale|quando|stata|lanciata|conversacional|para|cómo|como|qué|kostenlos|wie|pour|avec)\b|[àèéìòùñ]/i;
const AI_RX = /\b(ai|a\.i\.|chatgpt|gpt|gemini|claude|copilot|alexa|notebooklm|perplexity|grok|meta ai|midjourney|deepfakes?|chatbots?|prompts?)\b/i;
const FELADAT_RX = /\b(how|use|using|make|create|write|prompts?|trend\w*|photos?|pictures?|images?|videos?|voice|help|scams?|plan|learn|study|edit|summar\w*|translate|paraphrase|record|skill|identify|build|setup|set up|organi[sz]e|emails?|resume|budget|cook\w*|recipes?|travel|homework|letter|schedule|remind\w*|shopping|clone)\b/i;
const GENERIKUS = new Set(['ai', 'chat', 'gpt', 'gptt', 'chet', 'jet', 'bot', 'chatbot', 'assistant', 'app', 'apps', 'free', 'online', 'web', 'login', 'sign', 'download',
  'version', 'versions', 'model', 'models', 'plus', 'pro', 'new', 'latest', 'the', 'a', 'an', 'for', 'with', 'of', 'in', 'on', 'to', 'and', 'or', 'is', 'it', 'my', 'your',
  'anthropic', 'openai', 'google', 'microsoft', 'meta', 'amazon', 'xai']);
const TOLTELEK = new Set(['the', 'and', 'for', 'with', 'your', 'you', 'how', 'use', 'using', 'what', 'that', 'this', 'from', 'into', 'can', 'are', 'step', 'steps',
  'guide', 'minutes', 'beginner', 'beginners', 'easy', 'simple', 'ai']);
const escRx = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** config.json content.trends → { be, seeds }. Csak a kifejezett false kapcsol ki. */
export function trendBeallitas(cfg) {
  const c = cfg?.content?.trends || {};
  const seeds = Array.isArray(c.seeds) ? c.seeds.filter(s => typeof s === 'string' && s.trim()).slice(0, MAX_LEKERES) : [];
  return { be: c.enabled !== false, seeds };
}

/** Kisbetű, írásjel → szóköz (a „+" és a „-" marad), egyszeres szóközök. */
export function normal(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9+\-' àèéìòùñ.]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** A tartalmas szavak halmaza (legalább 3 betű, töltelékszó nélkül). */
export function szavak(s) {
  return new Set(normal(s).replace(/[^a-z0-9 ]+/g, ' ').split(' ').filter(w => w.length >= 3 && !TOLTELEK.has(w)));
}

/** Melyik ismert eszközt nevezi meg? (website/tool-links.json neve; a végi „+" nélkül is) → név vagy ''. */
export function eszkozBenne(kifejezes, eszkozok) {
  const k = ` ${normal(kifejezes)} `;
  return (eszkozok || []).find(e => {
    const n = String(e).toLowerCase().replace(/\+$/, '');
    return n.length >= 3 && new RegExp(`[^a-z0-9]${escRx(n)}\\+?[^a-z0-9]`).test(k);
  }) || '';
}

/** Megvan-e már: a kifejezés tartalmas szavainak legalább 75%-a egy meglévő címben. */
export function marMegirt(kifejezes, cimek) {
  const a = szavak(kifejezes);
  if (!a.size) return false;
  return (cimek || []).some(c => {
    const b = szavak(c);
    let k = 0; for (const w of a) if (b.has(w)) k++;
    return k / a.size >= 0.75;
  });
}

/** Átmegy-e a szűrőkön? `rss`: a Google felkapott listájáról jött (egy szó is lehet). */
export function szuro(kifejezes, { eszkozok = [], magok = [], meglevoCimek = [], rss = false } = {}) {
  const nyers = String(kifejezes || '');
  const k = normal(nyers);
  if (!k) return { ok: false, ok_ok: 'üres' };
  const sz = k.split(' ');
  if (!rss && sz.length < 2) return { ok: false, ok_ok: 'egyszavas' };
  if (sz.length > MAX_SZO) return { ok: false, ok_ok: 'túl hosszú (valószínűleg egyedi kérdés)' };
  if (magok.some(m => normal(m) === k)) return { ok: false, ok_ok: 'maga az alapkérdés' };
  if (OSSZEHASONLITAS_RX.test(k)) return { ok: false, ok_ok: 'összehasonlítás (tilos)' };
  if (TILTOTT_RX.test(k)) return { ok: false, ok_ok: 'nem nekünk való' };
  if (TENY_RX.test(k)) return { ok: false, ok_ok: 'szám/ár-kérdés (hivatalos adat kell)' };
  if (NEM_ANGOL_RX.test(nyers)) return { ok: false, ok_ok: 'nem angol' };
  const eszkoz = eszkozBenne(k, eszkozok);
  if (!rss) {
    if (!eszkoz && !AI_RX.test(k)) return { ok: false, ok_ok: 'nem AI-téma' };
    const en = eszkoz.toLowerCase().replace(/\+$/, '');
    const maradek = sz.filter(s => !GENERIKUS.has(s) && s.replace(/\+$/, '') !== en);
    if (!maradek.length) return { ok: false, ok_ok: 'csak márkanév (navigációs keresés)' };
    if (!eszkoz && !FELADAT_RX.test(k)) return { ok: false, ok_ok: 'ismeretlen márka vagy nincs benne feladat' };
  }
  if (marMegirt(k, meglevoCimek)) return { ok: false, ok_ok: 'már van ilyen útmutatónk' };
  return { ok: true, ok_ok: '', eszkoz };
}

// ── FORRÁSOK ────────────────────────────────────────────────────────
const decodeXml = s => String(s || '').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

/** A Google felkapott-RSS tételei: kifejezés, becsült forgalom, kapcsolódó hírcímek. */
export function rssTetelek(xml) {
  const ki = [];
  for (const m of String(xml || '').matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const cim = (m[1].match(/<title>([^<]*)<\/title>/) || [])[1];
    if (!cim) continue;
    const forgalom = (m[1].match(/<ht:approx_traffic>([^<]*)<\/ht:approx_traffic>/) || [])[1] || '';
    const hirek = [...m[1].matchAll(/<ht:news_item_title>([^<]*)<\/ht:news_item_title>/g)].map(x => decodeXml(x[1]).trim());
    ki.push({ kifejezes: decodeXml(cim).trim(), forgalom, hirek });
  }
  return ki;
}

const alvasAlap = ms => new Promise(r => setTimeout(r, ms));

/** Google keresési javaslatok az alapkérdésekre. Tiltásnál (403/429) vagy hálózati hibánál MEGÁLL. */
export async function googleJavaslatok(magok, { fetchFn = fetch, alvas = alvasAlap, ora = Date.now, szunetMs = SZUNET_MS, idoMs = LEKERES_IDO_MS, hatarido } = {}) {
  const vege = hatarido ?? ora() + OSSZ_IDO_MS;
  const talalat = [];
  let hiba = '';
  let n = 0;
  for (const mag of (magok || []).slice(0, MAX_LEKERES)) {
    if (ora() > vege) { hiba = 'időkeret elfogyott'; break; }
    if (n++) await alvas(szunetMs);
    let r;
    try {
      r = await fetchFn('https://suggestqueries.google.com/complete/search?client=firefox&hl=en&gl=us&q=' + encodeURIComponent(mag),
        { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(idoMs) });
    } catch (e) { hiba = 'hálózati hiba: ' + String(e?.message || e).slice(0, 60); break; }
    if (r.status === 403 || r.status === 429) { hiba = `HTTP ${r.status} (letiltott)`; break; }
    if (!r.ok) continue;
    let j; try { j = JSON.parse(await r.text()); } catch { continue; }   // pl. HTML egyetértés-oldal
    (Array.isArray(j?.[1]) ? j[1] : []).slice(0, 10).forEach((k, i) => {
      if (typeof k === 'string' && normal(k) !== normal(mag)) talalat.push({ kifejezes: k, hely: i, mag });
    });
  }
  return { talalat, hiba };
}

/** A Google napi felkapott listája (USA, RSS). */
export async function googleFelkapott({ fetchFn = fetch, idoMs = LEKERES_IDO_MS } = {}) {
  try {
    const r = await fetchFn('https://trends.google.com/trending/rss?geo=US', { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(idoMs) });
    if (!r.ok) return { tetelek: [], hiba: `HTTP ${r.status}` };
    return { tetelek: rssTetelek(await r.text()), hiba: '' };
  } catch (e) {
    return { tetelek: [], hiba: 'hálózati hiba: ' + String(e?.message || e).slice(0, 60) };
  }
}

/** A saját, utolsó `napok` nap `db` legolvasottabb cikkének eszközei (kisbetűs, egyedi). */
export function sajatTopEszkozok(days, cikkMeta, now = Date.now(), napok = 14, db = 10) {
  const tol = new Date(now - napok * NAP).toISOString().slice(0, 10);
  const v = new Map();
  for (const [nap, sorok] of Object.entries(days || {})) {
    if (nap < tol) continue;
    for (const r of Array.isArray(sorok) ? sorok : []) {
      const m = String(r?.path || '').match(/^\/(?:hu\/|es\/)?article\/([^/?#]+)/);
      if (m) v.set(m[1], (v.get(m[1]) || 0) + (Number(r.visits) || 0));
    }
  }
  const top = [...v.entries()].sort((a, b) => b[1] - a[1]).slice(0, db).map(([s]) => s);
  return [...new Set(top.map(s => String(cikkMeta?.get(s)?.tool || '').trim().toLowerCase()).filter(Boolean))];
}

/** Pontozás + összevonás (azonos tartalmas szókészlet = egy téma) → a legjobb TOP_DB. */
export function osszesit({ javaslatok = [], felkapott = [], bing = null, sajatEszkozok = [], eszkozok = [], magok = [], meglevoCimek = [] } = {}) {
  const m = new Map();
  const add = (kif, forras, pont, rss = false) => {
    const sz = szuro(kif, { eszkozok, magok, meglevoCimek, rss });
    if (!sz.ok) return;
    const kulcs = [...szavak(kif)].sort().join(' ') || normal(kif);
    const e = m.get(kulcs);
    if (e) {
      if (forras === 'google-javaslat' && e.forras.has('google-javaslat')) { e.pont += 5; return; }   // több alapkérdésnél is felbukkant
      if (e.forras.has(forras)) return;                                                                // ugyanaz a Bing-sor más szórenddel
      e.forras.add(forras); e.pont += pont; return;
    }
    m.set(kulcs, { kifejezes: normal(kif), forras: new Set([forras]), pont, eszkoz: sz.eszkoz || '' });
  };
  for (const j of javaslatok) add(j.kifejezes, 'google-javaslat', 10 - Math.min(9, Number(j.hely) || 0));
  for (const f of felkapott) if (AI_RX.test([f.kifejezes, ...(f.hirek || [])].join(' '))) add(f.kifejezes, 'google-felkapott', 50, true);
  for (const b of bing?.lehetosegek || []) add(b.kifejezes, 'bing-lehetoseg', BING_PONT[b.sav] || 4);
  const sajat = new Set((sajatEszkozok || []).map(s => s.toLowerCase()));
  for (const e of m.values()) if (e.eszkoz && sajat.has(e.eszkoz.toLowerCase())) e.pont += 10;
  return [...m.values()]
    .map(e => ({ kifejezes: e.kifejezes, forras: [...e.forras], pont: Math.round(e.pont), eszkoz: e.eszkoz }))
    .sort((a, b) => b.pont - a.pont || a.kifejezes.localeCompare(b.kifejezes))
    .slice(0, TOP_DB);
}

// ── LEMEZ ───────────────────────────────────────────────────────────
const jsonBe = ut => { try { return JSON.parse(readFileSync(ut, 'utf-8')); } catch { return null; } };
export const trendekBetolt = (ut = TRENDEK_UT) => jsonBe(ut);
export const bingListaBetolt = (ut = BING_UT) => jsonBe(ut);

/** Elég friss-e a lista ahhoz, hogy MA ne gyűjtsünk újra? */
export function frissE(trendek, now = Date.now()) {
  const t = Date.parse(trendek?.at || '');
  return Number.isFinite(t) && now - t < FRISS_ORA * 3600e3;
}

/** A HATÁSHOZ használható lista: be van kapcsolva, és 48 óránál nem régebbi — különben null. */
export function aktivTrendek({ now = Date.now(), cfg, trendek } = {}) {
  const c = cfg ?? jsonBe(join(ROOT, 'config.json')) ?? {};
  if (!trendBeallitas(c).be) return null;
  const T = trendek === undefined ? trendekBetolt() : trendek;
  const t = Date.parse(T?.at || '');
  if (!T || !Number.isFinite(t) || now - t > AKTIV_ORA * 3600e3) return null;
  return T;
}

function eszkozokBetolt(root) {
  const j = jsonBe(join(root, 'website', 'tool-links.json'));
  return Object.keys(j?.tools || {});
}

function cikkAdatok(root) {
  const dir = join(root, 'content', 'articles');
  const cimek = [], meta = new Map();
  if (!existsSync(dir)) return { cimek, meta };
  for (const f of readdirSync(dir).filter(x => x.endsWith('.json'))) {
    const d = jsonBe(join(dir, f));
    if (!d) continue;
    const slug = d._meta?.slug;
    if (slug) meta.set(slug, { tool: d._meta?.tool || '' });
    if (utmutatoE(f, d)) {
      const cim = (String(d.article_markdown || '').match(/^title:\s*"?([^"\n]+)/m) || [])[1];
      if (cim) cimek.push(cim);
    }
  }
  return { cimek, meta };
}

/** A napi gyűjtés: minden forrás, szűrés, pontozás. Soha nem dob — a hibák a `hibak`-ba kerülnek. */
export async function gyujt({ beall, fetchFn = fetch, alvas = alvasAlap, ora = Date.now, root = ROOT } = {}) {
  const hibak = [];
  const eszkozok = eszkozokBetolt(root);
  const { cimek, meta } = cikkAdatok(root);
  const j = await googleJavaslatok(beall?.seeds || [], { fetchFn, alvas, ora });
  if (j.hiba) hibak.push(`${FORRAS_NEV['google-javaslat']}: ${j.hiba}`);
  const f = await googleFelkapott({ fetchFn });
  if (f.hiba) hibak.push(`${FORRAS_NEV['google-felkapott']}: ${f.hiba}`);
  const bing = bingListaBetolt(join(root, 'content', 'trend-bing.json'));
  const days = jsonBe(join(root, 'memory', 'traffic-log.json'))?.days || {};
  const most = ora();
  const temak = osszesit({
    javaslatok: j.talalat, felkapott: f.tetelek, bing,
    sajatEszkozok: sajatTopEszkozok(days, meta, most), eszkozok, magok: beall?.seeds || [], meglevoCimek: cimek
  });
  return { at: new Date(most).toISOString(), datum: new Date(most).toISOString().slice(0, 10), temak, hibak, bing_frissitve: bing?.frissitve || null };
}

// ── PARANCSSOR ──────────────────────────────────────────────────────
//   node core/trend-kutato.js            napi gyűjtés (20 órán belül nem ismétel)
//   node core/trend-kutato.js --force    gyűjtés mindenképp
//   node core/trend-kutato.js --dry      gyűjt és kiírja, de NEM menti (helyi próba)
if (process.argv[1] && process.argv[1].endsWith('trend-kutato.js')) {
  const arg = process.argv.slice(2);
  (async () => {
    const cfg = jsonBe(join(ROOT, 'config.json')) || {};
    const beall = trendBeallitas(cfg);
    if (!beall.be) { console.log('⏭️  Trendkutató: kikapcsolva (config content.trends.enabled).'); return; }
    if (!arg.includes('--force') && !arg.includes('--dry') && frissE(trendekBetolt())) { console.log('💤 Trendkutató: a mai lista már megvan.'); return; }
    console.log('📈 TRENDKUTATÓ — ' + beall.seeds.length + ' alapkérdés');
    const ki = await gyujt({ beall });
    for (const tm of ki.temak) console.log(`   ${String(tm.pont).padStart(3)}  ${tm.kifejezes}  [${tm.forras.map(x => FORRAS_NEV[x] || x).join(' + ')}]${tm.eszkoz ? ' · ' + tm.eszkoz : ''}`);
    for (const h of ki.hibak) console.log('   ⚠️ ' + h);
    if (arg.includes('--dry')) { console.log('   (próba — nem mentem)'); return; }
    mkdirSync(dirname(TRENDEK_UT), { recursive: true });
    writeFileSync(TRENDEK_UT, JSON.stringify(ki, null, 2) + '\n', 'utf-8');
    console.log(`   ✅ ${ki.temak.length} téma mentve → memory/trendek.json`);
  })().catch(e => console.log('⚠️ Trendkutató hiba (nem kritikus): ' + String(e?.message || e).slice(0, 120)))
    .finally(() => { process.exitCode = 0; });
}
```

- [ ] **4. lépés: a Bing-lista** — `content/trend-bing.json` (a 10-14-én kiolvasott adat, szó szerint):

```json
{
  "_comment": "Bing Webmaster Tools → AI Performance → Topic Portfolio → Top Opportunity Queries (+ Citations & Pages → Grounding Queries). HAVONTA KÉZZEL frissül: Claude a user böngészőjéből olvassa ki, vagy a user a 'Letöltés' gombbal tölti le. Olvassa: core/trend-kutato.js (a szűrők az összehasonlítást és a szám/ár-kérdést kiveszik). A riport 45 nap után szól.",
  "frissitve": "2026-10-14",
  "adat_honap": "2026-08",
  "lehetosegek": [
    { "kifejezes": "lovable ai", "sav": "100K-500K" },
    { "kifejezes": "gemini (bot conversacional)", "sav": "10K-50K" },
    { "kifejezes": "gpt", "sav": "10K-50K" },
    { "kifejezes": "gpt chat", "sav": "10K-50K" },
    { "kifejezes": "ai chat gpt", "sav": "10K-50K" },
    { "kifejezes": "elicit ai", "sav": "5K-10K" },
    { "kifejezes": "chat gptt", "sav": "1K-5K" },
    { "kifejezes": "chat gpt versions", "sav": "1K-5K" },
    { "kifejezes": "gemini ai chatbot", "sav": "1K-5K" },
    { "kifejezes": "copilot ai gratis", "sav": "1K-5K" },
    { "kifejezes": "chet gpt", "sav": "500-1K" },
    { "kifejezes": "chatgpt paraphrase", "sav": "500-1K" },
    { "kifejezes": "chatgpt web", "sav": "500-1K" },
    { "kifejezes": "bot ai", "sav": "500-1K" },
    { "kifejezes": "claude cowork vs chat", "sav": "101-500" },
    { "kifejezes": "anthropic ai claude", "sav": "101-500" },
    { "kifejezes": "claude record a skill", "sav": "101-500" },
    { "kifejezes": "sci-bot", "sav": "101-500" },
    { "kifejezes": "record a skill claude", "sav": "101-500" },
    { "kifejezes": "can ai help with daily tasks", "sav": "101-500" },
    { "kifejezes": "jet gpt", "sav": "101-500" },
    { "kifejezes": "ChatGPT versions comparison", "sav": "51-100" },
    { "kifejezes": "chat gpt no longer free", "sav": "51-100" },
    { "kifejezes": "copilot benchmark", "sav": "51-100" },
    { "kifejezes": "latest ChatGPT models differences", "sav": "51-100" },
    { "kifejezes": "copilot adoption rate 2026", "sav": "51-100" },
    { "kifejezes": "chat gpt models comparison", "sav": "51-100" },
    { "kifejezes": "supergrok vs chatgpt", "sav": "51-100" },
    { "kifejezes": "super grok vs chatgpt plus", "sav": "51-100" },
    { "kifejezes": "according to this training, how can chatgpt be used by someone in operations and administration?", "sav": "11-50" },
    { "kifejezes": "caredge ai negotiator", "sav": "11-50" },
    { "kifejezes": "what is claude co work vs chat", "sav": "11-50" },
    { "kifejezes": "Microsoft Copilot vs ChatGPT vs Claude comparison", "sav": "11-50" },
    { "kifejezes": "record skill claude", "sav": "11-50" },
    { "kifejezes": "how much does grok ai cost", "sav": "11-50" },
    { "kifejezes": "gemini aziendale", "sav": "11-50" },
    { "kifejezes": "video avatars multilingual customer support", "sav": "11-50" },
    { "kifejezes": "Microsoft Copilot daily active users", "sav": "11-50" },
    { "kifejezes": "reasons users stop using AI assistants", "sav": "11-50" },
    { "kifejezes": "how many use microsoft copilot", "sav": "11-50" },
    { "kifejezes": "loveable mcp", "sav": "11-50" },
    { "kifejezes": "difference between AI copilots and traditional automation tools", "sav": "11-50" },
    { "kifejezes": "Can ChatGPT identify pictures", "sav": "11-50" },
    { "kifejezes": "Microsoft Copilot vs Claude vs ChatGPT comparison", "sav": "11-50" },
    { "kifejezes": "copilot subscription numbers 2026", "sav": "11-50" },
    { "kifejezes": "Microsoft Copilot Linux support", "sav": "0-10" },
    { "kifejezes": "Microsoft Copilot vs ChatGPT vs Claude differences", "sav": "0-10" },
    { "kifejezes": "quando è stata lanciata chat gpt", "sav": "0-10" },
    { "kifejezes": "grok context window", "sav": "0-10" },
    { "kifejezes": "claude cowork vs desktop", "sav": "0-10" }
  ],
  "idezett": [
    { "kifejezes": "can you put a streaming app on alexa", "idezes": 21 },
    { "kifejezes": "ai compose questions", "idezes": 15 },
    { "kifejezes": "AI PC benefits everyday use", "idezes": 12 },
    { "kifejezes": "apple intelligence email summarization iphone duo", "idezes": 11 },
    { "kifejezes": "AI PC everyday life uses", "idezes": 10 },
    { "kifejezes": "apple iphone 18 pro ai email writing features", "idezes": 7 },
    { "kifejezes": "iphone 18 pro apple intelligence email summarization", "idezes": 6 },
    { "kifejezes": "Apple Intelligence Mac write emails", "idezes": 6 },
    { "kifejezes": "apple intelligence professional email writing iphone duo", "idezes": 5 },
    { "kifejezes": "google meet_files", "idezes": 5 },
    { "kifejezes": "how AI improves daily business operations simple explanation", "idezes": 4 },
    { "kifejezes": "how to use GPT Builder", "idezes": 3 }
  ]
}
```

- [ ] **5. lépés: config** (`config.json`) — a `"content"` blokkban a Task 2 `"guide_prune": {…},` objektuma UTÁN:

```json
    "trends": {
      "_comment": "2026-10-14 — user ötlete: AI trendkutató. Naponta 1× ingyen gyűjt (Google keresési javaslatok ezekre az alapkérdésekre, Google napi felkapott AI-tételek, saját legolvasottak, content/trend-bing.json) → memory/trendek.json → a hírek sorrendje + napi 1 trend-útmutató a középszintű helyére. enabled:false = azonnal ki (core/trend-kutato.js aktivTrendek). Mérés ~11-11: node core/trend-kutato.js --meres.",
      "enabled": true,
      "seeds": [
        "ai photo trend", "ai photo prompt", "gemini trending prompt", "chatgpt trend", "ai trend",
        "viral ai", "ai scam", "ai voice clone scam", "deepfake", "how to use chatgpt",
        "how to use gemini", "how to use claude", "how to use copilot", "how to use meta ai", "how to use notebooklm",
        "how to use alexa+", "how to use perplexity", "how to use grok", "chatgpt new feature", "gemini new feature",
        "can ai help", "how to make ai", "ai image generator", "ai video generator", "ai for students",
        "ai for seniors", "ai for small business", "ai to write", "chatgpt prompt for", "gemini prompt for"
      ]
    },
```

- [ ] **6. lépés: őrszem-nyilvántartás** (`core/guard-registry.test.js`) — a `NEM_ORSZEM`-be, ábécérendben a `'translation-cost.json'` ELÉ:

```js
  'trendek.json': 'a trendkutató napi témalistája (core/trend-kutato.js) — munkaadat az Írónak és az Útmutató-agentnek; a riport a forrás-kiesést és a 2 napnál régebbi listát jelzi (trendRiportSorok)',
```

- [ ] **7. lépés: futtasd a teszteket, menjenek át.**
  - `node core/trend-kutato.test.js > "$SCRATCH/tk.out" 2>&1; echo $?` → `0`, 10 eset.
  - `node core/run-tests.js > "$SCRATCH/tests.out" 2>&1; echo $?` → `0`.

- [ ] **8. lépés: élő próba, mentés nélkül** (valódi, ingyenes hálózat):
  - Parancs: `node core/trend-kutato.js --dry > "$SCRATCH/tk-dry.out" 2>&1; echo $?` → `0`.
  - Elvárt: a kimenetben legalább 3 téma, és egyik sem tartalmaz „vs”/„comparison”/„best” szót. Ha a Google 429-et ad, az elfogadható: a ⚠️ sor és a Bing-alapú témák látszanak.
  - Ellenőrzés: `git status --short memory/` üres.

- [ ] **9. lépés: commit**

```bash
git add core/trend-kutato.js core/trend-kutato.test.js content/trend-bing.json config.json core/guard-registry.test.js
git commit -m "Trendkutató: napi ingyenes gyűjtés (Google-javaslat, felkapott, saját, Bing) + szűrők + pontozás

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Hatás a hírekre és az útmutatókra (Író + Útmutató-agent)

**Fájlok:**
- Módosít: `core/trend-kutato.js` (új exportok: `trendTalalat`, `trendElore`, `maiTrendDb`, `maiTrendTema`, `kovetkezoTrendTema`, `trendFelvetelKell`, `trendProbaJegyez`, `trendPrompt`)
- Módosít: `agents/iro/agent.js` (sorrend + `_meta.trend`)
- Módosít: `agents/guide/agent.js` (import, `pickTopics`, `proposeNewTopics`, `saveGuide`, `main`)
- Teszt: `core/trend-kutato.test.js` (új esetek)

**Interfészek:**
- Felhasznál (Task 3): `aktivTrendek`, `normal`, `szavak`.
- Előállít:
  - `trendTalalat(cim, trendek) → string|null` (a trend kifejezése)
  - `trendElore(fajlok, trendek, cimOf) → fajlok[]`
  - `maiTrendDb(metak, ma) → number`
  - `maiTrendTema(topics, metak, ma) → topic|null`
  - `kovetkezoTrendTema(trendek, proba, now) → tema|null`
  - `trendFelvetelKell(store, trendek, now) → tema|null`
  - `trendProbaJegyez(lista, kifejezes, now) → {kifejezes, at}[]`
  - `trendPrompt(tema) → string`
  - a guide-topics.json tárolóban az új mező: `store.trend_proba = [{kifejezes, at}]`
  - a témán: `priority: 'trend'`, `proposed_by: 'trend-kutato'`, `trend: {kifejezes, forras, datum}`
  - a cikk `_meta.trend`-je: `{kifejezes, datum}` (hír) vagy `{kifejezes, forras, datum}` (útmutató)

- [ ] **1. lépés: a bukó tesztek** — a `core/trend-kutato.test.js` importlistáját bővítsd ezekkel: `trendTalalat, trendElore, maiTrendDb, maiTrendTema, kovetkezoTrendTema, trendFelvetelKell, trendProbaJegyez, trendPrompt`. Az új esetek a záró `console.log` ELÉ:

```js
import { readFileSync as rfs } from 'node:fs';
const forras = p => rfs(new URL('../' + p, import.meta.url), 'utf-8').replace(/\r\n/g, '\n');
const TR = { at: new Date(MOST).toISOString(), datum: '2026-10-14', temak: [
  { kifejezes: 'gemini trending photo prompt', forras: ['google-javaslat'], pont: 25, eszkoz: 'Gemini' },
  { kifejezes: 'can ai help with daily tasks', forras: ['bing-lehetoseg'], pont: 10, eszkoz: '' }
] };

t('hír-sorrend: a trendhez illő draft ELŐRE, a többi sorrendje változatlan; trend nélkül semmi nem változik', () => {
  const cimek = { a: 'OpenAI ships new ChatGPT voice', b: 'Google brings new photo tricks to Gemini app', c: 'SAP finance suite update', d: 'How AI can help with daily tasks at home' };
  assert.deepEqual(trendElore(['a', 'b', 'c', 'd'], TR, f => cimek[f]), ['b', 'd', 'a', 'c']);
  assert.deepEqual(trendElore(['a', 'b'], null, f => cimek[f]), ['a', 'b']);
  assert.deepEqual(trendElore(['x'], TR, () => { throw new Error('sérült draft'); }), ['x']);
  assert.equal(trendTalalat('SAP finance suite update', TR), null);
  assert.equal(trendTalalat('Gemini gets a photo editor', TR), 'gemini trending photo prompt');
});

t('útmutató-hely: napi 1 trend-téma; ha ma már készült trend-útmutató, nincs több', () => {
  const ma = '2026-10-14';
  const topics = [{ id: 'k', status: 'todo', level: 'intermediate' }, { id: 'tr', status: 'todo', priority: 'trend' }, { id: 'kesz', status: 'done', priority: 'trend' }];
  assert.equal(maiTrendTema(topics, [], ma).id, 'tr');
  const metak = [{ trend: { kifejezes: 'x' }, written_at: ma + 'T03:00:00Z' }];
  assert.equal(maiTrendDb(metak, ma), 1);
  assert.equal(maiTrendTema(topics, metak, ma), null);
  assert.equal(maiTrendTema([{ id: 'k', status: 'todo' }], [], ma), null);
});

t('🔴 Review Focus 5: téma-felvétel naponta egyszer — sikertelen ötletelés után sem próbál újra aznap; 30 napig nem ismétel', () => {
  const store = { topics: [] };
  const elso = trendFelvetelKell(store, TR, MOST);
  assert.equal(elso.kifejezes, 'gemini trending photo prompt');
  store.trend_proba = trendProbaJegyez(store.trend_proba, elso.kifejezes, MOST);
  assert.equal(trendFelvetelKell(store, TR, MOST + 3600e3), null, '🔴 ugyanazon a napon újra AI-hívás menne');
  const holnap = trendFelvetelKell(store, TR, MOST + NAP);
  assert.equal(holnap.kifejezes, 'can ai help with daily tasks', 'a már kipróbált kifejezés 30 napig nem jön újra');
  assert.equal(trendFelvetelKell({ topics: [{ priority: 'trend', status: 'todo' }] }, TR, MOST), null, 'ha már vár egy trend-téma, ne halmozzon');
  assert.equal(trendFelvetelKell({ topics: [] }, null, MOST), null);
  assert.equal(kovetkezoTrendTema(TR, [{ kifejezes: 'gemini trending photo prompt', at: new Date(MOST - 40 * NAP).toISOString() }], MOST).kifejezes, 'gemini trending photo prompt', '30 nap után újra jöhet');
  assert.equal(trendProbaJegyez(null, 'x', MOST).length, 1);
});

t('ötletelő-prompt: a kifejezés benne van, összehasonlítást tilt, csak létező funkció', () => {
  const p = trendPrompt(TR.temak[0]);
  assert.match(p, /"gemini trending photo prompt"/);
  assert.match(p, /using Gemini/);
  assert.match(p, /No comparisons/);
  assert.match(p, /Only describe features that really exist/);
  assert.equal(trendPrompt(null), '');
});

t('🔌 Író: a draftok trend szerint rendezve, a cikk _meta.trend-et kap', () => {
  const s = forras('agents/iro/agent.js');
  assert.match(s, /import \{ aktivTrendek, trendElore, trendTalalat \} from '\.\.\/\.\.\/core\/trend-kutato\.js';/);
  assert.match(s, /trendElore\(rendezve, T, f => JSON\.parse\(readFileSync\(join\(DRAFTS_DIR, f\), 'utf-8'\)\)\.title\)/);
  assert.match(s, /trend: trendJeloles\(lista\),/);
});

t('🔌 Útmutató-agent: felvétel naponta 1, a trend a középszintű HELYÉRE, a jelölés a draftba kerül', () => {
  const s = forras('agents/guide/agent.js');
  assert.match(s, /import \{ aktivTrendek, trendFelvetelKell, trendProbaJegyez, maiTrendTema, maiTrendDb, trendPrompt \} from '\.\.\/\.\.\/core\/trend-kutato\.js';/);
  assert.match(s, /const trendTema = out\.length < args\.limit \? maiTrendTema\(fk\.tobbi, metak, maNap\) : null;/);
  assert.match(s, /be: kozepBe && !trendMa/, '🔴 a trend-útmutató MELLETT középszintű is íródna (napi 3)');
  assert.match(s, /fk\.tobbi\.filter\(t => t\.priority !== 'trend'\)/, 'a nem választott trend-téma az általános sorba csúszna');
  assert.match(s, /const tema = trendFelvetelKell\(store, aktivTrendek\(\), Date\.now\(\)\);/);
  assert.match(s, /store\.trend_proba = trendProbaJegyez\(store\.trend_proba, tema\.kifejezes, Date\.now\(\)\);/);
  assert.match(s, /\{ generalOnly = false, fokusz = null, trend = null \} = \{\}/);
  assert.match(s, /proposed_by: trend \? 'trend-kutato' : 'guide-ideas'/);
  assert.match(s, /trend: topic\.trend \|\| null,/);
});
```

- [ ] **2. lépés: futtasd, bukjon el.**
  Parancs: `node core/trend-kutato.test.js > "$SCRATCH/tk.out" 2>&1; echo $?`
  Elvárt: `1` (hiányzó export).

- [ ] **3. lépés: az új függvények** — a `core/trend-kutato.js`-be, a `// ── PARANCSSOR` blokk ELÉ:

```js
// ── HATÁS: HÍREK (core) ─────────────────────────────────────────────
/** Melyik trendhez illik egy cím? Eszköz-egyezés, vagy a kifejezés MINDEN tartalmas szava benne van. */
export function trendTalalat(cim, trendek) {
  const c = ` ${normal(cim).replace(/[^a-z0-9+ ]+/g, ' ')} `;
  for (const t of trendek?.temak || []) {
    const e = String(t.eszkoz || '').toLowerCase().replace(/\+$/, '');
    if (e && new RegExp(`[^a-z0-9]${escRx(e)}\\+?[^a-z0-9]`).test(c)) return t.kifejezes;
    const sz = [...szavak(t.kifejezes)];
    if (sz.length >= 2 && sz.every(w => c.includes(` ${w} `) || c.includes(` ${w.replace(/s$/, '')} `))) return t.kifejezes;
  }
  return null;
}

/** Stabil átrendezés: a trendhez illő draftok előre, a sorrend egyébként változatlan. */
export function trendElore(fajlok, trendek, cimOf) {
  const L = Array.isArray(fajlok) ? fajlok.slice() : [];
  if (!trendek?.temak?.length) return L;
  const elol = [], hatul = [];
  for (const f of L) {
    let cim = '';
    try { cim = cimOf(f) || ''; } catch { /* sérült draft: a helyén marad */ }
    (trendTalalat(cim, trendek) ? elol : hatul).push(f);
  }
  return [...elol, ...hatul];
}

// ── HATÁS: ÚTMUTATÓK (core) ─────────────────────────────────────────
export const UJRA_NAP = 30;

/** Hány trend-útmutató íródott MA (a _meta.trend + written_at alapján). */
export function maiTrendDb(metak, ma) {
  return (Array.isArray(metak) ? metak : []).filter(m => m && m.trend && String(m.written_at || '').startsWith(ma)).length;
}

/** A mai trend-téma — csak ha ma még nem készült trend-útmutató. */
export function maiTrendTema(topics, metak, ma) {
  if (maiTrendDb(metak, ma) > 0) return null;
  return (Array.isArray(topics) ? topics : []).find(t => t && t.status !== 'done' && t.priority === 'trend') || null;
}

/** Az első trend, amit az utóbbi UJRA_NAP napban nem próbáltunk. */
export function kovetkezoTrendTema(trendek, proba, now = Date.now()) {
  const hatar = now - UJRA_NAP * NAP;
  const volt = new Set((Array.isArray(proba) ? proba : []).filter(p => Date.parse(p?.at || '') >= hatar).map(p => normal(p.kifejezes)));
  return (trendek?.temak || []).find(t => !volt.has(normal(t.kifejezes))) || null;
}

/** Kell-e ma trend-témát felvenni? → a téma, vagy null (ma már próbáltuk / vár egy / nincs lista). */
export function trendFelvetelKell(store, trendek, now = Date.now()) {
  if (!trendek?.temak?.length) return null;
  const ma = new Date(now).toISOString().slice(0, 10);
  if ((store?.topics || []).some(t => t?.priority === 'trend' && t.status !== 'done')) return null;
  if ((store?.trend_proba || []).some(p => String(p?.at || '').startsWith(ma))) return null;
  return kovetkezoTrendTema(trendek, store?.trend_proba, now);
}

/** A próbálkozás feljegyzése (sikertelen ötletelésnél is) — 60 napnál régebbi kiesik. */
export function trendProbaJegyez(lista, kifejezes, now = Date.now()) {
  const hatar = now - 60 * NAP;
  return [...(Array.isArray(lista) ? lista : []).filter(p => Date.parse(p?.at || '') >= hatar), { kifejezes, at: new Date(now).toISOString() }];
}

/** Az ötletelő kérésének kiegészítése egy trendhez. */
export function trendPrompt(t) {
  if (!t) return '';
  return `\n\nTREND — real people are searching for this RIGHT NOW: "${t.kifejezes}". Every idea must be a practical, beginner-friendly how-to that answers exactly this need`
    + (t.eszkoz ? ` using ${t.eszkoz}` : '')
    + `. Only describe features that really exist; if you are not sure a feature exists, choose a general approach that works with any mainstream AI assistant. No comparisons or rankings between products.`;
}
```

- [ ] **4. lépés: Író** (`agents/iro/agent.js`; NEM futtatod, NEM importálod):
  - **a)** Az importok közé (a `ai-router.js` import sora után):

```js
import { aktivTrendek, trendElore, trendTalalat } from '../../core/trend-kutato.js';
```

  - **b)** A `listUnprocessedDrafts()` végén cseréld le ezt a két sort:

```js
  // LEGÚJABB ELÖL — a friss hír megy ki előbb (nem ragad be a régi backlogon)
  return fresh.sort().reverse();
```

    erre:

```js
  // LEGÚJABB ELÖL — a friss hír megy ki előbb (nem ragad be a régi backlogon)
  const rendezve = fresh.sort().reverse();
  // TREND ELŐRE (2026-10-14, user: trendkutató): a felkapott témáról szóló hír kerül előre —
  // csak a SORREND változik, a napi keret és minden ellenőrzés ugyanaz (core/trend-kutato.js).
  try {
    const T = aktivTrendek();
    return T ? trendElore(rendezve, T, f => JSON.parse(readFileSync(join(DRAFTS_DIR, f), 'utf-8')).title) : rendezve;
  } catch { return rendezve; }
```

  - **c)** A `saveWrittenArticle()` ELÉ egy segédfüggvény:

```js
// TREND-JELÖLÉS (2026-10-14): ha a forrás-cím a mai trendlistához illik, a cikk megjelölve
// megy tovább — a mérés (node core/trend-kutato.js --meres) ebből dolgozik.
function trendJeloles(lista) {
  try {
    const T = aktivTrendek();
    const k = T && trendTalalat(lista.map(d => d.title || '').join(' · '), T);
    return k ? { kifejezes: k, datum: T.datum } : null;
  } catch { return null; }
}
```

  - **d)** A `saveWrittenArticle()` `_meta`-jában a `merged_theme: theme || null,` sor UTÁN:

```js
      trend: trendJeloles(lista),
```

  - **Ellenőrzés:** `node --check agents/iro/agent.js`.

- [ ] **5. lépés: Útmutató-agent** (`agents/guide/agent.js`; NEM futtatod, NEM importálod):
  - **a)** Import a `guide-focus.js` import sora UTÁN:

```js
import { aktivTrendek, trendFelvetelKell, trendProbaJegyez, maiTrendTema, maiTrendDb, trendPrompt } from '../../core/trend-kutato.js';
```

  - **b)** A `pickTopics`-ban cseréld le ezt a blokkot:

```js
  if (fk.tema && args.limit > 0) out.push(fk.tema);
  // KÖZÉPSZINT (2026-09-29, user): napi 1 középszintű a 2-ből → ha ma még nincs,
  // az első középszintű téma ELŐRE kerül; ha már van, mára kimaradnak. Kapcsoló:
  // config.json content.intermediate_guides (core/content-switches.js).
  const rendezett = szintSorrend(fk.tobbi, { maiKozep: fk.maiKozep, be: kozepBe });
```

    erre:

```js
  if (fk.tema && args.limit > 0) out.push(fk.tema);
  // TREND (2026-10-14, user: „mehet a trend-útmutató a középszintű helyére"): naponta 1
  // trend-téma a fókusz UTÁN; ha ma van trend-útmutató, AZNAP nincs középszintű (különben
  // a napi 2 helyett 3 íródna). A nem választott trend-téma NEM csúszik az általános sorba.
  const trendTema = out.length < args.limit ? maiTrendTema(fk.tobbi, metak, maNap) : null;
  if (trendTema) out.push(trendTema);
  const trendMa = !!trendTema || maiTrendDb(metak, maNap) > 0;
  // KÖZÉPSZINT (2026-09-29, user): napi 1 középszintű a 2-ből → ha ma még nincs,
  // az első középszintű téma ELŐRE kerül; ha már van, mára kimaradnak. Kapcsoló:
  // config.json content.intermediate_guides (core/content-switches.js).
  const rendezett = szintSorrend(fk.tobbi.filter(t => t.priority !== 'trend'), { maiKozep: fk.maiKozep, be: kozepBe && !trendMa });
```

  - **c)** `proposeNewTopics` — az aláírás:

```js
async function proposeNewTopics(count, store, brandContext, { generalOnly = false, fokusz = null, trend = null } = {}) {
```

    A `userPrompt`-ban a `Pick fresh, …` sorban mindkét `${generalOnly || fokusz ? '' : …}` feltétel `generalOnly || fokusz || trend` legyen. A `${fokusz ? '' : coverageHint}` → `${fokusz || trend ? '' : coverageHint}`. A `${fokuszOtletPrompt(fokusz)}` UTÁN szúrd be: `${trendPrompt(trend)}`.

    A `store.topics.push({…})` végén cseréld le ezt a sort:

```js
      proposed_by: 'guide-ideas'
```

    erre:

```js
      proposed_by: trend ? 'trend-kutato' : 'guide-ideas',
      ...(trend ? { priority: 'trend', trend: { kifejezes: trend.kifejezes, forras: trend.forras, datum: new Date().toISOString().slice(0, 10) } } : {})
```

  - **d)** `saveGuide` — a `_meta`-ban a `source_news: …` sor UTÁN:

```js
      trend: topic.trend || null,                 // trendkutató-jelölés (a méréshez, 2026-10-14)
```

  - **e)** `main()` — az író-ágban a `const store = loadTopics();` UTÁN, a `const topics = pickTopics(store, args);` ELÉ:

```js
  // TREND-TÉMA (2026-10-14, user): naponta EGY téma a trendkutató listájából (core/trend-kutato.js).
  // Önkorlátozó: ha ma már próbáltuk, vagy vár egy trend-téma, AI-hívás NÉLKÜL továbblép — a
  // próbát a sikertelen ötletelés után is feljegyezzük, különben a napi 3 futás 3× fizetne érte.
  try {
    const tema = trendFelvetelKell(store, aktivTrendek(), Date.now());
    if (tema) {
      store.trend_proba = trendProbaJegyez(store.trend_proba, tema.kifejezes, Date.now());
      const before = store.topics.length;
      const r = await proposeNewTopics(1, store, brandContext, { trend: tema });
      saveTopics(store);
      console.log(r.added > 0
        ? `📈 Trend-téma felvéve: ${store.topics.slice(before).map(t => t.title).join(' | ')} („${tema.kifejezes}")`
        : `📈 Trend-téma: „${tema.kifejezes}" — nem született új, nem ismétlő cím (holnap a következő trend jön).`);
    }
  } catch (e) { console.log('⚠️ Trend-téma felvétel kimaradt: ' + String(e?.message || e).slice(0, 80)); }
```

  - **Ellenőrzés:** `node --check agents/guide/agent.js`. Nézd meg, hogy a `main()`-ben a `brandContext` a beszúrás ELŐTT definiálva van (`const brandContext = loadBrandContext();`). Ha nem, a beszúrást tedd a definíciója UTÁN.

- [ ] **6. lépés: futtasd a teszteket, menjenek át.**
  - `node core/trend-kutato.test.js > "$SCRATCH/tk.out" 2>&1; echo $?` → `0`, 16 eset.
  - `node core/run-tests.js > "$SCRATCH/tests.out" 2>&1; echo $?` → `0`. Különösen a `no-comparison-rules`, `guide-focus`, `content-switches` legyen zöld.

- [ ] **7. lépés: commit**

```bash
git add core/trend-kutato.js core/trend-kutato.test.js agents/iro/agent.js agents/guide/agent.js
git commit -m "Trendkutató hatása: a felkapott hír előre, napi 1 trend-útmutató a középszintű helyére, jelölés a méréshez

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Napi riport, CI-lépés, mérés

**Fájlok:**
- Módosít: `core/trend-kutato.js` (`trendRiportSorok`, `trendMeres`, `--meres` CLI-ág)
- Módosít: `core/daily-report.js` (CRLF; csak Edit eszközzel)
- Módosít: `.github/workflows/auto.yml` (új lépés + a „most 136” megjegyzés → „most 139”)
- Teszt: `core/trend-kutato.test.js`

**Interfészek:**
- Felhasznál: `trendekBetolt`, `bingListaBetolt`, `FORRAS_NEV`, `BING_ELAVULT_NAP`, `AKTIV_ORA`.
- Előállít:
  - `trendRiportSorok(trendek, bing, now) → string[]`
  - `trendMeres({ cikkek: {slug, published_at, guide, trend}[], days, kezdet, now }) → { utmutato: {trend, tobbi}, hir: {trend, tobbi} }`, ahol mindkét csoport `{db, atlag, median}`

- [ ] **1. lépés: a bukó tesztek** — az importlistába: `trendRiportSorok, trendMeres`. Az új esetek a záró `console.log` ELÉ:

```js
t('riport: a 3 legjobb téma forrással; kiesett forrás ⚠️; régi lista ⚠️; régi Bing-lista 🔁; még nem futott → csend', () => {
  const s = trendRiportSorok({ ...TR, hibak: ['Google-javaslat: HTTP 429 (letiltott)'] }, { frissitve: '2026-10-14' }, MOST);
  assert.equal(s[0], '📈 Trend ma: gemini trending photo prompt (Google-javaslat) · can ai help with daily tasks (Bing)');
  assert.equal(s[1], '⚠️ Trendforrás kiesett: Google-javaslat: HTTP 429 (letiltott)');
  assert.equal(s.length, 2);
  assert.match(trendRiportSorok(TR, null, MOST + 3 * NAP)[0], /^⚠️ Trendkutató: a lista 3 napja nem frissült/);
  assert.match(trendRiportSorok(TR, { frissitve: '2026-08-01' }, MOST).at(-1), /^🔁 Bing AI-lehetőség lista régi \(\d+ nap\)/);
  assert.deepEqual(trendRiportSorok(null, null, MOST), []);
  assert.equal(trendRiportSorok({ ...TR, temak: [] }, null, MOST)[0], '📈 Trend ma: nincs a szűrőn átjutó téma');
});

t('mérés: az első 7 nap belépői, trend vs többi, útmutató és hír külön; a 7 napja még nem teljes cikk kimarad', () => {
  const nap = n => new Date(MOST - n * NAP).toISOString().slice(0, 10);
  const days = {};
  for (let i = 0; i <= 30; i++) days[nap(i)] = [];
  days[nap(20)].push({ path: '/article/tr1', visits: 12 }, { path: '/article/sima', visits: 2 }, { path: '/hu/article/tr1', visits: 3 });
  const cikkek = [
    { slug: 'tr1', published_at: new Date(MOST - 21 * NAP).toISOString(), guide: true, trend: true },
    { slug: 'sima', published_at: new Date(MOST - 21 * NAP).toISOString(), guide: true, trend: false },
    { slug: 'friss', published_at: new Date(MOST - 2 * NAP).toISOString(), guide: true, trend: true },
    { slug: 'regi', published_at: new Date(MOST - 29 * NAP).toISOString(), guide: false, trend: false }
  ];
  const m = trendMeres({ cikkek, days, kezdet: nap(25), now: MOST });
  assert.deepEqual(m.utmutato.trend, { db: 1, atlag: 15, median: 15 });
  assert.deepEqual(m.utmutato.tobbi, { db: 1, atlag: 2, median: 2 });
  assert.deepEqual(m.hir.tobbi, { db: 0, atlag: 0, median: 0 }, 'a kezdet előtti cikk nem számít');
});

t('🔌 napi riport és CI: a riport a trendsorokat kiírja; a CI-lépés a Pipeline ELŐTT, || true-val, 3 perces kerettel', () => {
  const dr = forras('core/daily-report.js');
  assert.match(dr, /trendRiportSorok\(trendekBetolt\(\), bingListaBetolt\(\), Date\.now\(\)\)/);
  const yml = forras('.github/workflows/auto.yml');
  assert.match(yml, /- name: Trendkutató \(napi 1×, ingyenes\)\n\s*timeout-minutes: 3\n\s*run: node core\/trend-kutato\.js \|\| true/);
  assert.ok(yml.indexOf('node core/trend-kutato.js') < yml.indexOf('node agents/ceo/agent.js'), '🔴 a trend a CEO UTÁN gyűjtene — aznap már késő');
});
```

- [ ] **2. lépés: futtasd, bukjon el.**
  Parancs: `node core/trend-kutato.test.js > "$SCRATCH/tk.out" 2>&1; echo $?`
  Elvárt: `1`.

- [ ] **3. lépés: a függvények** — a `core/trend-kutato.js`-be, a `// ── PARANCSSOR` ELÉ:

```js
// ── RIPORT ÉS MÉRÉS ─────────────────────────────────────────────────
/** A napi Telegram-riport sorai. Ha még sosem futott: csend (üres tömb). */
export function trendRiportSorok(trendek, bing, now = Date.now()) {
  const s = [];
  if (!trendek) return s;
  const kor = now - Date.parse(trendek.at || 0);
  if (!(kor <= AKTIV_ORA * 3600e3)) s.push(`⚠️ Trendkutató: a lista ${Math.floor(kor / NAP)} napja nem frissült — a hírek és útmutatók most trend nélkül mennek`);
  const top = (trendek.temak || []).slice(0, 3).map(t => `${t.kifejezes} (${(t.forras || []).map(f => FORRAS_NEV[f] || f).join('+')})`);
  s.push(top.length ? '📈 Trend ma: ' + top.join(' · ') : '📈 Trend ma: nincs a szűrőn átjutó téma');
  for (const h of trendek.hibak || []) s.push('⚠️ Trendforrás kiesett: ' + h);
  const bk = now - Date.parse(bing?.frissitve || '');
  if (bk > BING_ELAVULT_NAP * NAP) s.push(`🔁 Bing AI-lehetőség lista régi (${Math.floor(bk / NAP)} nap) — kérd: „frissítsd a Bing-listát"`);
  return s;
}

const csoport = a => {
  if (!a.length) return { db: 0, atlag: 0, median: 0 };
  const r = a.slice().sort((x, y) => x - y);
  const med = r.length % 2 ? r[(r.length - 1) / 2] : (r[r.length / 2 - 1] + r[r.length / 2]) / 2;
  return { db: a.length, atlag: Math.round(10 * a.reduce((x, y) => x + y, 0) / a.length) / 10, median: med };
};

/** Trend vs többi: az első 7 nap belépői (3 nyelv együtt), a `kezdet` utáni, teljes 7 napos cikkekre. */
export function trendMeres({ cikkek, days, kezdet = '2026-10-15', now = Date.now() }) {
  const napok = Object.keys(days || {}).sort();
  const utolso = napok[napok.length - 1] || '';
  const v = new Map();
  for (const [nap, sorok] of Object.entries(days || {})) {
    for (const r of Array.isArray(sorok) ? sorok : []) {
      const m = String(r?.path || '').match(/^\/(?:hu\/|es\/)?article\/([^/?#]+)/);
      if (m) { const x = v.get(m[1]) || []; x.push([nap, Number(r.visits) || 0]); v.set(m[1], x); }
    }
  }
  const ki = { utmutato: { trend: [], tobbi: [] }, hir: { trend: [], tobbi: [] } };
  for (const c of cikkek || []) {
    const pub = String(c?.published_at || '').slice(0, 10);
    if (!pub || pub < kezdet) continue;
    const vege = new Date(Date.parse(pub) + 7 * NAP).toISOString().slice(0, 10);
    if (vege > utolso) continue;   // az első 7 nap még nincs meg a naplóban
    const ossz = (v.get(c.slug) || []).filter(([n]) => n >= pub && n <= vege).reduce((s, [, x]) => s + x, 0);
    ki[c.guide ? 'utmutato' : 'hir'][c.trend ? 'trend' : 'tobbi'].push(ossz);
  }
  return {
    utmutato: { trend: csoport(ki.utmutato.trend), tobbi: csoport(ki.utmutato.tobbi) },
    hir: { trend: csoport(ki.hir.trend), tobbi: csoport(ki.hir.tobbi) }
  };
}
```

- [ ] **4. lépés: a `--meres` CLI-ág.** A CLI `(async () => {` törzsének ELEJÉRE, a `const cfg = …` sor ELÉ:

```js
    if (arg.includes('--meres')) {
      const dir = join(ROOT, 'content', 'articles');
      const cikkek = readdirSync(dir).filter(x => x.endsWith('.json')).map(f => {
        const d = jsonBe(join(dir, f)) || {};
        return { slug: d._meta?.slug, published_at: d._meta?.published_at, guide: utmutatoE(f, d), trend: !!d._meta?.trend };
      }).filter(c => c.slug);
      const m = trendMeres({ cikkek, days: jsonBe(join(ROOT, 'memory', 'traffic-log.json'))?.days || {} });
      const sor = (n, g) => console.log(`   ${n}: trend ${g.trend.db} db · átlag ${g.trend.atlag} · medián ${g.trend.median}  |  többi ${g.tobbi.db} db · átlag ${g.tobbi.atlag} · medián ${g.tobbi.median}  (első 7 nap belépői)`);
      console.log('📏 TREND-MÉRÉS (2026-10-15 óta megjelent, teljes 7 napos cikkek)');
      sor('Útmutató', m.utmutato); sor('Hír     ', m.hir);
      return;
    }
```

- [ ] **5. lépés: napi riport** (`core/daily-report.js`, CRLF — csak Edit; NEM futtatod). A HÁZMESTER-blokk zárósora UTÁN illeszd be:

```js
    if (worth.length) lines.push('🧹 HÁZMESTER: ' + worth.join(' · '));
  } catch { /* nem futott — nem baj */ }
```

```js

  // TRENDKUTATÓ (2026-10-14, user ötlete): mi felkapott ma, és él-e minden forrás.
  // Ha még sosem futott, csend; ha egy forrás kiesett vagy a lista régi, ⚠️ (a záró sor
  // ezt hibának számolja — a user ott nézi).
  try {
    const { trendRiportSorok, trendekBetolt, bingListaBetolt } = await import('./trend-kutato.js');
    for (const s of trendRiportSorok(trendekBetolt(), bingListaBetolt(), Date.now())) lines.push(s);
  } catch { /* a riport ettől még kimegy */ }
```

  - **Ellenőrzés:** `node --check core/daily-report.js`; `file core/daily-report.js` (CRLF maradjon).

- [ ] **6. lépés: CI** (`.github/workflows/auto.yml`). Közvetlenül a `      - name: Pipeline (hírkeresés + cikk/útmutató írás + ellenőrzés)` sor ELÉ:

```yaml
      # TRENDKUTATÓ (2026-10-14, user ötlete): mi felkapott ma? Naponta EGYSZER gyűjt (a 3 futásból
      # az első dolgozik, a többi a 20 órás kapun kihagy), ingyen, AI-hívás nélkül. A CEO ELŐTT
      # fut, hogy az Író és az Útmutató-agent már a friss listát lássa. A hibája NEM állíthatja
      # meg a kiadást (|| true); a forrás-kiesést a napi riport jelzi. core/trend-kutato.js
      - name: Trendkutató (napi 1×, ingyenes)
        timeout-minutes: 3
        run: node core/trend-kutato.js || true

```

  A „Tesztek” lépés kommentjében a `(most 136)` szöveget írd át erre: `(most 139)`.

- [ ] **7. lépés: futtasd a teszteket, menjenek át.**
  - `node core/trend-kutato.test.js > "$SCRATCH/tk.out" 2>&1; echo $?` → `0`, 19 eset.
  - `node core/run-tests.js > "$SCRATCH/tests.out" 2>&1; echo $?` → `0`. Különösen a `ci-timeouts.test.js` legyen zöld: 139 ≤ 145, tartalék 6.

- [ ] **8. lépés: élő mérés-próba** (csak olvas):
  - Parancs: `node core/trend-kutato.js --meres > "$SCRATCH/meres.out" 2>&1; echo $?` → `0`.
  - Elvárt: két sor („Útmutató”, „Hír”). Most még 0 trend-cikkel, ez helyes.

- [ ] **9. lépés: commit**

```bash
git add core/trend-kutato.js core/trend-kutato.test.js core/daily-report.js .github/workflows/auto.yml
git commit -m "Trendkutató: napi riport-sor, CI-lépés a Pipeline előtt (3 perc), mérés (--meres)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Utólagos lépések (NEM agent-feladat — a vezérlő végzi)

1. **Végső áttekintés:** az egész ág átnézése, majd `git push`.
2. **Élő ellenőrzés a következő CI-futás után:**
   - a „Trendkutató” lépés naplója;
   - a `memory/trendek.json` tartalma;
   - a Házmester `🗑️` sora;
   - a 25 törölt útmutató valóban 404-et ad;
   - a napi riport `📈` sora.
3. **Kb. 5 nap múlva, az első törlési hullám után:** PDF-újragyártás (`node core/ebook-build.js --mind --pdf`, a `website/assets/free/` frissítése) és `node core/packs-data.js --write`.
4. **Kb. 2026-11-11:** `node core/trend-kutato.js --meres`, döntés a userrel.
5. **Havonta:** a Bing-lista frissítése (`content/trend-bing.json`, `frissitve`).
