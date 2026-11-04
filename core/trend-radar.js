// ===================================================================
// TREND-RADAR (/trending, 2026-10-18) — „mit kérdeznek most az emberek az MI-től”
// ===================================================================
// A trendkutató (core/trend-kutato.js) naponta kiválaszt egy valódi, felfutó keresést,
// és útmutató készül rá (`_meta.trend.kifejezes`). Ez az oldal a HÉT tételeit mutatja:
// a keresést, ahogy beírták, a választ adó útmutatót, egymondatos összefoglalót, a borítóképet
// és — ha van — egy bemásolható promptot. Cél: ok a visszajövésre (naponta új tétel).
//
// CSAK A HÉT (user 10-18: „ha letelik a hét, kerüljön le végleg… így megtévesztő lenne; ha
// megint trend lesz, visszakerül”): 7 napnál régebbi tétel NEM jelenik meg. Ha egy régebbi
// trend-útmutató témája a MAI trendlistán (memory/trendek.json) újra szerepel, „újra felkapott”
// jelöléssel a mai napnál visszakerül — amíg a napi listán van.
//
// DIZÁJN (10-18): fent a hét 7 napja (teli pötty = aznapi tétel, kattintva oda ugrik — a korábbi
// begépelős keresőmező keresésnek látszott, pedig nem az); alatta a hét NAPLÓ (napi egy tétel →
// valódi idővonal), a keresés kisbetűvel, ahogy beírták, a válasz mellett a borítókép.
//
// SZÁNDÉKOSAN nincs „még ezeket keresik” lista útmutató nélkül: a cím-szavas párosítás
// élesben tévedett (pl. „perplexity for free” → Alexa „hands-free cooking”), rossz
// párosítást pedig nem teszünk ki. Csak a trendre ÍRT útmutató kerül ide. LLM nélkül, $0.
import { promptokCikkbol, helyiPromptok, FOLYTATAS, SZKRIPT } from './prompt-library.js';
import { normal, szavak, rokonKifejezes } from './trend-kutato.js';

const NAP = 864e5;
export const HET_NAP = 7;
export const ROVID_MAX = 200;
const ELSO_MONDAT = /^(.{40,220}?[.!?])(?=\s|$)/;   // a kártyára az első mondat elég, ha önálló

/**
 * Az útmutató egymondatos összefoglalója: a markdown ELSŐ idézet-blokkja (a „> **In short:**”),
 * a félkövér címke nélkül. SZERKEZETRE illesztünk, nem a címke szövegére — a fordító lefordítja
 * („Röviden”, „En resumen”), és akkor a nem angol oldalon némán kimaradna (build.js wrapInShort).
 */
export function rovidOsszefoglalo(md) {
  if (typeof md !== 'string' || !md) return '';
  const sorok = md.split(/\r?\n/);
  const i = sorok.findIndex(s => /^>\s?\S/.test(s));
  if (i < 0) return '';
  const blokk = [];
  for (let j = i; j < sorok.length && /^>/.test(sorok[j]); j++) blokk.push(sorok[j].replace(/^>\s?/, ''));
  let s = blokk.join(' ').replace(/^\s*\*\*[^*]{1,40}:\*\*\s*/, '').replace(/\*\*|__/g, '').replace(/\s+/g, ' ').trim();
  const elso = s.match(ELSO_MONDAT);
  if (elso) s = elso[1];
  if (s.length > ROVID_MAX) s = s.slice(0, ROVID_MAX).replace(/\s+\S*$/, '') + '…';
  return s;
}

/**
 * Újra felkapott-e a régi trend-kifejezés a mai lista valamelyik elemével? Szó szerinti egyezés,
 * vagy a trendkutató rokon-szabálya ÉS legalább 2 közös tartalmas szó (egy szavas keresés — pl.
 * „ai trends” → {trends} — különben bármire illene).
 */
export function ujraFelkapott(mai, regi) {
  if (normal(mai) === normal(regi)) return true;
  if (!rokonKifejezes(mai, regi)) return false;
  const a = szavak(mai), b = szavak(regi);
  let k = 0; for (const w of a) if (b.has(w)) k++;
  return k >= 2;
}

/**
 * A radar szerkezete. `cikkek`: [{ slug, title (megjelenítendő), kifejezes (a trend-keresés, ANGOL —
 * ezzel párosítunk), tool, publishedAt, md (a megjelenítés nyelvén — összefoglaló), mdEn (ANGOL), kep }].
 * NEM ANGOL OLDALON (2026-10-20, user: „a magyarban vannak angol mondatok! ez így nem jó”) a hívó
 * `helyi: true`-t, `kerdesHelyi`-t (a keresés fordítása, core/trend-forditas.js) ad: a prompt a
 * fordított cikkből jön (core/prompt-library.js helyiPromptok), és ami nincs meg a megjelenítés
 * nyelvén, az KIMARAD — angol mondat nem kerül a magyar/spanyol oldalra.
 * `mai`: a MAI trendlista kifejezései (aktivTrendek; ha nincs friss lista, üres).
 */
