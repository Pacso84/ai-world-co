# Közeli-téma-őr + tele téma-sor — duplikáció-mentes, gyarapodó útmutatók

**Dátum:** 2026-07-18 · **Kérte:** user („egy cikk csak egyszer jelenjen, ne legyen ismétlés" + „az útmutatók is sokasodjanak") · **Jóváhagyva:** AskUserQuestion → közeli témák szűrése + tempó marad 6/nap (csak minőség).

## Előzmény (miért kell)
Szó szerinti duplikátum nincs (a 07-16-i slug-őr fogja), DE **közeli témák** igen: pl. „Meeting Notes into **Clear** Action Plans" vs „Meeting Notes into Action Plans"; 3-4 majdnem-azonos „Rough Notes → Polished Writing". Ok: a téma-javaslók (pairing, guide --ideas, company-coverage) csak EXACT id-t néznek, jelentést nem. Emellett a téma-sor vékony (10 todo) → néha kifogy (07-15: csak 4 guide a 6-os keret helyett).

## 1. Közeli-téma-őr — `core/topic-dedup.js`
Egyetlen közös kapu: `isNearDuplicateTopic(title, { threshold=0.88 })` → `{ duplicate, closest:{title,score} }`.
- Beágyazza a jelölt címet (`embedText`, gemini-embedding-001, INGYEN), és koszinusz-hasonlósággal veti össze a MEGLÉVŐ útmutató-címekkel (kész guide-ok frontmatter title + a guide-topics.json todo-témái).
- **Embedding-cache**: `guides/topic-embeddings.json` (title→vektor), inkrementálisan töltve — csak ÚJ címet ágyazunk be, így ~0 hívás/futás.
- Küszöb 0.88 koszinusz (hangolható); felette = közeli dup → eldobás.
- **Tartalék** (embedding nem elérhető): normalizált-cím szó-halmaz Jaccard-átfedés > 0.7 → dup. Így a pipeline sosem akad meg.

## 2. Bekötés — 3 ponton, ahol új téma keletkezik
1. **pairing** (hír→útmutató): új téma push ELŐTT az őr; közeli → NEM ad témát, a hír `_meta.pairing_checked` + `guide_worthy:false` + reason „near-duplicate of: <cím>".
2. **guide --ideas**: a generált ötleteket az őrön átszűrve adjuk a listához.
3. **guide --balance** (proposeCompanyTopics): ugyanaz a kapu a cég-lefedettség (LLM-es) témáira.
Mindhárom a `guides/guide-topics.json`-ba ír — az őr ott a közös belépő.
**Kivétel — company-coverage** (`addCompanyCoverage`): determinisztikus „Getting started with X" cím, és CSAK a 0-útmutatós cégekhez → nincs duplikáció-kockázat, ezért az embedding-őr YAGNI-okból kimarad (a `uniqueId` amúgy is véd az id-ütközéstől).

## 3. Tele téma-sor (az útmutatók „sokasodnak", tempó VÁLTOZATLAN)
- `daily_guides_max` MARAD 6 (user-döntés).
- Új config: `guide_topic_buffer_target` (≈16). A ceo-pipeline meglévő „kevés a téma → --ideas" ága ezt a puffert célozza (nem csak az aznapi slotokat), így a sor sosem ürül ki, és az őr-eldobások nem éheztetik ki. Az ötletelés free-first (~$0).
- Nettó hatás: a 6/nap ténylegesen, folyamatosan teljesül; a könyvtár egyenletesen, ismétlés nélkül nő.

## 4. Megfigyelhetőség
- `memory/topic-dedup-log.json` (nap-kulcsos, 14 nap) — eldobott közeli témák + a legközelebbi meglévő.
- Napi Telegram-riport: „🔁 N ismétlődő témát kiszűrtem (pl. …)" — csak ha volt.

## 5. Teszt — `core/topic-dedup.test.js` (offline, $0)
Injektált ál-embedText: (1) két majdnem-azonos cím → duplicate; (2) két különböző → nem; (3) embedText=null → Jaccard-tartalék dup-ot fog; (4) üres meglévő-lista → sosem dup; (5) cache: ismételt címet nem ágyaz be újra.

## Nem-célok
- Nem növeli a napi tempót (user: tempó marad).
- Nem törli a meglévő közeli guide-okat (visszamenőleg nem takarít — csak új témát véd; ha a user kéri, külön sweep).
- Nem cseréli a slug-őrt (az az EXACT ütközést fogja; ez a JELENTÉS-beli közelséget).
