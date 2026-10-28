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
export const FOLYTATAS = /^(now|then|also|next|and|what if|ok|okay|one more|another)\b/i;

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

// ===================================================================
// A PROMPT A MEGJELENÍTÉS NYELVÉN (2026-10-20, user: „a trendeknél a magyarban vannak angol
// mondatok! ez így nem jó”). A `promptE` csak ANGOL szöveget ismer fel, ezért eddig a magyar és
// a spanyol oldal is az angol promptot kapta. A fordító a 💬-jelölést és a sorrendet megtartja
// → az angolban kiválasztott prompt HELYÉN álló fordított szöveget vesszük. Ha a két cikkben
// eltér a 💬-találatok száma, vagy a „fordítás” angolul maradt: nincs helyi prompt (null) —
// a hívó ilyenkor inkább kihagyja, mint hogy angol mondatot tegyen a magyar oldalra.
// ===================================================================
const ANGOL_SZO = /\b(the|and|your|you|with|for|this|that|please|write|make|give|my|me|is|are|of|to)\b/gi;
/** Angolul maradt-e a szöveg (nem angol oldalon)? */
export function angolNak(s) {
  const t = String(s || '');
  const en = (t.match(ANGOL_SZO) || []).length;
  const helyi = (t.match(/[áéíóöőúüűñ¿¡]|\b(és|egy|hogy|nekem|kérlek|el|la|los|las|que|para|con|una|por)\b/gi) || []).length;
  return en >= 4 && en > helyi * 2;
}

