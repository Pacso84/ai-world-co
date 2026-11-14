# TÉNYKÖZPONT 1. fázis / B rész — TERMÉK-ADATLAP + SÚGÓ-HORGONY MINDEN ESZKÖZ-TÉMÁRA — megvalósítási terv

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eszközhöz kötött útmutató csak akkor íródjon meg, ha egy jóváhagyott hivatalos súgócikk ténylegesen leírja a témát. A horgony a téma `official_sources` + `sugo_alapu` mezője, és onnantól az író és az ellenőrző a súgóból dolgozik. Ha nincs illő súgócikk, a téma 14 napig vár, és a következő jelölt jön, így a napi útmutató-szám nem esik le.

**Architecture:**
- Egy vékony termék-adatlap homlokzat (`core/termek-adatlap.js`, spec 1c) egy hívással megadja, mit tudunk egy eszközről: kanonikus név, forrásszint, súgó-kulcsok, megszűnt-e.
- A súgó-horgony modul (`core/sugo-horgony.js`, spec 1d) a mai súgó-párosítás (`core/sugo-parositas.js`) mintáját általánosítja hírről témára. Lépései:
  1. a súgó cikklistáját a témához szűkíti;
  2. az AI egy sorszámot választ a listából;
  3. a cikket a súgó-tárból (`sugoSzoveg`) tölti le;
  4. egy második AI-lépés dönt.
- A kapu EGY helyen van: az útmutató-agent írási ciklusában, közvetlenül az írás előtt. Így minden témaforrást lefed (ötletek, kiegyenlítés, lefedettség, trend, hír-párosítás, kézi), és a régi várakozó témákat is.
- A napi riport új sora mutatja, hány téma kapott horgonyt és hány nem.

**Tech Stack:** Node.js ESM, saját tesztkeret (`assert/strict`, `core/*.test.js`, `node core/run-tests.js`), a projekt AI-routere (`ask`, az agent adja át).

**Spec:** `docs/superpowers/specs/2026-11-12-tenykozpont-design.md` — 5. pont 1c és 1d, 4.2 (a cégfüggetlen útmutató mehet súgó nélkül), 8.5 (a részleges forrás csak hétköznapi funkcióról ad útmutatót, felület-név nélkül), 9. pont (olvasó-védelem).

**Mért kiinduló helyzet (11-14):**
- 598 téma van, ebből 16 `todo`. A `todo`-k közül 9 eszközhöz kötött és horgony nélküli (Kimi 4, Duck.ai, Brave Leo, Lumo, Z.ai, MiniMax Code), 5 cégfüggetlen, 1 már horgonyos, 1 fékezett.
- 11-01 óta 36 útmutató készült, ebből csak 1 súgóra épült.
- Az A rész (b43023a5) óta 20 súgó cikklistája tölthető le (`indexLetolt`), és a súgószöveg a tárból jön (`sugoSzoveg`).

**Ez a rész NEM tartalmazza** (később): a témajavasló (`IDEAS_SYSTEM_PROMPT`) súgó-cikkcímekből javasoljon témát (spec 1d második mondata; a B rész mérése mondja meg, mennyire sürgős) · 1e–1g (író/bíráló mindenhol súgóból, Word/Office a Microsoft TELJES sorába, napi forrás-arány sor) · a `FORRAS_SUGO` bővítése (a hír-párosítás második esélye az új cégekre).

## Global Constraints

- Kiadói (súgó) szöveg SOHA nem kerül a nyilvános repóba. A témafájlba (`guides/guide-topics.json`, nyilvános) csak URL, cikkcím, dátum és rövid magyar ok kerülhet, súgó-mondat nem. A tesztekben kitalált szöveg szerepel.
- A cégfüggetlen téma (forrásszint `cegfuggetlen`) NEM kér horgonyt, és nem fékeződik (spec 4.2, anti-cél).
- A fékezett (`nincs` szintű) téma továbbra is a fék dolga; a horgony nem kerüli meg és nem helyettesíti.
- Kill-switch a `core/` oldalon: `export const HORGONY_BE = true` + teszt, ami az értékét rögzíti. `false` esetén a mai működés tér vissza (horgony nélkül is ír). A config `enabled` mező NEM kapcsoló.
- Költség: témánként legfeljebb 2 AI-hívás (választó + ellenőrző). Futásonként legfeljebb `FUTAS_MAX_PROBA = 6` horgony-próba (mérve ~$0,002/próba a párosításnál → futásonként ≤ ~$0,02). Napi plafon $1 (a többi gépsor ~$0,27).
- Az AI csak a listából választhat (sorszám). A választott URL-nek át kell mennie az `engedelyezett()`-en; kitalált URL nem kerülhet a témába.
- Olvasó-védelem (spec 9.):
  - kint lévő útmutatót ez a rész nem ír át;
  - téma nem törlődik, és a `status` mezője nem változik;
  - a sikertelen próba csak egy `horgony` jegyzést kap, és `UJRAPROBA_NAP = 14` nap múlva újra próbálkozik;
  - a napi útmutató-keretet a következő jelölt tölti ki.
