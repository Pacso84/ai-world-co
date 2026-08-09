# Új terjesztési csatornák — beállítási útmutató

**Készült:** 2026-08-09 · **Állapot:** a kód kész és él, a fiókok hiányoznak

Két csatorna maradt: **Threads** és **X**. Amíg a titkok nincsenek beállítva, a
poszterek **alszanak**: nem hibáznak, nem fogyasztanak, nem jelölnek meg semmit.

**A Make-fiókban jelenleg 1 forgatókönyv van** (Facebook, aktív). A Pinterestet
2026-08-09-én a user törölte — ellenőrizve a scenario-listán, nem csak a
`GET /scenarios/<id>` válaszán (az törölt forgatókönyvre 403-at ad, nem 404-et,
ami félrevezet).

---

## Miért épp ez a három

A Pinterest 30+ nap alatt 189 pinből **0 látogatót** hozott. A tanulság nem az,
hogy „a Pinterest rossz", hanem ez:

> Egy 0 követős fiók csak ott hoz forgalmat, ahol a platform **idegeneknek is
> megmutatja** a tartalmat.

A Facebook-oldalunknak **3 követője van**, mégis napi ~26 látogatót hoz — mert
a Meta ajánlómotorja kiteszi a posztjainkat olyanoknak, akik nem követnek
minket. A Pinterestnek nincs ilyen motorja kezdő fiókokhoz.

| Csatorna | Idegeneknek is mutat? | Make-művelet |
|---|---|---|
| **Threads** | Igen — ugyanaz a Meta-motor | ~2-3 / poszt |
| **X** | Részben (a külső linket visszafogja) | ~2-3 / poszt |
| ~~Flipboard~~ | *elvetve — lásd lent* | — |

---

## ⛔ Flipboard — ELVETVE (2026-08-09), ne fuss neki újra

Azért választottuk, mert nulla kódba és nulla Make-műveletbe került volna:
tisztán RSS. **Az ingyenes önkiszolgáló RSS-beküldés viszont megszűnt.**

Amit élesben ellenőriztem:

- `flipboard.com/publishers` → **301 egy FIZETŐS programra**
  („Publishers Paid Content Program"), nem az „Add your Content" űrlapra
- a magazin szerkesztőjében **nincs „sources" szakasz**, csak
  „URL hozzáadása" — azaz cikkenkénti KÉZI hozzáadás
- a Flipboard saját blogbejegyzései még a régi utat írják → **elavultak**

Napi 12 cikk kézi feltöltése nem fér bele („se időt, se pénzt" user-szabály),
ezért a csatorna kimarad. A user a fiókot törölte.

> **TANULSÁG:** ha egy szolgáltatás a SAJÁT dokumentációjától eltérő helyre
> irányít át, a funkció rendszerint megszűnt — a blogbejegyzést csak nem
> törölték. Ezt egyetlen `curl -L` megmutatja, mielőtt bárki fiókot csinál.

### Ami ebből MEGMARADT és értékes

A feed-javítások a helyükön maradnak, mert **minden hírolvasónak** jók
(Feedly, Inoreader, böngésző-kiegészítők), és egy valódi hiányt szüntettek meg:

- **kép minden tételben** (`<enclosure>` + `<media:content>`, valódi bájtmérettel)
- **teljes cikkszöveg** (`<content:encoded>`) — eddig csak az alcím ment ki,
  átlag 116 karakter; most 7 324

---

## 1. Threads — a legjobb esélyünk

**Fiók:** a Threads a meglévő Instagram/Facebook-fiókhoz köthető. Ha nincs
Instagram, a Threads regisztráció közben létrehozza.

**Make-forgatókönyv:**

1. `eu1.make.com` → **Create a new scenario**
2. Első modul: **Webhooks → Custom webhook** → *Add* → másold ki a címét
3. Második modul: **Threads → Create a Thread** (vagy „Publish a Post")
   - kösd össze a Threads-fiókkal
   - `text` mező → a webhook `text` mezője
   - `image_url` mező → a webhook `image` mezője
4. **Mentés**, majd a bal alsó kapcsolóval **bekapcsolás**
5. ⚠️ Jobb alul a fogaskerék → **Allow storing of Incomplete Executions: BE**

> A 5. pont nem elhagyható. Ez a `dlq` kapcsoló tartja életben a
> forgatókönyvet: ha ki van kapcsolva, **egyetlen hiba deaktiválja** az egészet.
> A Pinterest pontosan így állt le 2026-08-05-én.

**GitHub-titkok** (repó → Settings → Secrets and variables → Actions):

| Titok | Érték |
|---|---|
| `THREADS_MAKE_WEBHOOK_URL` | a 2. lépésben kimásolt cím |
| `THREADS_MAKE_SCENARIO_ID` | a forgatókönyv URL-jében lévő szám |

A második nem kötelező, de ha megadod, a napi Telegram-riport figyeli, hogy a
forgatókönyv él-e és van-e benne kimeneti modul.

---

## 2. X (Twitter)

Ugyanaz a menet, két eltéréssel:

- második modul: **X (Twitter) → Create a Post**
- titkok: `X_MAKE_WEBHOOK_URL` és `X_MAKE_SCENARIO_ID`

**Amire számíts:** az X a külső linkes posztokat erősen visszafogja, és egy
0 követős új fiók alig kap elérést. Ez a gyengébb fogadás a kettő közül.

---

## Amit a kód magától csinál

- **Napi 6 poszt csatornánként** (2 futásonként × 3 futás) — ugyanaz a kulturált
  tempó, mint a Facebooknál
- **Karakterkorlát:** Threads 500, X 280. Az X minden linket fixen 23
  karakternek számol (t.co), ezért ott több szöveg fér el, mint hinnéd
- **A link soha nem eshet ki** — csonkítás esetén a szöveg rövidül, nem a link
- **Kép csatornánként:** Threads 4:5 álló (mobil-első függőleges folyam),
  X 1,91:1 fekvő (az idővonala fekvő képre van szabva)
- **Örökzöld útmutatók** nem évülnek el, a helyek fele az övék
- **Hír csak 7 napig** megy ki

## Próba élesítés előtt

```
node agents/social/multi-poster.js --channel threads --limit 2 --dry
node agents/social/multi-poster.js --channel x --limit 2 --dry
```

A `--dry` semmit nem ír és nem küld — csak megmutatja, mi menne ki.

## Ha valaha vissza kellene hozni a Pinterestet

⚠️ **Már nem elég egy sor.** A poszter KÓDJA megvan (`agents/social/pinterest-poster.js`,
a hívása kikommentelve az `auto.yml`-ben), **de a Make-forgatókönyvet a user
törölte 2026-08-09-én** — azt újra fel kellene építeni, és új webhook-címet
beállítani a `PINTEREST_MAKE_WEBHOOK_URL` titokba.

Mielőtt bárki nekifutna, két szám: 189 pin → **0 látogató**, miközben a
művelet-keret **62%-át** vitte. Előbb a keretet nézd meg.

*(A régi `PINTEREST_MAKE_WEBHOOK_URL` GitHub-titok halott webhookra mutat.
Ártalmatlan — a posztert nem hívjuk —, de nyugodtan törölhető.)*
