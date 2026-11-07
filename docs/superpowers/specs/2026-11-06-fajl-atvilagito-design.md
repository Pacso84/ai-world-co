# 🔎 Fájl-átvilágító — terv (2026-11-06)

## Cél és miért

A user (11-06): „nem tudnánk olyat, hogy pl. egy fotó vagy zene nem tartalmaz-e kártékony valamit?” → a javasolt formára: „pontosan ezt! ezen induljunk el!”

Az olvasóink (≈82% Facebookról, telefonon, sok idősebb, nem műszaki ember) Messengeren, WhatsAppon, e-mailben kapnak fájlokat ismeretlenektől vagy feltört ismerősi fiókokból. A valódi JPG/PNG/MP3 szinte soha nem veszélyes; a csalás **álcázás**: program fotónak nevezve, dupla kiterjesztés, kódot rejtő SVG, adathalász HTML-melléklet, jelszavas ZIP programmal, makrós Word, PDF rejtett kóddal. Az eszköz ezeket a trükköket ismeri fel, és közérthetően elmondja, mit jelentenek és mit tegyen az olvasó.

Ez a harmadik ingyenes eszköz a 🛡️ Biztonságos bemásolás és a 🧩 Promptépítő mellett (`core/ingyenes-eszkozok.js`), ugyanazzal a felfogással: **a fájl nem hagyja el a készüléket**.

Mérhető cél: a Prompt-tár eszközsávjából + a saját posztjából érkező megnyitások (CF RUM `/file-check`), és később keresés („is this file safe”, „check file for virus”).

## Célok
- Az olvasó kiválaszt (telefon: fájlválasztó; gép: húzd ide is) EGY fájlt → másodperceken belül eredmény.
- Felismeri, **mi a fájl valójában** (a belseje alapján), és összeveti a nevével.
- Felismeri az alábbi „árulkodó jeleket” (lásd *Ellenőrzések*), mindegyikhez egy egyszerű mondat: mit jelent + mit tegyen.
- Háromszintű összegzés: 🟢 „Nem találtunk árulkodó jelet” · 🟡 „Légy óvatos” · 🔴 „Ne nyisd meg”.
- Megmutatja a fájl ujjlenyomatát (SHA-256), és ad egy gombot: **„Nézd meg a VirusTotalon is”** → `https://www.virustotal.com/gui/file/<sha256>` új lapon. Csak az ujjlenyomat megy át a linkben, a fájl nem.
- 3 nyelv (en / hu / es), telefonon és gépen is.

## Nem célok
- **Nem vírusirtó**, nem ígér vírusmentességet. Vírusadatbázist nem építünk be: a VirusTotal ingyenes API-ja üzleti termékben/szolgáltatásban TILOS (docs.virustotal.com/reference/public-vs-premium-api), a MalwareBazaar-é üzleti célra fizetős lehet (bazaar.abuse.ch/api) — nekünk hirdetéseink vannak → csak LINK a VirusTotal saját oldalára, API-hívás nincs.
- Nincs feltöltés, nincs szerver, nincs Worker, nincs MI-hívás, nincs külső könyvtár (user 10-21: saját kód, „semmi ne utaljon szerzőre”).
- Egyszerre egy fájl; mappa, több fájl NEM.
- Fájl „megjavítása”, tisztítása, kicsomagolása letöltésre NEM.

## Anti-célok (ha ez történik, kudarc, még ha „működik” is)
- **Hamis biztonságérzet:** a zöld eredmény szövege SOHA nem „biztonságos / safe / seguro”, hanem „nem találtunk árulkodó jelet — ez nem garancia”. Kódőr (teszt) tiltja a szavakat a zöld szövegben.
- **Fölösleges riadalom a családi fotókon:** a telefonok „élő fotói” (JPEG végén MP4-videó), HEIC-képek, a sima MP3-ak ID3-címkéi, a képernyőképek NEM adhatnak 🟡/🔴-t.
- Készüléknevet (kameragyártó/modell) NEM írunk ki — a metaadatot nem is olvassuk ki erre a célra.
- Ár nincs, összehasonlítás nincs.

