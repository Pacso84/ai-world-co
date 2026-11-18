# Súgókereső (felfedező) — megvalósítási terv

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ha a fix súgólistában nincs illő felhasználói súgócikk egy útmutató-témához, a kód magától felkutatja az eszköz hivatalos címén lévő súgólapokat (robots.txt → sitemap, llms.txt), és ugyanazon a szigorú választó → letöltés → ellenőrző úton próbálja horgonyozni a témát.

**Architecture:** Új modul `core/sugo-felfedezo.js`: (a) engedély-rész — a felfedezett forrás csak az eszköz `website/tool-links.json` címének PONTOS hostján lehet, súgó-jellegű útvonalon; (b) felfedezés — hamisítható `fetchFn`-nel, kérés- és méretkorlátokkal. A `core/sugo-horgony.js` `horgonyKeres` egy második választó-kört futtat a felfedezett jelöltekkel. A felfedezett forrást a témán tárolt `official_sources[i].felfedezett === true` jelöli, és minden későbbi használatkor (író, ellenőrző, súgó-tár) újra ellenőrizzük.

**Tech Stack:** Node.js 24 ESM, saját mini tesztkeret (`node core/<név>.test.js`, minden teszt a `core/run-tests.js`-ben), hálózat és AI nélküli tesztek (hamis `fetchFn` / `ask`).

**Spec:** `docs/superpowers/specs/2026-11-17-sugokereso-design.md` + a döntések: `docs/superpowers/specs/2026-11-17-sugokereso-design-builder-check.md` („Döntések (2026-11-18)” szakasz — EZ felülírja a spec 6.1/6.2 regisztrálható-domain szabályát és a 6.2 memória-fájlját).

## Global Constraints

