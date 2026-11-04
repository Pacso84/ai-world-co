// ===================================================================
// FORRÁS-LETÖLTŐ (2026-11-01) — a hivatalos forrásoldal SZÖVEGE, megbízhatóan, EGY helyen
//
// MIÉRT: a híríró eddig csak a hírfolyam (RSS) rövid összefoglalóját kapta, a forrásoldalt soha nem
// töltötte le → 10 nap alatt legalább 12 hírben írta, hogy „a forrás nem közli a lépéseket / az árat”,
// holott a forrásoldal közölte. A tény-ellenőrző is letölti a forrást — a két helyen UGYANAZ a letöltő
// fusson, különben az egyik javítása a másikból kimarad.
//   • Böngésző-fejléc: a robot-azonosítóra több hivatalos oldal 403/404-et ad (09-27, core/guide-links.js).
//   • 429 / 5xx / hálózati hiba / időtúllépés → `varakozasMs` várakozás + legfeljebb `ujraproba`
//     újrapróba. 403/404 → NINCS újrapróba (az nem múlik el pár másodperc alatt).
//   • Blogger-tartalék: a workspaceupdates.googleblog.com a CI-ben 13-ból 4-szer gyorsan elbukott →
//     a blog SAJÁT hírcsatornájából vesszük a bejegyzés teljes szövegét (`via: 'rss'`).
//     ⚠️ `redirect=false` NÉLKÜL a hírcsatorna a FeedBurnerre ugrik, ami a paramétereket eldobja és
//     csak az utolsó 25 bejegyzést adja, Atomban (élőben mérve 11-01). Vele: RSS, teljes
//     <description>, és a `published-min/max` dátumablak is működik → a régebbi bejegyzés is meglesz.
// Hálózatot CSAK a `fetchImpl`-en át ér el → a teszt hamis fetch-csel, hálózat nélkül fut.
// Csak beépített modulokat használ (a CI-próba `npm ci` nélkül futtatja).
// CLI: node core/forras-letoltes.js --proba <url> [<url> …]   (csak olvas, fájlt nem ír)
// ===================================================================

import { pathToFileURL } from 'url';
import { forrasSzoveg, MIN_FORRAS } from './friss-tenyellenorzes.js';
// ⚠️ A MIN_FORRAS-t és a forrasSzoveg-et CSAK függvényen belül használjuk, modulszinten soha:
// ha a friss-tenyellenorzes.js egyszer ezt a modult importálja vissza (körkörös import), a
// modulszintű hozzáférés „Cannot access before initialization” hibát dobna.

/** Böngésző-fejléc — ugyanaz a Chrome-azonosító, mint a core/guide-links.js bongeszoVelemeny()-ében. */
export const BONGESZO_FEJLEC = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
};

const NAP = 86400e3;

/**
 * A link levágva; csak http(s) link marad meg, minden más null.
 * (2026-11-01: a Dropbox hírfolyama `"  https://blog.dropbox.com/… "` alakban adja a linket —
 * mind a 10 Dropbox-hírünk `source_link`-je így került be.)
 */
export function tisztaUrl(u) {
  if (typeof u !== 'string') return null;
  const s = u.trim();
  if (!/^https?:\/\/\S/i.test(s)) return null;
  try { new URL(s); return s; } catch { return null; }
}

const alszik = ms => new Promise(r => setTimeout(r, ms));