## Megkötések (meglévő szabályok)
- Saját kód, ES5-szerű szintaxis, **lookbehind nincs** (régi iOS-es Facebook-böngésző). A felismerő mag egy exportált függvény, amelynek FORRÁSA kerül az oldalba (`toString`), mint az `eszkozMag()` → a Node-teszt és a böngésző ugyanazt futtatja.
- COOP/COEP fejléc nincs (AdSense); SharedArrayBuffer nem kell.
- A fájlt `File.slice()` + `FileReader`/`arrayBuffer()` darabokban olvassuk; nagy fájlból csak az eleje, a vége, és ZIP-nél a központi könyvtár. Felső korlát a teljes beolvasásra (SHA-256-hoz) — lásd *Builderre hagyva*.
- SHA-256: `crypto.subtle.digest` (HTTPS-en elérhető). Ha nincs (régi böngésző), az ujjlenyomat-rész egyszerűen elmarad, a többi működik.
- Oldalanként EGY hirdetés, az eszköz ALATT, gomboktól távol (AdSense-szabályunk). Béta-jelzés, mint a másik kettőn.
- Telefonon semmilyen lista nem csúszik oldalra (user-szabály) — a találatok tördelve.
- Nem angol oldalon nincs angol mondat (i18n-őr). A szövegek a `core/ingyenes-eszkozok-szoveg.js` mintájára.
- Egy H1 / lap (kimenet-őr).
- Teszt a VALÓDI sablonból: a build által előállított oldal HTML-jéből kell ellenőrizni a hirdetés helyét / a H1-et / az i18n-t (10-17-i tanulság).
- Build-próba csak scratchpad-másolatban + `node core/output-guard.js`. Helyben deploy SOHA, a CI épít.

## Hol jelenik meg
- Saját oldal: **`/file-check`** (en), `/hu/file-check`, `/es/file-check` — `ESZKOZ_UTAK` bővül `fc: 'file-check'`-kel; sitemap, JSON-LD (`WebApplication`, mint a másik kettőnél).
- A **Prompt-tár tetején** az eszközsávban 3. kártyaként (saját mini-mintával, lásd *Dizájn*).
- A két meglévő eszköz alján lévő „fx-more” sorba is bekerül.
- Nevek (Claude döntése, a user átírhatja): en **„File Check — Is this file safe to open?”**, hu **„Fájl-átvilágító — Biztonságos megnyitni ezt a fájlt?”**, es **„Revisor de archivos — ¿Es seguro abrir este archivo?”**. A H1 kérdés („…safe to open?”) a keresési szándékot fedi; a VÁLASZ szövegei sosem mondják, hogy biztonságos.

## Felismerés — mi a fájl valójában (első bájtok)
Legalább: JPEG, PNG, GIF, WebP, HEIC/HEIF/AVIF (ftyp), BMP, TIFF, ICO · MP3 (ID3 vagy frame-sync), M4A/MP4/MOV (ftyp), WAV, OGG, FLAC, AAC · PDF · ZIP-család (ZIP, DOCX/XLSX/PPTX, DOCM/XLSM, APK, JAR, EPUB — a ZIP tartalomjegyzékéből) · RAR, 7z, GZIP · régi Office/MSI (OLE, D0CF11E0) · RTF · **Windows-program (MZ)**, Linux (ELF), Mac (Mach-O) · Windows-parancsikon (LNK) · ISO/IMG lemezkép · szöveges: HTML, SVG, JS/VBS/BAT/CMD/PS1/HTA (kiterjesztés + tartalom-minta).
Sima szöveg is felismert típus: ha a tartalom olvasható UTF-8 szöveg, és a kiterjesztés szöveges (.txt .csv .vcf .ics .json .md .xml .log), az „egyező”.
Ha nem ismerjük fel: „ismeretlen fájltípus” → 🟡 csak akkor, ha a neve mást állít (pl. .jpg, de nem kép). **Ha nem ismerjük fel ÉS a neve sem állít semmi gyanúsat (vagy nincs kiterjesztése): NEGYEDIK, semleges állapot ⚪ „Ezt a fájltípust nem tudjuk átvilágítani”** + a 🔴/🟡 név-ellenőrzések (2–4.) ettől még futnak; ⚪ mellett is ott a VirusTotal-gomb és a „ha ismeretlentől jött, kérdezz rá” tanács. Felismert típus kiterjesztés nélkül → a tartalom alapján döntünk, a „név nem egyezik” jel (11.) nem jár. (Claude döntése, builder-ellenőrzés 1. kérdés.)

