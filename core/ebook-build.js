// ===================================================================
// A FIZETŐS CSOMAGOK LEGYÁRTÁSA — HTML, majd PDF (2026-09-09 / 09-18)
// ===================================================================
// A VÁLOGATÁS a `core/ebook-pack.js`-ben lakik (tiszta, tesztelhető); itt
// csak az I/O és a formázás van.
//
// FUTTATÁS (a fejlesztő gépén, NEM a CI-ban):
//   node core/ebook-build.js                      → dist/ebook/starter-pack.html
//   node core/ebook-build.js --pdf                → + starter-pack.pdf (Chrome kell)
//   node core/ebook-build.js --tema work --nyelv es [--pdf]
//                                                 → dist/ebook/work-es.html|pdf
//   node core/ebook-build.js --mind [--pdf]       → mind a 9 csomag × 2 nyelv
//
// Témák: a `core/topics.js` nyolc azonosítója + `all` (a nagy gyűjtemény).
// Nyelvek: `en` (a cikk eredetije) és `es` (a kész fordításból — NEM hívunk
// se AI-t, se fordítót; a spanyol csomag $0).
//
// ⚠️ PARAMÉTER NÉLKÜL A RÉGI VISELKEDÉS MARAD (starter-pack.html, 8×5
// útmutató). Nem azért, mert az a legjobb termék, hanem mert a $9-es csomag
// KINT VAN; egy néma formátum-váltás a meglévő linket tenné hazuggá.
//
// ⚠️ MIÉRT NEM CI-LÉPÉS: a PDF-hez fejetlen Chrome kell, ami az ubuntusi
// futtatón nincs telepítve — és nem is kell: a csomag ritkán változik,
// egyszeri gyártás. A `dist/` a .gitignore-ban van (a repó PUBLIKUS, és egy
// 100 oldalas PDF minden változásnál új bináris lenne a történetben).
// ===================================================================

import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { marked } from 'marked';
import { csomag, valogat, cimBol, lepesSzam, szovegNyelven, szoSzam, oldalSzam, TERULETEK, NYELVEK } from './ebook-pack.js';
import { utmutatoE } from './guide-kind.js';
import { temaSzoveg } from './topics.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const KI_DIR = join(ROOT, 'dist', 'ebook');

/**
 * Az örökzöld útmutatók betöltése a válogatáshoz — a FORDÍTÁSSAL együtt.
 *
 * ⚠️ A FORDÍTÁS UGYANEBBŐL A LÉPÉSBŐL JÖN, nem egy másodikból: a
 * `content/translations/<ugyanaz a fájlnév>.json` `es` mezője. Ha külön
 * betöltés lenne, a két lista első félrecsúszásakor ismét az történne, hogy
 * a spanyol csomagba angol szöveg kerül — a hiba, ami 2026-08-04-én már
 * megtörtént. A „van-e használható spanyol" kérdést a `szovegNyelven()`
 * dönti el; itt csak beadjuk a nyers mezőt.
 */
export function utmutatokBetolt(dir = join(ROOT, 'content', 'articles'),
                                forditasDir = join(ROOT, 'content', 'translations')) {
  if (!existsSync(dir)) return [];
  const ki = [];
  for (const f of readdirSync(dir)) {
    if (!f.startsWith('ARTICLE_') || !f.endsWith('.json')) continue;
    let d; try { d = JSON.parse(readFileSync(join(dir, f), 'utf-8')); } catch { continue; }
    const m = d._meta || {};
    // „Útmutató-e?" — a közös core/guide-kind.js dönt (2026-09-16). A `slug`
    // külön feltétel marad: URL nélkül a PDF nem tud visszalinkelni.
    // ⚠️ Ez a hívó TAGADÓ alakban (`!== 'guide'`) írta a feltételt, ezért a
    // másolat-kereső első mintája NEM LÁTTA. A mérce IRÁNYA itt is számított.
    if (!utmutatoE(f, d) || !m.slug) continue;
    let es = '';
    const fUt = join(forditasDir, f);
    if (existsSync(fUt)) { try { es = JSON.parse(readFileSync(fUt, 'utf-8')).es || ''; } catch { es = ''; } }
    ki.push({ slug: m.slug, tool: m.tool || '', md: d.article_markdown || '', es });
  }
  return ki;
}