- PONTOS HOST: felfedezés KIZÁRÓLAG a `tool-links.json` `tools[<kanonikus eszköznév>]` címének hostján; jelölt csak ugyanilyen hostú URL. Nincs visszaesés a regisztrálható domainre / www-re.
- Ha a host (www-vel vagy anélkül) bármely `ENGEDELY`-előtag hostjával egyezik → NINCS felfedezés (pl. brave.com, proton.me).
- Csak `https:`, port / felhasználónév / jelszó nélkül; a `..` / `%2e%2e` szakasz tilos (ugyanaz a szabály, mint az `engedelyezett()`-ben).
- Korlátok hostonként és futásonként: legfeljebb **12 HTTP-kérés**, kérésenként **30 mp** időtúllépés, legfeljebb **5000 URL** beolvasva, legfeljebb **400 jelölt**; sitemap-index rekurzió legfeljebb **2 szint**.
- Gyorsítótár CSAK futáson belül (az `indexCache`-ben) — **nincs új fájl a `memory/` alatt** (egyszerűsítés a spec 6.2-höz képest; a jogosultság a témán él).
- Nyilvános helyre (guide-topics.json, memory/*.json, konzol) AI-szöveg és súgóidézet NEM kerül — csak URL, cím (slug vagy llms.txt-linkszöveg), host, darabszám.
- A „Ha elakadsz” doboz (core/elakadas.js, core/elakadas-html.js) NEM változik: a fix súgó-indexből dolgozik (szolgaltatok()), felfedezett forrás oda nem kerülhet (eltérés a spec 6.3-tól, tudatos YAGNI).
- Kimi/MiniMax szintje MARAD `reszleges` (core/forras-szint.js-ben nem változik a szint).
- A router (`core/ai-router.js`) NEM változik. Választó maxTokens **1500**, ellenőrző **2000** (csak a horgonyban).
- Kikapcsoló: `export const FELFEDEZO_BE = true` a `core/sugo-felfedezo.js`-ben; `false` → egyetlen felfedező-kérés sem megy ki (teszt bizonyítja).
- Tesztszövegek kitaláltak (kiadói szöveg nem kerülhet a repóba). Tesztfuttatás kimenete FÁJLBA (`node core/run-tests.js > <scratchpad>/teszt.txt 2>&1`), soha nem csővezetékbe.
- NINCS push. Minden commit helyben; a push a user döntése a mérés után.

## Review Focus

1. **A llms.txt helyén HTML-hibaoldal jön 200-zal** (élőben: agent.minimax.io/llms.txt egy Next.js hibaoldal) → 0 jelölt, kivétel nélkül; a /docs/llms.txt ettől még feldolgozódik. → Task 2 teszt: `html-hibaoldal llms.txt helyén`.
2. **Átirányítás más hostra** (élőben: agent.minimax.io/docs/llms.txt → code.minimax.io/docs/llms.txt, a benne lévő linkek agent.minimax.io-sak) → a tartalom feldolgozható, de jelölt csak a tool-hostú URL; a sitemap-index más hostra mutató al-sitemapját NEM kérjük le. → Task 2 tesztek: `más hostú al-sitemap nem kérődik le`, `más hostú link nem jelölt`.
3. **Régi / kézzel átírt téma `felfedezett: true` jelöléssel, de idegen hoston vagy API-útvonalon** → az író és az ellenőrző nem kapja meg (`sugoForrasok` kiszűri). → Task 3 teszt: `felfedezett jelölés idegen hoston kiesik`.
4. **Óriás sitemap (> 5000 URL) vagy végtelen sitemap-index lánc** → megáll a korlátnál, a 12. kérés után nincs több. → Task 2 tesztek: `5000 URL felett megáll`, `legfeljebb 12 kérés`.
5. **Eszköz tool-links cím nélkül, http-címmel vagy ENGEDELY-hoston (www-eltéréssel)** → nincs felfedezés, nincs kérés. → Task 1 tesztek: `www-eltérés is kizár`, `http-cím nem felfedezhető`.

---

## File Structure

- Create `core/sugo-felfedezo.js` — engedély-rész (Task 1) + felfedezés (Task 2). Egy felelősség: „honnan jöhet felfedezett súgó, és mik azok”.
- Create `core/sugo-felfedezo.test.js`.
- Modify `core/sugo-parositas.js` — `valasztoValasz` engedély-paraméter, `sugoForrasok` felfedezett forrás (Task 3).
- Modify `core/sugo-tar.js` — `sugoSzoveg` / `sugoTarIr` felfedezett forrás opció (Task 3).
- Modify `agents/guide/agent.js:993,1074,1379`, `agents/ellenorzo/agent.js:864` — a súgószöveg-hívás átadja a felfedezett-opciót (Task 3).
- Modify `core/sugo-horgony.js` — második kör, maxTokens (Task 4).
- Modify `core/sugo-index.js`, `core/forras-szint.js` — Kimi felhasználói súgó (Task 5).
- Modify `core/horgony-valasztas.js`, `core/report-lines.js` — 🧭 új súgó-forrás sor (Task 6).
- Tesztek: a meglévő `core/sugo-parositas.test.js`, `core/sugo-tar.test.js`, `core/sugo-horgony.test.js`, `core/sugo-index.test.js`, `core/forras-szint.test.js`, `core/horgony-valasztas.test.js`, `core/report-lines.test.js` bővül (ha valamelyik fájlnév eltér, a meglévő, azonos modult tesztelő fájlt bővítsd).

---

### Task 1: Felfedező — engedély-rész

**Files:**
- Create: `core/sugo-felfedezo.js`
- Test: `core/sugo-felfedezo.test.js`

**Interfaces:**
- Consumes: `ENGEDELY` (core/sugo-index.js), `forrasSzint(tool, company).eszkoz` (core/forras-szint.js), `website/tool-links.json` (`{ tools: { "<név>": "https://…" } }`).
- Produces:
  - `export const FELFEDEZO_BE = true`
  - `export function felfedezoHost(eszkozNev: string, toolLinks?: object): string|null` — a cím hostja kisbetűvel; `null`, ha nincs cím, nem `https:`, port/felhasználó van benne, vagy a host (www-vel/nélkül) egy ENGEDELY-előtag hostja.
  - `export function sugoJellegu(url: string): boolean` — útvonal-szűrő.
  - `export function felfedezettEngedelyezett(url: string, eszkozNev: string, toolLinks?: object): boolean`
  - `export function forrasEngedelyezett(forras: {url:string, felfedezett?:boolean}|string, tema: {tool?:string, company?:string}, toolLinks?: object): boolean` — `engedelyezett(url)` VAGY (`forras.felfedezett === true` ÉS `felfedezettEngedelyezett(url, forrasSzint(tema.tool, tema.company).eszkoz)`).
  - `toolLinks` opcionális (tesztben átadható); alapból a `website/tool-links.json` egyszer, lustán beolvasva, hibánál `{tools:{}}`.

- [ ] **Step 1: Írd meg a bukó teszteket** (`core/sugo-felfedezo.test.js`, a `core/sugo-horgony.test.js` keretmintájával: `t(név, fn)`, végén összesítés + `process.exit(hiba ? 1 : 0)`)

```js
const TL = { tools: { 'MiniMax Code': 'https://agent.minimax.io', 'Lumo': 'https://lumo.proton.me', 'Brave Leo': 'https://brave.com/leo/',
  'Proba': 'https://www.proton.me', 'Httpes': 'http://example.org', 'Portos': 'https://example.org:8443' } };
t('pontos host', () => assert.equal(felfedezoHost('MiniMax Code', TL), 'agent.minimax.io'));
t('aldomain nem öröklődik a kizárásból', () => assert.equal(felfedezoHost('Lumo', TL), 'lumo.proton.me'));
t('ENGEDELY-host kizár', () => assert.equal(felfedezoHost('Brave Leo', TL), null));
t('www-eltérés is kizár', () => assert.equal(felfedezoHost('Proba', TL), null));          // proton.me/support/ az ENGEDELY-ben
t('http-cím nem felfedezhető', () => assert.equal(felfedezoHost('Httpes', TL), null));
t('port nem lehet', () => assert.equal(felfedezoHost('Portos', TL), null));
t('ismeretlen eszköz', () => assert.equal(felfedezoHost('Nincs Ilyen', TL), null));

t('súgó-jellegű útvonalak', () => {
  for (const u of ['https://agent.minimax.io/docs/code/welcome', 'https://x.io/help/start', 'https://x.io/faq', 'https://x.io/user-guide/a', 'https://x.io/support/a', 'https://x.io/guides/a'])
    assert.equal(sugoJellegu(u), true, u);
});
t('kizárt szakaszok', () => {
  for (const u of ['https://x.io/docs/api/a', 'https://x.io/docs/api-reference/a', 'https://x.io/developers/docs/a', 'https://x.io/docs/reference/a',
    'https://x.io/docs/sdk/a', 'https://x.io/docs/cookbook/a', 'https://x.io/help/pricing', 'https://x.io/docs/techblog', 'https://x.io/blog/help',
    'https://x.io/news/faq', 'https://x.io/legal/faq', 'https://x.io/help/terms', 'https://x.io/help/privacy', 'https://x.io/careers/faq',
    'https://x.io/features', 'https://platform.x.io/docs/a'])
    assert.equal(sugoJellegu(u), false, u);
});
t('nem angol nyelvi előtag kiesik, az en marad', () => {
  assert.equal(sugoJellegu('https://x.io/zh/docs/a'), false);
  assert.equal(sugoJellegu('https://x.io/en-cn/help/a'), false);
  assert.equal(sugoJellegu('https://x.io/en/help/a'), true);
});

t('felfedezett: csak a tool-host', () => {
  assert.equal(felfedezettEngedelyezett('https://agent.minimax.io/docs/code/welcome', 'MiniMax Code', TL), true);
  assert.equal(felfedezettEngedelyezett('https://code.minimax.io/docs/code/welcome', 'MiniMax Code', TL), false);
  assert.equal(felfedezettEngedelyezett('https://agent.minimax.io/docs/../api/x', 'MiniMax Code', TL), false);
  assert.equal(felfedezettEngedelyezett('https://agent.minimax.io/docs/%2e%2e/x', 'MiniMax Code', TL), false);
  assert.equal(felfedezettEngedelyezett('https://user@agent.minimax.io/docs/a', 'MiniMax Code', TL), false);
  assert.equal(felfedezettEngedelyezett('http://agent.minimax.io/docs/a', 'MiniMax Code', TL), false);
});
t('forrasEngedelyezett: jóváhagyott marad, felfedezett jelöléssel bővül', () => {
  const tema = { tool: 'MiniMax Code', company: 'MiniMax' };
  assert.equal(forrasEngedelyezett({ url: 'https://help.openai.com/en/articles/1-a' }, tema, TL), true);
  assert.equal(forrasEngedelyezett({ url: 'https://agent.minimax.io/docs/code/welcome' }, tema, TL), false);   // jelölés nélkül nem
  assert.equal(forrasEngedelyezett({ url: 'https://agent.minimax.io/docs/code/welcome', felfedezett: true }, tema, TL), true);
  assert.equal(forrasEngedelyezett({ url: 'https://agent.minimax.io/docs/code/welcome', felfedezett: true }, { tool: 'Kimi' }, TL), false);   // más eszköz
  assert.equal(forrasEngedelyezett('https://help.openai.com/en/articles/1-a', tema, TL), true);   // sima URL-szöveg is
});
```

- [ ] **Step 2: Futtasd, bukjon** — `node core/sugo-felfedezo.test.js` → hiba: a modul nem létezik.

- [ ] **Step 3: Írd meg a függvényeket a `core/sugo-felfedezo.js`-ben.** Fejkomment a ház stílusában (MIÉRT: user 11-16 „csináljunk egy súgókeresőt”; a döntések hivatkozása; KIKAPCSOLÁS: `FELFEDEZO_BE`). Útvonal-szűrő mintái (a szakasz-határ `(^|/)…(/|$)`):
  - súgó-jellegű szakasz: `help(-center)?`, `faqs?`, `guides?`, `user-guide`, `support`, `docs`;
  - kizárt szakasz: `api[a-z-]*`, `developers?`, `platform`, `reference`, `sdks?`, `cookbooks?`, `pricing`, `[a-z-]*blog`, `news`, `legal`, `terms`, `privacy`, `careers`; plusz a host `platform.` / `api.` / `developer(s).` kezdetű;
  - nyelvi előtag: az első útvonal-szakasz `^[a-z]{2}(-[a-z]{2,4})?$` (kisbetűsítve), és nem `en` / `en-us` → hamis.
  ENGEDELY-hostok: `new URL(p).hostname` minden előtagra; egyezés `h === e || 'www.' + h === e || h === 'www.' + e`.

- [ ] **Step 4: Futtasd, menjen át** — `node core/sugo-felfedezo.test.js` → minden ✅.

- [ ] **Step 5: Commit** — `git add core/sugo-felfedezo.js core/sugo-felfedezo.test.js && git commit -m "súgókereső 1: felfedező engedély-rész (pontos host, súgó-jellegű útvonal)"` (+ Co-Authored-By sor).

---

### Task 2: Felfedező — felfedezés (robots → sitemap, llms.txt)

**Files:**
- Modify: `core/sugo-felfedezo.js`
- Test: `core/sugo-felfedezo.test.js`

**Interfaces:**
- Consumes: Task 1 (`felfedezoHost`, `felfedezettEngedelyezett`, `FELFEDEZO_BE`); `slugCim` (core/sugo-index.js).
- Produces: `export async function felfedez(eszkozNev: string, { fetchFn = fetch, cache = {}, toolLinks, be = FELFEDEZO_BE } = {}): Promise<{url:string, cim:string, felfedezett:true}[]>` — SOHA nem dob; hiba/üres → `[]`. A `cache[host]` a futáson belüli eredmény (üres is), második hívás nem kér le semmit. Konstansok: `export const KERES_MAX = 12, URL_MAX = 5000, JELOLT_MAX = 400, SZINT_MAX = 2, IDOKORLAT_MS = 30000`.

Folyamat (sorrendben, a kérésszámláló hostonként közös): `https://<host>/robots.txt` → minden `Sitemap:` sor, amelynek hostja = host → lekérés; `<sitemapindex>` esetén az al-sitemapok (csak azonos host, legfeljebb 2 szint mélyen); `<urlset>` `<loc>`-jai. Ezután `https://<host>/llms.txt` és `https://<host>/docs/llms.txt`: markdown-linkek `[szöveg](https://…)`; a link `.md` végződése levágva; a cím a linkszöveg (tisztítva, max 160 kar.). Minden jelölt: `felfedezettEngedelyezett(url, eszkozNev)`, query/hash nélkül, egyedi; sitemapból a cím `slugCim(url)`; ha ugyanaz az URL llms.txt-ből is jön, a linkszöveg-cím nyer. Nem-200 válasz / kivétel / időtúllépés → az adott lépés kimarad, a többi mehet. Fejlécek: ugyanaz a böngésző-UA és `Accept-Language: en-US,en;q=0.9`, mint a `core/sugo-index.js`-ben (a UA-t exportáld onnan, ne másold).

- [ ] **Step 1: Írd meg a bukó teszteket** — hamis `fetchFn(url)` egy `{ [url]: {status, body} }` térképből, a hívott URL-eket naplózza.

```js
const TL = { tools: { 'MiniMax Code': 'https://agent.minimax.io' } };
const hamis = (lap, naplo = []) => async url => { naplo.push(url); const r = lap[url]; if (!r) return { ok: false, status: 404, text: async () => '' };
  return { ok: (r.status || 200) === 200, status: r.status || 200, text: async () => r.body }; };
const ROBOTS = 'User-agent: *\nSitemap: https://agent.minimax.io/sitemap.xml\nSitemap: https://masik.io/sitemap.xml';
const IDX = '<sitemapindex><sitemap><loc>https://agent.minimax.io/s-0.xml</loc></sitemap><sitemap><loc>https://code.minimax.io/s-1.xml</loc></sitemap></sitemapindex>';
const URLSET = '<urlset><url><loc>https://agent.minimax.io/docs/code/get-started/first-task</loc></url><url><loc>https://agent.minimax.io/pricing</loc></url><url><loc>https://agent.minimax.io/docs/api/x</loc></url></urlset>';
const LLMS = '# Docs\n- [Create Your First Task](https://agent.minimax.io/docs/code/get-started/first-task.md): x\n- [Coding and Work Modes](https://agent.minimax.io/docs/code/workflows/modes.md)\n- [Kívül](https://code.minimax.io/docs/code/x.md)';

tt('sitemap + llms.txt jelöltjei', async () => {
  const naplo = [];
  const l = await felfedez('MiniMax Code', { toolLinks: TL, fetchFn: hamis({ 'https://agent.minimax.io/robots.txt': { body: ROBOTS },
    'https://agent.minimax.io/sitemap.xml': { body: IDX }, 'https://agent.minimax.io/s-0.xml': { body: URLSET },
    'https://agent.minimax.io/docs/llms.txt': { body: LLMS } }, naplo) });
  assert.deepEqual(l.map(x => x.url), ['https://agent.minimax.io/docs/code/get-started/first-task', 'https://agent.minimax.io/docs/code/workflows/modes']);
  assert.equal(l[0].cim, 'Create Your First Task');            // a linkszöveg nyer a slug ellen
  assert.ok(l.every(x => x.felfedezett === true));
  assert.ok(!naplo.includes('https://masik.io/sitemap.xml'));  // más hostú Sitemap-sor nem kérődik le
});
tt('más hostú al-sitemap nem kérődik le', async () => { /* IDX-szel: naplóban nincs https://code.minimax.io/s-1.xml */ });
tt('más hostú link nem jelölt', async () => { /* LLMS „Kívül” sora nincs az eredményben (fenti teszt is fedi; itt külön assert) */ });
tt('html-hibaoldal llms.txt helyén', async () => {
  const l = await felfedez('MiniMax Code', { toolLinks: TL, fetchFn: hamis({ 'https://agent.minimax.io/llms.txt': { body: '<!DOCTYPE html><html><head><script src="https://cdn.x/a.js"></script></head></html>' },
    'https://agent.minimax.io/docs/llms.txt': { body: LLMS } }) });
  assert.equal(l.length, 2);
});
tt('legfeljebb 12 kérés', async () => {
  // önmagára mutató sitemap-index lánc 20 al-sitemappal → a napló hossza ≤ 12
});
tt('5000 URL felett megáll', async () => {
  // egy urlset 6000 súgó-jellegű <loc>-kal → az eredmény ≤ 400 (JELOLT_MAX), és a feldolgozás 5000 URL után megáll
});
tt('kivétel / időtúllépés: üres lista, nem dob', async () => {
  assert.deepEqual(await felfedez('MiniMax Code', { toolLinks: TL, fetchFn: async () => { throw new Error('x'); } }), []);
});
tt('cache: második hívás nem kér le semmit', async () => { /* ugyanazzal a cache-sel kétszer → a második naplója üres, az eredmény azonos */ });
tt('kikapcsolva: egyetlen kérés sem', async () => {
  const naplo = [];
  assert.deepEqual(await felfedez('MiniMax Code', { toolLinks: TL, be: false, fetchFn: hamis({}, naplo) }), []);
  assert.equal(naplo.length, 0);
});
tt('ENGEDELY-hoston nincs kérés', async () => {
  const naplo = [];
  await felfedez('Brave Leo', { toolLinks: { tools: { 'Brave Leo': 'https://brave.com/leo/' } }, fetchFn: hamis({}, naplo) });
  assert.equal(naplo.length, 0);
});
```
  (`tt` = a `t` aszinkron változata; a kommentes testeket írd ki teljes assertekkel a leírt bemenettel.)

- [ ] **Step 2: Futtasd, bukjon** — `node core/sugo-felfedezo.test.js` → a `felfedez` nincs exportálva.
- [ ] **Step 3: Írd meg a `felfedez`-t** a fenti folyamattal; `AbortSignal.timeout(IDOKORLAT_MS)` minden kérésen.
- [ ] **Step 4: Futtasd, menjen át** — minden ✅.
- [ ] **Step 5: Élő próba ($0, AI nélkül)** — scratchpad-szkriptből: `felfedez('MiniMax Code')`, `felfedez('Lumo')`, `felfedez('Duck.ai')` valódi `fetch`-csel; írd a commit-üzenetbe a darabszámot (11-18 kézi mérés: az agent.minimax.io/docs/llms.txt 86 linket ad, ebből a `miniapp/reference` kiesik). A repóba nem ír.
- [ ] **Step 6: Commit** — `"súgókereső 2: felfedezés robots/sitemap/llms.txt-ből (12 kérés, 5000 URL, 400 jelölt)"`.

---

### Task 3: A felfedezett forrás elfogadása az író, az ellenőrző és a súgó-tár útján

**Files:**
- Modify: `core/sugo-parositas.js` (`valasztoValasz`, `sugoForrasok`)
- Modify: `core/sugo-tar.js` (`sugoTarIr`, `sugoSzoveg`)
- Modify: `agents/guide/agent.js:993`, `:1074`, `:1379`; `agents/ellenorzo/agent.js:864`
- Test: `core/sugo-parositas.test.js`, `core/sugo-tar.test.js`

**Interfaces:**
- Consumes: Task 1 `forrasEngedelyezett`, `felfedezettEngedelyezett`; `forrasSzint` (core/forras-szint.js).
- Produces:
  - `valasztoValasz(szoveg, index, engedelyFn = engedelyezett)` — a kiválasztott cikket `engedelyFn(c.url)` engedi át (a hír-párosító hívása változatlan).
  - `sugoForrasok(x)` → `{url, title, felfedezett?: true, eszkoz?: string}[]`: a szűrés `forrasEngedelyezett(s, x)`; felfedezett tételnél `felfedezett: true` és `eszkoz: forrasSzint(x.tool, x.company).eszkoz`. Max 2 tétel marad.
  - `sugoSzoveg(url, { …, felfedezettEszkoz })` és `sugoTarIr(url, adat, { …, felfedezettEszkoz })`: tárolható, ha `engedelyezett(url) || (felfedezettEszkoz && felfedezettEngedelyezett(url, felfedezettEszkoz))`.
  - Hívási minta az agentekben: `sugoSzoveg(s.url, s.felfedezett ? { felfedezettEszkoz: s.eszkoz } : undefined)`.

- [ ] **Step 1: Bukó tesztek**
  - `sugo-parositas.test.js`: `valasztoValasz('{"pick":1}', [{url:'https://agent.minimax.io/docs/code/a', cim:'A'}])` → `null`; ugyanez `u => true` engedéllyel → a cikk.
  - `felfedezett jelölés idegen hoston kiesik`: `sugoForrasok({ sugo_alapu: true, tool: 'MiniMax Code', company: 'MiniMax', official_sources: [{ url: 'https://code.minimax.io/docs/a', title: 'A', felfedezett: true }, { url: 'https://agent.minimax.io/docs/api/x', title: 'B', felfedezett: true }] })` → `[]`.
  - `felfedezett forrás átmegy`: `official_sources: [{ url: 'https://agent.minimax.io/docs/code/a', title: 'A', felfedezett: true }]` → `[{ url, title: 'A', felfedezett: true, eszkoz: 'MiniMax Code' }]`.
  - régi viselkedés: jóváhagyott URL (`https://help.openai.com/en/articles/1-a`) változatlanul átmegy, `felfedezett` mező nélkül.
  - `sugo-tar.test.js` (a meglévő ideiglenes-mappás mintával): `sugoTarIr('https://agent.minimax.io/docs/code/a', {cim:'A', szoveg:'x'.repeat(700)}, {dir})` → `false`; `{dir, felfedezettEszkoz:'MiniMax Code'}`-dal → `true`, és a `sugoTarOlvas` visszaadja; `felfedezettEszkoz:'Kimi'` → `false`.
