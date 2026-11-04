// ===================================================================
// KIMENET-ŐR (2026-09-12) — a friss build ellenőrzése, a deploy ELŐTT
// ===================================================================
// MIÉRT: a kiépített lapokat néző ellenőrzések (paritás, szövegbeli linkek,
// „In short"-doboz, közép-doboz) eddig CSAK tesztként léteztek — és kiderült,
// hogy friss kimenetet sehol nem láttak. A CI-ban a tesztek a build ELŐTT
// futnak (a `website/public/` gitignore-os, tehát nincs), helyben pedig egy
// befagyott, napokkal korábbi build van. A „96/96 zöld" így a kimenet-őrökre
// nézve üres igazság volt. Részletek: core/built-output.js.
//
// EZ A LÉPÉS a CI-ban a „Weboldal build" UTÁN fut (`|| true`, a kiadást nem
// állítja meg), és a leletet a `memory/output-guard.json`-ba írja — onnan a
// napi riport olvassa. „Az őrszem csak akkor őr, ha odaszól, ahol a user néz."
//
// A döntések TISZTA függvényekben vannak (kimenetEllenorzes), lemez nélkül,
// így a teszt kitalált és valódi lapokon is futtatja őket.
// ===================================================================

import { paritasElemzes, isUtmutatoLap } from './template-parity.js';

/** A szövegbeli linkek plafonja. A website/build.js GUIDE_LINK_MAX-szal egyezik
 *  (user-döntés: MARAD 2) — a teszt forrásból ellenőrzi az egyezést. */
export const LINK_MAX = 2;
/** Egy útmutatóban legfeljebb ennyi közép-doboz lehet (09-11 óta kettő). */
export const MIDREAD_MAX = 2;

/**
 * @param {{f:string, h:string}[]} lapok  kiépített cikk-lapok (fájlnév + HTML)
 * @returns {{ hir:number, utmutato:number, problems:object[], megjavult:string[] }}
 */