export function trendRadar(cikkek, { now = Date.now(), mai = [] } = {}) {
  const napok = Array.from({ length: HET_NAP }, (_, i) => new Date(now - (HET_NAP - 1 - i) * NAP).toISOString().slice(0, 10));
  const ma = napok.at(-1);
  const promptja = c => c.helyi
    ? (helyiPromptok(c.mdEn || '', c.md || '').find(x => x.helyi && !FOLYTATAS.test(x.en))?.helyi || null)
    : (promptokCikkbol(c.mdEn || '').find(p => !FOLYTATAS.test(p)) || null);
  const tetel = (c, extra) => {
    const kifejezes = String(c.kifejezes).trim().toLowerCase();
    return {
      slug: c.slug, title: c.title || c.slug, kifejezes, kerdes: c.helyi ? String(c.kerdesHelyi || '').trim().toLowerCase() : kifejezes,
      tool: c.tool || '', publishedAt: c.publishedAt, rovid: rovidOsszefoglalo(c.md), kep: c.kep || '',
      prompt: promptja(c), ...extra
    };
  };
  const jo = (Array.isArray(cikkek) ? cikkek : []).filter(c => c?.slug && String(c.kifejezes || '').trim() && Date.parse(c.publishedAt));
  const ujak = jo.filter(c => napok.includes(String(c.publishedAt).slice(0, 10))).map(c => tetel(c, { nap: String(c.publishedAt).slice(0, 10), ujra: false }));
  const latott = new Set(ujak.map(e => e.slug));
  const ujrak = jo.filter(c => !latott.has(c.slug) && (mai || []).some(m => ujraFelkapott(m, c.kifejezes)))
    .map(c => tetel(c, { nap: ma, ujra: true }));
  const het = [...ujak, ...ujrak].sort((a, b) => b.nap.localeCompare(a.nap) || Number(a.ujra) - Number(b.ujra)
    || (Date.parse(b.publishedAt) - Date.parse(a.publishedAt)));
  return { het, napok: napok.map(kulcs => ({ kulcs, iso: kulcs + 'T12:00:00Z', slug: het.find(e => e.nap === kulcs)?.slug || null })) };
}

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// Saját nagyító-ikon (SVG), nem emoji: a keresés jele a napló soraiban.
const NAGYITO = '<svg class="tr-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M15.5 15.5 21 21" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
const VALASZ = '<svg class="tr-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 3v9a4 4 0 0 0 4 4h10m-4-4 4 4-4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function mezo(kifejezes, sz) {
  return `<p class="tr-q"><span class="tr-sr">${esc(sz.kerestek)} </span>${NAGYITO}<span class="tr-qt">${esc(kifejezes)}</span></p>`;
}

// A nyelvi tipp (nem angol oldalon: „a promptok angolul vannak…”) a dobozba kerül, nem a lista fölé:
// ott számít, és a lap tetejét nem terheli (10-18 előnézet).
function promptDoboz(p, sz, nyelvTipp) {
  return `<div class="pl-card tr-prompt">
          <pre class="pl-text">${esc(p).replace(/\[[^\]\n]{2,80}\]/g, m => `<span class="pl-fill">${m}</span>`)}</pre>
          <div class="pl-foot">${nyelvTipp ? `<span class="tr-ptip">${esc(nyelvTipp)}</span>` : ''}<button class="pl-copy" type="button" data-copied="${esc(sz.masolva)}">${esc(sz.masol)}</button></div>
        </div>`;
}

// A borítókép (16:9, 1280×720) ugyanoda visz, mint a cím mellette → a felolvasónak nem ismételjük (aria-hidden,
// tabindex -1, üres alt); lusta betöltés, megadott méret (nincs ugrálás betöltéskor). 10-18, user: „nézzük meg képekkel”.
const KEP_MERET = 'width="1280" height="720" loading="lazy" decoding="async"';
function kepLink(e) {
  return `<a class="tr-img" href="article/${esc(e.slug)}" tabindex="-1" aria-hidden="true"><img src="${esc(e.kep)}" alt="" ${KEP_MERET}></a>`;
}

