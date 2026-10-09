// ===================================================================
// AI WORLD — Front-end interakciók (vanilla JS, könyvtár nélkül)
// ===================================================================

(function () {
  'use strict';

  // ---------- 0. ál-domain eltüntetése (user-kérés 2026-07-03) ----------
  // A pages.dev címen érkezőket azonnal a saját domainre visszük. (A Cloudflare
  // a _redirects fájlból host-alapú átirányítást nem támogat; a keresőknek a
  // canonical linkek amúgy is a saját domainre mutatnak.)
  if (location.hostname === 'aiworldco.pages.dev') {
    location.replace('https://aiworldhq.com' + location.pathname + location.search + location.hash);
    return;
  }

  // ---------- 1. SÖTÉT MÓD kapcsoló (localStorage-ba menti) ----------
  const root = document.documentElement;
  const toggle = document.getElementById('themeToggle');

  // localStorage BIZTONSÁGOSAN — ha a böngésző/biztonsági szoftver blokkolja,
  // NE dobjon kivételt (különben az egész app.js leállna: szűrő, hamburger, stb.)
  function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch { /* blokkolt — nem baj */ } }

  // Mentett preferencia visszaállítása
  const saved = lsGet('aiworld-theme');
  if (saved === 'dark') {
    root.setAttribute('data-theme', 'dark');
    updateToggleIcon(true);
  }

  if (toggle) {
    toggle.addEventListener('click', function () {
      const isDark = root.getAttribute('data-theme') === 'dark';
      if (isDark) {
        root.removeAttribute('data-theme');
        lsSet('aiworld-theme', 'light');
        updateToggleIcon(false);
      } else {
        root.setAttribute('data-theme', 'dark');
        lsSet('aiworld-theme', 'dark');
        updateToggleIcon(true);
      }
    });
  }

  function updateToggleIcon(isDark) {
    const icon = toggle && toggle.querySelector('.theme-toggle__icon');
    if (icon) icon.textContent = isDark ? '☀' : '☾';
  }

  // ---------- 3. KATEGÓRIA SZŰRŐ ----------
  // A célközönség-szűrő mostantól TISZTA CSS (rejtett rádiók + :checked szabályok
  // a style.css-ben), így JavaScript nélkül is működik — nem függ attól, hogy a
  // böngésző/biztonsági szoftver engedi-e a scriptet. Itt nincs teendő.

  // ---------- 3b. NAVBAR árnyék görgetésnél ----------
  const navbar = document.getElementById('navbar');
  if (navbar) {
    window.addEventListener('scroll', function () {
      navbar.classList.toggle('navbar--scrolled', window.scrollY > 10);
    }, { passive: true });
  }

  // ---------- 3c. HAMBURGER MENÜ (mobil) ----------
  const burger = document.getElementById('navBurger');
  const navMenu = document.getElementById('navMenu');
  if (burger && navbar && navMenu) {
    const setOpen = function (open) {
      navbar.classList.toggle('navbar--open', open);
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    };
    burger.addEventListener('click', function (e) {
      e.stopPropagation();
      setOpen(!navbar.classList.contains('navbar--open'));
    });
    // Link választásra zárjon be
    navMenu.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () { setOpen(false); });
    });
    // Kattintás a menün kívül → zár
    document.addEventListener('click', function (e) {
      if (navbar.classList.contains('navbar--open') && !navbar.contains(e.target)) setOpen(false);
    });
    // Escape → zár; nagyobb képernyőre váltáskor reset
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setOpen(false); });
    window.addEventListener('resize', function () { if (window.innerWidth > 760) setOpen(false); });
  }

  // ---------- 4. OLVASÁSI FOLYAMATJELZŐ (cikk oldalakon) ----------
  const progressBar = document.getElementById('progressBar');
  if (progressBar) {
    window.addEventListener('scroll', function () {
      const h = document.documentElement;
      const scrolled = h.scrollTop;
      const height = h.scrollHeight - h.clientHeight;
      const pct = height > 0 ? (scrolled / height) * 100 : 0;
      progressBar.style.width = pct + '%';
    }, { passive: true });
  }
})();

// ===================================================================
// VILLÁMKERESŐ (2026-07-07) — navbar 🔍 → overlay, gépelés közben szűr.
// Az indexet (search.json, nyelvenként) csak az első megnyitáskor tölti.
// ===================================================================
(function () {
  'use strict';
  var tog = document.getElementById('searchToggle');
  var ov = document.getElementById('searchOverlay');
  var inp = document.getElementById('searchInput');
  var res = document.getElementById('searchResults');
  if (!tog || !ov || !inp || !res) return;

  var seg = location.pathname.split('/')[1];
  var pref = ['hu', 'es'].indexOf(seg) !== -1 ? '/' + seg : '';
  var idx = null;

  function esc(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  function render(q) {
    q = (q || '').trim().toLowerCase();
    if (q.length < 2) { res.innerHTML = ''; return; }
    if (!idx) return;
    var scored = [];
    for (var i = 0; i < idx.length; i++) {
      var a = idx[i];
      var t = a.t.toLowerCase(), s = (a.s || '').toLowerCase(), b = (a.b || '').toLowerCase();
      var score = -1;
      if (t.indexOf(q) === 0) score = 0;
      else if (t.indexOf(q) !== -1) score = 1;
      else if (b.indexOf(q) !== -1) score = 2;
      else if (s.indexOf(q) !== -1) score = 3;
      if (score >= 0) scored.push([score, a]);
    }
    scored.sort(function (x, y) { return x[0] - y[0]; });
    var top = scored.slice(0, 10);
    if (!top.length) { res.innerHTML = '<p class="search-empty">' + esc(res.getAttribute('data-noresults') || 'No results') + '</p>'; return; }
    res.innerHTML = top.map(function (p) {
      var a = p[1];
      return '<a class="search-hit" href="' + pref + (a.p ? a.p : '/article/' + a.u + '.html') + '">' +
        '<span class="search-hit__ico">' + (a.p ? '📖' : a.g ? '📘' : '📰') + '</span>' +
        '<span><span class="search-hit__t">' + esc(a.t) + '</span>' +
        (a.s ? '<span class="search-hit__s">' + esc(a.s) + '</span>' : '') + '</span></a>';
    }).join('');
  }

  function open() {
    ov.hidden = false;
    document.body.style.overflow = 'hidden';
    inp.focus();
    if (!idx) {
      fetch(pref + '/search.json').then(function (r) { return r.json(); })
        .then(function (d) { idx = d; render(inp.value); })
        .catch(function () { /* index nélkül nincs találat */ });
    }
  }
  function close() { ov.hidden = true; document.body.style.overflow = ''; }

  tog.addEventListener('click', function () { ov.hidden ? open() : close(); });
  ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !ov.hidden) close();
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); ov.hidden ? open() : close(); }
  });
  inp.addEventListener('input', function () { render(inp.value); });
})();

