// 📄 PAPÍRLAPOS FEJLÉC (2026-10-28, user: „ez tetszik, de minden oldalra kéne!”).
// A Biztonságos bemásolás eszköz dizájnja (megdöntött papírlap + pecsét, zsályazöld
// számozott sáv) közös építőkockaként: előbb a főoldal és a szótár, utána a többi oldal.
// Tiszta függvények, hálózat és fájl nélkül — a build.js hívja, a lap-hero.test.js őrzi.

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const LAP_SZ = {
  en: {
    homeH1: 'Everyday AI, explained simply.',
    homeLead: 'Short news about the AI tools you already use, in plain English. Plus step-by-step guides and free tools. New stories every day.',
    lapMa: "In today's issue", lapFriss: 'Latest stories',
    ujMa: n => `${n} new today`, ujHet: n => `${n} this week`,
    sav: [['Read the news', 'What changed, in 3 minutes'], ['Follow a guide', 'Step by step, with prompts to copy'], ['Try a free tool', 'Runs in your browser']],
    glBadge: n => `${n} words · plain English`,
    glLead: 'Saw a word in the news and nodded along? Look it up here. Every entry is one short explanation, no jargon.',
    glKeres: 'Find a word, e.g. token', glKeresL: 'Find a word',
    glNap: 'Word of the day', glPecset: 'No jargon', glDb: n => `${n} words`,
    glNincs: 'No word matches that yet. Try a shorter search, or ask our AI assistant in the corner.',
    csop: { alapok: ['The basics', 'Start here: the words behind every AI headline.'], hasznalat: ['Using AI day to day', 'What you meet when you type, talk or create.'], bovitmenyek: ['Add-ons and agents', 'How AI connects to other apps and does tasks for you.'], biztonsag: ['Staying safe', 'Mistakes, fakes and the rules meant to stop them.'] }
  },
  hu: {
    homeH1: 'A hétköznapi AI, érthetően.',
    homeLead: 'Rövid hírek a már használt AI-eszközeidről, közérthetően. Mellé lépésről lépésre útmutatók és ingyenes eszközök. Minden nap új cikkek.',
    lapMa: 'A mai számban', lapFriss: 'A legfrissebb cikkek',
    ujMa: n => `ma ${n} új`, ujHet: n => `${n} a héten`,
    sav: [['Olvasd el a híreket', 'Mi változott, 3 percben'], ['Kövess egy útmutatót', 'Lépésről lépésre, másolható promptokkal'], ['Próbálj ki egy ingyenes eszközt', 'A böngésződben fut']],
    glBadge: n => `${n} szó · közérthetően`,
    glLead: 'Láttál egy szót a hírekben, és csak bólintottál? Itt megtalálod. Minden szó egy rövid magyarázat, szakzsargon nélkül.',
    glKeres: 'Keress egy szót, pl. token', glKeresL: 'Szó keresése',
    glNap: 'A nap szava', glPecset: 'Zsargon nélkül', glDb: n => `${n} szó`,
    glNincs: 'Erre még nincs találat. Próbálj rövidebb szót, vagy kérdezd a sarokban az AI-asszisztensünket.',
    csop: { alapok: ['Az alapok', 'Itt kezdd: a szavak minden AI-hír mögött.'], hasznalat: ['Az AI a mindennapokban', 'Amivel gépelés, beszéd vagy alkotás közben találkozol.'], bovitmenyek: ['Bővítmények és ügynökök', 'Hogyan kapcsolódik az AI más appokhoz, és hogyan végez el feladatokat helyetted.'], biztonsag: ['Biztonságban', 'Tévedések, hamisítványok és a szabályok, amelyek megfékeznék őket.'] }
  },
  es: {
    homeH1: 'La IA cotidiana, explicada fácil.',
    homeLead: 'Noticias breves sobre las herramientas de IA que ya usas, en lenguaje claro. Además, guías paso a paso y herramientas gratuitas. Artículos nuevos cada día.',
    lapMa: 'En el número de hoy', lapFriss: 'Lo más reciente',
    ujMa: n => `${n} nuevos hoy`, ujHet: n => `${n} esta semana`,
    sav: [['Lee las noticias', 'Qué cambió, en 3 minutos'], ['Sigue una guía', 'Paso a paso, con prompts para copiar'], ['Prueba una herramienta gratis', 'Funciona en tu navegador']],
    glBadge: n => `${n} palabras · lenguaje claro`,
    glLead: '¿Viste una palabra en las noticias y asentiste sin entenderla? Búscala aquí. Cada entrada es una explicación breve, sin jerga.',
    glKeres: 'Busca una palabra, p. ej. token', glKeresL: 'Buscar una palabra',
    glNap: 'Palabra del día', glPecset: 'Sin jerga', glDb: n => `${n} palabras`,
    glNincs: 'Todavía no hay coincidencias. Prueba con una búsqueda más corta o pregunta a nuestro asistente de IA en la esquina.',
    csop: { alapok: ['Lo básico', 'Empieza aquí: las palabras detrás de cada titular de IA.'], hasznalat: ['La IA en el día a día', 'Lo que encuentras al escribir, hablar o crear.'], bovitmenyek: ['Complementos y agentes', 'Cómo la IA se conecta con otras apps y hace tareas por ti.'], biztonsag: ['Con seguridad', 'Errores, falsificaciones y las reglas para frenarlos.'] }
  }
};
const sz = lang => LAP_SZ[lang] || LAP_SZ.en;

