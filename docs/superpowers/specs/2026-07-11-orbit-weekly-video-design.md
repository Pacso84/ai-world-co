# Orbit — heti avatár-videó a "This Week in AI" cikkbe (terv)

**Dátum:** 2026-07-11 · **Státusz:** user által jóváhagyva (chat), építés előtt
**User-döntések:** honlapba ágyazva (nem FB/YT) · csak angolul · $0 "hírolvasó-kártya" formátum (nem lip-sync) · avatár: barátságos 3D robot a borítók stílusában · név: **Orbit**

## Cél

Minden vasárnap a heti összefoglaló cikk ("This Week in AI") tetején megjelenik egy ~60-90 mp-es videó: Orbit, az állandó AI-hírbemondó karakter elmondja a hét 5 sztoriját. Ausztrál akcentusú természetes TTS-hang + szóra pontos, égetett feliratok. Teljesen automata, $0/hét.

## Őszinteség

Orbit nyíltan AI ("I'm Orbit, your AI news anchor"). Illik a Rólunk-oldal elveihez; a videó alá AI-disclosure kerül.

## Architektúra (3 új elem + 1 egyszeri asset)

1. **Egyszeri: Orbit karakter** — Flux-szal generálva (designer backend), user választ a variánsokból. Fájl: `website/assets/orbit.png` (1024², márka-krém háttérrel). SOHA nem változik.

2. **`agents/video/agent.js`** — vasárnap fut (guard: UTC vasárnap + heti state-dedup `memory/video-state.json`; `--force` teszthez). Lépések:
   - megkeresi az AKTUÁLIS heti publikált weekly-digest cikket (tags: weekly-digest, ISO-hét egyezés) — ha nincs, kihagyja (a digest 1 futással előbb készül)
   - AI-val (free-first, config `agents.video`) ~150-170 szavas beszélt szkriptet ír a cikkből: köszönés Orbitként → 5 sztori 1-2 mondatban → outro ("read the full stories on aiworldhq.com")
   - TTS: `msedge-tts` npm csomag, hang: `en-AU-NatashaNeural`; a WordBoundary eseményekből szó-időzítés
   - kimenetek (COMMITOLVA, ~1 MB/hét): `website/assets/video/weekly.json` (week, slug, title, script, szó-időzítések), `weekly.mp3`
   - hiba esetén (TTS elromlik): kihagyás + Telegram-jelzés, a cikk attól még él

3. **`core/video-compose.js`** — MINDEN futásban a build után (gyors, ~30-60 mp): ha van `weekly.json`:
   - sharp: 960×540 "stúdió-kártya" PNG (krém háttér, Orbit balra, cím + AI WORLD HQ brand)
   - a szó-időzítésekből .ass felirat-fájl (styled, szavanként úszó kiemelés)
   - ffmpeg (ubuntu runneren előre telepítve): kártya-kép loop + mp3 + égetett felirat + haladás-csík → `website/public/assets/video/weekly-<ISO-hét>.mp4` (~4-6 MB, h264+aac)
   - az mp4 NINCS commitolva (repo-hízás ellen) — minden futás újragenerálja a cache-elt mp3-ból

4. **`website/build.js`** — a digest-cikk oldalán (slug egyezés a weekly.json-nal): `<video controls preload="metadata" poster>` blokk a cím alá + AI-disclosure sor. Ha a json hete régi (>8 nap), nem ágyaz be.

## Workflow (auto.yml)

- Videó-agent lépés a "Heti összefoglaló + összehasonlító" után: `node agents/video/agent.js || true`
- Compose lépés a build/i18n-őrszem után, deploy előtt: `node core/video-compose.js || true`

## Hibakezelés

- TTS-hiba → skip + Telegram (napi throttle nem kell, heti 1 futás)
- ffmpeg hiányzik (helyi Windows) → compose skip figyelmeztetéssel; felhőben adott
- digest még nincs publikálva vasárnap hajnalban → az esti futás elkapja (state csak SIKER után íródik)

## Költség / kockázat

- $0/hét (szkript: free pool; TTS: ingyenes; ffmpeg: runner)
- Kockázat: msedge-tts nem hivatalos → törhet; ilyenkor videó kimarad, minden más él. Később fizetős TTS-re (vagy lip-sync SaaS-ra) cserélhető ugyanebben a csőben.

## Siker-kritérium

Vasárnap a digest-cikk tetején lejátszható, feliratozott, ausztrál hangú Orbit-videó van; hétfőn a Cloudflare-mérőben látszik, nézik-e.