- [ ] **Step 2: Futtasd, bukjanak** — `node core/sugo-parositas.test.js`, `node core/sugo-tar.test.js`.
- [ ] **Step 3: Írd meg** a fenti aláírásokkal. Körkörös import ellenőrzése: a `core/sugo-felfedezo.js` csak a `sugo-index.js`-t és a `forras-szint.js`-t importálja.
- [ ] **Step 4: Az agent-hívások** — a 4 hívási helyen a fenti minta. A `core/sugo-tar-or.test.js` (agents/-őr) maradjon zöld.
- [ ] **Step 5: Futtasd** — a két tesztfájl + `node core/sugo-tar-or.test.js` + `node core/fek.test.js` + `node core/horgony-valasztas.test.js` → minden ✅.
- [ ] **Step 6: Commit** — `"súgókereső 3: a felfedezett forrás (témán jelölve, minden használatkor újraellenőrizve) az író, az ellenőrző és a súgó-tár útján"`.

---

### Task 4: Második választó-kör a `horgonyKeres`-ben + Haiku-keret

**Files:**
- Modify: `core/sugo-horgony.js` (`horgonyKeres`, fejkomment MŰKÖDÉS 4b pont)
- Test: `core/sugo-horgony.test.js`

**Interfaces:**
- Consumes: Task 2 `felfedez`; Task 3 `valasztoValasz(…, engedelyFn)`, `sugoSzoveg(url, {felfedezettEszkoz})`; Task 1 `felfedezettEngedelyezett`.
- Produces: `horgonyKeres(tema, { ask, indexFn, sugoSzovegFn, indexCache, agentName, felfedezFn = felfedez })` — sikernél `frissites.official_sources = [{ url, title, felfedezett: true }]` a felfedezett körből; az eredmény új mezője: `felfedezett: true` (csak sikernél, a Task 6 számolja).

