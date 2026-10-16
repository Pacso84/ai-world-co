// ===================================================================
// PROMPT-TÁR — „AI Prompt Library” (2026-10-16)
// ===================================================================
// User: „jó lenne ilyen extrával rendelkezni, mint a nagyobb oldalak” → „ezt inkább a
// trendeknél kéne megnézni”. Mérve a trendlistán (10-16): a top 10 keresésből 3 „X prompt
// for Y” (fotós promptok), és a valaha legjobb cikkünk is virális fotós prompt-trend volt
// (27 belépő vs ~4 átlag). Egy kereshető, bemásolható prompt-gyűjtemény az, amit egy
// MI-összefoglaló nem ad, és amire könyvtárak/tanárok szívesen linkelnek.
//
// $0, MI-hívás nélkül: a promptok a MEGLÉVŐ útmutatókból jönnek, két jól felismerhető alakból:
//   1) „💬 Example …” sor UTÁN álló kódblokk (az író „másold be az egészet” blokkja);
//   2) „💬 Example: "…"” — legalább 60 karakteres, idézőjeles példa.
// A „💬 Example” egy része NEM prompt („don't type anything yet”, „Theme: dinosaur dig…”) —
// ezért kötelező, hogy felszólítással vagy kérdéssel kezdődjön (KEZDO). Mérve: 766 jelöltből
// a szűrő a példa-ADATOT („Címke: …”) kiveszi.
// Minden futáskor magától frissül: a trend-útmutatók promptjai naponta elöl jelennek meg.
// ===================================================================
import { temaOf, TEMAK } from './topics.js';

export const PROMPT_MIN = 40;
export const PROMPT_MAX = 700;
export const CIKKENKENT_MAX = 3;     // egy útmutató ne uralja a tárat
export const KIEMELT_MAX = 12;       // „Trending & new” sor
export const FRISS_NAP = 14;
const NAP = 864e5;

// Felszólító igék és kérdőszavak, amikkel egy valódi prompt kezdődik (angol forrás).
const IGEK = new Set(('please write create make turn update explain help give list plan draft summarize summarise '
  + 'suggest rewrite rephrase translate generate look tell show check find review organize organise convert format '
  + 'brainstorm outline edit fix proofread shorten simplify identify analyze analyse read draw design imagine keep '
  + 'add remove change use schedule remind describe build recommend prepare teach quiz sort group extract calculate '
  + 'estimate break put set start act pretend compose answer respond combine split highlight polish improve expand '
  + 'condense adjust swap replace pick choose offer research track remember play find set').split(/\s+/));