## Ellenőrzések (árulkodó jelek)
Minden jelnek van: azonosító, szint (🔴/🟡/ℹ️), rövid cím, egy mondatos magyarázat, „mit tegyél”. Az összesítő a legsúlyosabb jel szintje.

**🔴 Ne nyisd meg**
1. **Program, fotónak/zenének/dokumentumnak álcázva**: a belseje MZ/ELF/Mach-O/APK/LNK/HTA/script, a neve kép/hang/videó/dokumentum.
2. **Dupla kiterjesztés** veszélyes véggel: `nyaralas.jpg.exe`, `dal.mp3.scr`, `szamla.pdf.apk`; ide tartozik a sok szóköz a kiterjesztés előtt.
3. **Megfordított írásirány karakter** (U+202E és rokonai) a fájlnévben (`kep‮gpj.exe` → „kepexe.jpg”-nek látszik).
4. **Futtatható/veszélyes típus** önmagában: .exe .scr .com .bat .cmd .pif .msi .vbs .vbe .js .jse .wsf .hta .ps1 .lnk .apk .jar .iso .img (és ha a belseje ilyen) — a magyarázat: „ez egy program, nem fotó/zene; ismeretlentől soha ne indítsd el”.
5. **SVG-kép rejtett kóddal**: `<script`, `on…=` eseménykezelő, `javascript:`, `<foreignObject`, `<iframe`/`<embed`/`<object`, külső oldalra vivő link vagy átirányítás.
6. **HTML-melléklet** jelszó-/bejelentkező mezővel vagy űrlappal, vagy átirányítással (tipikus adathalász „számla.html”). HTML önmagában → 🟡.
7. **ZIP/archívum programmal benne** (bármelyik bejegyzés a 4. pont listájáról, vagy dupla kiterjesztésű).
8. **Office-fájl makróval** (OOXML-ben `vbaProject.bin`; .docm/.xlsm/.pptm; régi OLE-ban VBA-jelek).
9. **PDF automatikusan futó művelettel**: `/JavaScript` vagy `/JS`, `/Launch`, beágyazott fájl (`/EmbeddedFile`).
10. **Kép vagy hang, aminek a végéhez program/archívum van fűzve** (a kép vége-jele után MZ/PK/RAR/7z kezdet).

**🟡 Légy óvatos**
11. A név és a belső tartalom nem egyezik, de nem program (pl. .jpg, ami valójában PDF vagy ZIP).
12. **Jelszóval védett ZIP/archívum** (a csalók így kerülik ki a vírusirtót) — magyarázat: „ha ismeretlentől jött jelszóval, ne bontsd ki”.
13. PDF `/OpenAction` vagy `/AA` (megnyitáskor induló művelet) JavaScript nélkül; Office-fájl külső **sablonra, OLE-objektumra, keretre (frame) vagy aldokumentumra** mutat (`TargetMode="External"` CSAK ezeknél a kapcsolattípusoknál: attachedTemplate, oleObject, frame, subDocument). A **sima hiperhivatkozás NEM jel** — azok domainjeit ℹ️-ként listázzuk, mint a PDF-linkeket (17.). (Claude döntése, builder-ellenőrzés 2. kérdés.)
14. HTML-fájl (űrlap/átirányítás nélkül), RTF, régi Office-fájl (OLE) makró-jel nélkül → „olyan fájl, amit csalók gyakran használnak — csak akkor nyisd meg, ha tudod, kitől jött”.
15. Ismeretlen fájltípus, aminek a neve mást állít.

**ℹ️ Tájékoztatás (nem rontja az összesítést)**
16. **Élő fotó**: a JPEG végén MP4-videó (ftyp) → „ez valószínűleg egy élő fotó a hozzá tartozó rövid videóval — normális”.
17. A PDF-ben lévő külső linkek száma és a domainjeik listája (max. ~10) — „kattintás előtt nézd meg, hová visznek”.
18. MP3 ID3-címkében lévő link (WXXX/W*** keret) → kiírjuk a domaint.
19. Kis, nem futtatható „maradék” bájtok a kép végén (néhány KB alatt, nem MZ/PK) → nem jelezzük (sok normális kép ilyen).