/**
 * A markdown TÖRZSE — frontmatter nélkül, a saját H1 nélkül (a címet mi adjuk).
 *
 * ⚠️ A SORREND SZÁMÍT, ÉS ELŐSZÖR ELRONTOTTAM: a `trim()` a H1-levágás UTÁN
 * futott, így a frontmatter után maradt üres sor miatt a `^#` minta nem
 * illeszkedett. A kész PDF-ben MIND A 25 útmutató címe KÉTSZER jelent meg
 * (31 `<h1>` a helyes 6 helyett). Egy fizetős terméknél ez nem szépséghiba.
 * Előbb TRIM, aztán vágás.
 */
export function torzs(md) {
  const s = String(md || '');
  const m = s.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  return (m ? s.slice(m[0].length) : s).trim().replace(/^#\s+.*(\r?\n)?/, '').trim();
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ===================================================================
// A FELÜLETI SZÖVEGEK NYELVENKÉNT — KÉZZEL ÍRVA, NEM GÉPI FORDÍTÁSSAL
// ===================================================================
// ⚠️ UGYANAZ A MINTA, MINT A `website/build.js` UI-táblái, és ugyanaz az oka:
// a `buildTopicPage()` 2026-09-10-én BEÉGETETT ANGOLLAL készült, és ezzel 16
// élő lap kapott angol címet spanyolul/magyarul. Egy FIZETŐS terméknél ez
// nem szépséghiba: a vevő spanyol csomagot vett.
//
// ⚠️ ÉS NEM A HELYSZÍNEN FORDÍTUNK: a felületi szöveg AI-val való fordítása
// minden gyártáskor pénzbe kerülne, és minden gyártáskor MÁS lenne. Ez a
// tábla egyszer készült el, és attól kezdve $0.
//
// 🇪🇺 A MI-JELÖLÉS MINDKÉT NYELVEN BENNE VAN (`aiSzerzo`). Az EU AI Act
// miatt kötelező, és épp gépi tartalom miatt vagyunk keresői büntetésben —
// egy eltitkolt szerzőség sokkal drágább lenne, mint a kimondása.
export const SZOVEG = {
  en: {
    htmlLang: 'en', ut: '',
    regiCim: 'The Everyday AI Starter Pack',
    nagyCim: 'The Everyday AI Collection',
    miniCim: (tema) => `Everyday AI: ${tema}`,
    alcim: (n) => `${n} step-by-step guides for real, everyday tasks`,
    tocCim: "What's inside",
    lepes: 'steps',
    online: 'Read online',
    oszinteCim: 'Before you start — what this is, honestly',
    ingyen: '<strong>Every guide in this pack is also free on our website.</strong> What you paid '
      + 'for is the selection, the offline copy you can print or keep on your phone, and a '
      + 'version with no ads and no cookie banners. If you would rather read them free online, '
      + 'that is completely fine — every guide links back to its page.',
    aiSzerzo: (site) => '<strong>These guides were written by our AI editorial team</strong> and reviewed for '
      + `accuracy and clarity, the same as everything on ${site}. We say this openly because you `
      + 'deserve to know who wrote what you are reading.',
    valtozas: '<strong>Apps change.</strong> Buttons move and menus get renamed. If a step does not '
      + "match what you see, the guide's online version is the newer one — the link is under "
      + 'every title.',
    koszonet: 'Thank you for supporting a very small, independent project.'
  },
  es: {
    htmlLang: 'es', ut: '/es',
    regiCim: 'IA para el día a día: paquete inicial',
    nagyCim: 'IA para el día a día: la colección completa',
    miniCim: (tema) => `IA para el día a día: ${tema}`,
    alcim: (n) => `${n} guías paso a paso para tareas reales del día a día`,
    tocCim: 'Qué incluye',
    lepes: 'pasos',
    online: 'Léela en la web',
    oszinteCim: 'Antes de empezar: qué es esto, con sinceridad',
    ingyen: '<strong>Todas las guías de este paquete están también gratis en nuestra web.</strong> Lo que '
      + 'has pagado es la selección, la copia sin conexión que puedes imprimir o llevar en el móvil, y '
      + 'una versión sin anuncios ni avisos de cookies. Si prefieres leerlas gratis en internet, no hay '
      + 'ningún problema: cada guía enlaza a su página.',
    aiSzerzo: (site) => '<strong>Estas guías las ha escrito nuestro equipo editorial de IA</strong> y se han '
      + `revisado para comprobar su exactitud y claridad, igual que todo lo que publicamos en ${site}. Lo `
      + 'decimos abiertamente porque tienes derecho a saber quién escribió lo que estás leyendo.',
    valtozas: '<strong>Las aplicaciones cambian.</strong> Los botones se mueven y los menús cambian de '
      + 'nombre. Si un paso no coincide con lo que ves, la versión en internet de la guía es la más '
      + 'reciente: el enlace está debajo de cada título.',
    koszonet: 'Gracias por apoyar un proyecto pequeño e independiente.'
  }
};

/** A csomag borító-címe: a régi néven marad, ha nincs téma megadva. */
export function csomagCim(tema, nyelv = 'en') {
  const T = SZOVEG[nyelv] || SZOVEG.en;
  if (!tema) return T.regiCim;
  if (tema === 'all') return T.nagyCim;
  const t = TERULETEK.find(x => x.id === tema);
  return t ? T.miniCim(temaSzoveg(t, nyelv).cim) : T.regiCim;
}

/**
 * A könyv HTML-je. Nyomtatásra van szabva (A4, oldaltörés fejezetenként).
 *
 * ⚠️ A HÁROM NEM ALKU TÁRGYA SZABÁLY (lásd ebook-pack.js fejléce) ITT
 * VÁLIK SZÖVEGGÉ: az AI-szerzőség kimondva, a „ingyen is elérhető"
 * kimondva, és minden útmutatóhoz ott a HONLAP-LINK. Egy fizetős csomag,
 * ami elhallgatja, hogy a tartalma ingyen is megvan, megtévesztés.
 */
export function konyvHtml(szakaszok, { site = 'https://aiworldhq.com', nyelv = 'en', tema = null } = {}) {
  const T = SZOVEG[nyelv] || SZOVEG.en;
  const db = szakaszok.reduce((s, x) => s + x.cikkek.length, 0);
  // A szakasz-cím a nyelvi táblából jön (a `szakaszok` ANGOL címet hoz — ott
  // a téma azonosítója a hordozható adat, nem a felirat).
  const szCim = (sz) => {
    const t = TERULETEK.find(x => x.id === sz.id);
    return t ? temaSzoveg(t, nyelv).cim : sz.cim;
  };
  // A csomagba kerülő szöveg — spanyolnál a spanyol. `null` itt már nem
  // fordulhat elő: a válogatás kiszűrte a fordítatlanokat.
  const sz = (c) => szovegNyelven(c, nyelv) || String(c.md || '');

  const toc = szakaszok.map(s =>
    `<li class="toc-sec">${esc(szCim(s))}<ol>` +
    s.cikkek.map(c => `<li>${esc(cimBol(sz(c)))}</li>`).join('') + '</ol></li>').join('');

  const fejezetek = szakaszok.map(s => `
  <section class="area">
    <h1 class="area__h">${esc(szCim(s))}</h1>
  </section>
  ${s.cikkek.map(c => `
  <article class="guide">
    <h2>${esc(cimBol(sz(c)))}</h2>
    <p class="guide__meta">${lepesSzam(c.md)} ${T.lepes} &middot;
      <a href="${site}${T.ut}/article/${esc(c.slug)}">${T.online}</a></p>
    ${marked.parse(torzs(sz(c)))}
  </article>`).join('')}`).join('');
  // ⚠️ A LÉPÉSSZÁM MINDIG AZ ANGOL EREDETIBŐL JÖN (`c.md`). Kimérve: a
  // spanyol fordításban a lépés-fejlécek „## Paso 1" alakúak, amire a
  // `lepesSzam()` angol mintája NEM illeszkedik — a fordításból mérve MIND a
  // spanyol cikk „0 pasos"-t írna ki. Ugyanaz a cikk, ugyanannyi lépés.

  return `<!doctype html><html lang="${T.htmlLang}"><head><meta charset="utf-8">
<title>${esc(csomagCim(tema, nyelv))}</title>
<style>
  @page { size: A4; margin: 20mm 18mm; }
  body { font: 11.5pt/1.6 Georgia, 'Times New Roman', serif; color: #1a1a1a; }
  h1, h2, h3 { font-family: Helvetica, Arial, sans-serif; line-height: 1.25; }
  .cover { text-align: center; padding-top: 55mm; page-break-after: always; }
  .cover h1 { font-size: 30pt; margin: 0 0 6mm; }
  .cover p { font-size: 12pt; color: #444; margin: 2mm 0; }
  .honesty { page-break-after: always; background: #f6f6f4; padding: 8mm; border-radius: 3mm; }
  .honesty h2 { margin-top: 0; }
  .toc { page-break-after: always; }
  .toc-sec { font-weight: bold; margin-top: 4mm; }
  .toc-sec ol { font-weight: normal; }
  .area { page-break-before: always; padding-top: 30mm; }
  .area__h { font-size: 22pt; border-bottom: 2px solid #1a1a1a; padding-bottom: 3mm; }
  .guide { page-break-before: always; }
  .guide h2 { font-size: 16pt; margin-bottom: 1mm; }
  .guide__meta { font-size: 9pt; color: #666; margin-top: 0; }
  .guide h3 { font-size: 12.5pt; margin-top: 6mm; }
  a { color: #14507d; }
  code { background: #f2f2ef; padding: 0 2px; font-size: 10pt; }
  blockquote { border-left: 3px solid #ccc; margin-left: 0; padding-left: 4mm; color: #444; }
</style></head><body>

<div class="cover">
  <h1>${esc(csomagCim(tema, nyelv))}</h1>
  <p>${esc(T.alcim(db))}</p>
  <p>${szakaszok.map(s => esc(szCim(s))).join(' &middot; ')}</p>
  <p style="margin-top:14mm">AI World HQ &middot; ${site}${T.ut}</p>
</div>

<div class="honesty">
  <h2>${esc(T.oszinteCim)}</h2>
  <p>${T.ingyen}</p>
  <p>${T.aiSzerzo(site)}</p>
  <p>${T.valtozas}</p>
  <p>${esc(T.koszonet)}</p>
</div>

<nav class="toc"><h2>${esc(T.tocCim)}</h2><ol>${toc}</ol></nav>
${fejezetek}
</body></html>`;
}
// ⚠️ A BORÍTÓ TERÜLET-FELSOROLÁSA A VALÓDI SZAKASZOKBÓL ÉPÜL, nem beégetve.
// A régi változatban öt terület neve állt ott kézzel — miközben a `topics.js`
// már NYOLC témát ismert. A borító tehát három fejezetet elhallgatott a
// saját termékünkből. Ami kézzel van kiírva, az csöndben elavul.

// ── CLI ─────────────────────────────────────────────────────────────

/** Egy `--kapcsolo ertek` kiolvasása. */
function ertek(argv, nev) {
  const i = argv.indexOf(nev);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null;
}

/**
 * Egy csomag legyártása HTML-be (és kérésre PDF-be).
 * @returns {{ok:boolean, indok?:string, db?:number, szo?:number, oldal?:number, nev?:string}}
 */
export function gyart(cikkek, { tema = null, nyelv = 'en', pdf = false } = {}) {
  // Téma nélkül a RÉGI csomag: 8 terület × 5 útmutató, `starter-pack` néven.
  const c = tema
    ? csomag(cikkek, { tema, nyelv })
    : (() => {
      const szakaszok = valogat(cikkek, { nyelv });
      const mind = szakaszok.flatMap(s => s.cikkek);
      const szo = mind.reduce((s, x) => s + szoSzam(szovegNyelven(x, nyelv)), 0);
      return { ok: mind.length > 0, szakaszok, db: mind.length, szo, oldal: oldalSzam(szo), indok: 'nincs alkalmas útmutató' };
    })();
  if (!c.ok) return { ok: false, indok: c.indok, db: c.db };

  const nev = tema ? `${tema}-${nyelv}` : 'starter-pack';
  mkdirSync(KI_DIR, { recursive: true });
  const htmlUt = join(KI_DIR, nev + '.html');
  writeFileSync(htmlUt, konyvHtml(c.szakaszok, { nyelv, tema }), 'utf-8');

  const ki = { ok: true, nev, db: c.db, szo: c.szo, oldal: c.oldal, html: htmlUt, szakaszok: c.szakaszok };
  if (!pdf) return ki;

  const CHROME = process.env.CHROME_PATH
    || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  if (!existsSync(CHROME)) { ki.pdfHiba = `nincs Chrome itt: ${CHROME} — add meg a CHROME_PATH-t`; return ki; }
  const pdfUt = join(KI_DIR, nev + '.pdf');
  execFileSync(CHROME, ['--headless', '--disable-gpu', '--no-sandbox',
    '--no-pdf-header-footer', `--print-to-pdf=${pdfUt}`, htmlUt], { stdio: 'pipe' });
  const buf = readFileSync(pdfUt);
  // ⚠️ A LÉTEZŐ FÁJL NEM BIZONYÍTÉK: a Chrome hibára is írhat csonkot.
  ki.pdf = pdfUt; ki.pdfMb = buf.length / 1024 / 1024; ki.pdfEp = buf.subarray(0, 5).toString() === '%PDF-';
  return ki;
}

if (process.argv[1] && process.argv[1].endsWith('ebook-build.js')) {
  const argv = process.argv.slice(2);
  const pdf = argv.includes('--pdf');
  const temaArg = ertek(argv, '--tema');
  const nyelvArg = ertek(argv, '--nyelv');
  // Paraméter nélkül: a RÉGI csomag, a régi néven. Ez visszafelé kompatibilitás.
  const melyek = argv.includes('--mind')
    ? NYELVEK.flatMap(n => ['all', ...TERULETEK.map(t => t.id)].map(t => ({ tema: t, nyelv: n })))
    : [{ tema: temaArg || (nyelvArg ? 'all' : null), nyelv: nyelvArg || 'en' }];

  const cikkek = utmutatokBetolt();
  console.log(`📚 ${cikkek.length} örökzöld útmutató betöltve\n`);
  for (const { tema, nyelv } of melyek) {
    const r = gyart(cikkek, { tema, nyelv, pdf });
    const nev = tema ? `${tema}-${nyelv}` : 'starter-pack';
    if (!r.ok) { console.log(`⛔ ${nev}: NINCS CSOMAG — ${r.indok}`); continue; }
    // A MÉRT számok: cikkszám, szószám, becsült oldalszám (600 szó/oldal).
    console.log(`📘 ${nev}: ${r.db} útmutató, ${r.szo} szó (~${r.oldal} oldal)`);
    // A szakasz AZONOSÍTÓJÁT írjuk ki, nem a feliratát: a naplót fejlesztő
    // olvassa, és a `work` mindkét nyelvű csomagban ugyanaz a téma.
    if (!tema || tema === 'all') for (const s of r.szakaszok) console.log(`      ${s.id}: ${s.cikkek.length}`);
    console.log(`      HTML: ${r.html}`);
    if (r.pdfHiba) console.log(`      ⚠️ ${r.pdfHiba}`);
    else if (r.pdf) console.log(`      PDF: ${r.pdf} — ${r.pdfMb.toFixed(1)} MB, ${r.pdfEp ? '✅ ép' : '❌ NEM PDF'}`);
  }
}

export default { utmutatokBetolt, torzs, konyvHtml, csomagCim, gyart, SZOVEG };
