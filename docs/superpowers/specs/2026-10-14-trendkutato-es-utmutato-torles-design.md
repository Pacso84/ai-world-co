# Trendkutató + nézetlen útmutatók törlése — terv (2026-10-14)

## Cél

A cél havi 10 000 látogató. Ehhez a **hasznos tartalom arányát** akarjuk növelni:

- **kevesebb nézetlen oldal:** a Google az egész oldalt egyben ítéli meg, a nézetlen oldalak lehúzzák;
- **több olyan téma, amire épp van érdeklődés.**

A két rész együtt működik:

- a **trendkutató** a felkapott témák felé tereli a napi cikkeket és útmutatókat;
- a **takarító** eltávolítja azokat az útmutatókat, amelyek iránt nincs érdeklődés.

## A user döntései (2026-10-14, a beszélgetésben)

| Kérdés | Döntés |
|---|---|
| Milyen jelek alapján? | **Mindkettő:** külső felkapottság + a saját olvasóink érdeklődése |
| Mennyiség | **A mostani keretben:** napi 4 hír + 2 útmutató, nincs több cikk |
| Melyik megoldás | **„Kérdésvadász” szűkítve:** Google-javaslatok, Google napi felkapott lista (AI-szűrővel), saját adatok, Bing AI Performance lehetőség-lista. A Bing-keresésszám és a Wikipedia KIMARAD, mert saját mérés szerint az eszköz népszerűsége nálunk nem számít (4,1 vs 4,3 belépő/7 nap). |
| Útmutató-hely | A trend-útmutató a **középszintű helyére** kerül; ha aznap nincs jó trendtéma, marad a középszintű |
| Törlési szabály | **60 nap** olvasó nélkül → törlés (a 30 napot elvetettük: 57%-ot vinne, és az első 30 napban nézetlen új útmutatók harmada később kapott olvasót) |
| Törlés módja | **Teljes törlés**, nem átirányítás; egyik kereső se indexelje |
| Automatika | **Teljesen automatikus,** előzetes lista és jóváhagyás nélkül |
| Kivételek | **Nincsenek** (PDF-ben lévő útmutató is törlődik; a PDF-eket utána újragyártjuk) |
| Építés | **Agentekkel,** a végén ellenőrzés a usernek |

Megmaradó hibavédelem (a user jóváhagyta: „nem kivétel, hanem hibavédelem”):

- ha a mérés hiányos, aznap nincs törlés;
- futásonként legfeljebb 25 törlés.

---

## 1. rész — Nézetlen útmutatók törlése

### Szabály

Egy útmutató akkor **jelölt**, ha mindhárom feltétel teljesül:

1. **útmutató:** a `core/guide-kind.js` `utmutatoE()` igazat ad (hír nem érintett, azt a 90 napos hírtörlés kezeli);
2. **legalább 60 napos:** a `_meta.published_at` legalább 60 napja volt;
3. **nem volt olvasója:** a `memory/traffic-log.json` utolsó 60 napjában a `/article/<slug>`, `/hu/article/<slug>` és `/es/article/<slug>` útvonalakon a `visits` összege **0**.

### Hibavédelem (kötelező, teszttel)

- **Lefedettség-kapu.** A traffic-log utolsó 60 naptári napjából **egyik sem hiányozhat**, minden napnak legalább 1 sora kell legyen, és a legutolsó naplónap legfeljebb 2 napos lehet.
  - Ha bármelyik nem teljesül: **nincs törlés**, a riportba figyelmeztető sor kerül.
  - Indok: egy kiesett Cloudflare-lekérés miatt a gép minden útmutatót „olvasatlannak” látna, és mindent kitörölne.
- **Darabkorlát.** Futásonként legfeljebb **25** törlés, a legrégebbi előre. A maradék a következő futásra marad, és a riport kiírja („még N vár”).
- **`--dry` mód.** Csak listáz, nem töröl. Ez kézi ellenőrzéshez való; a CI éles módban fut.

