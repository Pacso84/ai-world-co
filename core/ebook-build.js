// ===================================================================
// A FIZETŐS CSOMAG LEGYÁRTÁSA — HTML, majd PDF (2026-09-09)
// ===================================================================
// A VÁLOGATÁS a `core/ebook-pack.js`-ben lakik (tiszta, tesztelhető); itt
// csak az I/O és a formázás van.
//
// FUTTATÁS (a fejlesztő gépén, NEM a CI-ban):
//   node core/ebook-build.js            → dist/ebook/starter-pack.html
//   node core/ebook-build.js --pdf      → + starter-pack.pdf (Chrome kell)
//
// ⚠️ MIÉRT NEM CI-LÉPÉS: a PDF-hez fejetlen Chrome kell, ami az ubuntusi
// futtatón nincs telepítve — és nem is kell: a csomag ritkán változik,
// egyszeri gyártás. A `dist/` a .gitignore-ban van (a repó PUBLIKUS, és egy
// 100 oldalas PDF minden változásnál új bináris lenne a történetben).
// ===================================================================

import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { marked } from 'marked';
import { valogat, cimBol, lepesSzam } from './ebook-pack.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const KI_DIR = join(ROOT, 'dist', 'ebook');

/** Az örökzöld útmutatók betöltése a válogatáshoz. */
export function utmutatokBetolt(dir = join(ROOT, 'content', 'articles')) {
  if (!existsSync(dir)) return [];
  const ki = [];
  for (const f of readdirSync(dir)) {
    if (!f.startsWith('ARTICLE_') || !f.endsWith('.json')) continue;
    let d; try { d = JSON.parse(readFileSync(join(dir, f), 'utf-8')); } catch { continue; }
    const m = d._meta || {};
    if (m.type !== 'guide' || !m.slug) continue;
    ki.push({ slug: m.slug, tool: m.tool || '', md: d.article_markdown || '' });
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

/**
 * A könyv HTML-je. Nyomtatásra van szabva (A4, oldaltörés fejezetenként).
 *
 * ⚠️ A HÁROM NEM ALKU TÁRGYA SZABÁLY (lásd ebook-pack.js fejléce) ITT
 * VÁLIK SZÖVEGGÉ: az AI-szerzőség kimondva, a „ingyen is elérhető"
 * kimondva, és minden útmutatóhoz ott a HONLAP-LINK. Egy fizetős csomag,
 * ami elhallgatja, hogy a tartalma ingyen is megvan, megtévesztés.
 */
export function konyvHtml(szakaszok, { site = 'https://aiworldhq.com', ar = '$9' } = {}) {
  const db = szakaszok.reduce((s, x) => s + x.cikkek.length, 0);
  const toc = szakaszok.map(sz =>
    `<li class="toc-sec">${esc(sz.cim)}<ol>` +
    sz.cikkek.map(c => `<li>${esc(cimBol(c.md))}</li>`).join('') + '</ol></li>').join('');

  const fejezetek = szakaszok.map(sz => `
  <section class="area">
    <h1 class="area__h">${esc(sz.cim)}</h1>
  </section>
  ${sz.cikkek.map(c => `
  <article class="guide">
    <h2>${esc(cimBol(c.md))}</h2>
    <p class="guide__meta">${lepesSzam(c.md)} steps &middot;
      <a href="${site}/article/${esc(c.slug)}">Read online</a></p>
    ${marked.parse(torzs(c.md))}
  </article>`).join('')}`).join('');

  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>The Everyday AI Starter Pack</title>
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
  <h1>The Everyday AI Starter Pack</h1>
  <p>${db} step-by-step guides for real, everyday tasks</p>
  <p>Home &amp; family &middot; Money &amp; admin &middot; Staying safe &middot; Photos &amp; music &middot; Work &amp; email</p>
  <p style="margin-top:14mm">AI World HQ &middot; ${site}</p>
</div>

<div class="honesty">
  <h2>Before you start — what this is, honestly</h2>
  <p><strong>Every guide in this pack is also free on our website.</strong> What you paid
  for is the selection, the offline copy you can print or keep on your phone, and a
  version with no ads and no cookie banners. If you would rather read them free online,
  that is completely fine — every guide links back to its page.</p>
  <p><strong>These guides were written by our AI editorial team</strong> and reviewed for
  accuracy and clarity, the same as everything on ${site}. We say this openly because you
  deserve to know who wrote what you are reading.</p>
  <p><strong>Apps change.</strong> Buttons move and menus get renamed. If a step does not
  match what you see, the guide's online version is the newer one — the link is under
  every title.</p>
  <p>Thank you for supporting a very small, independent project.</p>
</div>

<nav class="toc"><h2>What's inside</h2><ol>${toc}</ol></nav>
${fejezetek}
</body></html>`;
}

// ── CLI ─────────────────────────────────────────────────────────────
if (process.argv[1] && process.argv[1].endsWith('ebook-build.js')) {
  const cikkek = utmutatokBetolt();
  const szakaszok = valogat(cikkek);
  const db = szakaszok.reduce((s, x) => s + x.cikkek.length, 0);
  const szo = szakaszok.reduce((s, x) => s + x.cikkek.reduce((n, c) => n + c.md.split(/\s+/).length, 0), 0);

  mkdirSync(KI_DIR, { recursive: true });
  const htmlUt = join(KI_DIR, 'starter-pack.html');
  writeFileSync(htmlUt, konyvHtml(szakaszok), 'utf-8');
  // ⚠️ A SZÓ/OLDAL ARÁNY MÉRVE, nem tippelve: az első becslésem 380 szó/oldal
  // volt, a valóság 600 — a 104 oldalas jóslatból 66 lett. A jóslat, amit
  // nem hitelesítünk a kimeneten, marketing-szám.
  console.log(`📘 Starter Pack: ${db} útmutató, ${szo} szó (~${Math.round(szo / 600)} oldal)`);
  for (const sz of szakaszok) console.log(`   ${sz.cim}: ${sz.cikkek.length}`);
  console.log(`   HTML: ${htmlUt}`);

  if (process.argv.includes('--pdf')) {
    const { execFileSync } = await import('child_process');
    const CHROME = process.env.CHROME_PATH
      || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    if (!existsSync(CHROME)) {
      console.log(`   ⚠️ Nincs Chrome itt: ${CHROME} — add meg a CHROME_PATH-t.`);
    } else {
      const pdfUt = join(KI_DIR, 'starter-pack.pdf');
      execFileSync(CHROME, ['--headless', '--disable-gpu', '--no-sandbox',
        '--no-pdf-header-footer', `--print-to-pdf=${pdfUt}`, htmlUt], { stdio: 'pipe' });
      const meret = readFileSync(pdfUt).length;
      // ⚠️ A LÉTEZŐ FÁJL NEM BIZONYÍTÉK: a Chrome hibára is írhat csonkot.
      const ep = readFileSync(pdfUt).subarray(0, 5).toString() === '%PDF-';
      console.log(`   PDF: ${pdfUt} — ${(meret / 1024 / 1024).toFixed(1)} MB, ${ep ? '✅ ép' : '❌ NEM PDF'}`);
    }
  }
}

export default { utmutatokBetolt, torzs, konyvHtml };
