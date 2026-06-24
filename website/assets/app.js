// ===================================================================
// AI WORLD — Front-end interakciók (vanilla JS, könyvtár nélkül)
// + AOS (Animate On Scroll) inicializálás
// ===================================================================

(function () {
  'use strict';

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

  // Mentett preferencia visszaállítása
  const saved = localStorage.getItem('aiworld-theme');
  if (saved === 'dark') {
    root.setAttribute('data-theme', 'dark');
    updateToggleIcon(true);
  }

  if (toggle) {
    toggle.addEventListener('click', function () {
      const isDark = root.getAttribute('data-theme') === 'dark';
      if (isDark) {
        root.removeAttribute('data-theme');
        localStorage.setItem('aiworld-theme', 'light');
        updateToggleIcon(false);
      } else {
        root.setAttribute('data-theme', 'dark');
        localStorage.setItem('aiworld-theme', 'dark');
        updateToggleIcon(true);
      }
    });
  }

  function updateToggleIcon(isDark) {
    const icon = toggle && toggle.querySelector('.theme-toggle__icon');
    if (icon) icon.textContent = isDark ? '☀' : '☾';
  }

  // ---------- 3. KATEGÓRIA SZŰRŐ (chipek + navbar menü + hash) ----------
  const filters = document.getElementById('filters');
  const grid = document.getElementById('grid');
  const navLinks = document.querySelectorAll('.navbar__nav a[data-nav]');

  function applyFilter(filter) {
    if (!grid) return;
    // kártyák — audience alapján; a "both" cikkek MINDKÉT szűrőben látszanak
    grid.querySelectorAll('.card').forEach(card => {
      const aud = card.getAttribute('data-audience');
      const show = (filter === 'all') || (aud === filter) || (aud === 'both');
      card.style.display = show ? '' : 'none';
    });
    // chip aktív állapot
    if (filters) {
      filters.querySelectorAll('.chip').forEach(c =>
        c.classList.toggle('chip--active', c.getAttribute('data-filter') === filter));
    }
    // navbar aktív állapot
    navLinks.forEach(a =>
      a.classList.toggle('nav--active', a.getAttribute('data-nav') === filter));
  }

  // Chip kattintás
  if (filters && grid) {
    filters.addEventListener('click', function (e) {
      const btn = e.target.closest('.chip');
      if (btn) applyFilter(btn.getAttribute('data-filter'));
    });
  }

  // Navbar menü kattintás (csak a főoldalon szűr; cikkről átnavigál)
  if (grid) {
    navLinks.forEach(a => {
      a.addEventListener('click', function (e) {
        const cat = a.getAttribute('data-nav');
        e.preventDefault();
        history.replaceState(null, '', '#' + cat);
        applyFilter(cat);
        grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
    // Hash a betöltéskor (pl. cikkről "News"-ra kattintva érkezünk)
    const hash = (location.hash || '').replace('#', '');
    if (hash) applyFilter(hash);
  }

  // ---------- 3b. NAVBAR árnyék görgetésnél ----------
  const navbar = document.getElementById('navbar');
  if (navbar) {
    window.addEventListener('scroll', function () {
      navbar.classList.toggle('navbar--scrolled', window.scrollY > 10);
    }, { passive: true });
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
