# Hitelesség-kapu (truth gate) — publikálás előtti hallucináció-szűrő

**Dátum:** 2026-07-16 · **Kérte:** user („kéne ellenőrzés a hitelességre mielőtt publikálva lenne, hogy többet ne legyen ilyen hülyeség azaz hallucináció") · **Jóváhagyva:** „igen" + AskUserQuestion: **Mindig fizetős (Gemini)** változat.

## Előzmény (miért kell)
2026-07-16-i söprés leletei: reserved-capacity guide kitalált OpenAI önkiszolgáló felülettel; Copilot-guide nem létező copilot.github.com URL-lel; 5 Cohere/Snowflake guide nem létező funkciókkal (Rewrite tool, Prompt Library, GPT-5.6 + CORTEX.GPT5_6). Mind PUBLIKÁLVA volt — a fact-check csak utólag talált rájuk. A kapu ezt előzi meg.

## Hol dolgozik
Az **Ellenőrző** (agents/ellenorzo/agent.js) döntése UTÁN, a `moveToArticles()` ELŐTT — csak a minőségben már átment (finalPass) piszkozatokra fut, hogy ne fizessünk olyanért, ami úgyis bukik. Minden típusra: hír + guide.

## Két réteg (core/truth-gate.js)
1. **Link-vadász** ($0, determinisztikus): a markdownból kigyűjti a linkeket (kódblokkokon KÍVÜL; saját domain kihagyva), élő próbát tesz (HEAD→GET, 8 mp).
   - DNS/kapcsolat-hiba vagy 404/410 → **BLOKK** (kitalált URL — a copilot.github.com esetet ez másodpercek alatt fogta volna)
   - Időtúllépés vagy 5xx → csak **figyelmeztetés** (lassú/beteg szerver miatt jó cikket nem dobunk vissza)
   - 403/405/429 → átengedve (bot-védelem gyakori, nem hamisság-jel)
2. **AI hitelesség-bíró** (config.agents.truth, **paid-only**: gemini-2.5-flash → minimax-m3, a többi tartalmi agenttel azonos lánc + augusztus 1-i csere érinti): CSAK kitaláltság-vadászat — nem létező felület/gomb/menü, kitalált URL/modellnév/verziószám, kitalált ár/kedvezmény/százalék, a megnevezett eszköznél nem létező funkció. Általános tanács, begépelendő prompt-példa, óvatos fogalmazás NEM hiba. Kimenet: `{credible, problems[], confidence}`. Konzervatív: csak akkor blokkol, ha észszerűen biztos.

## Döntési tábla
| Eredmény | Akció |
|---|---|
| Link-blokk VAGY credible=false | NEM publikál → `moveToRejected` a kapu-indokokkal (issues) → meglévő rework-kör írja újra; tanulság a közös memóriába |
| AI-bíró nem elérhető (mindkét fizetős elhal / parse-hiba) | **HOLD**: a piszkozat MARAD a drafts-ban, következő futás (max ~8 óra) újrapróbálja — ellenőrizetlenül semmi nem megy ki |
| Átment (figyelmeztetésekkel is) | Publikálás a megszokott úton; figyelmeztetések a naplóba |

## Megfigyelhetőség
- `memory/truth-gate-log.json` (nap-kulcsos, 14 nap retenció, a quality-fix-log mintájára)
- Napi Telegram-riport új sora: „🛡️ Hitelesség-kapu: N blokkolva / M visszatartva (pl. …)" — csak ha volt találat
- A kapu AI-költsége a futás költségébe számít (router logolja, budget-őr látja)

## Költség
Mért (élő füst-teszt): ~$0.002-0.01/cikk → ~10-20 friss tartalom/nap ≈ **+$1-4/hó** (a becsült $4-6 felső határ alatt; user-döntés: megéri). Augusztus 1 után MiniMax-elsődlegessel tovább csökken.

## Teszt (core/truth-gate.test.js — offline, $0)
Injektált ál-fetch + ál-ask: (1) link-kigyűjtés kódblokk-kihagyással; (2) halott domain → blokk, 200 → ok, 404 → blokk, timeout → csak warn; (3) credible=false → blokk indokokkal; (4) ask→null → HOLD; (5) élő link + credible=true → pass. A copilot.github.com-os valós eset mintáján bizonyít.

## Nem-célok
- Nem cseréli le a fact-check agentet (az marad az UTÓLAGOS frissesség-őr a régi állományra)
- Nem ellenőriz stílust/minőséget (az az Ellenőrző dolga, előtte fut)
- Nem próbál webes kutatást — a bíró a modell tudásából + a linkpróbákból dolgozik
