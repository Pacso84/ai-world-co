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

  // ---------- 3. KATEGÓRIA SZŰRŐ ----------
  const filters = document.getElementById('filters');
  const grid = document.getElementById('grid');

  if (filters && grid) {
    filters.addEventListener('click', function (e) {
      const btn = e.target.closest('.chip');
      if (!btn) return;

      // Aktív chip váltás
      filters.querySelectorAll('.chip').forEach(c => c.classList.remove('chip--active'));
      btn.classList.add('chip--active');

      const filter = btn.getAttribute('data-filter');
      const cards = grid.querySelectorAll('.card');

      cards.forEach(card => {
        const cat = card.getAttribute('data-category');
        const show = (filter === 'all' || cat === filter);
        card.style.display = show ? '' : 'none';
      });
    });
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
