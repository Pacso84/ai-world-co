# CLAUDE.md

**A projekt nyelve magyar.** A felhasználó magyarul ír és magyar választ vár; a kód kommentjei is magyarul vannak. A honlap tartalma viszont **amerikai angolul** készül (+ hu/es fordítás).

## Mi ez

Automata, több nyelvű AI-hírportál (aiworldhq.com), amit agentek üzemeltetnek ember nélkül. GitHub Actions (`.github/workflows/auto.yml`, cron 00/08/16 UTC — a GitHub késleltet, a valóságban ~02, ~12–13, ~18–19 UTC) épít és deployol Cloudflare Pagesre. Nincs adatbázis: **minden tartalom JSON-fájl** a `content/` alatt, a pipeline állapota a fájlok `_meta` mezőjében él.

⚠️ A `README.md` ELAVULT (ausztrál célközönséget ír) — ne abból tájékozódj.

## Parancsok

```bash
node core/run-tests.js > <scratchpad>/tesztek.txt   # minden core/*.test.js — INGYENES, hálózat nélkül; a kimenet hosszú → fájlba
node core/<nev>.test.js                            # egyetlen teszt
npm run router-smoke                               # ⚠️ PÉNZBE KERÜL — valódi API-hívás, NE futtasd
```

- **Helyben build/deploy SOHA** — a CI épít és deployol. Build-próba csak a repó scratchpad-MÁSOLATÁBAN (az útvonalban „buildpro” legyen, egy hook ezt nézi), utána `node core/output-guard.js`.
- A CI a teszteket a költés ELŐTT, `|| true`-val futtatja: a bukás a napi Telegram-riportba megy (`core/test-guard.js`).
- A `telegram-worker/` (api.aiworldhq.com) deployja NEM a CI-ban van: `npx wrangler deploy` abból a mappából.
- Éles ellenőrzés **mindig cache-busterrel** (`?v=$RANDOM`). A domain-egyesítés a `functions/_middleware.js`-ben van — a `_redirects` abszolút címes szabályait a Cloudflare némán eldobja.

## Architektúra

```
rss-scraper ──► iro / guide ──► ellenorzo ──► content/articles/*.json ──► website/build.js ──► Cloudflare Pages
                (írás)          (kapuk +                                    │
                                 AI-bíró +                                  ├──► translator ──► content/translations/
                                 truth-gate)                                └──► social (Make: Facebook · Buffer: Threads, TikTok)
```

- **`agents/`** — agentek saját mappában, `agent.js` belépési ponttal. Ezek költenek pénzt és publikálnak.
- **`core/`** — tiszta modulok + `*.test.js` párjuk: kapuk, őrszemek, router, memória. **Ide tedd a tesztelhető logikát**, ne az agentbe.
- **`shared/`** — a promptokba fűzött közös tudás. ⚠️ A promptokba a TÖMÖR `legal-rules-ai.md` megy, nem a `legal-rules.md` — jogi változásnál **mindkettőt** frissítsd.
- **`content/`** — `articles/` (megjelent) · `drafts/` · `rejected/` · `withdrawn/` (levett, a build nem látja) · `translations/` · `csalas-archiv/` (kézzel írt 2026-os csalás-figyelmeztetések, beépített hu/es-sel; CSAK a /scams-on — `core/csalas-archiv.js`) · `slug-history.json` (301-ek).

### Minőségi kapuk

Az `agents/ellenorzo/agent.js` `runAutoCheck()`-je ingyenes, gépi jelzéseket ad. Hogy egy jelzés **elutasít-e**, azt a `core/auto-check-codes.js` dönti el (egyetlen forrás): **blokkoló** → elutasítás + újraírás · **tanácsadó** → csak lecke a következő cikkhez. Új kódhoz **állandó** lecke-szöveg kell a `LESSON_TEXT`-be (a `core/memory-manager.js` pontos szövegegyezésre deduplikál — változó szám a szövegben minden alkalommal új emléket hozna létre).

## Amit tudnod kell, mielőtt hozzányúlsz

1. **Soha ne importálj `agents/` alól semmit.** A legtöbb agent a fájl végén feltétel nélkül hívja a `main()`-t: a puszta `import` pénzt költ, publikál, posztol. Diagnózishoz `fs`-sel olvasd, vagy importálj `core/`-ból.
2. **A GitHub-repó PUBLIKUS.** A belső napló, a stratégia és a memória a repón KÍVÜL él (`C:\AI work\memoria\`).
3. **Az angol átírása NEM indít újrafordítást.** A fordítás-gyorsítótár **fájl+nyelv** kulcsú: szövegjavításnál a `content/translations/<ugyanaz-a-fájlnév>.json` `{hu, es}` mezőit **kézzel is javítsd**.
4. **A build MINDEN `ARTICLE_*.json`-t beolvas**, a `_meta.status`-tól függetlenül. Levenni csak fájlmozgatással lehet (`content/withdrawn/`) + 301 a `content/slug-history.json`-ba. A `_redirects` plafonja 2100 sor (`core/legacy-urls.js` őrzi).
5. **A `_meta.slug` a kanonikus URL.** Cím-átírás sosem költöztet. **Soha ne képezz URL-t a címből.**
6. **Költségkeret:** napi $1, havi $25 KEMÉNY plafon (user-döntés); betelte = teljes szünet. A modell-kiosztást (`config.json` + `core/ai-router.js`) user-döntés nélkül ne írd át.
7. **A `core/traffic-log.js`-t KIZÁRÓLAG a CI írja.** Helyben csak `--report`.
8. **Őrszem csak akkor ér valamit, ha odaszól, ahol a user néz:** `memory/<nev>-guard.json` (`{at, problems}`) → `core/daily-report.js` → napi Telegram-riport. A CI-napló senkihez nem jut el.
9. **Helyi fizetős mérés után** állítsd vissza: `git checkout -- core/budget-state.json memory/ai-latency-guard.json`.

## Munkamódszer, ami itt bevált

- **Használd magadtól, ami könnyíti a munkát** (skill, agent, plugin — állandó engedély). Az engedély az ESZKÖZRE szól, nem az ÍTÉLETRE: élő szöveg, deploy, keret feletti költés előtt jóváhagyás kell.
- **Mérj, ne tippelj** — ha a mérés katasztrófát mond egy működő rendszerre, előbb a mérést gyanúsítsd.
- **A „sikeres" válasz nem elvégzett munka** — a láncot a VÉGÉRŐL mérd (a webhook 200-a nem jelenti, hogy a poszt kiment).
- **Egy szám több helyre másolva szétcsúszik** — tedd egy helyre, írj rá tesztet (`core/article-length.js`, `core/auto-check-codes.js`).
- **Minden mérce IRÁNYA számít** — a kapuk többször azért engedtek át hibát, mert csak az egyik irányra voltak élezve.
- **Teszt a VALÓDI adaton is:** a kézzel gyártott minta csak az alakot ellenőrzi. Minden ilyen modul kap egy esetet, ami a `content/articles/` valódi fájljain fut végig (`core/frontmatter.test.js`, `core/reel-post.test.js`).
- **Windows-os sorvégek:** sok fájl CRLF — szöveg-cserénél/forrás-minta tesztben normalizálj (`.replace(/\r\n/g, '\n')`).
