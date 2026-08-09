# Új terjesztési csatornák — beállítási útmutató

**Készült:** 2026-08-09 · **Állapot:** a kód kész és él, a fiókok hiányoznak

A kód mindhárom csatornára megvan. Amíg a titkok nincsenek beállítva, a
poszterek **alszanak**: nem hibáznak, nem fogyasztanak, nem jelölnek meg semmit.

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
| **Flipboard** | Igen (téma-magazinok, RSS-ből) | **0** |
| **Threads** | Igen — ugyanaz a Meta-motor | ~2-3 / poszt |
| **X** | Részben (a külső linket visszafogja) | ~2-3 / poszt |

---

## 1. Flipboard — 5 perc, nulla művelet

Ez a legolcsóbb: nincs se forgatókönyv, se webhook, se művelet. A Flipboard
magát az RSS-t olvassa.

1. `flipboard.com` → regisztráció
2. Új magazin (pl. „AI World HQ")
3. A magazinban: **Add RSS feed** → `https://aiworldhq.com/feed.xml`

**Kész.** A feed 40 tételes, és 2026-08-09 óta **minden tételben van kép**
(`<enclosure>` + `<media:content>`) — enélkül a Flipboard szürke szövegdobozként
mutatna minket.

---

## 2. Threads — a legjobb esélyünk

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

## 3. X (Twitter)

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

## Ha vissza kell kapcsolni a Pinterestet

Egy sor a `.github/workflows/auto.yml`-ben (a kód érintetlen maradt). De előbb
nézd meg a művelet-keretet: a Pinterest napi 15 pinnel a keret 62%-át vitte.
