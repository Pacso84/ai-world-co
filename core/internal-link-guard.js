// ===================================================================
// BELSŐ HIVATKOZÁS-ŐR (2026-09-08) — mutat-e a saját oldalunk sehova?
// ===================================================================
// MI TÖRTÉNT: a user Search Console-képén „Nem található (404): 15" állt.
// Végigpásztáztam a 2822 épített oldal MINDEN belső hivatkozását, és három
// halott célt találtam. Kettő a 404-oldal nyelvváltójából jött, a harmadik egy
// heti összefoglaló „Read the full story" gombja volt — HAT HETE 404.
//
// A gyökérok tanulságos: az amerikai-helyesírás javítónk 2026-08-30 ELŐTT az
// URL-eket is átírta, így a cikk „personalise" slugjából a linkben
// „personalize" lett. A gépezet azóta javítva (a `core/us-spelling.js` védi az
// URL-eket) — de a SÉRÜLÉS bent maradt, és semmi nem szólt róla.
//
// 🔑 EZÉRT KELL EZ AZ ŐR: a halott belső link nem robban, nem dob hibát, és a
// tesztek is zöldek maradnak tőle. Csak az olvasó akad el rajta — és a kereső,
// ami 404-et jegyez fel a SAJÁT oldalunkról. Pontosan az a fajta hiba, amit a
// projekt legdrágább tanulsága ír le: némán él, amíg valaki rá nem néz.
//
// ⚠️ AZ ÁTIRÁNYÍTOTT CÍM NEM HALOTT. A `_redirects` 301-et ad rá, a látogató
// célba ér. Ha ezt az őr nem venné figyelembe, mind a 49 régi slugra riasztana
// — és a zajban a valódi lelet elveszne. A hamis riasztás itt nem kisebb baj,
// mint a hallgatás.
// ===================================================================

