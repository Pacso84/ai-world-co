# Hír-összevonás és forrás-zár — terv

*2026-08-18 · user-kérés: „ne több nézőpontból legyen több cikk, hanem több hírből egy cikk"*

## 1. Miért

Két, egymástól független baj derült ki a 2026-08-18-i duplikáció-átvizsgáláson.

**a) Ugyanabból a forrásból két cikk.** Öt sztoriról két-két cikk született, mind
2026 júliusában. Négyet azonos forrás-URL azonosít, egyet azonos eredeti cím (ott a
forrás átírta a saját linkje kötőjelezését). Mindkét példány élő.

**b) Egy eseményről több cikk, több forrásból.** A Claude Opus 5 bejelentéséről
**három** cikkünk van, mind 2026-07-26-ról: Anthropic, AWS és Snowflake feedjéből.
A Claude Sonnet 5-ről szintén három, 07-01 és 07-24 között szétszórva.

### Amit a mérés mondott

| mérés | eredmény |
|---|---|
| hír összesen | 413 |
| ebből forrás-linkkel | 413 (**100%**) |
| „egy nap + egy forrás" csoport 2+ cikkel | 92 csoport, 257 cikk (a hírek 62%-a) |
| kereszt-forrású, 3 napon belüli, címben hasonló pár | 3 |
| azonos slug / szó szerint azonos törzs | 0 |

### A döntő lelet: gépből nem megy

A jelenlegi író promptja szerint a hír **csak jelzés**, nem alapanyag: *„The input is
ONLY a SIGNAL of what topic is timely… DO NOT rewrite, summarize or paraphrase…
write something GENUINELY OUR OWN."* Ezért írt a modell ugyanabból a forrásból két
teljesen más cikket — nem hibázott, hanem a tervet követte.

Ennek az a következménye, hogy **tartalmi hasonlósággal nem lehet őket megfogni**:

| pár | tartalmi hasonlóság |
|---|---|
| NVIDIA SIGGRAPH ×2 | 0,091 |
| Gemini 3.6 ×2 | 0,120 |
| OpenAI long-horizon ×2 | 0,321 |
| OpenAI GPT-Red ×2 | 0,397 |
| AWS Built Technologies ×2 | 0,409 |

A legmagasabb 0,409 — vagyis a küszöböt 0,09-ig kellene levinni, ami mindent
megjelölne. Cím-hasonlóság sem megy: a Midjourney 07-23-i öt frissítése (V8 Alpha,
V8.1 Alpha, V8.1 Updates, Web Updates, Random styles) **0,056**-ot kap, az öt
független OpenAI-bejelentés 07-22-ről **0,022**-t. A két eset gyakorlatilag
megkülönböztethetetlen; a Midjourney-hírek rokonsága **termékismeretből** látszik,
nem szóegyezésből.

> Ugyanez a tanulság már le van írva a `core/guide-claims.js` végén egy másik
> elvetett kapunál: *„annak Discord-voltát csak TERMÉKISMERETBŐL lehet tudni,
> kódból nem."*

**Ezért: a rokonság eldöntéséhez AI-ítélet kell. A duplikátum kiszűréséhez nem.**

### Hogyan keletkeztek a duplikátumok (mechanizmus, nem bizonyított ok)

A scraper `saveDraft()`-ja **azonnal** lemezre ír (`agents/rss-scraper/agent.js:305`),
a `saveSeenItems()` viszont **csak a teljes futás végén** hívódik (`:476`), és a link
megjelölése is csak sikeres AI-döntés után történik (`:458`). Ha a futás félbeszakad
a batch-ek között, a draftok már ott vannak, de **egyetlen link sem lesz „látott"** —
a következő futás újra lementi őket.

Ez illeszkedik a leletre: a 07-20-i pár két scrape-futásból származik 13 perc
különbséggel (`17-22-07` vs `17-35-52`), a 07-16-i 9 óra különbséggel. Egyben ez a
legerősebb érv a terv mellett: **a publikált cikkekből épített zár robusztusabb,
mint a `seen-items.json`**, mert nem függ attól, sikerült-e a futás végén menteni.