### A törlés lépései

A meglévő `pruneOldNews()` mintájára, ugyanabban a Házmesterben (`core/housekeeping.js`). A döntési logika tiszta, tesztelhető modulba kerül: `core/guide-prune.js`.

1. A cikk JSON-ja törlődik (`content/articles/…`).
2. A közösségi bejegyzése törlődik (`content/social/<slug>.json`), ha van.
3. A rá mutató régi átirányítások kikerülnek a `content/slug-history.json`-ból. Ez a meglévő `lejartCeluakNelkul()`, ugyanúgy, mint a hírtörlésnél.
4. **A többi cikkben a rá mutató linkek kikerülnek.**
   - Az angol markdownban és a fordításokban (`content/articles`, `content/translations`) a linkszöveg marad, csak a link tűnik el.
   - A meglévő `core/guide-links.js` `halottLinkTorles()` végzi, minden URL-alakra: `https://aiworldhq.com/article/<slug>`, `/article/<slug>`, `/hu/…`, `/es/…`.
5. A borítókép és a fordítás a meglévő árva-takarítással megy (`pruneImages`, `pruneTranslations`), ugyanabban a futásban.
6. **Keresők értesítése.**
   - A törölt URL-ek a `memory/torolt-utmutatok.json`-ba kerülnek (slug + dátum; 30 nap után kiesnek a listából).
   - A `core/indexnow.js` a következő bejelentéskor ezeket is beküldi (IndexNow: a törölt URL bejelentése = „nézd meg újra”, és a kereső 404-et talál).
7. **Riportsor** a Házmester sorai közt: `🗑️ nézetlen útmutató törölve: N db (60 napja 0 olvasó) — még M vár`. A Telegramba a meglévő `🧹 HÁZMESTER` soron át jut.

**Mi lesz az oldallal:**

- a build már nem gyártja le, a webhelytérképből is kimarad;
- a címe **404**-et ad (a 410-et a Cloudflare Pages statikus kiszolgálása nem tudja; a Google a 404-et és a 410-et gyakorlatilag azonosan kezeli).

**Ami NEM változik:**

- a `guides/guide-topics.json` „done” témája megmarad, így ugyanaz a téma nem íródik újra;
- a Reel-sor csak 7 napnál frissebbet néz, így nem érinti.

**PDF-ek:**

- a 113 mostani jelöltből 30 benne van az ingyenes PDF-ekben;
- az első törlési hullám után a PDF-eket **kézzel újragyártjuk** (`node core/ebook-build.js --mind --pdf` + `node core/packs-data.js --write`), hogy bennük csak élő útmutató legyen. Ez az építési terv utolsó lépése.

### Várható első hatás (mért, 10-14)

- 306 útmutató 60 napnál régebbi;
- **113 (37%)** az utolsó 60 napban 0 olvasót kapott → kb. 5 nap alatt törlődnek (napi 25);
- utána naponta csak néhány.

---

## 2. rész — Trendkutató

### Modul és futás

- **Új modul:** `core/trend-kutato.js`.
  - Exportált tiszta függvények: gyűjtés, szűrés, pontozás, sorrendezés.
  - CLI-ként a CI-ben a CEO-lépés **előtt** fut, `|| true`, tehát hiba esetén sem állítja meg a futást.
- **Naponta egyszer gyűjt.** Ha a `memory/trendek.json` 20 óránál frissebb, kihagy; a CI napi 3 futásából így csak az első dolgozik.
- **Kimenet:** `memory/trendek.json`
  ```json
  { "datum": "…", "temak": [ { "kifejezes": "…", "forras": ["google-javaslat"], "pont": 0, "eszkoz": "Gemini" } ], "hibak": [ "google-javaslat: 429" ] }
  ```
  A `memory/*.json`-t csak a CI írja (meglévő szabály).

### Források