import { readdirSync, readFileSync, existsSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// ⚠️ `fileURLToPath`, NEM `.pathname` — Windowson az utóbbi „/C:/AI%20work/…"
// alakot ad, és az `existsSync` némán hamisat mondana rá.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SAJAT_DOMAIN = /^https?:\/\/aiworldhq\.com/i;

/**
 * Egy oldal HTML-jéből a BELSŐ hivatkozás-célok halmaza, ABSZOLÚT alakban.
 *
 * ⚠️ A RELATÍV LINKET IS FEL KELL OLDANI, ÉS EZ AZ ELSŐ VÁLTOZATOMBÓL
 * KIMARADT (2026-09-08). A főoldal kártyái `href="article/…"` alakúak, vezető
 * `/` nélkül — az én szűrőm ezeket eldobta, és a főoldalról NULLA cikk-linket
 * látott. Az őr tehát a legfontosabb linkjeinket nem is nézte volna.
 *
 * A feloldás alapja a KISZOLGÁLT cím, nem a fájlnév: a `/article/foo` lapon a
 * `bar` a `/article/bar`-ra mutat (a böngésző az utolsó szeletet eldobja).
 *
 * @param {string} html
 * @param {string} [oldalUt] a lap saját címe (pl. `/article/foo` vagy `/hu/`)
 */
export function belsoLinkek(html, oldalUt = '/') {
  const ki = new Set();
  if (typeof html !== 'string' || !html) return ki;
  const alap = 'https://aiworldhq.com' + (String(oldalUt || '/').startsWith('/') ? oldalUt : '/' + oldalUt);
  for (const m of html.matchAll(/href="([^"]+)"/g)) {
    const nyers = String(m[1]).trim();
    if (!nyers || /^(mailto:|tel:|javascript:|data:|#)/i.test(nyers)) continue;
    let u;
    try {
      const abs = new URL(nyers, alap);
      if (abs.hostname !== 'aiworldhq.com') continue;   // külső link — nem a mi dolgunk
      u = abs.pathname;                                  // horgony és lekérdezés nélkül
    } catch { continue; }
    if (u) ki.add(u);
  }
  return ki;
}

/** A `_redirects` FORRÁS-címei (amikre 301 van). A joker-szabály kimarad. */
export function atiranyitasTerkep(szoveg) {
  const m = new Map();
  if (typeof szoveg !== 'string' || !szoveg) return m;
  for (const sor of szoveg.split(/\r?\n/)) {
    const s = sor.trim();
    if (!s || s.startsWith('#')) continue;
    const [from, to] = s.split(/\s+/);
    if (!from || !to) continue;
    // ⚠️ A joker (`/*`) MINDEN címre illik. Ha egyedi címként vennénk fel,
    // az őr sosem találna semmit — és a zöldje semmit nem bizonyítana.
    if (from.includes('*')) continue;
    m.set(from, to);
  }
  return m;
}

/**
 * Melyik hivatkozás-cél nem vezet sehova?
 *
 * @param {Map<string,string[]>} celok  cél → mely oldalakról hivatkozunk rá
 * @param {{letezik:Function, atiranyitasok?:Map}} opts
 */
export function halottLinkek(celok, opts = {}) {
  const { letezik, atiranyitasok = new Map() } = opts || {};
  const ki = [];
  if (!(celok instanceof Map) || typeof letezik !== 'function') return ki;
  for (const [cel, honnanLista] of celok) {
    if (letezik(cel)) continue;
    if (atiranyitasok instanceof Map && atiranyitasok.has(cel)) continue;
    const lista = Array.isArray(honnanLista) ? honnanLista : [];
    ki.push({ cel, honnan: lista.length, pelda: lista[0] || null });
  }
  // A legtöbb helyről hivatkozott hiba a legfontosabb.
  return ki.sort((a, b) => b.honnan - a.honnan);
}

/**
 * A napi jelentés sora — `null`, ha nincs mondanivaló.
 * A projekt bevett alakja: néma, amíg minden rendben.
 */
export function linkSor(allapot) {
  const a = allapot || {};
  const p = Array.isArray(a.problems) ? a.problems : [];
  if (!p.length) return null;
  const elso = p.slice(0, 3).join(' · ');
  return `🔗 HALOTT BELSŐ LINK: ${p.length} cél — a saját oldalunk küld sehova. `
    + elso + (p.length > 3 ? ` (+${p.length - 3} további)` : '');
}

// ===================================================================
// PÁSZTÁZÁS — az épített kimeneten (I/O, ezért külön a tiszta résztől)
// ===================================================================
function htmlFajlok(d, ki = []) {
  for (const f of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, f.name);
    if (f.isDirectory()) htmlFajlok(p, ki);
    else if (f.name.endsWith('.html')) ki.push(p);
  }
  return ki;
}

/**
 * Végigpásztázza a build kimenetét, és visszaadja az őrszem-állapotot.
 * @returns {{at:string, oldalak:number, celok:number, problems:string[]}}
 */
export function pasztaz({ dir = join(ROOT, 'website', 'public') } = {}) {
  const at = new Date().toISOString();
  if (!existsSync(join(dir, 'index.html'))) {
    // ⚠️ „NEM TUDOM" ≠ „RENDBEN": ha nincs mit nézni, NEM mondjuk, hogy tiszta.
    return { at, oldalak: 0, celok: 0, problems: [], ismeretlen: true };
  }
  const oldalak = htmlFajlok(dir);
  const celok = new Map();
  for (const p of oldalak) {
    const rov = p.split(/[\\/]/).slice(-2).join('/');
    // A KISZOLGÁLT cím: a `.html` lekerül, az `index` pedig mappa-címmé válik.
    // Ez a relatív linkek feloldásának alapja — fájlnévvel számolva minden
    // kártya-link egy szinttel elcsúszna.
    const ut = '/' + p.slice(dir.length).replace(/\\/g, '/').replace(/^\//, '')
      .replace(/index\.html$/, '').replace(/\.html$/, '');
    for (const u of belsoLinkek(readFileSync(p, 'utf-8'), ut)) {
      if (!celok.has(u)) celok.set(u, []);
      celok.get(u).push(rov);
    }
  }
  const atir = existsSync(join(dir, '_redirects'))
    ? atiranyitasTerkep(readFileSync(join(dir, '_redirects'), 'utf-8'))
    : new Map();

  const letezik = u => {
    const a = u.replace(/^\//, '').replace(/\/$/, '');
    if (!a) return existsSync(join(dir, 'index.html'));
    return [a, a + '.html', a + '/index.html'].some(v => existsSync(join(dir, v)));
  };

  const halott = halottLinkek(celok, { letezik, atiranyitasok: atir });
  return {
    at, oldalak: oldalak.length, celok: celok.size,
    problems: halott.map(h => `${h.cel} (${h.honnan} oldalról, pl. ${h.pelda})`)
  };
}

// CLI: a build UTÁN fut, és állapotfájlt ír, amit a napi jelentés beolvas.
// ⚠️ `import.meta.url`-re szűrve — az importálás SOHA ne indítsa el.
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).href) {
  const a = pasztaz();
  writeFileSync(join(ROOT, 'memory', 'link-guard.json'), JSON.stringify(a, null, 2) + '\n', 'utf-8');
  console.log(`🔗 Belső hivatkozás-őr: ${a.oldalak} oldal, ${a.celok} cél, `
    + `${a.problems.length} halott`);
  for (const p of a.problems.slice(0, 10)) console.log('   ❌ ' + p);
}

export default { belsoLinkek, atiranyitasTerkep, halottLinkek, linkSor, pasztaz };