// HTML-megjegyzés ki, MIELŐTT a közös forrasSzoveg() kapja (11-01, élőben: a Dropbox-oldal szövegében
// „--> -->” maradékok voltak — a `<!-- <link …> -->` alakú megjegyzés belső `>`-jénél a tag-törlés elvágott).
const megjegyzesNelkul = html => String(html || '').replace(/<!--[\s\S]*?-->/g, ' ');
// Számmal kódolt entitás → karakter (11-01, élőben: a Zapier-oldal `that&#x27;s`-éből a közös tisztító „that s”-t
// csinált, mert az ismeretlen entitást szóközre cseréli). A <, > és & SZÁNDÉKOSAN marad: dekódolva hamis tag lehetne belőle.
const NEVES = { mdash: '—', ndash: '–', hellip: '…', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', trade: '™', reg: '®', copy: '©' };
const entitasok = s => s
  .replace(/&#(\d{1,7});|&#x([0-9a-f]{1,6});/gi, (m, d, h) => {
    const k = d ? Number(d) : parseInt(h, 16);
    if (k === 38 || k === 60 || k === 62 || k < 32 || k > 0x10FFFF) return m;
    try { return String.fromCodePoint(k); } catch { return m; }
  })
  .replace(/&(mdash|ndash|hellip|lsquo|rsquo|ldquo|rdquo|trade|reg|copy);/g, (_, n) => NEVES[n]);
/** HTML → olvasható szöveg: megjegyzés ki, entitások vissza, utána a közös forrasSzoveg(). Az író a hírfolyam teljes szövegére is ezt használja. */
export const htmlSzoveg = (html, max) => forrasSzoveg(entitasok(megjegyzesNelkul(html)), max);
const tisztit = htmlSzoveg;

/**
 * A scraper „látott” linkjei levágva (2026-11-01). A seen-items.json-ban 21 RÉGI, szóközös Dropbox-link
 * van: ha az új (levágott) linket szó szerint vetnénk össze velük, minden régi Dropbox-hír újként jönne
 * vissza. Levágva hasonlítunk → a régi bejegyzés is talál.
 */
export function latottLinkek(lista) {
  return new Set((Array.isArray(lista) ? lista : []).map(l => (typeof l === 'string' ? l.trim() : l)));
}