Logika (a meglévő lépések közé):
- A fix lista első köre változatlan, DE ha a szűkített lista minden tétele `FEJLESZTOI_URL`, az első kör AI-hívása kimarad (egyenesen a 2. körre).
- A második kör akkor fut, ha az első kör „nincs illő súgócikk” lett, VAGY a fix lista üres (ekkor a felfedezés előbb jön, mint a mostani „a súgó cikklistája nem jött le” átmeneti válasz), VAGY csak fejlesztői volt. A termékoldal-szabály (3b) változatlanul előbb dönt.
- `const jeloltek = await felfedezFn(ad.nev, { cache: (indexCache.__felfedezes ||= {}) })`; üres → az eredeti kudarc-ok és -jelleg marad (üres fix listánál továbbra is `atmeneti: true`).
- Nem üres → `indexSzukites` → `valasztoPromptTema` → `ask(…, { maxTokens: 1500 })` → `valasztoValasz(text, szukitett, u => felfedezettEngedelyezett(u, ad.nev))` → `sugoSzovegFn(url, { felfedezettEszkoz: ad.nev })` → a meglévő hossz-szabályok → ellenőrző (`maxTokens: 2000`, ugyanaz a `szint`).
- A választó (mindkét körben) `maxTokens: 1500`, az ellenőrző `2000` (eddig 200 / 400).