Ha egyik jel sincs, és a típus ismert, egyező → 🟢. A 🟢 doboz mindig tartalmazza: „Ez nem vírusirtó. Ha a fájl ismeretlentől jött, vagy furcsa kísérőszöveggel, akkor is légy óvatos.” + a VirusTotal-gomb.

## Mit tegyél (dobozok)
- 🔴: „Ne nyisd meg, ne telepítsd. Ha ismerőstől jött, más úton (telefon) kérdezd meg, ő küldte-e — a fiókját feltörhették. Töröld az üzenetet.”
- 🟡: „Csak akkor nyisd meg, ha tudod, kitől jött és miért. Kérdezz rá más úton.”
- Mindhárom szinten: link egy meglévő/eljövendő útmutatónkra, ha van illő (builderre hagyva; ha nincs, elmarad — kitalált link TILOS).

## Dizájn
- A user-szabály szerint az eszköz MUTASSA, amit csinál („ne gagyi”, nem űrlap): **„átvilágító” / röntgen-kép** — a fájl ikonja egy szkenner-kereten halad át (egyszeri animáció, `prefers-reduced-motion` mellett nincs), a végén **pecsét** (a Biztonságos bemásolás „fx-stamp” mintájára) a szinttel; alatta a jelek kártyákban.
- Mini-minta a Prompt-tár sávjában: egy „nyaralas.jpg” ikon, ami az átvilágítón „.exe”-nek látszik, piros pecséttel.
- „Próbáld ki mintával” gombok (a Biztonságos bemásolás „Példa” gombjának megfelelője): 2–3 BEÉPÍTETT, ártalmatlan mintafájl, amit a kód memóriában állít elő (pl. „nyaralas.jpg”, ami valójában MZ-fejléc + néhány bájt, futtathatatlan; egy rendes kis PNG; egy szkriptes SVG szövege). Valódi kártevő SOHA nem kerül a repóba vagy az oldalba.
- Világos + sötét mód, 390 px mobil, nagy betű, nagy érintési célok; a fájlválasztó gomb nagy és egyértelmű („Válassz egy fájlt”); gépen „vagy húzd ide”.
- Adatvédelmi sor (🔒): „A fájl a készülékeden marad — semmit nem töltünk fel.”
- Facebook alkalmazáson belüli böngésző: a fájlválasztónak ott is működnie kell (iOS: Fotók/Fájlok); élesítés előtt ellenőrizni. **Ha valahol nem működik, az élesítést NEM tartjuk vissza**: a Facebook-böngészőt felismerjük (user-agent: FBAN/FBAV/FB_IAB/Instagram), és egy tipp jelenik meg: „Ha nem tudsz fájlt választani, nyisd meg ezt az oldalt a böngésződben (⋯ → Megnyitás böngészőben)”. (Claude döntése, builder-ellenőrzés 3. kérdés.)
- Lenyitható „**Hogyan jut ide a kapott fájl?**” rész: Messenger/WhatsApp mellékletből előbb mentés (iPhone: Megosztás → Mentés a Fájlokba / Kép mentése; Android: Letöltés), utána itt a fájlválasztóval kiválasztható. Készüléknevet nem írunk (iPhone/Android mint platform rendben van, modellnév nem).

## Szöveg-szabályok
- Közérthető, rövid mondatok, idősebb olvasóra szabva; szakszó csak magyarázattal (pl. „ujjlenyomat (SHA-256)”).
- Tilos a zöld szinten: „safe”, „clean”, „virus-free”, „biztonságos”, „tiszta”, „vírusmentes”, „seguro”, „limpio”, „sin virus” (teszt fogja).
- Az eszközt nem nevezzük vírusirtónak / víruskeresőnek / antivirusnak.

## Tesztek (`core/fajl-atvilagito.test.js`, a `run-tests.js` futtatja)
- Minden típusfelismerés: pozitív minta (kézzel összerakott bájt-tömb) + negatív.
- Minden 🔴/🟡 jel: legalább 1 pozitív, 1 negatív minta; a ℹ️ élő fotó NEM ad 🟡/🔴-t; sima MP3 ID3-mal, PNG, HEIC, képernyőkép-szerű PNG → 🟢.
- Fájlnév-esetek: dupla kiterjesztés, U+202E, sok szóköz, nagybetűs kiterjesztés (.JPG.EXE), ékezetes név.
- ZIP: tartalomjegyzék olvasása, titkosítás-bit, program a bejegyzések között, DOCX vs DOCM, APK felismerése.
- Zöld-szöveg tilalom 3 nyelven; nincs angol mondat hu/es-ben; 1 H1; 1 hirdetés az eszköz alatt — a buildelt oldalból.
- A mag nem használ lookbehindot, és nincs benne külső hivatkozás (mint az eszkozMag-tesztben).

