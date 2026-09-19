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
import {
  csomag, valogat, cimBol, lepesSzam, szovegNyelven, szoSzam, oldalSzam,
  horgonyok, szakaszHorgony, promptLista, TERULETEK, NYELVEK
} from './ebook-pack.js';
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
    // ⚠️ „PROMPT AND EXAMPLE", NEM CSAK „PROMPT" — és ez MÉRÉS, nem óvatosság:
    // a 719 💬 példából 266 beírható prompt, a többi szemléltetés (menü-név,
    // képernyő-szöveg, eset-leírás). A „719 prompt" felirat tehát ugyanaz a
    // fajta túlígérés lenne, amit ebben a fájlban most javítunk.
    promptCim: 'Every prompt and example in this pack',
    promptBev: 'Every line marked 💬 in the guides above, collected in one place: the prompts you '
      + 'can copy and type (marked ➤), and the example labels and screen text that go with them. '
      + 'Each guide title links back to the guide it came from.',
    promptSzam: (db, beir, g) => `${db} examples from ${g} guides — ${beir} of them prompts you can type`,
    oszinteCim: 'Before you start — what this is, honestly',
    // ⚠️ A „hirdetésmentes" ÍGÉRET KIKERÜLT (2026-09-19). A honlap maga
    // hirdetés- és fizetőfal-mentes („no ads, no paywall" — a cikkek alján,
    // tesztel őrizve), tehát a régi mondat („a version with no ads and no
    // cookie banners") olyan előnyt sugallt a fizetős csomagnak, ami az INGYEN
    // változatban is megvan. Ez is túlígérés, csak nem a szerzőségről.
    ingyen: '<strong>Every guide in this pack is also free on our website.</strong> What you paid '
      + 'for is the selection and the order, one offline file you can print or keep on your phone, '
      + 'and the work of putting it together — not secret knowledge. Our website has no ads and no '
      + 'paywall either. If you would rather read them free online, that is completely fine — '
      + 'every guide links back to its page.',
    // 🇪🇺 A MI-JELÖLÉS SZÓ SZERINT AZT MONDJA, AMI IGAZ (átírva 2026-09-19).
    // A régi mondat („written by our AI editorial team and reviewed for
    // accuracy and clarity") KÉT dolgot állított, amit nem tudunk fedezni:
    //   1. „reviewed" — ilyen felülvizsgálat NINCS; a honlap lábléce és a
    //      cikk-címkék pont az ellenkezőjét mondják: „no human editor";
    //   2. „AI editorial team" — eufemizmus, amit épp azért cseréltünk le a
    //      honlapon 2026-09-12-én, mert félreérthető (csapat = emberek).
    // A fizetős termék NEM állíthat többet, mint az ingyenes oldal. A jel fő
    // eleme a nagybetűs, ANGOL „AI" rövidítés minden nyelven (Gyakorlati
    // Kódex 1.1(a)) — a próza viszont a honlap adott nyelvű szövegével egyezik.
    aiSzerzo: (site) => '<span class="ai-mark">AI</span> <strong>Every guide in this pack was written '
      + 'by AI</strong> and checked by automated fact and quality gates. <strong>No human editor '
      + `reviewed the text.</strong> Every guide page on ${site} carries the same notice — we say it `
      + 'openly because you deserve to know who wrote what you are reading.',
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
    promptCim: 'Todos los prompts y ejemplos de este paquete',
    promptBev: 'Todas las líneas marcadas con 💬 en las guías anteriores, reunidas en un solo lugar: '
      + 'los prompts que puedes copiar y escribir (marcados con ➤) y los ejemplos de etiquetas y '
      + 'textos de pantalla que los acompañan. El título de cada guía enlaza con la guía de la que procede.',
    promptSzam: (db, beir, g) => `${db} ejemplos de ${g} guías — ${beir} son prompts que puedes escribir`,
    oszinteCim: 'Antes de empezar: qué es esto, con sinceridad',
    ingyen: '<strong>Todas las guías de este paquete están también gratis en nuestra web.</strong> Lo que '
      + 'has pagado es la selección y el orden, un único archivo sin conexión que puedes imprimir o llevar '
      + 'en el móvil, y el trabajo de reunirlo todo; no conocimiento secreto. Nuestra web tampoco tiene '
      + 'anuncios ni muro de pago. Si prefieres leerlas gratis en internet, no hay ningún problema: cada '
      + 'guía enlaza a su página.',
    // A próza a HONLAP spanyol szövegével egyezik („escrita por IA … ningún
    // editor humano la revisó"), a JEL viszont a nagybetűs angol „AI" —
    // ugyanaz a kettősség, mint a honlap kártyáin (`aiMark()`).
    aiSzerzo: (site) => '<span class="ai-mark">AI</span> <strong>Todas las guías de este paquete fueron '
      + 'escritas por IA</strong> y pasaron controles automáticos de datos y calidad. <strong>Ningún editor '
      + `humano revisó el texto.</strong> Cada guía de ${site} lleva el mismo aviso: lo decimos abiertamente `
      + 'porque tienes derecho a saber quién escribió lo que estás leyendo.',
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

  // A HORGONY-TÉRKÉP EGY HELYEN KÉSZÜL, és a jegyzék ÉS a fejezet-fejléc
  // UGYANEZT olvassa — enélkül a kettő elcsúszhatna, és a jegyzék némán
  // halott belső linkekre mutatna. (Tesztel őrizve.)
  const horg = horgonyok(szakaszok);

  // 🔗 KATTINTHATÓ TARTALOMJEGYZÉK (2026-09-19). A termékszöveg ezt ígérte, és
  // eddig sima felsorolás volt: egy 340 oldalas PDF-ben a jegyzék linkek nélkül
  // majdnem használhatatlan. Az azonosító a `_meta.slug`-ból jön, NEM a címből.
  const toc = szakaszok.map(s =>
    `<li class="toc-sec"><a href="#${szakaszHorgony(s.id)}">${esc(szCim(s))}</a><ol>` +
    s.cikkek.map(c => `<li><a href="#${horg.get(c)}">${esc(cimBol(sz(c)))}</a></li>`).join('')
    + '</ol></li>').join('');

  const fejezetek = szakaszok.map(s => `
  <section class="area" id="${szakaszHorgony(s.id)}">
    <h1 class="area__h">${esc(szCim(s))}</h1>
  </section>
  ${s.cikkek.map(c => `
  <article class="guide" id="${horg.get(c)}">
    <h2>${esc(cimBol(sz(c)))}</h2>
    <p class="guide__meta">${lepesSzam(c.md)} ${T.lepes} &middot;
      <a href="${site}${T.ut}/article/${esc(c.slug)}">${T.online}</a></p>
    ${marked.parse(torzs(sz(c)))}
  </article>`).join('')}`).join('');

  // 💬 PROMPT-FÜGGELÉK — CSAK A NAGY GYŰJTEMÉNYBEN (a termékszöveg is csak ott
  // ígéri). A promptok a csomagba kerülő NYELVEN jönnek, és a forrás-útmutató
  // címe visszalinkel a fejezetére.
  const lista = tema === 'all' ? promptLista(szakaszok, nyelv) : [];
  const promptDb = lista.reduce((n, x) => n + x.promptok.length, 0);
  const beirDb = lista.reduce((n, x) => n + x.promptok.filter(p => p.beir).length, 0);
  const fuggelek = promptDb ? `
  <section class="prompts" id="prompts">
    <h1 class="area__h">${esc(T.promptCim)}</h1>
    <p class="prompts__lead">${esc(T.promptBev)}</p>
    <p class="prompts__n">${esc(T.promptSzam(promptDb, beirDb, lista.length))}</p>
    ${lista.map(x => `<div class="pr">
      <h3 class="pr__h"><a href="#${horg.get(x.cikk)}">${esc(x.cim)}</a></h3>
      <ul class="pr__l">${x.promptok.map(p =>
    `<li class="pr__i${p.beir ? ' pr__i--beir' : ''}">`
    + (p.bevezeto ? `<span class="pr__b">${esc(p.bevezeto)}</span>` : '')
    // A kerítésből jött prompt SORTÖRÉSE TARTALOM, nem formázás: escape + <br>.
    // Az egysorosé markdown (dőlt/félkövér/kód) — ugyanaz, amit a törzs kap.
    + `<span class="pr__t">${p.kod ? esc(p.szoveg).replace(/\n/g, '<br>') : marked.parseInline(p.szoveg)}</span>`
    + `</li>`).join('')}</ul>
    </div>`).join('')}
  </section>` : '';
  const tocFuggelek = promptDb
    ? `<li class="toc-sec"><a href="#prompts">${esc(T.promptCim)}</a></li>` : '';
  // ⚠️ A LÉPÉSSZÁM MINDIG AZ ANGOL EREDETIBŐL JÖN (`c.md`). Kimérve: a
  // spanyol fordításban a lépés-fejlécek „## Paso 1" alakúak, amire a
  // `lepesSzam()` angol mintája NEM illeszkedik — a fordításból mérve MIND a
  // spanyol cikk „0 pasos"-t írna ki. Ugyanaz a cikk, ugyanannyi lépés.

  // 🏷️ GÉPILEG KIOLVASHATÓ SZÁMOK a bolti feltöltéshez (2026-09-19, user-kérés).
  // A borítón eddig CSAK emberi szövegben állt a darabszám („12 step-by-step
  // guides") — a bolti leírást abból csak találgatva lehetett kitölteni, és a
  // találgatott szám pont az a fajta állítás, amiért ez a fájl most átíródik.
  return `<!doctype html><html lang="${T.htmlLang}"><head><meta charset="utf-8">
<title>${esc(csomagCim(tema, nyelv))}</title>
<meta name="aiworld-guides" content="${db}">
<meta name="aiworld-lang" content="${T.htmlLang}">${promptDb ? `
<meta name="aiworld-prompts" content="${promptDb}">` : ''}
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
  /* A jegyzék KATTINTHATÓ, de nyomtatásban ne legyen kék aláhúzott tenger:
     a link örökli a szöveg színét. A cél-horgony így is működik a PDF-ben. */
  .toc a { color: inherit; text-decoration: none; }
  /* A MI-jel: a nagybetűs angol „AI" minden nyelven (mint a honlap kártyáin). */
  .ai-mark { display: inline-block; font-family: Helvetica, Arial, sans-serif;
    font-size: 8.5pt; font-weight: bold; letter-spacing: .5pt;
    border: 1pt solid #1a1a1a; border-radius: 1mm; padding: 0 1.4mm; }
  .prompts { page-break-before: always; padding-top: 18mm; }
  .prompts__lead { color: #444; }
  .prompts__n { font-size: 9pt; color: #666; margin-top: -2mm; }
  .pr { page-break-inside: avoid; margin-top: 7mm; }
  .pr__h { font-size: 11.5pt; margin: 0 0 1.5mm; }
  .pr__l { list-style: none; padding-left: 0; margin: 0; }
  .pr__i { border-left: 3px solid #ccc; padding: 1mm 0 1mm 4mm; margin-bottom: 2mm; }
  /* ➤ = BEÍRHATÓ prompt. Ugyanaz a jel, amit az olvasó a honlapon lát. */
  .pr__i--beir { border-left-color: #14507d; }
  .pr__i--beir .pr__t::before { content: '➤ '; color: #14507d; }
  .pr__b { display: block; font-size: 9pt; color: #666; }
  .pr__t { display: block; }
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

<nav class="toc"><h2>${esc(T.tocCim)}</h2><ol>${toc}${tocFuggelek}</ol></nav>
${fejezetek}
${fuggelek}
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

  // MÉRT SZÁMOK A HÍVÓNAK — ugyanabból a függvényből, amiből a HTML készül.
  const lista = tema === 'all' ? promptLista(c.szakaszok, nyelv) : [];
  const ki = {
    ok: true, nev, db: c.db, szo: c.szo, oldal: c.oldal, html: htmlUt, szakaszok: c.szakaszok,
    horgony: horgonyok(c.szakaszok).size,
    promptCikk: lista.length,
    promptDb: lista.reduce((n, x) => n + x.promptok.length, 0),
    beirDb: lista.reduce((n, x) => n + x.promptok.filter(p => p.beir).length, 0)
  };
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
    // A HORGONYOK ÉS A PROMPTOK SZÁMA IS KIMEGY: a termékszöveg mindkettőt
    // ígéri, és ami nincs kiírva, annak a hiánya NEM tűnik fel a gyártáskor.
    console.log(`      🔗 ${r.horgony} horgony · 💬 ${r.promptDb} példa (${r.beirDb} beírható) ${r.promptCikk} útmutatóból`);
    console.log(`      HTML: ${r.html}`);
    if (r.pdfHiba) console.log(`      ⚠️ ${r.pdfHiba}`);
    else if (r.pdf) console.log(`      PDF: ${r.pdf} — ${r.pdfMb.toFixed(1)} MB, ${r.pdfEp ? '✅ ép' : '❌ NEM PDF'}`);
  }
}

export default { utmutatokBetolt, torzs, konyvHtml, csomagCim, gyart, SZOVEG };