function naploSor(e, sz, datum, hetnap, nyelvTipp, horgony) {
  const iso = e.nap + 'T12:00:00Z';
  return `<li class="tr-day"${horgony ? ` id="d-${esc(e.nap)}"` : ''}>
      <div class="tr-when"><span class="tr-dd">${esc(datum(iso))}</span><span class="tr-wd">${esc(hetnap(iso))}</span></div>
      <div class="tr-body">
        ${e.ujra ? `<p class="tr-again">${esc(sz.ujra)}</p>` : ''}
        ${e.kerdes ? mezo(e.kerdes, sz) : ''}
        <div class="tr-answer${e.kep ? ' tr-answer--img' : ''}">${VALASZ}<div class="tr-ans">
          <h3 class="tr-t"><a href="article/${esc(e.slug)}">${esc(e.title)}</a></h3>
          ${e.rovid ? `<p class="tr-s">${esc(e.rovid)}</p>` : ''}
          ${e.prompt ? promptDoboz(e.prompt, sz, nyelvTipp) : ''}
          <p class="tr-foot">${e.tool ? `<span class="tr-tool">${esc(e.tool)}</span>` : ''}<a class="tr-read" href="article/${esc(e.slug)}">${esc(sz.utmutato)}</a></p>
        </div>${e.kep ? kepLink(e) : ''}</div>
      </div>
    </li>`;
}

/** Hányadik napló-sor ELÉ kerüljön a hirdetés (0 = a lista alá): két sor közé, a ~40%-hoz legközelebb. */
export function hirdetesHely(n) {
  if (!Number.isInteger(n) || n < 2) return 0;
  return Math.min(n - 1, Math.max(1, Math.round(n * 0.4)));
}

// A hét sávja: 7 nap; ahol volt tétel, a pötty link a napló első aznapi sorára (#d-ÉÉÉÉ-HH-NN).
function hetSav(napok, { rovidNap, napSzam }) {
  return `<ol class="tr-week7">${napok.map(n => {
    const fej = `<span class="tr-w7-n">${esc(rovidNap(n.iso))}</span><span class="tr-w7-d">${esc(napSzam(n.iso))}</span>`;
    return n.slug
      ? `<li class="tr-w7 tr-w7--van"><a href="#d-${esc(n.kulcs)}">${fej}<span class="tr-w7-dot" aria-hidden="true"></span></a></li>`
      : `<li class="tr-w7">${fej}<span class="tr-w7-dot" aria-hidden="true"></span></li>`;
  }).join('')}</ol>`;
}

/**
 * Az oldal törzse. `sz`: felületi szövegek (db: n → „…megválaszolva: n”; ujra: „Újra felkapott”);
 * `datum(iso)`: rövid dátum; `hetnap(iso)`: a hét napja; `rovidNap`/`napSzam`: a sáv feliratai;
 * `nyelvTipp`: nem angol oldalon (a promptok angolok); `hirdetes`: EGY hirdetés-blokk (core/ads.js) vagy '';
 * `fejlec({ hetSav })`: 📄 2026-10-28 — a papírlapos fejléc (core/lap-hero.js); a hét-sávot megkapja, az alá kerül.
 */
export function trendRadarHtml(radar, { sz, datum = s => String(s).slice(0, 10), hetnap = () => '', nyelvTipp = '', hirdetes = '',
  rovidNap = iso => new Date(iso).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }),
  napSzam = iso => String(new Date(iso).getUTCDate()), fejlec = null }) {
  const vanPrompt = radar.het.some(e => e.prompt);
  const weekbar = radar.napok?.length ? `<nav class="tr-weekbar" aria-label="${esc(sz.het)}">
        ${hetSav(radar.napok, { rovidNap, napSzam })}
        <p class="tr-range"><strong>${esc(datum(radar.napok[0].iso))} – ${esc(datum(radar.napok.at(-1).iso))}</strong><span>${esc(sz.db(radar.het.length))}</span></p>
      </nav>` : '';
  const hero = fejlec ? fejlec({ hetSav: weekbar }) : `<section class="tr-hero">
      <h1 class="tr-h1">${esc(sz.cim)}</h1>
      <p class="tr-tag">${esc(sz.tag)}</p>
      ${weekbar}
    </section>`;
  const elso = new Set();   // napi első sor kapja a horgonyt (a sáv oda ugrik)
  const sorok = radar.het.map(e => {
    const horgony = !elso.has(e.nap); elso.add(e.nap);
    return naploSor(e, sz, datum, hetnap, nyelvTipp, horgony);
  });
  // HIRDETÉS (user 10-18: „ide is rakjunk hirdetést!”): oldalanként EGY, két napló-sor KÖZÉ a ~40%-nál
  // (mint az útmutatóknál, core/ads.js); egy sornál a lista alá. Soron belülre (a Másolás gomb mellé) soha.
  const hely = hirdetesHely(sorok.length);
  if (hirdetes && hely) sorok.splice(hely, 0, `<li class="tr-ad">${hirdetes}</li>`);
  const naplo = radar.het.length
    ? `<section class="tr-week" id="this-week"><h2 class="tr-h2">${esc(sz.het)}</h2><ol class="tr-log">${sorok.join('\n')}</ol></section>`
    : `<p class="tr-ures">${esc(sz.ures)}</p>`;
  return `${hero}
    ${naplo}
    ${hirdetes && radar.het.length && !hely ? hirdetes : ''}
    ${vanPrompt ? SZKRIPT : ''}`;
}
