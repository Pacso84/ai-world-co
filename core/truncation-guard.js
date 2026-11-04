// ===================================================================
// CSONKA-KAPU (2026-08-25) — elvágott szöveg felismerése
// ===================================================================
// A LELET, ami kiváltotta (teljes hibakeresés, a user kérésére):
//   • 1592 fordítás-párból 12 CSONKA — mind mondat közepén ér véget,
//     némelyik SZÓ közepén ("…használd a `Ctrl + I` (vagy `Cmd + I` Mac‑").
//   • 796 angol cikkből 10 ugyanígy.
//   • Élő példa, amit az olvasó lát ma is a chat-and-create-with-meta-ai
//     oldalon: "…create a unique image for a birthday card or social media
//     post, all without " — és ott a cikk véget ér.
//   • A legrosszabb: automate-git-commands-with-github-copilot-suggestions
//     magyarul 5 lépés helyett 2. Az olvasó megtanulja, hogyan KÉRJEN
//     parancsot — és nem tudja meg, hogyan futtassa. A spanyol teljes.
//
// A GYÖKÉROK — core/ai-router.js, a keret-mentő feltétele:
//     if (safety.reason === 'Üres válasz' && … && cutByCeiling) { … }
// A rendszer LÁTJA a `finish_reason: "length"`-et (ki is olvassa), de csak
// akkor lép, ha a válasz ÜRES. A félkész válasz nem üres — 3893 karakter
// tökéletes magyar szöveg, ami félbeszakad —, tehát SIKERKÉNT megy tovább.
//
// MIÉRT NEM FOGTA MEG EGYIK MEGLÉVŐ KAPU SEM:
// A translation-guard három ellenőrzése (angol maradt-e a cím / a törzs /
// prompt-szivárgás) mind azt kérdezi, hogy ROSSZ-e a tartalom. Egyik sem
// azt, hogy MEGVAN-E AZ EGÉSZ. A csonka fordítás jó nyelvű, jó című,
// szivárgásmentes — csak a fele hiányzik.
// Ugyanaz a lecke, mint a prompt-szivárgásnál: MINDEN MÉRCE IRÁNYA SZÁMÍT.
//
// KALIBRÁCIÓ VALÓDI ADATON (nem kitalált példákon):
//   796 angol cikk → 11 jelölés, ebből 10 valódi csonkulás.
//   Az egy határeset (ai-image-basics) egy prompt-példával zárul, aminek
//   a nyitó `*` dísze nincs lezárva — a TARTALOM teljes. Vállalt ár:
//   inkább egy fölösleges jelzés, mint egy átengedett féloldalas cikk.
// ===================================================================

// A mondatvég UTÁN még állhat markdown-dísz és idézőjel: .* .** ." .` .*"
// Ez a rész elsőre kimaradt, és 102 hamis riasztást okozott — a cikkeink
// nagy része `*Written and edited by…*` aláírással zárul.
// (A visszapipa karaktert kódból építjük — sablonliterálban lezárná magát.)
const ZARO = '["\'”’)\\]*_' + String.fromCharCode(96) + ']*';

