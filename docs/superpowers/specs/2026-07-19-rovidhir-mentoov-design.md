# Rövidhír-mentőöv — a minden kört elbukó cikkek utolsó esélye

**Dátum:** 2026-07-19 · **Kérte:** user („kéne megoldás ha nem megy ki egy cikk hiába két kör után") · **Jóváhagyva:** AskUserQuestion → „Rövidhír-mentőöv" + terv-bemutatás → „igen".

## Előzmény
A 2 újraírási + 2 főnöki kör után bukó cikk ma „menthetetlenként" lezárul → a hír SOHA nem jut el az olvasókhoz (8 ilyen lezárt van). Ez ütközik a MENTSD-NE-DOBD elvvel (user 2026-07-13). A bukások fő oka: a TELJES cikk formátum (lépések, felület-részletek) sokat követel; a hír MAGVA (mi történt, miért számít) általában ép.

## Működés (agents/ceo/desk.js — az unsalvageable-ág elé)
1. **Mikor:** a `rounds >= MAX_CEO_ROUNDS` lezárás előtt, HA `_meta.brief_attempt` még nincs. Duplikátum/okafogyott továbbra is drop (helyes).
2. **Író:** agentName **'rework'** (erős paid-lánc: Gemini→MiniMax; aug. 1-től MiniMax-elsődleges). AI-hiba/hard-cap (ask→null) esetén a rejected marad érintetlenül — következő futás újrapróbálja, NEM zárjuk le.
3. **Bemenet:** original_title + source_name/link + a bukott markdown ELEJE (~1500 kar) CSAK tény-kinyerésre — szigorú utasítással: a how-to/felület/ár részleteket DOBD, csak az igazolható magot tartsd (a bukott változatok „betegségét" nem visszük át).
4. **Sablon (a meglévő auto-check követelményei szerint):** frontmatter (title/category:news/…) + H1 + lead (mi történt, 3-4 mondat) + `## What this means for you` (2-3 mondat) + forrás-sor. ~200-250 szó. TILOS: lépéslista, UI-elem, ár/százalék (hacsak nem a forrás címéből való).
5. **Kimenet:** WRITER_ fájl a drafts-ba, `_meta`: brief_attempt:true, rework_attempts:0, ceo_hint/ceo_decision törölve, ceo_rounds MEGMARAD (könyvelés) → a NORMÁL úton megy: Ellenőrző + hitelesség-kapu (nincs kiskapu!). A REJECTED fájl törlődik (átköltözött).
6. **Kör-védelem:** ha a rövidhír is elbukik → REJECTED-ként jön vissza brief_attempt:true-val → a desk következő futása VÉGLEG lezárja (unsalvageable, „rövidhír-próba után").
7. **Napló:** deskLog „Rövidhírként mentve: …" / „Rövidhír-próba után végleg lezárva: …" — a napi riport 👔 sora mutatja.

## Teszt
`--test-brief` kapcsoló (a meglévő --test-verdict mintájára): kanna-szöveggel, AI-hívás nélkül járatja végig az ágat egy szintetikus rejected-fixtúrán → WRITER_ létrejön, REJECTED törlődik, deskLog bejegyzés. + éles füst 1 valódi eseten.

## Visszamenőleg
A 8 már lezárt cikk közül a nem-duplikátum/nem-okafogyottak egy egyszeri helyi körrel kapnak rövidhír-esélyt (ceo_decision törlése → desk-futás). A kapu dönt; ami így is bukik, végleg zárul.

## Nem-célok
- Nincs külön „rövidhír" oldal-sablon (normál, rövidebb hír — YAGNI).
- A duplikátum/okafogyott drop-szabály nem változik.