- [ ] **Step 1: Bukó tesztek** (hamis `ask` sorban adott válaszokkal, hamis `indexFn`, `sugoSzovegFn`, `felfedezFn`; a hívásokat naplózd):
  - `2. kör: fix lista nem illik → felfedezett siker`: indexFn → `[{url:'https://platform.minimax.io/docs/guides/x', cim:'X'}]`; ask: `{"pick":0}`, majd `{"pick":1}`, majd `{"ok":true,"title":"<eredeti cím>","reason":"r"}`; felfedezFn → `[{url:'https://agent.minimax.io/docs/code/a', cim:'A', felfedezett:true}]` → `ok:true`, `frissites.official_sources[0]` = `{url:'https://agent.minimax.io/docs/code/a', title:<cim>, felfedezett:true}`, `felfedezett:true`, és a `sugoSzovegFn` megkapta a `{felfedezettEszkoz:'MiniMax Code'}`-ot.
  - `2. kör üres → az eredeti ok`: felfedezFn → `[]` → `reason: 'nincs illő súgócikk'`, nincs `atmeneti`.
  - `üres fix lista + üres felfedezés → átmeneti marad`.
  - `csak fejlesztői fix lista → az 1. kör AI-hívása kimarad` (az ask-napló első hívása már a felfedezett listát látja).
  - `idegen hostú felfedezett jelölt nem választható` (felfedezFn hamisan `https://code.minimax.io/docs/a`-t ad, pick 1 → `nincs illő súgócikk`).
  - `maxTokens: választó 1500, ellenőrző 2000` (az ask-napló opcióiból).
  - `jóváhagyott siker esetén nincs felfedezés` (felfedezFn hívásszáma 0).
  - A meglévő horgony-tesztek maradjanak zöldek (az alapértelmezett `felfedezFn` a tesztekben hamisra cserélendő, ahol hálózatot hívna).