const LEZART = [
  new RegExp('[.!?…]' + ZARO + '\\s*$'),  // mondatvég (+ dísz)
  /^-{3,}$/,                                   // vízszintes vonal
  /\|\s*$/,                                    // táblázat-sor
  /^```/,                                      // kódblokk-határ
  /https?:\/\/\S+\s*$/,                        // forrás-URL-lel zárul
  /[:;]\s*$/                                   // kettőspont: felsorolást vezet be
];

/** Ennél rövidebb szövegen nem mondunk ítéletet (rövidhír, töredék). */
export const MIN_HOSSZ = 200;

/**
 * Elvágottnak látszik-e a szöveg?
 * CSAK a VÉGÉT nézi — ez szándékos: a csonkulás mindig ott van, és így
 * nincs szükség az eredetivel való összevetésre (az angol nem mindig van kéznél).
 * @param {string} md  markdown törzs
 * @returns {boolean}
 */
export function looksTruncated(md) {
  const s = String(md || '').trimEnd();
  if (s.length < MIN_HOSSZ) return false;
  const sorok = s.split('\n').map(x => x.trim()).filter(Boolean);
  const utolso = sorok[sorok.length - 1] || '';
  // Cím a legvégén = van fejezet-cím, de nincs alatta semmi.
  if (/^#{1,6}(\s|$)/.test(utolso)) return true;
  return !LEZART.some(re => re.test(utolso));
}

/**
 * A fordítás GYANÚSAN RÖVID-e az eredetihez képest?
 * Külön mérce, mert egy fordítás lehet szabályosan lezárt mondattal is
 * félbevágva — a `getting-started-cohere` spanyolja pont ilyen.
 *
 * MÉRVE 1592 élő páron: az egészséges fordítás az angol 100-110%-a
 * (a magyar és a spanyol tipikusan HOSSZABB). Mind a 12 csonka 61% ALATT
 * van, a legrövidebb 38%-on. A 0.62 tisztán elválasztja a kettőt:
 * 12 találat, 0 hamis riasztás.
 */
export const MIN_FORDITAS_ARANY = 0.62;

/**
 * Újra kell-e próbálni egy ELVÁGOTT választ bővebb kerettel?
 * A döntés itt él, nem a routerben, hogy tesztelhető legyen hálózat nélkül.
 *
 * Az ÜRES válasz NEM ide tartozik: azt a gondolkodás-mentő kezeli
 * (core/ai-router.js), más gyógyszerrel — ott a modell a gondolkodó-csatornába
 * írta el a keretet, itt a hasznos szöveg nem fért bele.
 */
export function shouldRetryTruncated({ finishReason, text, alreadyRetried, currentCeiling, nextCeiling } = {}) {
  if (alreadyRetried) return false;                       // modellenként EGYSZER
  if (finishReason !== 'length') return false;            // nem a keret vágta el
  if (!String(text || '').trim()) return false;           // üres → a másik mentőé
  const most = Number(currentCeiling), kov = Number(nextCeiling);
  if (!Number.isFinite(most) || !Number.isFinite(kov)) return false;
  return kov > most;                                      // van hova emelni
}

export function translationTooShort(enMd, trMd, kuszob = MIN_FORDITAS_ARANY) {
  const en = String(enMd || '').trim();
  const tr = String(trMd || '').trim();
  // Nincs mivel összevetni → NEM állítunk semmit. A "nem tudom" nem "nem".
  if (en.length < 400 || !tr.length) return false;
  return tr.length / en.length < kuszob;
}

// ===================================================================
// ŐRSZEM — végigméri a tárat, és a napi riportba szól
// ===================================================================
// A ház szabálya: az őrszem csak akkor ér valamit, ha ODASZÓL, AHOL A USER
// NÉZ. A CI naplójába írni annyi, mintha senkinek nem szólnánk. Ez a rész
// tehát `memory/truncation-guard.json`-t ír, amit a core/daily-report.js
// olvas be a napi Telegram-riportba.
//
// ⚠️ A LEFEDETTSÉGET IS KIÍRJUK. A magyar helyesírás-őrszem 773 cikkből
// 12-t nézett, mindig ugyanazt, és erre "0 hiba"-t jelentett — a naplóban
// ZÖLD volt. A néma siker és a néma vakság enélkül egyformán néz ki.

/**
 * Átnézi az egész tárat. Tiszta függvény: a fájlolvasást kívülről kapja,
 * hogy hálózat és lemez nélkül is tesztelhető legyen.
 * @param {{articles: Array<{file, md}>, translations: Map<string,{hu?,es?}>}} be
 */
export function scanCorpus({ articles = [], translations = new Map() } = {}) {
  const problems = [];
  let cikkNezve = 0, parNezve = 0;

  for (const a of articles) {
    const md = String(a?.md || '');
    if (md.trim().length < 400) continue;
    cikkNezve++;
    if (looksTruncated(md)) problems.push({ code: 'ARTICLE_TRUNCATED', file: a.file, lang: 'en' });

    const t = translations.get(a.file);
    if (!t) continue;
    for (const l of ['hu', 'es']) {
      if (!t[l]) continue;
      parNezve++;
      if (translationTooShort(md, t[l])) problems.push({ code: 'TRANSLATION_TRUNCATED', file: a.file, lang: l });
      else if (looksTruncated(t[l])) problems.push({ code: 'TRANSLATION_CUT_OFF', file: a.file, lang: l });
    }
  }
  return { problems, cikkNezve, parNezve };
}

// ---------- CLI: node core/truncation-guard.js ----------
const kozvetlen = process.argv[1] && process.argv[1].endsWith('truncation-guard.js');
if (kozvetlen) {
  const { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } = await import('fs');
  const { join, dirname } = await import('path');
  const { fileURLToPath } = await import('url');
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
  const A = join(ROOT, 'content', 'articles'), T = join(ROOT, 'content', 'translations');

  const articles = [], translations = new Map();
  if (existsSync(A)) {
    for (const f of readdirSync(A).filter(x => x.endsWith('.json'))) {
      try {
        articles.push({ file: f, md: JSON.parse(readFileSync(join(A, f), 'utf-8')).article_markdown || '' });
      } catch { /* romlott fájl — a többit attól még nézzük */ }
      if (existsSync(join(T, f))) {
        try { translations.set(f, JSON.parse(readFileSync(join(T, f), 'utf-8'))); } catch { /* ua. */ }
      }
    }
  }

  const { problems, cikkNezve, parNezve } = scanCorpus({ articles, translations });

  console.log('✂️  CSONKA-ŐRSZEM');
  console.log('─'.repeat(60));
  console.log(`   ${cikkNezve} angol cikk és ${parNezve} fordítás-pár átnézve`);
  if (!problems.length) console.log('   ✅ Nincs elvágott szöveg.');
  else for (const p of problems) console.log(`   ⚠️  [${p.code}] ${p.lang} · ${p.file.slice(0, 56)}`);

  try {
    mkdirSync(join(ROOT, 'memory'), { recursive: true });
    writeFileSync(join(ROOT, 'memory', 'truncation-guard.json'),
      JSON.stringify({ at: new Date().toISOString(), cikkNezve, parNezve, problems }, null, 2), 'utf-8');
  } catch { /* a lelet a naplóban akkor is ott van */ }
  process.exit(0);
}