| Forrás | Hogyan | Kiesés esetén |
|---|---|---|
| **Google keresési javaslatok** | `suggestqueries.google.com/complete/search?client=firefox&hl=en&gl=us&q=…`. Kb. 30 alapkérdés a `config.json` `trends.seeds` listájából (pl. „ai photo trend”, „gemini trending prompt”, „chatgpt how to”, „ai scam”, „how to use <eszköz>”). Max. 40 lekérés, köztük 1 mp szünet, 10 mp időkorlát. | 403/429 → a forrás aznapra leáll, a többi megy; a `hibak` mezőbe kerül |
| **Google napi felkapott (USA)** | `trends.google.com/trending/rss?geo=US`; csak az AI-hoz kapcsolódó tételek (szűrő: ai/chatgpt/gemini/… + a `website/tool-links.json` eszköznevei) | kimarad, `hibak` |
| **Saját adat** | `memory/traffic-log.json` utolsó 14 napjának 10 legolvasottabb cikke → az eszközük és a címük kulcsszavai | — |
| **Bing AI Performance** | `content/trend-bing.json` (git): a „Top Opportunity Queries” lista. Havonta egyszer kézzel frissül: Claude kiolvassa a user böngészőjéből, vagy a user a „Letöltés” gombbal letölti. | ha 45 napnál régebbi, a riport szól |

A tesztekben nincs hálózat: a `fetch` beadható.

### Szűrők

- **Összehasonlítás tilos** (meglévő szabály, `no-comparison-rules.test.js`): `vs`, `versus`, `comparison`, `compare`, `alternative(s)`, `better than`, `best` → kiesik.
- **Nekünk nem való:** felnőtt, szerencsejáték, politika; a szólista a modulban él, teszttel.
- **Már megírt téma:** egyszerű szóátfedés a meglévő útmutató-címekkel. A téma-felvételkor az útmutató-agent saját közeli-ismétlés szűrője is lefut.
- **Eszköz-ellenőrzés:** ha a kifejezés eszközt nevez meg, az eszköznek szerepelnie kell a `website/tool-links.json`-ban (hivatalos link). Eszköz nélküli, hétköznapi téma mehet.

### Pontozás

- **Google-javaslat:** a javaslat helyezése (1. hely több pont); ha több alapkérdésnél is felbukkan, bónusz.
- **Felkapott lista** találata: nagy bónusz.
- **Saját legolvasottak** eszköze vagy témája: közepes bónusz.
- **Bing-lehetőség:** közepes bónusz az idézés-sáv szerint.
- **Kimenet:** a legjobb 10 téma.

### Hatás

**a) Hírek (csak sorrend):**

- Az `agents/iro/agent.js` `listUnprocessedDrafts()` ma a legújabbat teszi előre.
- Ezután **stabil átrendezés:** előre kerül az a draft, amelynek címe trendkifejezést vagy trendeszközt tartalmaz, utána a többi a mostani sorrendben.
- A logika a `core/trend-kutato.js` `trendElore()` függvénye; az iro csak meghívja.
- A napi 4-es keret és minden ellenőrzés változatlan.

**b) Útmutatók (napi 1 trend-útmutató a 2-ből):**

- **Téma-felvétel:** naponta egyszer a legjobb, szűrőn átment trendből **1 téma** kerül a `guides/guide-topics.json`-ba.
  - **Ki csinálja:** az **útmutató-agent** a saját futásában (a `core/trend-kutato.js` csak a `memory/trendek.json`-t írja). Ha ma még nincs `trend` témája, felvesz egyet, a már feldolgozott kifejezéseket kihagyva.
  - Ugyanaz a kifejezés 30 napon belül nem lesz újra téma.
  - mezők: `priority: 'trend'`, `proposed_by: 'trend-kutato'`, `trend: { kifejezes, forras, datum }`;
  - a címet az útmutató-agent meglévő ötletelője fogalmazza meg egy kis AI-hívással (≤ $0,01/nap). A promptban a trendkifejezés szerepel, és ugyanazok a szabályok érvényesek („csak amit a hivatalos forrás mond”).