// A szótár olvasási sorrendje: az alapoktól a biztonságig (ezért számozott).
export const SZOTAR_CSOPORT = [
  { id: 'alapok', t: ['ai', 'chatbot', 'llm', 'model', 'generative-ai', 'machine-learning', 'algorithm', 'neural-network', 'gpt', 'foundation-model', 'training-data', 'nlp', 'computer-vision', 'multimodal'] },
  { id: 'hasznalat', t: ['prompt', 'prompt-engineering', 'token', 'context-window', 'reasoning-model', 'knowledge-cutoff', 'image-generator', 'voice-assistant', 'machine-translation', 'copilot', 'ai-avatar', 'recommendation-system'] },
  { id: 'bovitmenyek', t: ['ai-agent', 'ai-skill', 'plugin', 'mcp', 'api', 'rag', 'fine-tuning', 'open-source-model', 'benchmark', 'chip-gpu'] },
  { id: 'biztonsag', t: ['hallucination', 'bias', 'deepfake', 'voice-cloning', 'facial-recognition', 'jailbreak', 'guardrails', 'watermark', 'agi', 'superintelligence'] }
];

/** A szótár szavai csoportokba; a csoportba nem sorolt (később felvett) szó az alapok végére kerül — sosem vész el. */
export function szotarCsoportok(terms) {
  const byId = new Map((terms || []).map(t => [t.id, t]));
  const hasznalt = new Set();
  const csop = SZOTAR_CSOPORT.map(c => ({ id: c.id, szavak: c.t.filter(id => byId.has(id)).map(id => { hasznalt.add(id); return byId.get(id); }) }));
  const maradek = (terms || []).filter(t => !hasznalt.has(t.id));
  csop[0].szavak.push(...maradek);
  return csop.filter(c => c.szavak.length);
}

/** A nap szava: a dátumból számolt, napról napra lépő index (a napi 3 build ugyanazt adja). */
export function napSzava(terms, datum = new Date()) {
  if (!terms || !terms.length) return null;
  const nap = Math.floor(Date.UTC(datum.getUTCFullYear(), datum.getUTCMonth(), datum.getUTCDate()) / 864e5);
  return terms[nap % terms.length];
}

/** Számozott sáv: [{href, cimke, al}] */
export function lapSavHtml(elemek) {
  return `<ol class="lh-sav" style="--n:${elemek.length}">${elemek.map((e, i) => `<li><a href="${esc(e.href)}"><span class="lh-num">${i + 1}</span><span class="lh-sav-t">${esc(e.cimke)}</span></a>${e.al ? `<small>${esc(e.al)}</small>` : ''}</li>`).join('')}</ol>`;
}

/** Papírlap: fej (ikon + felirat), törzs (kész HTML), pecsét. */
export function lapHtml({ ikon = 'AI', fej, torzs, pecset = '', ariaHidden = false }) {
  return `<div class="lh-lap"${ariaHidden ? ' aria-hidden="true"' : ''}>
      <span class="lh-lap-fej"><span class="lh-lap-ai">${esc(ikon)}</span>${esc(fej)}</span>
      ${torzs}
      ${pecset ? `<span class="lh-stamp">${esc(pecset)}</span>` : ''}
    </div>`;
}

/** Kétoszlopos fejléc: bal oldalt címke + cím + bevezető (+ extra), jobbra a papírlap. */
export function lapHeroHtml({ badge, badgeIkon = '', h1, lead, extra = '', lap, sav = '' }) {
  return `<section class="lh-hero">
  <div class="lh-top">
    <div>
      ${badge ? `<p class="lh-badge">${badgeIkon ? `<span aria-hidden="true">${badgeIkon}</span> ` : ''}${esc(badge)}</p>` : ''}
      <h1 class="lh-h1">${esc(h1)}</h1>
      ${lead ? `<p class="lh-lead">${esc(lead)}</p>` : ''}
      ${extra}
    </div>
    ${lap}
  </div>
  ${sav}
</section>`;
}