export function kimenetEllenorzes(lapok) {
  const problems = [];
  const par = paritasElemzes(lapok.map(x => x.h));

  if (!par.elegendo) {
    problems.push({ code: 'KEVES_LAP', uzenet: `túl kevés lap az összevetéshez (${par.hir} hír, ${par.utmutato} útmutató)` });
  }
  if (par.ismeretlenHir.length) {
    problems.push({ code: 'PARITAS_CSAK_HIR', uzenet: 'csak a hírben van, az útmutatóban nincs: ' + par.ismeretlenHir.join(', '), elemek: par.ismeretlenHir });
  }
  if (par.ismeretlenUtm.length) {
    problems.push({ code: 'PARITAS_CSAK_UTMUTATO', uzenet: 'nem műfaji elem csak az útmutatóban: ' + par.ismeretlenUtm.join(', '), elemek: par.ismeretlenUtm });
  }
  if (par.ismeretlenTag.length) {
    problems.push({ code: 'PARITAS_TAG', uzenet: 'meg nem magyarázott tag-eltérés: <' + par.ismeretlenTag.join('>, <') + '>', elemek: par.ismeretlenTag });
  }

  const tullepo = [], hubra = [], csupasz = [], tulSokDoboz = [], ugyanaz = [];
  for (const { f, h } of lapok) {
    const linkek = [...String(h).matchAll(/<a class="guide-link" href="([^"]+)"/g)].map(m => m[1]);
    if (linkek.length > LINK_MAX) tullepo.push(f);
    if (!isUtmutatoLap(h)) continue;
    // útmutatóból a /tools gyűjtő mérhetően zsákutca (40 nap: 7 oldalletöltés)
    if (linkek.some(u => /\/tools(#|$)/.test(u))) hubra.push(f);
    // az „In short" doboz csupasz idézetblokként (a 09-12-i javítás előtti állapot)
    const i = h.indexOf('<div class="g-intro">');
    if (i >= 0 && /^\s*<blockquote>/.test(h.slice(i + '<div class="g-intro">'.length))) csupasz.push(f);
    // közép-dobozok száma és célpontja
    const dobozok = [...h.matchAll(/<aside class="midread">([\s\S]*?)<\/aside>/g)];
    if (dobozok.length > MIDREAD_MAX) tulSokDoboz.push(f);
    const celok = dobozok.map(d => (/href="([^"]+)"/.exec(d[1]) || [])[1]).filter(Boolean);
    if (celok.length === 2 && celok[0] === celok[1]) ugyanaz.push(f);
  }
  const jelent = (lista, code, szoveg) => {
    if (lista.length) problems.push({ code, uzenet: `${lista.length} lap: ${szoveg}`, pelda: lista.slice(0, 3) });
  };
  jelent(tullepo, 'LINK_PLAFON', `${LINK_MAX}-nél több szövegbeli link`);
  jelent(hubra, 'UTMUTATO_HUB_LINK', 'útmutatóból a /tools gyűjtőre visz a szövegbeli link');
  jelent(csupasz, 'CSUPASZ_IDEZET', 'az útmutató bevezetője stílus nélküli idézetblokk');
  jelent(tulSokDoboz, 'MIDREAD_TOBB', `${MIDREAD_MAX}-nél több közép-doboz`);
  jelent(ugyanaz, 'MIDREAD_UGYANAZ', 'a két közép-doboz ugyanarra a cikkre mutat');

  return { hir: par.hir, utmutato: par.utmutato, problems, megjavult: par.megjavult };
}

// ------------------------------------------------------------------
// CLI — csak közvetlen futtatáskor (a CI-lépés hívja). Importkor nem fut.
// ------------------------------------------------------------------
/** Közvetlenül futtatták-e a modult? Külön függvény, hogy tesztelhető legyen:
 *  ha importkor lefutna, a `process.exit(0)` a TESZTET is zölden lelőné. */
export function kozvetlenFuttatas(arg) {
  return Boolean(arg) && String(arg).replace(/\\/g, '/').endsWith('core/output-guard.js');
}
if (kozvetlenFuttatas(process.argv[1])) {
  const { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } = await import('fs');
  const { join, dirname } = await import('path');
  const { fileURLToPath } = await import('url');
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
  const PUB = join(ROOT, 'website', 'public', 'article');

  let eredmeny;
  if (!existsSync(PUB)) {
    eredmeny = { hir: 0, utmutato: 0, megjavult: [], problems: [{ code: 'NINCS_KIMENET', uzenet: 'nincs kiépített website/public/article mappa' }] };
  } else {
    const lapok = [];
    for (const f of readdirSync(PUB).filter(x => x.endsWith('.html'))) {
      try { lapok.push({ f, h: readFileSync(join(PUB, f), 'utf-8') }); } catch { /* romlott fájl — a többit nézzük */ }
    }
    eredmeny = kimenetEllenorzes(lapok);
  }

  console.log('🧩 KIMENET-ŐR (a friss buildön)');
  console.log('─'.repeat(60));
  console.log(`   ${eredmeny.hir} hír és ${eredmeny.utmutato} útmutató átnézve`);
  if (!eredmeny.problems.length) console.log('   ✅ A két cikk-sablon egyezik, nincs kimeneti visszaesés.');
  else for (const p of eredmeny.problems) console.log(`   ⚠️  [${p.code}] ${p.uzenet}`);
  if (eredmeny.megjavult.length) console.log(`   🔔 megjavult, a FOLYAMATBAN listából törölhető: ${eredmeny.megjavult.join(', ')}`);

  try {
    mkdirSync(join(ROOT, 'memory'), { recursive: true });
    writeFileSync(join(ROOT, 'memory', 'output-guard.json'),
      JSON.stringify({ at: new Date().toISOString(), ...eredmeny }, null, 2), 'utf-8');
  } catch { /* a lelet a naplóban akkor is ott van */ }
  process.exit(0);
}
