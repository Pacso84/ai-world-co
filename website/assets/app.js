// ===================================================================
// AI WORLD — Front-end interakciók (vanilla JS, könyvtár nélkül)
// + AOS (Animate On Scroll) inicializálás
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

  // ---------- 1. AOS scroll-animációk inicializálás ----------
  if (window.AOS) {
    AOS.init({
      duration: 650,
      easing: 'ease-out-cubic',
      once: true,
      offset: 60
    });
  }

  // ---------- 2. SÖTÉT MÓD kapcsoló (localStorage-ba menti) ----------
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