- [ ] **Step 2: Futtasd, bukjanak** — `node core/sugo-horgony.test.js`.
- [ ] **Step 3: Írd meg**; a kivétel-szabály marad (SOHA nem dob).
- [ ] **Step 4: Futtasd** — `node core/sugo-horgony.test.js`, `node core/horgony-valasztas.test.js` → ✅.
- [ ] **Step 5: Commit** — `"súgókereső 4: második választó-kör felfedezett súgóval; Haiku-keret 1500/2000"`.

---

### Task 5: Kimi felhasználói súgó a fix listába (G2)

**Files:**
- Modify: `core/sugo-index.js` (`ENGEDELY`, `FORRASOK.kimi`, fejkomment)
- Modify: `core/forras-szint.js` (`ESZKOZ_SZINT.Kimi.sugo` — a szint MARAD `RESZLEGES`)
- Test: `core/sugo-index.test.js`, `core/forras-szint.test.js` (ha a tábla-épség teszt a sugo-előtagokat egyezteti, az is)

**Interfaces:**
- Produces: `ENGEDELY` új eleme `'https://www.kimi.com/help/'`; `FORRASOK.kimi` második sora `{ sitemap: 'https://www.kimi.com/sitemap/sitemap-ug-helpcenter.xml', minta: /^https:\/\/www\.kimi\.com\/help\/[a-z0-9-]+(\/[a-z0-9-]+)*$/, kizar: /\/help\/(kimi-api|search)(\/|$)/ }` (a platform.kimi.ai sor marad). 11-18 kézi mérés: a sitemap 180 URL, ebből 14 `kimi-api`; a nem angol változat a `…-helpcenter-en-cn.xml`-ben van, azt NEM kötjük be.

