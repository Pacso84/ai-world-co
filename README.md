# AI World Co. — Agent-cég projekt

**Cél:** Multi-agent AI rendszer, ami ausztrál célközönségnek üzemeltet AI hírportált (később több weboldalt).

## Mappastruktúra

- **agents/** — Az "alkalmazottak". Minden agent saját mappa.
  - `ceo/` — A főnök, koordinál
  - `rss-scraper/` — Hírgyűjtő RSS feed-ekről
  - `iro/` — Cikkíró
  - `ellenorzo/` — Tényellenőrző + minőség kontroll
- **core/** — A cég alapinfrastruktúrája (kód, ami a rendszert működteti)
- **shared/** — Közös tudás minden agentnek (cég info, stílus, jogi szabályok)
- **content/** — A "termékek"
  - `articles/` — Megjelent cikkek
  - `drafts/` — Készülő cikkek
  - `rejected/` — Bíráló-agent által elutasított cikkek
- **sources/** — Honnan szedjük az infót (RSS lista, X figurák, subreddit-ek)
- **website/** — A weboldal maga (HTML + CSS + JS)
- **scheduled/** — Időzített feladatok (napi scrape, publikálás, analytics)
- **logs/** — Naplók (mi történt, mikor)

## Státusz

- ✅ 0. fázis: alapok (mappák, Node.js, Git)
- ⏳ 1. fázis: első agentek
- ⏳ 2. fázis: end-to-end cikk pipeline
- ⏳ 3. fázis: élő weboldal
- ⏳ 4. fázis: Telegram bot
- ⏳ 5+. fázis: bővítés (több scraper, social media, designer)

## Költségvetés

- Cél: **~100 €/hó** API + hosting
- Multi-provider stratégia: Anthropic Claude + Google Gemini (ingyenes tier) + OpenAI

## Készítő

pacsi84 + Claude (Anthropic) közös fejlesztés, 2026.