// ===================================================================
// LÉPÉS-KIPIPÁLÁS (2026-07-07) — az útmutató lépés-számára kattintva
// pipa lesz; a haladást a böngésző megjegyzi (localStorage, oldalanként).
// ===================================================================
(function () {
  'use strict';
  var steps = document.querySelectorAll('.g-step');
  if (!steps.length) return;
  var key = 'aiworld-steps:' + location.pathname;
  function lsGet() { try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch (e) { return []; } }
  function lsSet(v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* blokkolva — nem baj */ } }
  var done = lsGet();

  steps.forEach(function (step) {
    var no = step.querySelector('.g-step__no');
    if (!no) return;
    var id = step.id || '';
    var orig = no.textContent;
    function apply(isDone) {
      step.classList.toggle('g-step--done', isDone);
      no.textContent = isDone ? '✓' : orig;
      no.setAttribute('title', isDone ? '✓' : '');
    }
    if (done.indexOf(id) !== -1) apply(true);
    no.addEventListener('click', function () {
      var i = done.indexOf(id);
      if (i === -1) { done.push(id); apply(true); }
      else { done.splice(i, 1); apply(false); }
      lsSet(done);
    });
  });
})();

// ===================================================================
// 👍/👎 OLVASÓI VISSZAJELZÉS (2026-07-07) — a Workernek küldi, egyszer/cikk
// ===================================================================
(function () {
  'use strict';
  var box = document.querySelector('.fb');
  if (!box) return;
  var slug = box.getAttribute('data-slug');
  var key = 'aiworld-fb:' + slug;
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }
  function thank() { box.innerHTML = '<span class="fb__q">' + (box.getAttribute('data-thanks') || '💛') + '</span>'; }
  if (lsGet(key)) { thank(); return; }
  var seg = location.pathname.split('/')[1];
  var lang = ['hu', 'es'].indexOf(seg) !== -1 ? seg : 'en';
  box.querySelectorAll('.fb__btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      lsSet(key, btn.getAttribute('data-vote'));
      thank();
      fetch('https://aiworld-telegram.pacsi84.workers.dev/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: slug, lang: lang, vote: btn.getAttribute('data-vote') })
      }).catch(function () { /* csendes — a köszönet már kint van */ });
    });
  });
})();

// ===================================================================
// 🛒 AMAZON PARTNERLINK KATTINTÁS (2026-10-09) — core/affiliate.js
// ===================================================================
// A link KÖZVETLENÜL az Amazonra megy (átirányítás = nincs jutalék), ezért a
// kattintást a háttérben jelezzük a Workernek. A jel hibája néma: a link
// ettől függetlenül megnyílik (új lapon).
(function () {
  'use strict';
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('.aff__btn') : null;
    if (!a) return;
    var box = a.closest('.aff');
    var p = box ? box.getAttribute('data-aff') : '';
    if (!p) return;
    try {
      fetch('https://aiworld-telegram.pacsi84.workers.dev/aff-hit', {
        method: 'POST', keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ p: p })
      }).catch(function () { /* a számláló hibája nem az olvasó gondja */ });
    } catch (err) { /* régi böngésző */ }
  });
})();


// ---------- „Másolás" gomb a beírandó mintákon (2026-09-27) ----------
// A doboz szövegét másolja (a ➤ jel nélkül); siker után 2 mp-ig „Kimásolva!".
(function () {
  document.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest ? e.target.closest('.g-copy') : null;
    if (!btn) return;
    var box = btn.parentNode && btn.parentNode.querySelector('.g-prompt__box');
    if (!box) return;
    var clone = box.cloneNode(true);
    var send = clone.querySelector('.g-prompt__send');
    if (send) send.remove();
    var text = (clone.innerText || clone.textContent || '').trim();
    var eredeti = btn.textContent;
    function kesz() {
      btn.textContent = btn.getAttribute('data-copied') || '✓';
      btn.classList.add('g-copy--ok');
      setTimeout(function () { btn.textContent = eredeti; btn.classList.remove('g-copy--ok'); }, 2000);
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(kesz, function () {});
      else {
        var ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); kesz();
      }
    } catch (err) { /* a másolás nem kritikus */ }
  });
})();