- **Kiválasztás (`pickTopics`):**
  1. a **fókusz** (Alexa, 10-23-ig) marad az első;
  2. ha ma még nem készült trend-útmutató, a `trend` téma **a középszintű elé** kerül;
  3. középszintű csak akkor jön, ha nincs trendtéma.
- **Jelölés:** az elkészült útmutató `_meta.trend` mezőt kap (kifejezés, forrás), a mérés ebből dolgozik.
- **Biztonság:** változatlan. A trend-útmutató is átmegy az ellenőrzőn, a tényellenőrzésen, a hitelesség-kapun és a név-őrön.

### Riport (Telegram, napi jelentés)

- `📈 Trend ma: <1.> · <2.> · <3.> (források)` — a `memory/trendek.json`-ból.
- Ha egy forrás kiesett: `⚠️ Trendforrás kiesett: Google-javaslat (429)`. A `zaroSor` ezt hibának számolja, mert ⚠️-vel kezdődik.
- Ha a Bing-lista 45 napnál régebbi: `🔁 Bing AI-lehetőség lista régi (N nap) — frissítsd`.

### Mérés (3–4 hét múlva, ~2026-11-11)

- **Új kézi riport:** `node core/trend-kutato.js --meres`.
- Összeveti a `_meta.trend` jelölésű és a jelöletlen cikkek **első heti látogatóját** a traffic-logból, cikkenként átlagot és mediánt ír.
- **Döntés:** ha a trendcikkek nem jobbak, a trendkutató kapcsolóval kikapcsolható (`config.json` `trends.enabled`, a `core/` oldalon kezelve — meglévő szabály: a config `enabled` mező magától nem kapcsol ki semmit, ezért teszttel kötjük be).

---

## Nem cél (YAGNI)

- Fizetős API, Reddit, X, TikTok-trendoldal, Google Trends „Explore”-lekérés (a 10-14-i próbán 429-cel tiltott).
- Bing-keresésszám és Wikipedia-látogatottság (mérés szerint nálunk nem számít).
- Plusz cikk a napi kereten felül.
- Átirányítás a törölt útmutatókra.

## Tesztek (ingyenes, hálózat nélkül, `node core/run-tests.js`)

- **`core/guide-prune.test.js`:**
  - jelölt-kiválasztás: kor, 3 nyelvi útvonal, a hírt nem bántja;
  - lefedettség-kapu: hiányzó nap, elavult napló → 0 törlés;
  - 25-ös korlát, legrégebbi előre;
  - linkkivétel minden URL-alakra;
  - bekötés a `housekeeping.js`-be (forrás-alapú ellenőrzés; a `housekeeping.js` nem importálható).
- **`core/trend-kutato.test.js`:**
  - szűrők (összehasonlítás, tiltott témák, eszközlista);
  - pontozás és sorrend;
  - forráskiesés-tűrés: 429 → a többi forrás megy, `hibak` kitöltve;
  - 20 órás kihagyás;
  - `trendElore()` stabil sorrend;
  - bekötés: iro, guide `pickTopics` (`priority 'trend'` a középszintű előtt), daily-report sor, `auto.yml` lépés (forrás-alapú ellenőrzés, mert az agentek nem importálhatók).
- Meglévő tesztek: zöldek maradnak.

## Kockázatok

| Kockázat | Kezelés |
|---|---|
| A Google letiltja a javaslat-végpontot | Napi ~40 lassú kérés; tiltásnál a többi forrás megy; a riport szól |
| Mérési hiba → tömeges törlés | Lefedettség-kapu + 25/futás korlát + git-előzmény (visszahozható) |
| Trendtémáról kitalált funkciót ír | Eszközlista-ellenőrzés + a meglévő tény- és hitelesség-kapuk |
| A törölt útmutatóra régi PDF-ben link mutat | Elfogadott (user); a PDF-eket újragyártjuk |
| Vírusos, de hivatalos forrás nélküli trend | Nem lesz belőle útmutató; ez szándékos |
