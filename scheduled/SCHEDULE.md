# ⏰ Ütemezés — "fut amíg alszol"

A teljes pipeline (`node agents/ceo/agent.js`) magától is lefuthat. Két mód:

## 1. 🌍 Felhő — GitHub Actions (AJÁNLOTT, gép nélkül, ingyen)

A géped lehet **kikapcsolva** — a pipeline a GitHub felhőjében fut.

**Aktiválás (élesítéskor):**
1. Töltsd fel a projektet GitHub-ra
2. A repón: **Settings → Secrets and variables → Actions → New repository secret**
   - `GOOGLE_API_KEY` (+ ha van: `ANTHROPIC_API_KEY`, `GROQ_API_KEY`, …)
3. Kész — a `.github/workflows/daily-pipeline.yml` szerint **minden nap** lefut
   (kézzel is indíthatod: Actions fül → Run workflow)

- Ingyenes: 2000 perc/hó (napi ~5 perc futás = ~150 perc/hó)
- Az új cikkeket + tanulást **visszamenti** a repóba
- Idő: 20:00 UTC = ~reggel 6-7 Sydney-ben (ausztrál reggeli olvasóknak)

## 2. 💻 Helyi — Windows Feladatütemező (a géped legyen bekapcsolva)

Gyors teszthez / amíg nincs felhő.

**Beállítás (egyszer):**
```powershell
powershell -ExecutionPolicy Bypass -File scheduled\register-task.ps1
```
Ez létrehoz egy napi 8:00-s feladatot, ami a `scheduled\daily.bat`-ot futtatja.
A kimenet a `logs\scheduled.log`-ba kerül.

**Törlés:**
```powershell
Unregister-ScheduledTask -TaskName "AIWorldDailyPipeline" -Confirm:$false
```

## Kézi futtatás (bármikor)
```powershell
node agents/ceo/agent.js            # teljes pipeline
node agents/ceo/agent.js --dry-run  # csak megmutatja mit csinálna
node agents/ceo/agent.js --report   # csak napi jelentés
```

---
⚠️ A te szabályod: **élesítés (deploy) csak akkor, ha minden agent kész és be van kötve.**
Az ütemezés most "készen áll", de a felhős aktiválás (GitHub push + secrets) a végső lépés.