const KERDO = new Set('what how why which when where who can could would will is are do does should'.split(' '));
const NEVMAS = /^(i'm|i am|i need|i want|i have|i'd like|you are|you're)\b/i;
const HANG_ELO = /^(alexa|hey google|ok google|hey siri|siri|hey meta|hey copilot),\s*/i;
// Mérve a valódi útmutatókon (10-16): sok valódi prompt BEVEZETŐVEL kezdődik („Now please…”,
// „Here's a YouTube link: … Summarize…”, „I got these wrong: … Please make…”). Ezek akkor
// promptok, ha a szövegben egyértelmű KÉRÉS is van.
const BEVEZETO = /^(now|here is|here's|here are|based on|using|from|for|before|after|my|we're|we are|same as|next|also|then|this is|these are|attached)\b/i;
const KERES = /\b(please|can you|could you|would you|give me|make me|tell me|help me|show me|write|create|summari[sz]e|suggest|list|draft|rewrite|turn|plan|explain|generate|translate|make|organi[sz]e|check|find|review)\b/i;
// Az „I …” mondat gyakran KIJELENTÉS („I'll paste the plan into my calendar…”, „I keep thinking…”) —
// ott csak az egyértelmű kérés számít, egy főnévként álló „plan” nem (10-16 előnézet, 2. kör).
const EROS_KERES = /\b(please|can you|could you|would you|give me|make me|tell me|help me|show me|let me know)\b/i;
// Kész szöveg (e-mail, levél, fejléc) vagy előzmény nélkül érthetetlen visszakérdezés — nem tár-anyag.
const NEM_PROMPT = /^(thanks|thank you|hi|hello|dear|great|perfect|sure|that's|that is|awesome|nice|looks good|i am writing|i'm writing|i am reaching out|i'm reaching out|i hope this|from:|to:|subject:|re:)/i;
// ÖSSZEHASONLÍTÁS TILOS (user 09-26, no-comparison-rules) — a tárban sem jelenhet meg „X vs Y”.
const OSSZEHASONLITAS = /\b(vs\.?|versus|different from|compared (to|with)|better than|worse than)(?=\s|$|[,.?!])/i;

function promptE(szoveg) {
  const s = String(szoveg || '').replace(HANG_ELO, '').trim();
  if (NEM_PROMPT.test(s) || OSSZEHASONLITAS.test(s)) return false;
  // 10-16 előnézet: „I have meetings until 3 p.m. … business casual.” csak HÁTTÉR, nincs benne kérés.
  if (NEVMAS.test(s) || /^i\b/i.test(s)) return EROS_KERES.test(s) || s.includes('?');
  const elso = (s.match(/^[A-Za-z']+/) || [''])[0].toLowerCase();
  if (IGEK.has(elso)) return true;
  // Kérdőszóval kezdődik → kérdés legyen („When you described… that stayed with me.” nem az).
  if (KERDO.has(elso)) return s.includes('?');
  return BEVEZETO.test(s) && KERES.test(s);
}

// Egy korábbi válaszra épülő folytatás — a kirakatba nem való (10-16 előnézet).
const FOLYTATAS = /^(now|then|also|next|and|what if|ok|okay|one more|another)\b/i;

// Felsorolás-sor: ezt nem fűzzük az előzőhöz.
const LISTA_SOR = /^\s*([-*•]|\d+[.)])\s/;

// 10-16 előnézet: a kódblokkok szövege kemény tördeléssel jön („Generate a new / image of me”).
// A MONDATKÖZI sortörést összefűzzük; marad a sortörés mondatvég (. ! ? :) és felsorolás-sor előtt.
function tordelesOsszefuz(s) {
  const sorok = s.split('\n');
  let ki = '';
  for (let i = 0; i < sorok.length; i++) {
    const sor = sorok[i];
    if (i === 0) { ki = sor; continue; }
    const elozo = sorok[i - 1];
    const marad = !sor.trim() || !elozo.trim() || LISTA_SOR.test(sor) || /[.!?:]$/.test(elozo.trim());
    ki += (marad ? '\n' : ' ') + sor.trimStart();
  }
  return ki;
}

function tisztit(s) {
  return tordelesOsszefuz(String(s || '')
    .replace(/^\s*\*{1,2}|\*{1,2}\s*$/g, '')
    .replace(/^["“„]|["”]$/g, '')
    .split('\n').map(l => l.replace(/\s+$/, '')).join('\n'))
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Egy útmutató markdownjából a bemásolható promptok (sorrendben, ismétlés nélkül). */
export function promptokCikkbol(md) {
  if (typeof md !== 'string' || !md) return [];
  const talalat = [];
  for (const m of md.matchAll(/💬[^\n]*\n+```[a-z]*\n([\s\S]*?)```/g)) talalat.push({ at: m.index, s: m[1] });
  for (const m of md.matchAll(/💬[^\n:]*:\s*\*{0,2}["“]([^"”\n]{60,})["”]/g)) talalat.push({ at: m.index, s: m[1] });
  const ki = [], latott = new Set();
  for (const { s } of talalat.sort((a, b) => a.at - b.at)) {
    const p = tisztit(s);
    if (p.length < PROMPT_MIN || p.length > PROMPT_MAX || !promptE(p)) continue;
    const kulcs = p.toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (latott.has(kulcs)) continue;
    latott.add(kulcs);
    ki.push(p);
  }
  return ki;
}

/**
 * A tár szerkezete. `cikkek`: [{ slug, title (megjelenítendő), titleEn (témához), tool, trend,
 * publishedAt, md (ANGOL markdown) }]. Kiemelt: trend-útmutatók, majd a FRISS_NAP-nál fiatalabbak,
 * legújabb elöl; a többi témánként (core/topics.js), ismeretlen téma → egyéb.
 */
export function promptTar(cikkek, { now = Date.now() } = {}) {
  const globalis = new Set();
  const bejegyzesek = [];
  for (const c of Array.isArray(cikkek) ? cikkek : []) {
    if (!c?.slug) continue;
    let db = 0;
    for (const szoveg of promptokCikkbol(c.md)) {
      if (db >= CIKKENKENT_MAX) break;
      const kulcs = szoveg.toLowerCase().replace(/[^a-z0-9]+/g, '');
      if (globalis.has(kulcs)) continue;
      globalis.add(kulcs);
      db++;
      bejegyzesek.push({ szoveg, slug: c.slug, title: c.title || '', tool: c.tool || '', trend: !!c.trend,
        publishedAt: c.publishedAt || '', tema: temaOf(c.titleEn || c.title) });
    }
  }
  const ido = e => Date.parse(e.publishedAt) || 0;
  const ujElol = (a, b) => ido(b) - ido(a);
  const friss = e => now - ido(e) <= FRISS_NAP * NAP;
  // A kiemelt sorban útmutatónként EGY (10-16 előnézet: egy friss útmutató 3 kártyát foglalt el);
  // az útmutató többi promptja a témák közé kerül.
  // A kirakatba ÖNÁLLÓ prompt kell: a folytatás („Now give me…”, „What if…”) előzmény nélkül
  // érthetetlen — az lent, a témáknál marad, az útmutató linkjével.
  const kiemeltSlug = new Set();
  const kiemelt = [...bejegyzesek.filter(e => e.trend).sort(ujElol), ...bejegyzesek.filter(e => !e.trend && friss(e)).sort(ujElol)]
    .filter(e => !FOLYTATAS.test(e.szoveg) && !kiemeltSlug.has(e.slug) && kiemeltSlug.add(e.slug))
    .slice(0, KIEMELT_MAX);
  const kiemeltHalmaz = new Set(kiemelt);
  const tobbi = bejegyzesek.filter(e => !kiemeltHalmaz.has(e)).sort(ujElol);
  const temak = TEMAK.map(t => ({ id: t.id, lista: tobbi.filter(e => e.tema === t.id) })).filter(x => x.lista.length);
  const egyeb = tobbi.filter(e => !e.tema || !TEMAK.some(t => t.id === e.tema));
  return { kiemelt, temak, egyeb, ossz: bejegyzesek.length };
}

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function kartya(e, sz) {
  const szoveg = esc(e.szoveg).replace(/\[[^\]\n]{2,80}\]/g, m => `<span class="pl-fill">${m}</span>`);
  return `<div class="pl-card">
      <pre class="pl-text">${szoveg}</pre>
      <div class="pl-foot">${e.tool ? `<span class="g-tool">📘 ${esc(e.tool)}</span>` : ''}<a class="pl-guide" href="article/${esc(e.slug)}" title="${esc(e.title)}">${esc(sz.utmutato)} →</a><button class="pl-copy" type="button" data-copied="${esc(sz.masolva)}">${esc(sz.masol)}</button></div>
    </div>`;
}

// Másolás (eseménydelegálással) + szűrés gépelés közben. A vágólap-API hiányában a gomb nem csinál semmit.
const SZKRIPT = `<script>(function(){document.addEventListener('click',function(e){var b=e.target.closest&&e.target.closest('.pl-copy');if(!b||!navigator.clipboard)return;var t=b.closest('.pl-card').querySelector('.pl-text').innerText;navigator.clipboard.writeText(t).then(function(){var o=b.textContent;b.textContent=b.getAttribute('data-copied');setTimeout(function(){b.textContent=o},1600)})});var q=document.getElementById('plSearch');if(!q)return;q.addEventListener('input',function(){var v=q.value.toLowerCase().trim();document.querySelectorAll('.pl-card').forEach(function(c){c.style.display=!v||c.textContent.toLowerCase().indexOf(v)>-1?'':'none'});document.querySelectorAll('.pl-sec').forEach(function(s){var l=s.querySelectorAll('.pl-card:not([style*="none"])').length;s.style.display=l?'':'none'})})})();</script>`;

/** Az oldal törzse. `sz`: felületi szövegek; `temaNev(id)`: a téma neve az adott nyelven; `nyelvTipp`: nem angol oldalon. */
export function promptTarHtml(tar, { sz, temaNev, nyelvTipp = '' }) {
  const szakasz = (id, cim, lista) => lista.length ? `<section class="pl-sec" id="${esc(id)}">
    <h2 class="pl-h">${esc(cim)}</h2>
    <div class="pl-grid">${lista.map(e => kartya(e, sz)).join('\n')}</div>
  </section>` : '';
  const ugro = [...(tar.kiemelt.length ? [['trending', sz.kiemeltCim]] : []), ...tar.temak.map(x => [x.id, temaNev(x.id)]),
    ...(tar.egyeb.length ? [['more', sz.egyebCim]] : [])]
    .map(([id, c]) => `<a href="#${esc(id)}">${esc(c)}</a>`).join('');
  return `<section class="guides-hero">
      <p class="intro__kicker">${esc(sz.kicker)}</p>
      <h1 class="guides-hero__title">${esc(sz.cim)}</h1>
      <p class="guides-hero__tag">${esc(sz.tag)} <span class="pl-count">${esc(sz.db(tar.ossz))}</span></p>
    </section>
    ${nyelvTipp ? `<p class="pl-tip">${esc(nyelvTipp)}</p>` : ''}
    <div class="pl-tools"><input id="plSearch" class="pl-search" type="search" placeholder="${esc(sz.kereses)}" aria-label="${esc(sz.kereses)}"><nav class="pl-jump">${ugro}</nav></div>
    ${szakasz('trending', sz.kiemeltCim, tar.kiemelt)}
    ${tar.temak.map(x => szakasz(x.id, temaNev(x.id), x.lista)).join('\n')}
    ${szakasz('more', sz.egyebCim, tar.egyeb)}
    ${SZKRIPT}`;
}
