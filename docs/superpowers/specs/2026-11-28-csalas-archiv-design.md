# Csalás-archív: a 2026-os hivatalos figyelmeztetések a /scams-on (rövid terv, 2026-11-28)

## Szándék
A csalás-figyelő 11-28-án élesedett, a /scams oldal üresen indul. A user kérése: a hivatalos források 2026-ban
MÁR közzétett csalás-figyelmeztetései is kerüljenek ki a /scams-ra, de a Hírek közé (és a közösségi médiába)
csak az ÚJAK menjenek. User-döntések: csak 2026 · a cikkeket Claude írja meg a beszélgetésben (nem a napi gép).

## Célok / nem-célok
- CÉL: 6–8 archív csalás-cikk (en + hu + es), mindegyik a /scams listán és a saját /scams/<slug> oldalán,
  az eredeti forrásdátummal („FBI warning · June 2026”).
- NEM: Hírek-lista, főoldal, RSS, hírlevél, Facebook/TikTok/Threads, Reel, napi riport „mai cikkek”.
- ANTI-CÉL: friss hírnek látsszon egy régi figyelmeztetés; lezajlott eseményhez kötött (foci-vb, választás)
  vagy céges/állami (router, észak-koreai IT-sok) figyelmeztetés kerüljön ki; szexuális zsarolás példaüzenettel.

## Megközelítések
1. Visszatöltő sor a napi gépsoron (napi 2 tétel a csalás-szűrőn át) — elvetve: a user azt kérte, hogy Claude írja.
2. Egyszeri külön CI-futás — elvetve: párhuzamos írási út, 42 perces korlát.
3. **VÁLASZTOTT (user: „gondoltam te megirod!”): Claude írja** a hivatalos PSA-szövegből, a napi csalás-cikkekkel
   AZONOS szerkezetben (In short · What's happening · Warning signs + 🧪 példablokk · How to protect yourself ·
   If it already happened · What this means for you), a hu/es fordítást is (content/translations, így a napi
   fordító nem nyúl hozzá). $0 API.

## A hogyan (döntve)
- Jelölés: `_meta.csalas` (mint élesben) + `_meta.csalas_archiv: { forras_datum: 'YYYY-MM-DD', forras_nev: 'FBI' }`.
- Kiszűrés = KÜLÖN MAPPA (felderítés után, 11-28): `content/csalas-archiv/ARTICLE_SCAM_<slug>.json`, a hu/es
  fordítás a fájlon BELÜL (`forditas: { hu, es }`). Ok: ~40 program olvassa a content/articles-t (social, Reel,
  hírlevél, prune, videó, SEO, házmester — az utóbbi a content/translations árva fájljait TÖRLI); egyenkénti szűrő
  helyett ezek EGYIKE sem látja az archívot. Csak a build.js, a csalas-kepek.js és az indexnow.js olvassa.
- Oldalak: CSAK /scams/<slug> (a rövid /article/<slug> változat NEM készül), sitemap + IndexNow igen.
- /scams lista és a teljes oldal: a forrásdátum jelenik meg („FBI warning · June 2026”).
- Képek: a CI „Csalás-képek” lépése magától rajzolja (4:5, 16:9, kártya).
- Ellenőrzés feltöltés előtt (helyben, ingyen): ár-tilalom, us-spelling, example-domain, peldaBlokk-elemzés,
  build-próba scratchpadben + output-guard, Chrome-előnézet asztali + 390 px. Előbb 1 mintacikk → user-jóváhagyás.

## A builderre hagyva
- A pontos kiszűrési pontok a build.js-ben és az agentekben (felderítés a terv első lépése).
- A végleges cikklista a PSA-szövegek elolvasása után (magánembert érint-e, ma is érvényes-e).