## Élesítés
1. Kód + teszt → scratchpad build-próba + kimenet-őr.
2. **Előnézet a usernek** Chrome-ban (helyi szerver, élő keret + 390 px mobil-iframe), világos + sötét → user jóváhagyás.
3. Push → a CI épít; élőben ellenőrzés en/hu/es (oldal, hirdetés, Prompt-tár kártya, sitemap).
4. Bejelentés: FB-poszt (4:5 kép „FREE” jelvénnyel) + Threads (?src=th) + TikTok (a képen olvasható URL) — a szöveget előtte a usernek magyar fordítással megmutatni. Lájkot/megosztást nem kérünk.
5. Mérés: 1 hét múlva a CF RUM-ból a megnyitások.

## A user döntései
| Kérdés | Döntés |
|---|---|
| Kell-e ilyen eszköz? | Igen: „pontosan ezt! ezen induljunk el!” (11-06) |
| Vírusirtó-ígéret / beépített vírusadatbázis | Nincs (licenc + becsület) — Claude javaslata, a user nem ellenkezett; VirusTotal csak linkként |

## Claude döntései (a user átírhatja)
- Név, útvonal (`/file-check`), hely (Prompt-tár sáv 3. kártya + saját oldal).
- Az ellenőrzés-lista és a szintek (fent).
- Beépített ártalmatlan mintafájlok a kipróbáláshoz.
- Egyszerre egy fájl; nincs MI.
- ⚪ negyedik, semleges állapot a fel nem ismert, gyanútlan nevű fájlokra; sima szöveg felismert típus.
- Office-hiperhivatkozás csak ℹ️; csak külső sablon/OLE/keret/aldokumentum 🟡.
- A Facebook-böngésző nem akadály az élesítésnek; tipp + „hogyan jut ide a kapott fájl” rész.

## SEO (2026-11-07, agent-javaslat; user: „legyen SEO-biztos!”)
- Slug: `/file-check` mindhárom nyelven (a hreflang egy közös `pagePath`-ot vár, a másik két eszköz is angol slugot használ).
- A „safe / biztonságos / seguro” CSAK kérdésként: `<title>`, H1, GYIK-kérdés. Leírásban, leadben, válaszokban, OG-címben SEHOL. A „virus check / vírusos-e” kulcsszót kihagyjuk (ígéretnek hatna).
- Új build-mezők kellenek: külön `metaTitle` (a jelenlegi `${name}: ${h1} — AI WORLD HQ` + 65 karakteres vágás rossz címet adna) és külön `ogTitle` (most az OG-cím = `<title>`); FAQPage JSON-LD (a GYIK főleg oldalon belüli érték).

| | en | hu | es |
|---|---|---|---|
| Név | File Check | Fájl-átvilágító | Revisor de archivos |
| `<title>` | File Check: Is This File Safe to Open? — AI WORLD HQ | Fájl-átvilágító: biztonságos-e a fájl? — AI WORLD HQ | Revisor de archivos: ¿es seguro abrirlo? — AI WORLD HQ |
| H1 | Is this file safe to open? | Biztonságos-e megnyitni ezt a fájlt? | ¿Es seguro abrir este archivo? |
| Meta | Free file check in your browser: see what a file really is and spot disguised programs, like a “photo” that is secretly an .exe. Nothing is uploaded. | Ingyenes fájl-ellenőrzés a böngésződben: megmutatja, mi a kapott fájl valójában, és jelzi az álcázást (pl. fotónak látszó program). Nincs feltöltés. | Revisión gratis en tu navegador: comprueba qué es en realidad un archivo y detecta programas disfrazados, como una “foto” que es un .exe. No se sube nada. |
| Lead | Pick a photo, song, PDF or ZIP you were sent. We look at what it really is inside and warn you about disguises. The file stays on your device. Nothing is uploaded. | Válaszd ki a kapott fotót, zenét, PDF-et vagy ZIP-et. Megnézzük, mi van valójában benne, és figyelmeztetünk az álcázásra. A fájl a készüléken marad, semmit nem töltünk fel. | Elige la foto, la canción, el PDF o el ZIP que te enviaron. Miramos qué hay realmente dentro y te avisamos de los disfraces. El archivo se queda en tu dispositivo: no se sube nada. |
| OG-cím | Got a “photo” from someone? Check what the file really is | „Fotót” kaptál valakitől? Nézd meg, mi a fájl valójában | ¿Te mandaron una “foto”? Comprueba qué es el archivo en realidad |