## 2. Cél és nem-cél

**Cél**

1. Ugyanabból a forrás-URL-ből soha ne szülessen második cikk.
2. Ha több függőben lévő hír ugyanarról a témáról szól, azokból **egy** cikk
   legyen: magyarázó a közös témáról, nem szakaszos összefoglaló.

**Nem cél (szándékosan kimarad)**

- **Nem** vonunk össze pusztán azért, mert egy forrásból egy napon több hír jött.
  Az OpenAI 07-22-i öt bejelentése öt külön téma — külön is marad. (user-döntés)
- **Nem** nézzük a már megjelent cikkek témáit. A Sonnet 5 esete (3 hét alatt
  szétszórva) tehát **nem oldódik meg**. Ok: egy „erről már írtunk" szűrő valódi
  folytatásokat is blokkolna („az Opus 5 mostantól AWS-en" önmagában hír). Előbb
  lássuk, mennyit old meg az egyszerűbb változat.
- **Nem** nyúlunk a meglévő 5 duplikátum-párhoz. Hírek, a 90 napos szabály szerint
  2026-10-16 és 10-26 között maguktól törlődnek, és tartalmilag eltérőek, tehát
  duplikált-tartalom büntetést sem kockáztatnak.

## 3. Felépítés

Két **független** mechanizmus. Ha a második elromlik, az első akkor is véd.

### A) Forrás-zár — ingyenes, determinisztikus

`core/source-lock.js` — tiszta függvények, hálózat nélkül, tesztelhető.

```
normalizeSourceUrl(url)        → protokoll, www., záró per, ?query, #horgony nélkül
normalizeSourceTitle(title)    → kisbetű, csak betű/szám, egy szóköz
publishedSourceKeys(articles)  → { urls: Set, titles: Set }
isAlreadyWritten(draft, keys)  → boolean
```

Az író a draft feldolgozása előtt kérdez. Ha a válasz igen: a draft **eldobásra
kerül** (nem íródik meg, nem költünk rá), és a naplóba egy sor megy.

**⚠️ A URL önmagában nem elég — a cím is kell.** A Gemini-pár két forrás-URL-je
`…gemini-36-flash-35-flash-lite…` és `…gemini-3-6-flash-3-5-flash-lite…`: a
különbség magában az útvonalban van, azt semmilyen ésszerű URL-normalizálás nem
hozza közös kulcsra. Ezért a zár **kétkulcsos**: normalizált URL **vagy**
normalizált eredeti cím. Ez nem új ötlet — az `agents/ceo/desk.js:124-136`
`isDuplicate()` már ma is így dolgozik.

**⚠️ A saját domaint ki kell hagyni a kulcsokból.** Kilenc szerkesztőségi cikk
(heti digest, összehasonlítás) `source_link`-je `https://aiworldhq.com`
(`agents/digest/agent.js:212`, `agents/compare/agent.js:147`). Ha ez bekerül a
zárolt kulcsok közé, a digest önmagát zárná ki.

⚠️ A kulcshalmaz a `_meta.source_link` **és** a `_meta.source_links[]` mezőkből
épül — különben egy összevont cikkbe olvasztott hír később újra megíródna.

**⚠️ A draftban a mező neve `link`, nem `source_link`** — az utóbbi nevet az író
adja neki (`agents/iro/agent.js:374`: `source_link: draft.link`).

### A meglévő zárat át kell állítani, nem mellé építeni

`agents/ceo/desk.js:124-136` `isDuplicate()` gyakorlatilag ugyanez a függvény, de
(a) csak a beragadt/elutasított hírekre fut (`:168`), a normál írási útvonalon nem,
és (b) **nem normalizál** — szó szerinti `===`-szel hasonlít. A `desk.js`-t a
`core/source-lock.js`-re kell átállítani, különben két, egymástól eltérően
normalizáló duplikátum-fogalom él majd a rendszerben.

### B) Összevonás — AI-ítélet

`core/draft-clusters.js` — tiszta függvények: az ítélet nyers válaszát csoportokká
alakítja, és betartatja a korlátokat.

```
parseClusterReply(raw, draftIds) → [{ theme, ids[] }]
applyLimits(groups, opts)        → a korlátokon átment csoportok
```

Az AI-hívás magában az íróban, a draft-választás után, az írás előtt.

**Az ítélet szerződése**

- *Bemenet:* a függőben lévő draftok — azonosító, eredeti cím, egysoros kivonat,
  forrás neve. **Minden forrásból együtt**, nem forrásonként külön: a
  kereszt-forrású csoportosítás (Opus 5) így ingyen adódik.
- *Kimenet:* JSON — csoportok, mindegyikhez egy rövid közös téma. Ami nem fér
  csoportba, az marad magában.
- *Modell:* M2.5 (a gépi agentek modellje). A bemenet csak cím + kivonat, tehát
  pár száz token; napi ~1,3 csoportnyi forgalom. Nagyságrend: tized-cent/nap.

**A követendő minta már megvan:** `agents/rss-scraper/agent.js`
`checkRelevanceBatch()` (`:248-273`) — számozott lista bemenet → `ask(…, { jsonMode:
true })` → `extractJsonArray()` (`:209-227`) → hibánál `{ ok:false }`, és a hívó
(`:449-454`) a mai viselkedésre esik vissza. Az összevonó ítéletnek ezt kell
követnie. ⚠️ Az `extractJsonArray` ma **kétszer van lemásolva**
(`agents/rss-scraper/agent.js:209` és `agents/guide/agent.js:352`), core-ban nincs —
a harmadik másolat helyett `core/`-ba kerül, és a két meglévő hívó is arra vált.

**Korlátok**

| korlát | érték | miért |
|---|---|---|
| max csoportméret | 5 | efölött a cikk elveszti a fókuszt |
| min csoportméret | 2 | 1 elem nem csoport |
| kell közös téma | igen | üres/általános téma („AI news") → nincs csoport |

### Hibatűrés — a legfontosabb szabály

**Alapértelmezés minden hibánál: a MAI viselkedés.** Ha az ítélet nem válaszol,
időtúllépésbe fut, értelmezhetetlen JSON-t ad, vagy bizonytalan → **minden draft
külön cikk lesz, ahogy most.** Az összevonás sosem kötelező, csak lehetőség.

Ez ugyanaz az elv, ami a `make-budget.js`-ben és a `scenario-guard`-ban már áll:
API-hiba miatt nem fékezünk, mert az azonnali és biztos kár.

## 4. Adatmodell

Az összevont cikk `_meta`-jában:

```jsonc
{
  "source_link":  "https://…",       // a csoport legerősebb híre — MARAD, ahogy eddig
  "source_links": ["https://…", "…"], // MIND, amiből a cikk készült   ← ÚJ
  "merged_from":  3                   // hány hírből — naplóhoz és méréshez ← ÚJ
}
```

`source_link` szándékosan marad egyértékű, hogy a mai olvasói ne törjenek el.
**Kik olvassák valójában** (ellenőrizve — a terv első változata rossz fájlokat
nevezett meg):

| olvasó | mire |
|---|---|
| `agents/ceo/desk.js:127-132` | a mai duplikátum-zár |
| `agents/ellenorzo/agent.js:855` | prompt-kontextus |
| `core/guide-claims.js:300-315` `hasUsableSource()` | az útmutató UI-állítás kapuja |
| `website/build.js:1061` | beolvassa, de sehol nem használja — **holt adat** |

A truth-gate, a SEO-őr és a 90 napos házmester **NEM** használja: a truth-gate a
markdown törzséből szedi a linkeket, a másik kettő a `_meta.slug`-ra és a
`_meta.published_at`-ra épül.

## 5. Számvitel

> **A terv első változata itt tévedett, és ez fordította volna a visszájára az
> egész ígéretet.** Az állítás az volt, hogy „a keret cikket számol, tehát ugyanaz
> a 8 cikk születik". A *számláló* valóban cikket számol
> (`agents/ceo/agent.js:215-226`), **de a keret az író draft-számára van ráadva**:
> `agents/ceo/agent.js:495` → `--limit N` → `agents/iro/agent.js:645`
> `drafts.slice(0, args.limit)`. Ma a kettő egybeesik, mert 1 draft = 1 cikk.
> Összevonás után **nem**: 8 draftból 5 cikk lenne, vagyis az összevonás
> **csökkentené** a napi cikkszámot.

**A javítás:** az író `--limit` kapcsolójának jelentése draftról **cikkre** vált.
Az író addig vesz draftokat, amíg `N` cikket meg nem írt — egy 3-as csoport egy
cikknek számít, és három draftot fogyaszt. A `--limit` így azt jelenti, amit a
CEO amúgy is ért rajta („ennyi cikk fér még ma bele").

Következmény: **több hír dolgozódik fel ugyanannyi cikk alatt**. Pontosan ez a
kívánt hatás — több anyag, kevesebb ismétlés.

⚠️ A draft-készlet ettől gyorsabban fogy. Ha egy nap kevés a draft, az író
kevesebb cikket ír — ez ma is így van, nem új kockázat.

Terjesztésre nincs hatása: a közösségi sorban jelenleg 265 poszt vár, napi 9 megy
ki — a szűk keresztmetszet a sor, nem a cikkellátás.

## 6. Tesztelés

Ingyenes, hálózat nélküli tesztek (`core/*.test.js`), a **valódi** esetekkel:

| próbaeset | elvárás |
|---|---|
| a 4 azonos URL-ű duplikátum-pár | a második megíródása **megelőzve** (URL-kulcs) |
| Gemini-pár: `gemini-36-flash` vs `gemini-3-6-flash` | a **CÍM-kulcs** fogja meg — az URL-kulcs itt bizonyítottan nem elég |
| `https://aiworldhq.com` mint forrás | **NEM** kerül a zárolt kulcsok közé |
| összevont cikk `source_links` mezője | mindegyik URL zárolva |
| Midjourney 07-23, öt frissítés | **összevonandó** |
| **OpenAI 07-22, öt független bejelentés** | **NEM vonható össze** |
| Opus 5 hármas, három forrásból | **összevonandó** (kereszt-forrás) |
| az ítélet hibázik / üres / szemét | minden draft külön cikk |
| 6+ elemű csoport | 5-re vágva |

A legfontosabb a kiemelt sor: az őrzi, hogy ne váljunk mohóvá. Egy összevonás,
ami független témákat gyúr egybe, rosszabb a jelenlegi állapotnál.

## 7. Kockázatok

| kockázat | ellenszer |
|---|---|
| az ítélet túl mohó, független témákat von össze | max 5-ös korlát + kötelező közös téma + az OpenAI-teszt |
| az ítélet sosem von össze semmit | mérhető: `merged_from` a napi riportban |
| a beolvasztott hír később újra megíródik | a zár a `source_links[]`-et is nézi (teszt őrzi) |
| egy összevont cikk gyengébb, mint két külön | a meglévő minőségi kapuk változatlanul futnak |
| két, egymástól eltérően normalizáló duplikátum-fogalom él egyszerre | a `desk.js` is a `core/source-lock.js`-re áll át, nem marad saját `isDuplicate()` |
| a `--limit` jelentésváltása elrontja a napi keretet | teszt a cikk-számlálásra; a napi riport cikkszáma az élő ellenőrzés |

## 8. Utólagos mérés

Egy hét után megnézendő: hány cikk született `merged_from > 1`-gyel, és a
forrás-zár hányszor fogott. Ha az összevonás egyszer sem történt meg, az ítélet
vagy a korlátok túl szigorúak — a szám nélkül ezt nem lehetne látni.
