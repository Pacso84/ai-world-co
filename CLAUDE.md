# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**A projekt nyelve magyar.** A felhasználó magyarul ír és magyar választ vár; a kód kommentjei is magyarul vannak. A honlap tartalma viszont **amerikai angolul** készül. Tartsd ezt a felosztást.

## Mi ez

Automata, több nyelvű AI-hírportál (aiworldhq.com), amit agentek üzemeltetnek ember nélkül. GitHub Actions cron indítja 8 óránként (00/08/16 UTC), Cloudflare Pages szolgálja ki. Nincs adatbázis: **minden tartalom JSON-fájl** a `content/` alatt, a pipeline állapota a fájlok `_meta` mezőjében él.

⚠️ A `README.md` ELAVULT: még ausztrál célközönséget és befejezetlen fázisokat ír. Az oldal 2026 júniusa óta él, a közönség 2026-07-31 óta amerikai. Ne abból tájékozódj.

## Parancsok

```bash
npm test                    # 33 teszt — INGYENES és hálózat nélküli (core/run-tests.js)
node core/<nev>.test.js     # egyetlen teszt futtatása
npm run router-smoke        # ⚠️ PÉNZBE KERÜL — valódi API-hívás, szándékosan nincs a npm test-ben
node website/build.js       # statikus build a website/public/-ba (ingyenes, hálózat nélkül)
```

A CI (`.github/workflows/auto.yml`) **nem futtat teszteket** — helyben kell.

### Deploy (ebben a sorrendben, a középső lépés kötelező)

```bash
node website/build.js
node core/share-images.js        # KÖTELEZŐ: a build ÜRÍTI a public/-ot, ez gyártja újra a megosztás-képeket
npx wrangler pages deploy website/public --project-name=aiworldco --branch=main --commit-dirty=true
```

Éles ellenőrzés **mindig cache-busterrel** (`?v=$RANDOM`), különben az él-cache a régi oldalt adja vissza. A `functions/_middleware.js` intézi a domain-egyesítést — a `_redirects` abszolút címes szabályait a Cloudflare némán eldobja, ezért ott ne próbálkozz.

## Architektúra

```
rss-scraper ──► iro / guide ──► ellenorzo ──► content/articles/*.json ──► website/build.js ──► Cloudflare Pages
                (írás)          (kapuk +                                    │
                                 AI-bíró +                                  ├──► translator ──► content/translations/
                                 truth-gate)                                └──► social (Make: Facebook · Buffer: Threads, Instagram)
```

- **`agents/`** — 20 agent, mind saját mappában, `agent.js` belépési ponttal. Ezek költenek pénzt és publikálnak.
- **`core/`** — 81 tiszta modul: kapuk, őrszemek, router, memória. **Ide tedd a tesztelhető logikát**, ne az agentbe.
- **`shared/`** — a promptokba fűzött közös tudás (stílus, jogi szabályok). ⚠️ A promptokba a TÖMÖR `legal-rules-ai.md` megy, nem a 12,5K-s `legal-rules.md` — jogi változásnál **mindkettőt** frissítsd.
- **`content/`** — `articles/` (megjelent) · `drafts/` · `rejected/` · `withdrawn/` (levett, a build nem látja) · `translations/` · `slug-history.json` (301-ek).

### Minőségi kapuk

Az `agents/ellenorzo/agent.js` `runAutoCheck()`-je ingyenes, gépi jelzéseket ad. Hogy egy jelzés **elutasít-e**, azt a `core/auto-check-codes.js` dönti el — az a lista az egyetlen forrás, az Író és az Útmutató is onnan kérdezi:

- **blokkoló** → azonnali elutasítás, fizetős újraírás
- **tanácsadó** → nem utasít el, csak leckét ír a következő cikkhez (user-döntés: „tanuljon, de ne utasítson el")

Új kód felvételekor adj neki **állandó** lecke-szöveget a `LESSON_TEXT`-ben: a `core/memory-manager.js` `remember()`-e pontos szövegegyezésre deduplikál és ismétlést számol, tehát egy cikkenként változó szám (szószám!) minden alkalommal ÚJ emléket hozna létre a meglévő erősítése helyett.

## Amit tudnod kell, mielőtt hozzányúlsz

**1. Soha ne importálj `agents/` alól semmit.** 25 agentből 21 a fájl végén feltétel nélkül hívja a `main()`-t, tehát a puszta `import` elindítja: pénzt költ, publikál, posztol. Diagnózishoz `fs`-sel olvasd a fájlt, vagy importálj `core/`-ból. (Az `import.meta.url`-re szűrő mérés mind a 25-öt „védettnek" mondja — a `main()` hívás környezetét kell nézni.)

**2. A GitHub-repó PUBLIKUS.** Ami ide bekerül, azt bárki elolvassa. A belső napló, a stratégia és a memória szándékosan a repón KÍVÜL él: `C:\AI work\memoria\`.

**3. Az angol átírása NEM indít újrafordítást.** A fordítás-gyorsítótár **fájl+nyelv** kulcsú, nem tartalom-hash. Ha egy cikk szövegét javítod, a `content/translations/<ugyanaz-a-fájlnév>.json` `{hu, es}` mezőit **kézzel is javítanod kell**, különben a magyar és spanyol oldal a régi (akár hibás) szöveget mutatja tovább. Fordítva viszont hasznos: tömeges markdown-szerkesztés nem szakítja el a gyorsítótárat, tehát $0.

**4. A build MINDEN `ARTICLE_*.json`-t beolvas, a `_meta.status`-tól függetlenül.** Cikket levenni csak fájlmozgatással lehet (`content/withdrawn/`), és mellé 301 kell a `content/slug-history.json`-ba (`{régi-slug: új-slug}`), különben 404 lesz belőle. A `_redirects` plafonja 2100 sor; a `core/legacy-urls.js` őrzi, hogy ne kússzon oda.

**5. A `_meta.slug` a kanonikus URL.** Cím-átírás sosem költöztet oldalt. **Soha ne képezz URL-t a címből** — a kettő a cikkek 11%-ánál eltér.

**6. Költségkeret:** napi $1, havi $25 KEMÉNY plafon (user-döntés). A havi cap betelte teljes szünetet jelent. Minden agent fizetős MiniMax modellt használ, a kiosztást ne írd át.

**7. A `core/traffic-log.js`-t KIZÁRÓLAG a CI írja.** Helyben csak `--report`, különben git-ütközés lesz belőle.

**8. Őrszemet csak akkor érdemes építeni, ha odaszól, ahol a user néz.** A minta: állapotfájl `memory/<nev>-guard.json` (`{at, problems}`), amit a `core/daily-report.js` beolvas és a napi Telegram-riportba tesz. A CI-naplóba írni annyi, mintha senkinek nem szólnál.

## Munkamódszer, ami itt bevált

- **Mérj, ne tippelj** — és ha a mérés 100%-os katasztrófát mond egy működő rendszerre, előbb a mérést gyanúsítsd. Az adatútvonalat ellenőrizd, ne csak a függvényt.
- **A „sikeres" válasz nem elvégzett munka** — a láncot a VÉGÉRŐL mérd (a webhook 200-a nem jelenti, hogy a poszt kiment).
- **Egy szám, ami több helyre van kimásolva, matematikai biztonsággal szétcsúszik.** Ha ilyet találsz, tedd egy helyre és írj rá tesztet — lásd `core/article-length.js` és `core/auto-check-codes.js` fejlécét.
- **Minden mérce IRÁNYA számít.** A kapuink többször azért engedtek át hibát, mert csak az egyik irányra voltak élezve (túl kevés fordítás, túl rövid cikk) — a hiba a fölösleg felől jött.
