/* AI World HQ — ügyfélszolgálati chat-doboz + űrlap (2026-07-20).
   Vanilla JS, lusta init: a panel + a Turnstile CSAK az első kattintásra épül.
   Külső szkript KIZÁRÓLAG a Cloudflare Turnstile (challenges.cloudflare.com). */
(function () {
  'use strict';
  var cfg = window.__csCfg; if (!cfg) return;
  var fab = document.getElementById('cs-fab');
  // Turnstile-tokenek EGYSZER használatosak (a Worker verifyTurnstile elfogyasztja
  // az első /chat vagy /contact hívásnál) — ezért a chat-panel, a beépített
  // about-űrlap és a panel-mini-űrlap MINDHÁROM a SAJÁT tokenjét tartja.
  var panel = null, log = null, sessionId = sessionStorage.getItem('csSess') || '';
  var tsToken = '', formTsToken = '', miniTsToken = '';

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; }

  function loadTurnstile(cb) {
    if (window.turnstile) return cb();
    var s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true; s.onload = cb;
    document.head.appendChild(s);
  }
  function renderTs(container, cb) {
    loadTurnstile(function () {
      window.turnstile.render(container, {
        sitekey: cfg.key, appearance: 'interaction-only',
        callback: function (t) { cb && cb(t); }
      });
    });
  }

  function addMsg(cls, text) {
    var m = el('div', 'cs-msg ' + cls); m.textContent = text;
    log.appendChild(m); log.scrollTop = log.scrollHeight; return m;
  }
  function addLinks(links) {
    if (!links || !links.length) return;
    var box = el('div', 'cs-links');
    links.forEach(function (l) {
      var a = el('a', 'cs-link', '📖 ' + l.t); a.href = l.u; box.appendChild(a);
    });
    log.appendChild(box); log.scrollTop = log.scrollHeight;
  }

  function showForm() {
    // Idempotens: ha a mini-űrlap már létrejött, csak megmutatjuk — a MEGLÉVŐ
    // (még fel nem használt) miniTsToken-t nem cseréljük, nem renderelünk újra Turnstile-t.
    var f = panel.querySelector('.cs-panel__form'); if (f) { f.hidden = false; return; }
    f = el('div', 'cs-panel__form');
    f.innerHTML = '<input type="email" placeholder="' + cfg.ui.email + '" maxlength="120">' +
      '<textarea placeholder="' + cfg.ui.msg + '" maxlength="2000" rows="3"></textarea>' +
      '<input type="text" class="cs-hp" tabindex="-1" autocomplete="off" aria-hidden="true">' +
      '<div class="cs-ts cs-mini-ts"></div>' +
      '<button type="button">' + cfg.ui.submit + '</button><p class="cs-status" aria-live="polite"></p>';
    panel.appendChild(f);
    renderTs(f.querySelector('.cs-mini-ts'), function (t) { miniTsToken = t; });
    f.querySelector('button').addEventListener('click', function () {
      var email = f.querySelector('input').value.trim(), msg = f.querySelector('textarea').value.trim();
      var st = f.querySelector('.cs-status');
      if (!email || !msg) return;
      fetch(cfg.base + '/contact', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, message: msg, lang: cfg.lang, web: f.querySelector('.cs-hp').value, token: miniTsToken })
      }).then(function (r) { st.textContent = r.ok ? cfg.ui.ok : cfg.ui.err; if (r.ok) { f.querySelector('textarea').value = ''; } })
        .catch(function () { st.textContent = cfg.ui.err; });
    });
  }

  function send(input) {
    var text = input.value.trim(); if (!text) return;
    input.value = '';
    addMsg('cs-msg--me', text);
    var wait = addMsg('cs-msg--bot cs-msg--wait', cfg.ui.thinking);
    fetch(cfg.base + '/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, lang: cfg.lang, sessionId: sessionId, token: tsToken })
    }).then(function (r) { return r.json().then(function (j) { return { s: r.status, j: j }; }); })
      .then(function (o) {
        wait.remove();
        if (o.j.sessionId) { sessionId = o.j.sessionId; sessionStorage.setItem('csSess', sessionId); }
        addMsg('cs-msg--bot', o.j.answer || cfg.ui.err);
        addLinks(o.j.links);
        if (o.j.escalate) showForm();
      })
      .catch(function () { wait.remove(); addMsg('cs-msg--bot', cfg.ui.err); });
  }

  function openPanel() {
    if (panel) { panel.hidden = !panel.hidden; return; }
    panel = el('div', 'cs-panel');
    var head = el('div', 'cs-panel__head', cfg.ui.title);
    var x = el('button', 'cs-panel__x', '×'); x.setAttribute('aria-label', 'close');
    x.addEventListener('click', function () { panel.hidden = true; });
    head.appendChild(x);
    log = el('div', 'cs-panel__log');
    var row = el('div', 'cs-panel__row');
    var input = el('input', 'cs-panel__in'); input.placeholder = cfg.ui.ph; input.maxLength = 500;
    var btn = el('button', 'cs-panel__send', cfg.ui.send);
    var human = el('button', 'cs-panel__human', cfg.ui.human);
    var tsBox = el('div', 'cs-ts');
    row.appendChild(input); row.appendChild(btn);
    panel.appendChild(head); panel.appendChild(log); panel.appendChild(row); panel.appendChild(human); panel.appendChild(tsBox);
    document.body.appendChild(panel);
    addMsg('cs-msg--bot', cfg.ui.hello);
    renderTs(tsBox, function (t) { tsToken = t; });
    btn.addEventListener('click', function () { send(input); });
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') send(input); });
    human.addEventListener('click', showForm);
  }
  fab && fab.addEventListener('click', openPanel);

  // Az about-oldal beépített űrlapja (ha van az oldalon)
  var pf = document.getElementById('cs-form');
  if (pf) {
    renderTs(document.getElementById('cs-form-ts'), function (t) { formTsToken = t; });
    pf.addEventListener('submit', function (e) {
      e.preventDefault();
      var st = pf.querySelector('.cs-status');
      fetch(cfg.base + '/contact', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: pf.name.value.trim(), email: pf.email.value.trim(),
          message: pf.message.value.trim(), lang: cfg.lang, web: pf.web.value, token: formTsToken
        })
      }).then(function (r) { st.textContent = r.ok ? cfg.ui.ok : cfg.ui.err; if (r.ok) pf.reset(); })
        .catch(function () { st.textContent = cfg.ui.err; });
    });
  }
})();