- Kód-kommentek, konzol- és riport-sorok MAGYARUL, nem-technikus olvasónak.
- Tesztek: `node core/run-tests.js > <scratchpad>/teszt.txt 2>&1` (fájlba). Egyes teszt: `node core/<név>.test.js`. Hálózat és fizetős AI a tesztekben TILOS (`ask`, `indexFn`, `sugoSzovegFn` injektálva). `npm run router-smoke` TILOS.
- Agent-modult (`agents/*/agent.js`) NE importálj (feltétel nélküli `main()`), csak `node --check`.
- Build-próba scratchpad-másolatban + `node core/output-guard.js`.
- Commit feladatonként; a commit-üzenet végén üres sor + `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Push CSAK a 6. feladatban, a mérés után.

## Review Focus

- A súgó cikklistája nagyobb, mint `INDEX_MAX` (ElevenLabs 1263, GitHub Copilot 564): a szűkítés a témához legközelebbi cikkeket adja, nem a lista elejét (2. feladat tesztje).
- Az AI 0-t, a listán kívüli sorszámot, nem JSON-t vagy kitalált URL-t ad → nincs horgony, nincs kivétel (2–3. feladat tesztje).
- A súgócikk szövege nem jön le, vagy rövidebb, mint `MIN_SUGO_SZOVEG` → nincs horgony, a téma nem íródik meg emlékezetből (3. feladat tesztje).
- A „Getting started with X” lefedettségi téma címe nem „How to …” alakú. Az ellenőrző válasza ezt is elfogadja, és a cím nem válik idegen témává (2. feladat tesztje).
- A téma `tool` mezője üres, de a cége ismert (pl. `company: "Google"`) → a cég főtermékének súgójából keres, ahogy a `forrasSzint` dönt (1. feladat tesztje).

---

### Task 1: Termék-adatlap homlokzat (spec 1c)

**Files:**
- Create: `core/termek-adatlap.js`
- Test: `core/termek-adatlap.test.js`

**Interfaces:**
- Consumes: `forrasSzint(tool, company)`, `sugoKulcsok(tool, company)`, `SZINT` (`core/forras-szint.js`); `megszuntTema(t)` (`core/megszunt-eszkozok.js`).
- Produces: `adatlap({ tool, company, title, angle }) → { nev: string | null, szint: 'teljes'|'reszleges'|'nincs'|'cegfuggetlen', kulcsok: string[], megszunt: { nev, datum, forras } | null, horgonyKell: boolean }`.
  - `horgonyKell` igaz, ha a szint `teljes` vagy `reszleges`, a `kulcsok` nem üres, és nem megszűnt.
  - Ez EGYETLEN belépési pont: a homlokzat a meglévő listákat olvassa, nem másolja (spec 1c, Claude döntése).

- [ ] **Step 1: Failing test**

```js
import { adatlap } from './termek-adatlap.js';
let a = adatlap({ tool: 'ChatGPT', company: 'OpenAI', title: 'How to summarize a PDF with ChatGPT' });
assert.equal(a.nev, 'ChatGPT'); assert.equal(a.szint, 'teljes'); assert.deepEqual(a.kulcsok, ['openai']); assert.equal(a.megszunt, null); assert.equal(a.horgonyKell, true);
a = adatlap({ tool: '', company: 'Google', title: 'x' });
assert.equal(a.nev, 'Gemini'); assert.equal(a.horgonyKell, true);
a = adatlap({ tool: '', company: '', title: 'How to write a follow-up email with AI' });
assert.equal(a.szint, 'cegfuggetlen'); assert.equal(a.horgonyKell, false);
a = adatlap({ tool: 'Meta AI', company: 'Meta', title: 'x' });
assert.equal(a.szint, 'nincs'); assert.equal(a.horgonyKell, false);
a = adatlap({ tool: 'ChatGPT', company: 'OpenAI', title: 'How to build a custom GPT for weekly tasks' });
assert.ok(a.megszunt); assert.equal(a.horgonyKell, false, 'kivezetés alatt álló eszközről nincs új útmutató');
a = adatlap({ tool: 'Apple Intelligence', company: 'Apple', title: 'x' });
assert.equal(a.szint, 'teljes'); assert.deepEqual(a.kulcsok, []); assert.equal(a.horgonyKell, false, 'kulcs nélkül nincs miből horgonyozni');
assert.doesNotThrow(() => adatlap(null));
```

(Az Apple Intelligence és az Alexa+ TELJES szintű, de cikklistája még nincs: `horgonyKell: false`, tehát a mai módon íródik. Ezt a 4. feladat naplója jelzi „nincs cikklista” okkal, és a 6. feladat jelentése megnevezi.)

- [ ] **Step 2: Run** `node core/termek-adatlap.test.js` → FAIL (nincs modul).
- [ ] **Step 3: Implement**: a fejléc-komment magyarul mondja meg, hogy ez homlokzat, és a 3. fázis olvasztja össze a listákat. Hibás vagy hiányzó bemenetre (`null`) is ad választ: `cegfuggetlen`, `horgonyKell: false`.
- [ ] **Step 4: Run** → zöld · `node core/run-tests.js > <scratchpad>/teszt.txt 2>&1` → minden zöld.
- [ ] **Step 5: Commit** — `tényközpont 1c: termék-adatlap homlokzat (egy belépési pont az eszköz-tudáshoz)`.

---

### Task 2: Súgó-horgony — szűkítés, promptok, válasz-értelmezés (tiszta függvények)

**Files:**
- Create: `core/sugo-horgony.js`
- Test: `core/sugo-horgony.test.js`

**Interfaces:**
- Consumes: `valasztoValasz(szoveg, index)`, `MIN_SUGO_SZOVEG` (`core/sugo-parositas.js`, változatlanul újrahasználva); `INDEX_MAX` (ugyanonnan).
- Produces:
  - `HORGONY_BE = true`, `FUTAS_MAX_PROBA = 6`, `UJRAPROBA_NAP = 14`.
  - `indexSzukites(tema, index, max = INDEX_MAX) → {url, cim}[]`: pontszám = a téma címének és szögének (`angle`) szavai, amelyek a cikkcímben is szerepelnek (kisbetű, a `STOP`-szavak és az eszköz/cég neve nélkül). A sorrend pontszám szerint csökkenő, egyenlőségnél az eredeti sorrend. Ha `index.length ≤ max`, a teljes listát adja vissza eredeti sorrendben.
  - `valasztoPromptTema(tema, index) → { rendszer, felhasznalo }`: a `valasztoPrompt` mintája TÉMÁRA. Szabályok angolul: válaszd azt a súgócikket, amely egy hétköznapi felhasználónak elmagyarázza a téma funkcióját; 0, ha egyik sem pontosan erről szól; admin-, fejlesztői/API- és számlázási cikk nem találat; egy általános „getting started” csak „Getting started with …” témához találat. Kimenet: `{"pick": n, "reason": "..."}`.
  - `ellenorzoPromptTema(tema, sugo, { szint }) → { rendszer, felhasznalo }`: az `ellenorzoPrompt` mintája TÉMÁRA. `ok` csak akkor igaz, ha:
    1. a súgócikk ugyanarról a funkcióról szól;
    2. hétköznapi ember ma követhető lépéseit írja le;
    3. az útmutató csak a súgóból megírható.

    Ha `ok`, a cím maradjon a téma címe, vagy legyen szűkebb úgy, hogy csak azt ígérje, amit a súgó lefed (ugyanaz a téma, nem másik). `szint === 'reszleges'` esetén a prompt kimondja: a forrás csak a funkció létét igazolja, gomb-/menünév nem lesz az útmutatóban.
  - `ellenorzoValaszTema(szoveg, tema) → { ok: true, title, reason } | { ok: false, reason }`: a cím `How to …` VAGY `Getting started with …` alakú, legfeljebb 110 karakter. Ha a javasolt cím nem tartalmaz egyetlen közös tartalmi szót sem a téma eredeti címével (STOP-szavak és eszköznév nélkül), akkor `ok: false` „a javasolt cím más témáról szól” okkal (a 11-12-i Workspace-eset tanulsága: csendes témaváltás nincs).

- [ ] **Step 1: Failing test**

```js
const tema = { title: 'How to use Perplexity Spaces to keep research in one place', tool: 'Perplexity', company: 'Perplexity', angle: 'organize sources' };
const nagy = Array.from({ length: 400 }, (_, i) => ({ url: `https://www.perplexity.ai/help-center/en/articles/${i}-x`, cim: `Unrelated article ${i}` }));
nagy.push({ url: 'https://www.perplexity.ai/help-center/en/articles/9999-spaces', cim: 'What are Spaces?' });
const sz = indexSzukites(tema, nagy, 50);
assert.equal(sz.length, 50); assert.equal(sz[0].cim, 'What are Spaces?', 'a témához illő cikk előre kerül');
assert.deepEqual(indexSzukites(tema, nagy.slice(0, 3)), nagy.slice(0, 3), 'kis listát nem rendez át');
const p = valasztoPromptTema(tema, sz);
assert.match(p.felhasznalo, /1\. What are Spaces\?/); assert.match(p.rendszer, /developer/i);
assert.equal(valasztoValasz('{"pick": 1}', sz).cim, 'What are Spaces?');
assert.equal(valasztoValasz('{"pick": 0}', sz), null);
assert.equal(valasztoValasz('nem json', sz), null);
let v = ellenorzoValaszTema('{"ok": true, "title": "How to use Perplexity Spaces to keep research in one place", "reason": "r"}', tema);
assert.equal(v.ok, true);
v = ellenorzoValaszTema('{"ok": true, "title": "How to cancel your subscription", "reason": "r"}', tema);
assert.equal(v.ok, false); assert.match(v.reason, /más témáról/);
v = ellenorzoValaszTema('{"ok": true, "title": "Getting started with Lumo", "reason": "r"}', { title: 'Getting started with Lumo', tool: 'Lumo' });
assert.equal(v.ok, true);
assert.equal(ellenorzoValaszTema('{"ok": false, "reason": "admin only"}', tema).ok, false);
assert.equal(ellenorzoValaszTema('szemét', tema).ok, false);
assert.match(ellenorzoPromptTema(tema, { url: 'u', cim: 'c', szoveg: 'Kitalált tesztszöveg.' }, { szint: 'reszleges' }).rendszer, /button|menu/i);
assert.equal(HORGONY_BE, true); assert.equal(FUTAS_MAX_PROBA, 6); assert.equal(UJRAPROBA_NAP, 14);
```

- [ ] **Step 2: Run** `node core/sugo-horgony.test.js` → FAIL.
- [ ] **Step 3: Implement**: a `STOP`-szólistát és a JSON-kibontást a `core/sugo-parositas.js`-ből exportáld és használd újra (DRY), ne másold. A párosítás viselkedése nem változhat (`node core/sugo-parositas.test.js` zöld marad).
- [ ] **Step 4: Run** → zöld (mindkét teszt).
- [ ] **Step 5: Commit** — `tényközpont 1d: súgó-horgony — szűkítés, téma-promptok, válasz-értelmezés`.

---

### Task 3: Súgó-horgony — keresés és jegyzés (aszinkron, injektált függőségekkel)

**Files:**
- Modify: `core/sugo-horgony.js`
- Test: `core/sugo-horgony.test.js`

**Interfaces:**
- Consumes: `adatlap` (1. feladat); 2. feladat függvényei; `indexLetolt(kulcs)` (`core/sugo-index.js`); `sugoSzoveg(url)` (`core/sugo-tar.js`).
- Produces:
  - `async horgonyKeres(tema, { ask, indexFn = indexLetolt, sugoSzovegFn = sugoSzoveg, indexCache = {}, agentName = 'guide' }) → { ok: true, frissites: { sugo_alapu: true, official_sources: [{ url, title }], title? }, reason, cost } | { ok: false, reason, cost }`.
    - Lépések:
      1. `adatlap` → ha `!horgonyKell`, akkor `{ ok:false, reason:'nem kell horgony' }`, AI-hívás nélkül;
      2. `kulcsok` → index (cache kulcsonként, egy futáson belül egyszer);
      3. üres index → „a súgó cikklistája nem jött le”;
      4. `indexSzukites` → választó AI;
      5. `valasztoValasz` → `null` → „nincs illő súgócikk”;
      6. `sugoSzovegFn` → `null` vagy rövidebb, mint `MIN_SUGO_SZOVEG` → „a súgócikk nem tölthető le”;
      7. ellenőrző AI → `ellenorzoValaszTema`.
    - A `title` csak akkor kerül a `frissites`-be, ha eltér az eredetitől.
    - Kivétel soha: bármely hiba → `{ ok:false, reason: 'hiba: …' }`.
    - A `cost` a két `ask`-válasz `costUsd`-jének összege.
  - `horgonyJegyzes(tema, eredmeny, most = Date.now()) → { at, ok, ok_ok?: string, url?: string }`: a témába írandó `horgony` mező. Sikernél `url`, kudarcnál a rövid magyar ok. Súgószöveget NEM tartalmaz.
  - `horgonyVar(tema, most = Date.now()) → boolean`: igaz, ha `tema.horgony?.ok === false` és `UJRAPROBA_NAP` napon belüli. Hibás dátumnál hamis (ne ragadjon be).

- [ ] **Step 1: Failing test**: hamis `ask` (két egymás utáni válasz: `{"pick":1}`, majd `{"ok":true,"title":<eredeti cím>}`, mindkettő `costUsd: 0.001`), hamis `indexFn` és `sugoSzovegFn` (≥ 600 karakteres kitalált szöveg). Esetek:
  - (a) siker → `frissites.sugo_alapu === true`, `official_sources[0].url` a listából, nincs `title` (nem változott), `cost === 0.002`;
  - (b) cégfüggetlen téma → `ok:false`, az `ask` hívásszáma 0;
  - (c) `pick: 0` → „nincs illő súgócikk”, csak 1 `ask`;
  - (d) a súgószöveg `null` → „nem tölthető le”;
  - (e) rövid szöveg (100 kar.) → ugyanaz;
  - (f) az ellenőrző `ok:false` → `ok:false` az okával;
  - (g) az `indexFn` dob → `ok:false`, nincs kivétel;
  - (h) két téma ugyanarra a kulcsra → az `indexFn` egyszer hívódik (cache);
  - (i) a választó listán kívüli URL-t nem tud adni: `pick: 999` → `null` → „nincs illő súgócikk”;
  - (j) `horgonyJegyzes` sikernél és kudarcnál, a mezők pontosan;
  - (k) `horgonyVar`: tegnapi kudarc → igaz, 15 napos → hamis, siker → hamis, `at: 'rossz'` → hamis.
- [ ] **Step 2: Run** → FAIL · **Step 3: Implement** · **Step 4: Run** → zöld + teljes csomag zöld.
- [ ] **Step 5: Commit** — `tényközpont 1d: súgó-horgony keresése és jegyzése (horgonyKeres, horgonyVar)`.

---

### Task 4: Bekötés az útmutató-agent írási ciklusába (a kapu)

**Files:**
- Create: `core/horgony-valasztas.js` (a kiválasztási ciklus, tesztelhető, mert az agent nem importálható)
- Test: `core/horgony-valasztas.test.js`
- Modify: `agents/guide/agent.js` (`pickTopics` szűrő + `main` írási ciklus), `core/sugo-horgony.js` (állapotfájl-író)

**Interfaces:**
- Consumes: `horgonyKeres`, `horgonyJegyzes`, `horgonyVar`, `HORGONY_BE`, `FUTAS_MAX_PROBA` (2–3. feladat); `adatlap` (1. feladat); `sugoForrasok` (`core/sugo-parositas.js`).
- Produces:
  - `async horgonyozottValasztas(jeloltek, limit, { keres, most, maxProba = FUTAS_MAX_PROBA, be = HORGONY_BE }) → { iras: tema[], jegyzesek: [{ id, horgony, frissites? }], probak: number }`:
    - sorban végigmegy a jelölteken, amíg `iras.length < limit`;
    - a cégfüggetlen, a már horgonyos (`sugoForrasok(t).length > 0`) és a `horgonyKell: false` téma horgony nélkül bekerül;
    - a horgonyt kérő téma `keres(t)`-et kap. Sikernél a `frissites`-szel kiegészített MÁSOLAT kerül az `iras`-ba, kudarcnál kimarad;
    - `maxProba` próba után a további horgonyt kérő jelölt kimarad (a cégfüggetlen még bekerülhet);
    - `be === false` → a jelöltek első `limit` eleme változatlanul (a mai működés).
  - `horgonyAllapotIr(osszegzes, { fajl = 'memory/horgony-allapot.json', most })`: `{ at, probak, sikeres, sikertelen: [{ cim, eszkoz, ok }] }`. Súgószöveg nincs benne. Hiba nem dob.
- `agents/guide/agent.js`:
  - a `pickTopics` a `horgonyVar(t)` témákat kiszűri, ahogy a féket;
  - a `main` a `pickTopics`-ot `{ ...args, limit: args.limit + FUTAS_MAX_PROBA }`-val hívja (jelölt-tartalék);
  - az eredmény a `horgonyozottValasztas`-on megy át `args.limit`-tel;
  - a `jegyzesek` a `store.topics`-ba íródnak (`horgony` mező; sikernél `sugo_alapu` + `official_sources` + esetleg `title`), majd `saveTopics(store)` következik, még az írás előtt;
  - a meglévő súgó-ág (`sugoForrasok(topic)` → `sugoSzoveg` → `writeGuide`) VÁLTOZATLAN, a horgonyos téma onnantól ezen megy;
  - konzol: `🧭 súgó-horgony: „<cím>” → <cikkcím>` / `🧭 nincs horgony: „<cím>” — <ok> (14 nap múlva újra)`;
  - a `--id` / `--title` kézi kérés is átmegy a kapun.

- [ ] **Step 1: Failing test** (`core/horgony-valasztas.test.js`, hamis `keres`): limit 2, jelöltek [horgonyt kérő-kudarc, cégfüggetlen, horgonyt kérő-siker, további] → `iras` = [cégfüggetlen, siker-másolat `sugo_alapu`-val], `probak` = 2, a `jegyzesek` 2 elem, az eredeti objektum NEM módosult · `maxProba: 1` → a második horgonyt kérő kimarad · `be: false` → az első 2 változatlanul, `keres` nem hívódik · üres lista → `iras: []` · a `keres` dob → az a jelölt kimarad, a ciklus megy tovább.
- [ ] **Step 2: Run** → FAIL · **Step 3: Implement** a modul + az agent-bekötés (az agentben csak hívás és jegyzés-visszaírás; logika a modulban).
- [ ] **Step 4: Ellenőrzés**:
  - `node core/horgony-valasztas.test.js` → zöld;
  - `node --check agents/guide/agent.js`;
  - teljes csomag zöld. A `core/guard-registry.test.js` az új `memory/horgony-allapot.json`-t besorolja: őrszem-fájl, a riport olvassa (5. feladat), a frissesség-térkép kivétele: „csak útmutató-íráskor íródik”. A besorolás az 5. feladattal együtt zöldül; ha itt bukik, a commit az 5. feladat után megy.
- [ ] **Step 5: Commit** — `tényközpont 1d: a súgó-horgony kapuja az útmutató-írás előtt (minden témaforrásra)`.

---

### Task 5: Napi riport-sor (a kapu látható legyen)

**Files:**
- Modify: `core/report-lines.js` (`horgonyLine`), `core/daily-report.js` (bekötés a `🧯 Fék` sor után), `core/guard-registry.test.js` (besorolás)
- Test: `core/report-lines.test.js` (vagy a meglévő riport-sor teszt, ahol a `fekLine` tesztje él)

**Interfaces:**
- Consumes: `memory/horgony-allapot.json` (4. feladat).
- Produces: `horgonyLine(allapot, maNap) → string | null`:
  - `null`, ha az állapot nem mai vagy tegnapi, vagy `probak === 0`;
  - csak sikerek: `🧭 Súgó-horgony: ma 3 útmutató-téma kapott hivatalos súgócikket — ezek a súgóból íródnak.`
  - kudarccal: `🧭 Súgó-horgony: 2 téma kapott hivatalos súgócikket, 3 nem (Kimi 2, Lumo 1) — azok 14 nap múlva újra próbálkoznak, addig más téma íródik.`
  - Az eszköznevek a `fek.js` `eszkozFelsorolas`-ával készülnek (DRY).

- [ ] **Step 1: Failing test**: a fenti három eset + hibás vagy `null` bemenet → `null`, kivétel nincs.
- [ ] **Step 2–4:** implementálás, a `daily-report.js` bekötése `try/catch`-ben (a fájl hiánya nem állítja meg a riportot), a teljes csomag zöld (a guard-registry is).
- [ ] **Step 5: Commit** — `tényközpont 1d: napi riport-sor a súgó-horgonyról`.

---

### Task 6: Mérés valódi adaton, majd élesítés

**Files:**
- Scratchpad mérő-szkript (nem a repóban): `<scratchpad>/horgony-meres.mjs`
- Modify (csak ha a mérés indokolja): `core/sugo-horgony.js` promptjai

- [ ] **Step 1: Mérés**:
  - Futtasd a `horgonyKeres`-t a 9 jelenlegi, horgony nélküli eszköz-`todo` témán, és a 11-01 óta írt 36 útmutató közül a 20 legutóbbi eszközhöz kötött témáján.
  - A valódi `ask` a helyi `.env` kulcsával megy; a költség < $0,10, a napló mutatja.
  - Kimenet témánként: eszköz, szint, ok/nem, választott cikkcím, ok.
- [ ] **Step 2: Kézi szúrópróba**: 5 sikeres horgonyt Claude összevet (a témacím és a súgócikk címe egyezik-e funkcióban), és 5 kudarc okát átnézi (valódi hiány vagy rossz szűkítés/prompt).
- [ ] **Step 3: Döntés**:
  - a TELJES szintű eszköz-témák legalább 60%-a horgonyt kap, ÉS a szúrópróbában 0 téves párosítás van → élesítés;
  - különben a prompt/szűkítés javítása és újramérés (legfeljebb 2 kör);
  - ha akkor sem megy → STOP: jelentés a usernek számokkal, push nélkül.
- [ ] **Step 4: Build-próba** scratchpad-másolatban + `node core/output-guard.js` · teljes csomag zöld.
- [ ] **Step 5: Push** — `git pull --rebase` + `git push`. **Élesítés-ellenőrzés a következő CI-futás után:**
  - a naplóban `🧭` sorok;
  - a napi útmutató-szám a megszokott (2/2);
  - a megírt útmutató vázlatában `sugo_alapu: true` és a 📘 súgó-mérés sor;
  - a riportban a `🧭 Súgó-horgony` sor.

  A usernek magyarul: a mérés számai, az élesítés, és mi változik a gyakorlatban.

---

## Önellenőrzés (writing-plans)

- **Spec-lefedés:**
  - 1c homlokzat a meglévő listák fölött (1. feladat);
  - 1d horgony minden eszköz-témára, AI csak a listából választ, letöltés, AI dönt hétköznapi felhasználóra (2–4. feladat);
  - „ha nincs illő súgócikk → nincs téma” — a téma nem íródik meg, 14 nap múlva újra próbálkozik (4. feladat);
  - 8.5 részleges forrás felület-név nélkül (2. feladat prompt + a meglévő `GUIDE_UI_NO_HELP` gát);
  - 4.2 cégfüggetlen nem fékeződik (1. és 4. feladat);
  - olvasó-védelem: nincs törlés, és a keretet a következő jelölt tölti ki (4. feladat);
  - 1d második mondata (a témajavasló súgó-címekből): tudatosan később, a 6. feladat mérése alapján.
- **Típus-egyezés:**
  - `adatlap().horgonyKell` → `horgonyKeres` → `horgonyozottValasztas`;
  - a `frissites` alakja (`sugo_alapu`, `official_sources[{url,title}]`) egyezik a hír-párosító témáival (`agents/pairing/agent.js:287`) és a `sugoForrasok()` bemenetével.
- **Arány:** 6 feladat, kis tiszta függvények + 1 bekötés; a tesztek az értékeket rögzítik.
