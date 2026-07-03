# Útmutató-minőség: szabályrendszer + kezdő-érthetőségi ellenőrzés

**Dátum:** 2026-07-03 · **Kérte:** pacsi84 · **Státusz:** jóváhagyva ("igen")

## Probléma

A user jelzése: az útmutatók és az AI-eszköz oldali leírások nem elég részletesek,
nem egyértelműek, és **félreviszik a kezdő felhasználókat**. Gyökérokok:

1. A guide-szabály 450–800 szó, lépésenként 2–4 mondat → a lépések túl
   általánosak ("keresd a buborék ikont"), nem mondják meg, mit lát a képernyőn
   az olvasó, mi történik a művelet után, és mit tegyen, ha nála máshogy néz ki.
2. Az Ellenőrző bírálati szempontjai közt **nincs kezdő-érthetőség** — a homályos
   útmutató 7/10 fölött simán átmegy.
3. A csempéken (guides.html + tools.html) csak a cím látszik, leírás (alcím) nélkül.

## Döntések

- **Hatókör:** mind a 87 publikált útmutató átdolgozandó (user választása), plusz
  minden ezután készülő. A hírcikkek (iro) NEM változnak.
- **Irány:** "A" változat — központi szabálykönyv + erősített Ellenőrző
  (a külön "kezdő tesztelő" agent lényege — a kezdő-szimuláció — az Ellenőrző
  utasításába épül, plusz agent nélkül).

## Terv

### 1. Szabálykönyv: `shared/guide-quality-rules.md` (ÚJ)

Egyetlen igazságforrás, angolul (a promptok nyelvén). Betölti a guide agent
(brand-kontextus részeként). Tartalma:

- **Minden lépés 6 kötelező eleme:** (1) pontos MŰVELET, (2) MIT LÁTSZ a
  képernyőn, (3) MI TÖRTÉNIK utána, (4) "HA NÁLAD MÁSHOGY néz ki" tartalék,
  (5) 💬 másolható példa ahol releváns, (6) siker-jel: "onnan tudod, hogy
  sikerült, hogy…".
- **Őszinteségi szabályok** (félrevezetés ellen): kitalált menüpont/gomb/ár/limit
  TILOS — bizonytalan UI-részlet csak "keress egy ehhez hasonló gombot…"
  formában; nem ígérünk olyan eredményt, amit az eszköz nem biztosan hoz;
  fizetős funkció jelölése; az eszköz korlátainak kimondása.
- **Mélység:** 700–1200 szó, 4–7 lépés, lépésenként 60–140 szó; a "Before you
  start" MINDENT felsorol, ami kell (fiók, app, csomag, eszköz).
- **3 érthetőségi teszt** (az Ellenőrző ezeket futtatja): Nagyszülő-teszt,
  Elakadás-teszt, Félrevezetés-teszt.

### 2. Guide agent (`agents/guide/agent.js`)

- `loadBrandContext()` betölti a guide-quality-rules.md-t is.
- `GUIDE_SYSTEM_PROMPT`: bővített lépés-sablon (6 elem), 700–1200 szó,
  read_time 5–7 perc. A szekció-nevek és a 💬 marker VÁLTOZATLANOK
  (a build.js lépés-felismerése és fordítás-pipeline ne törjön).
- maxTokens 3000 → 4500 (író + rework ágon is).
- Új `--upgrade [N]` mód: a publikált ARTICLE_GUIDE_* fájlokat írja át az új
  szabályok szerint → WRITER_GUIDE_* draft (meta átvéve, `rules_version: 2`,
  `upgraded_from`) → a NORMÁL Ellenőrző-pipeline viszi végig. A
  `rules_version >= 2` cikkeket kihagyja (idempotens, megszakítható-folytatható).
  Az eredeti cikk addig marad élőben, amíg az új át nem megy.

### 3. Ellenőrző (`agents/ellenorzo/agent.js`)

- `REVIEWER_SYSTEM_PROMPT` + kompakt "BEGINNER CLARITY (guides only)" szempont:
  a bíráló KEZDŐKÉNT végigjátssza a lépéseket; hibás: homályos művelet,
  tényként állított bizonytalan UI-részlet, hiányzó előfeltétel, be nem
  tartható ígéret, túl vékony lépés. (A teljes szabálykönyvet NEM töltjük a
  reviewer-promptba — a 30k-s kontextus korábban szétzilálta a JSON-kimenetet.)
- JSON-kimenet új mezője: `"clarity_score": 1-10` (csak guide-nál; hírnél null).
  PASS guide-nál: overall ≥ 7 ÉS clarity ≥ 7. Hiányzó clarity_score nem bukás
  (parse-variancia ne büntessen). A mentő-parser is kinyeri a clarity_score-t.
- Auto-check: guide-nál < 550 szó → kritikus bukás (ingyen, AI-hívás nélkül).
- `moveToArticles()`: ha egy meglévő cikk ÚJ markdownnal publikálódik újra,
  a fordítás-cache fájlját töröljük → a fordító újrafordítja. (Ez a rework-ág
  lappangó hibáját is javítja: eddig átdolgozás után elavult fordítás maradt.)

### 4. Csempék (`website/build.js` + `style.css`)

- `guideTile()`: megjelenik az alcím (`gtile__sub`, 2 sorra vágva CSS-sel) —
  a leírás már választáskor látszik. Az alcím a fordított frontmatterből jön,
  tehát automatikusan többnyelvű.

### 5. Egyszeri átdolgozás-menet (helyben futtatva)

1. Pilot: 3 útmutató (köztük a kifogásolt ügyfélszolgálatos) → kézi átnézés.
2. Teljes kör: maradék 84 → Ellenőrző → bukók a meglévő rework-körön
   (max 4 próba, utána CEO-eszkaláció).
3. Fordítás-backfill: a törölt cache-párok újrafordítása (~348 pár).
4. Build + deploy + push. Becsült összköltség ~$2 (a $80-as havi keret ~2,5%-a).

## Nem-célok

- Hírcikkek (iro agent) szabályai változatlanok.
- Nincs új agent; nincs workflow-változtatás (a cron a meglévő lépésekkel viszi
  az új szabályokat).

## Kockázatok és kezelésük

- **Reviewer JSON-megbízhatóság:** csak kompakt kiegészítés a promptban;
  mentő-parser bővítve; hiányzó clarity_score nem bukás.
- **Fordítás-csonkulás hosszabb guide-oknál:** a meglévő 35%-os
  csonkulás-védelem + 6000 maxTokens elegendő (1200 szó ≈ ~2000 token).
- **Slug/dátum-stabilitás:** a WRITER→ARTICLE névmegfeleltetés és a meglévő
  published_at-megőrzés garantálja, hogy az oldal szerkezete nem borul.
