/* global window, document, localStorage */
/* Shared, local-only theme preference. Runs before paint under script-src self. */
(function () {
  var media = window.matchMedia('(prefers-color-scheme: dark)');
  function apply() {
    var choice = 'system';
    try { choice = localStorage.getItem('wifi-theme') || 'system'; } catch { /* Storage may be unavailable in captive browsers. */ }
    if (choice !== 'light' && choice !== 'dark') choice = 'system';
    var theme = choice === 'system' ? (media.matches ? 'dark' : 'light') : choice;
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme === 'dark' ? '#111827' : '#f5f6fa';
  }
  apply();
  document.addEventListener('DOMContentLoaded', function () {
    var picker = document.getElementById('hotspot-theme');
    if (!picker) return;
    try { picker.value = localStorage.getItem('wifi-theme') || 'system'; } catch { /* Storage may be unavailable in captive browsers. */ }
    picker.addEventListener('change', function () {
      try { localStorage.setItem('wifi-theme', picker.value); apply(); }
      catch {
        var theme = picker.value === 'system' ? (media.matches ? 'dark' : 'light') : picker.value;
        document.documentElement.dataset.theme = theme;
        document.documentElement.style.colorScheme = theme;
      }
    });
  });
  if (media.addEventListener) media.addEventListener('change', apply);
  window.addEventListener('storage', apply);
  window.addEventListener('wifi-theme-change', apply);
})();