- [ ] **Step 1: Bukó tesztek** — `engedelyezett('https://www.kimi.com/help/new-user-guide/x')` → igaz; `sitemapCikkek(<urlset: /help/new-user-guide/x, /help/kimi-api/y, /help/search, /en-cn/help/z>, FORRASOK.kimi[1].minta, FORRASOK.kimi[1].kizar)` → csak az első; `felfedezoHost('Kimi')` (valódi tool-links) → `null` (mostantól jóváhagyott host); `forrasSzint('Kimi').szint === 'reszleges'`.
- [ ] **Step 2: Futtasd, bukjanak.**
- [ ] **Step 3: Írd meg**; a `sugo-index.js` fejkommentje: „11-18 (user-jóváhagyás 11-17): Kimi felhasználói súgó · a felfedezett forrásokra a jóváhagyás a tool-links.json hivatalos címlistája (core/sugo-felfedezo.js), lásd spec 5.”
- [ ] **Step 4: Élő próba ($0)** — scratchpadból `indexLetolt('kimi')` → darabszám a commit-üzenetbe (várható: ~160 felhasználói cikk + a platform-dok).
- [ ] **Step 5: Futtasd** — a két tesztfájl → ✅.
- [ ] **Step 6: Commit** — `"súgókereső 5: Kimi felhasználói súgó (www.kimi.com/help) a jóváhagyott listában"`.