function nyersTalalatok(md) {
  const t = [];
  for (const m of md.matchAll(/💬[^\n]*\n+```[a-z]*\n([\s\S]*?)```/g)) t.push({ at: m.index, s: m[1], blokk: true });
  for (const m of md.matchAll(/💬[^\n:]*:\s*\*{0,2}["“„«]([^"”»\n]{40,})["”»]/g)) t.push({ at: m.index, s: m[1], blokk: false });
  return t.sort((a, b) => a.at - b.at).map(x => ({ ...x, s: tisztit(x.s) }));
}

/**
 * Az angol útmutató promptjai (ugyanaz a válogatás, mint a `promptokCikkbol`), mindegyik mellett a
 * helyi változat: [{ en, helyi }] — `helyi` null, ha nem található biztosan.
 */
export function helyiPromptok(mdEn, mdHelyi) {
  const en = typeof mdEn === 'string' ? nyersTalalatok(mdEn) : [];
  const hu = typeof mdHelyi === 'string' && mdHelyi ? nyersTalalatok(mdHelyi) : [];
  const igazodik = hu.length === en.length;
  const ki = [], latott = new Set();
  en.forEach((x, i) => {
    // az angol szabály: az idézőjeles (nem blokkos) prompt legalább 60 karakter
    if (!x.blokk && x.s.length < 60) return;
    if (x.s.length < PROMPT_MIN || x.s.length > PROMPT_MAX || !promptE(x.s)) return;
    const kulcs = x.s.toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (latott.has(kulcs)) return;
    latott.add(kulcs);
    const h = igazodik ? hu[i].s : '';
    ki.push({ en: x.s, helyi: h && h.length >= 20 && h.length <= PROMPT_MAX * 1.6 && !angolNak(h) ? h : null });
  });
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
    // Nem angol oldalon (`helyi`) a fordított cikk ugyanazon helyén álló prompt; ami nincs meg a
    // megjelenítés nyelvén, kimarad (2026-10-20, user: „ez van a prompttárban is”). A kulcs angol marad.
    const parok = c.helyi
      ? helyiPromptok(c.md, c.mdHelyi).filter(x => x.helyi).map(x => ({ en: x.en, szoveg: x.helyi }))
      : promptokCikkbol(c.md).map(p => ({ en: p, szoveg: p }));
    for (const { en, szoveg } of parok) {
      if (db >= CIKKENKENT_MAX) break;
      const kulcs = en.toLowerCase().replace(/[^a-z0-9]+/g, '');
      if (globalis.has(kulcs)) continue;
      globalis.add(kulcs);
      db++;
      bejegyzesek.push({ szoveg, en, slug: c.slug, title: c.title || '', tool: c.tool || '', trend: !!c.trend,
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
    .filter(e => !FOLYTATAS.test(e.en || e.szoveg) && !kiemeltSlug.has(e.slug) && kiemeltSlug.add(e.slug))
    .slice(0, KIEMELT_MAX);
  const kiemeltHalmaz = new Set(kiemelt);
  const tobbi = bejegyzesek.filter(e => !kiemeltHalmaz.has(e)).sort(ujElol);
  const temak = TEMAK.map(t => ({ id: t.id, lista: tobbi.filter(e => e.tema === t.id) })).filter(x => x.lista.length);
  const egyeb = tobbi.filter(e => !e.tema || !TEMAK.some(t => t.id === e.tema));
  return { kiemelt, temak, egyeb, ossz: bejegyzesek.length };
}

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ===================================================================
// MEGJELENÉS (2026-10-20, user: „a prompttárnak csinálj valami jobb dizájnt, mert ez nagyon gagyi —
// mintha csak egy felsorolás lenne, nem köti oda a szemet!”). A prompt az, amit az ember az MI-nek
// MOND → chat-buborékban áll, fölötte vastagon, MIRE JÓ (az útmutató címe). Felül chat-mezőre
// emlékeztető kereső és témagombok darabszámmal; az első felkapott „A nap promptja”; a témák két
// hasábban (CSS columns), így a rövid és a hosszú prompt nem hagy lyukat; a hosszú lenyitható.
// ===================================================================
const TEMA_JEL = { trending: '🔥', safe: '🛡️', money: '💵', home: '🏠', create: '🎨', learn: '🌱', work: '💼', explain: '💡', automate: '⚙️', more: '✨' };
const HOSSZU = 240;   // ennél hosszabb promptnál „Mutasd az egészet” (a másolás mindig a teljes szöveget viszi)
const MASOL_IKON = '<svg class="pl-copy-i" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="8" y="8" width="12" height="12" rx="2.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
const KERES_IKON = '<svg class="pl-compose-i" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M15.5 15.5 21 21" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';

function kartya(e, sz, fo = false) {
  const szoveg = esc(e.szoveg).replace(/\[[^\]\n]{2,80}\]/g, m => `<span class="pl-fill">${m}</span>`);
  const hosszu = !fo && (e.szoveg.length > HOSSZU || (e.szoveg.match(/\n/g) || []).length > 4);   // a nap promptja mindig teljes
  return `<article class="pl-card${fo ? ' pl-card--fo' : ''}${hosszu ? ' pl-card--hosszu' : ''}">
      ${fo ? `<p class="pl-day">${esc(sz.nap || '')}</p>` : ''}
      <h3 class="pl-goal"><a href="article/${esc(e.slug)}">${esc(e.title || '')}</a></h3>
      <div class="pl-bubble"><pre class="pl-text">${szoveg}</pre></div>
      ${hosszu ? `<button class="pl-more" type="button" aria-expanded="false" data-less="${esc(sz.kevesebb || '')}">${esc(sz.mutasd || '')}</button>` : ''}
      <div class="pl-foot">${e.tool ? `<span class="pl-tool">${esc(e.tool)}</span>` : ''}<a class="pl-guide" href="article/${esc(e.slug)}">${esc(sz.utmutato)}</a><button class="pl-copy" type="button" data-copied="${esc(sz.masolva)}">${MASOL_IKON}<span class="pl-copy-l">${esc(sz.masol)}</span></button></div>
    </article>`;
}

// Másolás (eseménydelegálással; a Felkapott oldal prompt-dobozát is ez kezeli) + lenyitás + szűrés
// gépelés közben (üres találatnál üzenet). A vágólap-API hiányában a gomb nem csinál semmit.
export const SZKRIPT = `<script>(function(){document.addEventListener('click',function(e){var m=e.target.closest&&e.target.closest('.pl-more');if(m){var c=m.closest('.pl-card'),o=c.classList.toggle('pl-card--nyitott');m.setAttribute('aria-expanded',o);if(!m.dataset.more)m.dataset.more=m.textContent;m.textContent=o?m.dataset.less:m.dataset.more;return}var b=e.target.closest&&e.target.closest('.pl-copy');if(!b||!navigator.clipboard)return;var t=b.closest('.pl-card').querySelector('.pl-text').innerText;navigator.clipboard.writeText(t).then(function(){var l=b.querySelector('.pl-copy-l')||b,x=l.textContent;l.textContent=b.getAttribute('data-copied');b.classList.add('pl-copy--ok');setTimeout(function(){l.textContent=x;b.classList.remove('pl-copy--ok')},1600)})});var q=document.getElementById('plSearch');if(!q)return;var n=document.getElementById('plNone');q.addEventListener('input',function(){var v=q.value.toLowerCase().trim(),db=0;document.querySelectorAll('.pl-card').forEach(function(c){var j=!v||c.textContent.toLowerCase().indexOf(v)>-1;c.style.display=j?'':'none';if(j)db++});document.querySelectorAll('.pl-sec').forEach(function(s){var l=s.querySelectorAll('.pl-card:not([style*="none"])').length;s.style.display=l?'':'none'});if(n)n.hidden=db>0})})();</script>`;

/**
 * Az oldal törzse. `sz`: felületi szövegek (kereses = a kereső helyőrzője; nap = „A nap promptja”;
 * mutasd/kevesebb = lenyitás; nincs = üres találat); `temaNev(id)`: a téma neve az adott nyelven.
 */
// 📢 2026-10-21 (user: „ide is rakjunk erre az oldalra reklámot!”): EGY hirdetés, az első („Felkapott és új”)
// szakasz UTÁN, a témák előtt — szakaszok közti térközben, a Másolás gomboktól távol (mint a /trending-en).
// 📄 2026-10-28: `fejlecHtml` = papírlapos fejléc (core/lap-hero.js) a régi pl-hero cím+bevezető helyett.
export function promptTarHtml(tar, { sz, temaNev, nyelvTipp = '', eszkozok = '', promptokCim = '', hirdetes = '', fejlecHtml = '' }) {
  const fejlec = (id, cim, db) => `<h2 class="pl-h"><span class="pl-h-i" aria-hidden="true">${TEMA_JEL[id] || '✨'}</span>${esc(cim)}<span class="pl-h-db">${db}</span></h2>`;
  const szakasz = (id, cim, lista) => lista.length ? `<section class="pl-sec" id="${esc(id)}">
    ${fejlec(id, cim, lista.length)}
    <div class="pl-cols">${lista.map(e => kartya(e, sz)).join('\n')}</div>
  </section>` : '';
  const [fo, ...tobbiKiemelt] = tar.kiemelt;
  const gombok = [...(tar.kiemelt.length ? [['trending', sz.kiemeltCim, tar.kiemelt.length]] : []),
    ...tar.temak.map(x => [x.id, temaNev(x.id), x.lista.length]),
    ...(tar.egyeb.length ? [['more', sz.egyebCim, tar.egyeb.length]] : [])]
    .map(([id, c, db]) => `<a class="pl-chip" href="#${esc(id)}"><span aria-hidden="true">${TEMA_JEL[id] || '✨'}</span>${esc(c)}<span class="pl-chip-db">${db}</span></a>`).join('');
  const promptokH = `<h2 class="pl-h"><span class="pl-h-i" aria-hidden="true">📋</span>${esc(promptokCim)}</h2>`;
  const eleje = fejlecHtml
    ? `${fejlecHtml}${eszkozok}
    <section class="pl-hero pl-hero--promptok">${eszkozok ? promptokH : ''}`
    : `<section class="pl-hero">
      <h1 class="pl-h1">${esc(sz.cim)}</h1>
      <p class="pl-lead">${esc(sz.tag)}</p>
      ${eszkozok ? `</section>
    ${eszkozok}
    <section class="pl-hero pl-hero--promptok">${promptokH}` : ''}`;
  return `<div class="pl-page">${eleje}
      <label class="pl-compose">${KERES_IKON}<input id="plSearch" class="pl-search" type="search" placeholder="${esc(sz.kereses)}" aria-label="${esc(sz.kereses)}"><span class="pl-total">${esc(sz.db(tar.ossz))}</span></label>
      <nav class="pl-chips" aria-label="${esc(sz.kicker || '')}">${gombok}</nav>
    </section>
    ${nyelvTipp ? `<p class="pl-tip">${esc(nyelvTipp)}</p>` : ''}
    <p id="plNone" class="pl-none" hidden>${esc(sz.nincs || '')}</p>
    ${fo ? `<section class="pl-sec pl-sec--kiemelt" id="trending">
      ${fejlec('trending', sz.kiemeltCim, tar.kiemelt.length)}
      ${kartya(fo, sz, true)}
      ${tobbiKiemelt.length ? `<div class="pl-cols">${tobbiKiemelt.map(e => kartya(e, sz)).join('\n')}</div>` : ''}
    </section>` : ''}
    ${hirdetes ? `<div class="pl-ad">${hirdetes}</div>` : ''}
    ${tar.temak.map(x => szakasz(x.id, temaNev(x.id), x.lista)).join('\n')}
    ${szakasz('more', sz.egyebCim, tar.egyeb)}</div>
    ${SZKRIPT}`;
}