/**
 * Főoldal-fejléc. maiak = a mai cikkek, frissek = a legutóbbiak (ha ma még nincs cikk);
 * egy cikk: { href, cim }. Hajnalban (ma még 0 cikk) a „Legfrissebb” lap jön, heti számmal.
 */
export function fooldalHeroHtml({ lang, kicker, maiak = [], frissek = [], hetiDb = 0, eszkozHref = 'safe-paste', utmutatoHref = 'guides' }) {
  const s = sz(lang);
  const vanMai = maiak.length > 0;
  const lista = (vanMai ? maiak : frissek).slice(0, 4);
  const torzs = `<ol class="lh-ma">${lista.map(c => `<li><a href="${esc(c.href)}">${esc(c.cim)}</a></li>`).join('')}</ol>`;
  const pecset = vanMai ? s.ujMa(maiak.length) : (hetiDb ? s.ujHet(hetiDb) : '');
  const sav = lapSavHtml([
    { href: '#newsfeed', cimke: s.sav[0][0], al: s.sav[0][1] },
    { href: utmutatoHref, cimke: s.sav[1][0], al: s.sav[1][1] },
    { href: eszkozHref, cimke: s.sav[2][0], al: s.sav[2][1] }
  ]);
  return lapHeroHtml({
    badge: kicker, badgeIkon: '📰', h1: s.homeH1, lead: s.homeLead,
    lap: lista.length ? lapHtml({ fej: vanMai ? s.lapMa : s.lapFriss, torzs, pecset }) : '',
    sav
  });
}

const KERESO_IKON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';

/** A teljes szótár-oldal törzse (a pageShell bodyContent-je). */
export function szotarOldalHtml({ terms, lang, cim, datum = new Date(), utoHtml = '' }) {
  const s = sz(lang);
  const loc = t => t[lang] || t.en;
  const csop = szotarCsoportok(terms);
  const nap = napSzava(terms, datum);
  const lap = nap ? lapHtml({
    ikon: 'Aa', fej: s.glNap, pecset: s.glPecset, ariaHidden: true,
    torzs: `<p class="lh-szo">${esc(loc(nap).term)}</p>
      <p class="lh-szo-def">${esc(loc(nap).def)}</p>`
  }) : '';
  const extra = `<label class="lh-kereso">${KERESO_IKON}<input id="lhQ" type="search" placeholder="${esc(s.glKeres)}" autocomplete="off" aria-label="${esc(s.glKeresL)}"></label>`;
  const sav = lapSavHtml(csop.map(c => ({ href: '#' + c.id, cimke: s.csop[c.id][0], al: s.glDb(c.szavak.length) })));
  const csoportok = csop.map((c, i) => `<section class="lh-csoport" id="${c.id}" aria-labelledby="${c.id}-h">
    <h2 class="lh-csoport-h" id="${c.id}-h"><span class="lh-num">${i + 1}</span>${esc(s.csop[c.id][0])}</h2>
    <p class="lh-csoport-p">${esc(s.csop[c.id][1])}</p>
    <dl class="lh-lista">${c.szavak.map(t => `<div class="lh-tetel" id="${esc(t.id)}"><dt><a href="#${esc(t.id)}">${esc(loc(t).term)}</a></dt><dd>${esc(loc(t).def)}</dd></div>`).join('')}</dl>
  </section>`).join('\n');
  return lapHeroHtml({ badge: s.glBadge(terms.length), badgeIkon: '📖', h1: cim, lead: s.glLead, extra, lap, sav })
    + csoportok
    + `<p class="lh-nincs" id="lhNincs" hidden>${esc(s.glNincs)}</p>`
    + utoHtml
    + `<script>(function(){var q=document.getElementById('lhQ'),n=document.getElementById('lhNincs');if(!q)return;q.addEventListener('input',function(){var v=q.value.trim().toLowerCase(),db=0;document.querySelectorAll('.lh-csoport').forEach(function(c){var l=0;c.querySelectorAll('.lh-tetel').forEach(function(t){var ok=!v||t.textContent.toLowerCase().indexOf(v)>-1;t.hidden=!ok;if(ok)l++;});c.hidden=!l;db+=l;});n.hidden=db>0;});})();</script>`;
}