---

### Task 6: Riport-sor „🧭 új súgó-forrás”

**Files:**
- Modify: `core/horgony-valasztas.js` (`horgonyAllapotIr`)
- Modify: `core/report-lines.js` (`horgonyLine`)
- Test: `core/horgony-valasztas.test.js`, `core/report-lines.test.js`

**Interfaces:**
- Consumes: a jegyzések `frissites.official_sources[0].{url, felfedezett}`.
- Produces: az állapotfájl új mezője `felfedezett: { "<host>": <db> }` (host `^[a-z0-9.-]+$` szűréssel; üresnél a mező HIÁNYZIK). A `horgonyLine` minden nem-null kimenete végére: ` 🧭 Új súgó-forrás: agent.minimax.io (2 téma).` (több host: vesszővel, legfeljebb 3, a többi „+N”).

- [ ] **Step 1: Bukó tesztek** — `horgonyAllapotIr` 2 felfedezett + 1 jóváhagyott sikerrel → `felfedezett: {'agent.minimax.io': 2}`; felfedezett nélkül nincs mező; rossz host (`'a b'`) kimarad. `horgonyLine({at:ma, probak:3, sikeres:2, sikertelen:[], felfedezett:{'agent.minimax.io':2}}, ma)` → `endsWith('🧭 Új súgó-forrás: agent.minimax.io (2 téma).')`; felfedezett nélkül a mostani szöveg betűre azonos (a meglévő tesztek).
- [ ] **Step 2: Futtasd, bukjanak.**
- [ ] **Step 3: Írd meg.**
- [ ] **Step 4: Futtasd** — a két tesztfájl → ✅.
- [ ] **Step 5: Commit** — `"súgókereső 6: napi riport — új súgó-forrás sor"`.

---

### Task 7 (vezérlő végzi): teljes ellenőrzés és mérés

- [ ] `node core/run-tests.js > <scratchpad>/teszt.txt 2>&1` → az összes zöld (a 222 + az új tesztek).
- [ ] Build-próba CSAK scratchpad-másolatban + `node core/output-guard.js` (a repóban build SOHA).
- [ ] Mérés ugyanazon a 28 témán (a korábbi `horgony-meres.mjs` mintája, env-átirányítás a scratchpadba, a repóba nem ír), költséghatár **$0,10**. Minden sikert kézzel ellenőrizni a súgó ellen.
- [ ] Push-feltétel (user 11-18): **0 téves párosítás** + minden kudarc „valódi hiány” vagy indokolt ellenőrző-döntés. Eredmény a user elé; push CSAK az ő döntésével.