GYIK (mindhárom nyelven, a válasz sosem ígér biztonságot): (1) Biztonságos-e megnyitni? → nem ígérhetjük, ismert trükköket keresünk, a „nincs jel” nem garancia · (2) Feltöltődik a fájl? → nem; a VirusTotal-gombnál csak az ujjlenyomat (SHA-256) megy a linkbe · (3) Hogyan lehet egy „fotó” program? → nyaralas.jpg.exe, a vége számít, a készülék elrejti; mi a belső bájtokat olvassuk · (4) Ez vírusirtó? → nem, álcázást és kockázatos típust jelez; a készülék saját védelme maradjon bekapcsolva · (5) Mit tegyek, ha kockázatos? → ne nyisd meg, ismerőst telefonon kérdezd meg, töröld az üzenetet. (A pontos szövegek az agent-jelentésben: a 2. rész ebből dolgozik.)

## 1. rész — felismerő mag ✅ (2026-11-07)
- `core/fajl-atvilagito.js` (`fajlMag()`, toString-tel kerül majd az oldalba) + `core/fajl-atvilagito.test.js` (23 teszteset, kézi bájtmintákkal).
- Olvasási korlát: ≤ 32 MB a teljes fájl; fölötte az elejéből és a végéből 2-2 MB (a ZIP tartalomjegyzéke a végén van). Kibontás (saját inflate): részenként ≤ 4 MB, fájlonként ≤ 16 MB.
- Valódi fájlokon mérve (534 db: a projekt képei/PDF-jei, Windows háttérképek/hangok, .exe/.dll): 0 eltérés a várttól; a leglassabb 11 MB-os PDF 0,2 s.
- Builder-döntések a terv fölött (a user átírhatja):
  - PDF-kód: 🔴 csak, ha MAGÁTÓL indul (OpenAction / dokumentumszintű JavaScript / oldal-megnyitási művelet); a kitölthető űrlapok mezőkódja 🟡 (pl. hivatalos nyomtatványok — különben hamis 🔴).
  - PDF `/OpenAction` oldalra ugrással ([lap /Fit]) NEM jel; 🟡 csak megnyitáskor induló nem-kód műveletnél (link megnyitása, űrlapküldés…).
  - PDF-csatolmány: veszélyes név 🔴; e-számla XML/PDF/kép/szöveg csak ℹ️; ismeretlen 🟡.
  - Makrós formátum (.docm/.xlsm…) makró NÉLKÜL 🟡 (makróval 🔴).
  - 🟡 beágyazott OLE-/ActiveX-objektum (Office), jelszavas Office-fájl (OLE „EncryptedPackage”), RAR/7z/CAB, amibe nem látunk bele.
  - .txt-ben lévő szkript-szöveg nem jel (Jegyzettömb nyitja).
  - MSI telepítő felismerése az OLE gyökér-azonosítójából (fotónak/dokumentumnak nevezve 🔴).

## Builderre hagyva
- A pontos olvasási korlátok (mekkora fájlnál számolunk teljes SHA-256-ot; javaslat: ≤ 200 MB teljes, fölötte csak az ellenőrzések; mekkora darabot olvasunk az elejéből/végéből).
- A fájl-modul elnevezése és bontása (külön `core/fajl-atvilagito.js` + `-szoveg.js`, vagy a meglévő szövegfájl bővítése) — a meglévő mintát kövesse.
- Az animáció és a pecsét pontos kinézete, a meglévő `fx-` stílusokra építve.
- Illő útmutató-link kiválasztása a „mit tegyél” dobozba (csak létező slug).