/** Egyetlen GET. `ujra: true` = érdemes újrapróbálni (429, 5xx, hálózati hiba, időtúllépés). */
async function egyLetoltes(url, { timeoutMs, fetchImpl }) {
  try {
    const r = await fetchImpl(url, { headers: BONGESZO_FEJLEC, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
    const status = Number(r?.status) || null;
    if (!r?.ok) {
      try { await r?.body?.cancel?.(); } catch { /* a kapcsolat felszabadítása nem kötelező */ }
      return { status, body: null, hiba: `HTTP ${status ?? '?'}`, ujra: status === 429 || (status ?? 0) >= 500 };
    }
    const tipus = typeof r.headers?.get === 'function' ? String(r.headers.get('content-type') || '') : '';
    if (tipus && !/html|xml|text\//i.test(tipus)) {
      try { await r.body?.cancel?.(); } catch { /* */ }
      return { status, body: null, hiba: `nem szöveges tartalom (${tipus.split(';')[0].trim()})`, ujra: false };
    }
    return { status, body: await r.text(), hiba: null, ujra: false };
  } catch (e) {
    if (/timeout|abort/i.test(String(e?.name || ''))) {
      return { status: null, body: null, hiba: `időtúllépés (${Math.round(timeoutMs / 1000)} mp)`, ujra: true };
    }
    const kod = String(e?.cause?.code || e?.code || '');
    return { status: null, body: null, hiba: 'hálózati hiba' + (kod ? ` (${kod})` : ''), ujra: true };
  }
}

async function letoltesUjraprobaval(url, o) {
  const proba = Math.max(0, Math.floor(Number(o.ujraproba) || 0));
  let utolso = null;
  for (let k = 0; k <= proba; k++) {
    if (k > 0 && o.varakozasMs > 0) await alszik(o.varakozasMs);
    utolso = await egyLetoltes(url, o);
    if (!utolso.ujra) break;
  }
  return utolso;
}

// ── BLOGGER-TARTALÉK ────────────────────────────────────────────────

/** Blogger-blog (a Google hivatalos blogjai a *.googleblog.com alatt; ugyanez a motor a *.blogspot.com). */
export function bloggerBlog(url) {
  try { return /(^|\.)(googleblog|blogspot)\.com$/i.test(new URL(url).hostname); } catch { return false; }
}

/**
 * A blog hírcsatornájának címe. Ha a link /ÉÉÉÉ/HH/ alakú, a bejegyzés hónapjára szűrünk (±3 nap
 * a blog időzónája miatt) → a régebbi bejegyzés is benne van; különben a legutóbbi 50.
 */
export function bloggerHirfolyamUrl(url) {
  const p = new URL(url);
  const q = new URLSearchParams({ alt: 'rss', redirect: 'false' });
  const m = p.pathname.match(/^\/(\d{4})\/(\d{2})\//);
  if (m) {
    const ev = Number(m[1]), ho = Number(m[2]);
    const iso = t => new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z');
    q.set('max-results', '150');
    q.set('published-min', iso(Date.UTC(ev, ho - 1, 1) - 3 * NAP));
    q.set('published-max', iso(Date.UTC(ev, ho, 1) + 3 * NAP));
  } else {
    q.set('max-results', '50');
  }
  return `https://${p.host}/feeds/posts/default?${q}`;
}

/** Összevetési kulcs: protokoll, www., query, hash és záró perjel nélkül, kisbetűvel. */
export function linkKulcs(u) {
  try {
    const p = new URL(String(u || '').trim());
    return (p.hostname.replace(/^www\./i, '') + p.pathname.replace(/\/+$/, '')).toLowerCase();
  } catch { return null; }
}

const xmlDekod = s => String(s || '')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&amp;/g, '&');   // UTOLJÁRA: különben a „&amp;lt;” kétszer dekódolódna
const cdataVagyDekod = s => {
  const m = String(s || '').match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  return m ? m[1] : xmlDekod(s);
};

/** RSS <item> és Atom <entry> tételek: linkek, cím és a leghosszabb tartalom-mező (HTML). */
export function hirfolyamTetelek(xml) {
  return String(xml || '').split(/<item[\s>]|<entry[\s>]/i).slice(1).map(darab => {
    const blokk = darab.split(/<\/item>|<\/entry>/i)[0];
    const linkek = [];
    for (const m of blokk.matchAll(/<link>([^<]+)<\/link>/gi)) linkek.push(cdataVagyDekod(m[1]).trim());
    for (const m of blokk.matchAll(/<link\b([^>]*?)\/?>/gi)) {
      const attr = m[1];
      if (/\brel=['"](?!alternate)/i.test(attr)) continue;   // replies, edit, self → nem a bejegyzés
      const h = attr.match(/\bhref=['"]([^'"]+)['"]/i);
      if (h) linkek.push(xmlDekod(h[1]).trim());
    }
    for (const m of blokk.matchAll(/<feedburner:origLink>([^<]+)<\/feedburner:origLink>/gi)) linkek.push(xmlDekod(m[1]).trim());
    const cim = cdataVagyDekod((blokk.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').trim();
    const tartalmak = [...blokk.matchAll(/<(content:encoded|description|content|summary)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map(m => cdataVagyDekod(m[2]));
    const html = tartalmak.sort((a, b) => b.length - a.length)[0] || '';
    return { linkek, cim, html };
  });
}

async function bloggerTartalek(url, o) {
  let hirfolyam;
  try { hirfolyam = bloggerHirfolyamUrl(url); } catch { return { ok: false, status: null, text: '', hiba: 'rossz link' }; }
  const v = await letoltesUjraprobaval(hirfolyam, o);
  if (v.body == null) return { ok: false, status: v.status, text: '', hiba: v.hiba };
  const kulcs = linkKulcs(url);
  const tetel = hirfolyamTetelek(v.body).find(t => t.linkek.some(l => linkKulcs(l) === kulcs));
  if (!tetel) return { ok: false, status: v.status, text: '', hiba: 'nincs a hírcsatornában' };
  const text = tisztit(`<h1>${tetel.cim}</h1>\n${tetel.html}`, o.maxChars);
  return text.length >= MIN_FORRAS
    ? { ok: true, status: v.status, text, hiba: null }
    : { ok: false, status: v.status, text, hiba: `túl rövid szöveg (${text.length} karakter)` };
}

// ── FŐ FÜGGVÉNY ─────────────────────────────────────────────────────

/**
 * A forrásoldal olvasható szövege (szkript, stílus, menü nélkül, legfeljebb `maxChars` karakter).
 * SOHA nem dob kivételt: a hibát a `hiba` mező mondja (rövid magyar ok, HTTP-státusszal).
 * @returns {Promise<{ok: boolean, url: string, status: number|null, via: 'html'|'rss'|null, text: string, hiba: string|null}>}
 *   `ok` csak akkor true, ha `text.length >= MIN_FORRAS`.
 */
export async function forrasLetoltes(url, { timeoutMs = 20000, maxChars = 24000, ujraproba = 1, varakozasMs = 4000, fetchImpl = globalThis.fetch } = {}) {
  const tiszta = tisztaUrl(url);
  if (!tiszta) return { ok: false, url: typeof url === 'string' ? url.trim() : String(url ?? ''), status: null, via: null, text: '', hiba: 'nem http(s) link' };
  const o = { timeoutMs, maxChars, ujraproba, varakozasMs, fetchImpl };
  try {
    const v = await letoltesUjraprobaval(tiszta, o);
    let eredmeny = { ok: false, url: tiszta, status: v.status, via: null, text: '', hiba: v.hiba };
    if (v.body != null) {
      const text = tisztit(v.body, maxChars);
      eredmeny = text.length >= MIN_FORRAS
        ? { ok: true, url: tiszta, status: v.status, via: 'html', text, hiba: null }
        : { ok: false, url: tiszta, status: v.status, via: 'html', text, hiba: `túl rövid szöveg (${text.length} karakter)` };
    }
    if (eredmeny.ok || !bloggerBlog(tiszta)) return eredmeny;
    const rss = await bloggerTartalek(tiszta, o);
    if (rss.ok) return { ok: true, url: tiszta, status: rss.status, via: 'rss', text: rss.text, hiba: null };
    return { ...eredmeny, hiba: `${eredmeny.hiba}; RSS-tartalék: ${rss.hiba}` };
  } catch (e) {
    // Elvileg nem jutunk ide (a letöltés maga nem dob) — a hívót (író, tény-ellenőrző) semmi nem állíthatja meg.
    return { ok: false, url: tiszta, status: null, via: null, text: '', hiba: 'váratlan hiba: ' + String(e?.message || e).slice(0, 80) };
  }
}

// ── CLI (csak közvetlen futtatáskor; importnál NEM fut) ─────────────
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  // A workflow EGY argumentumban, szóközzel elválasztva is átadhatja a listát → szétszedjük.
  const urlek = args.filter(a => a !== '--proba').flatMap(a => a.split(/\s+/)).filter(Boolean);
  if (!args.includes('--proba') || !urlek.length) {
    console.log('Használat: node core/forras-letoltes.js --proba <url> [<url> …]');
    process.exit(2);
  }
  let jo = 0;
  for (const u of urlek) {
    const t0 = Date.now();
    const r = await forrasLetoltes(u);
    if (r.ok) jo++;
    console.log(`${r.ok ? '✅' : '❌'} ${String(r.status ?? '—').padEnd(3)} ${String(r.via ?? '—').padEnd(4)} ${String(r.text.length).padStart(6)} kar. ${String(Date.now() - t0).padStart(6)} ms  ${r.hiba ? r.hiba + '  ' : ''}${JSON.stringify(u)}`);
    if (r.text) console.log('     ↳ ' + r.text.slice(0, 160));
  }
  console.log(`\n${jo}/${urlek.length} forrás rendben (≥ ${MIN_FORRAS} karakter).`);
}
