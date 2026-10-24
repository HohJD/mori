// Blocking, pre-paint bootstrap. Keep these colors in sync with theme.js/theme.css.
(() => {
  const colors = { light: '#f6f5ee', dark: '#080b0a' };
  let theme;

  try {
    const saved = window.localStorage.getItem('mori-theme');
    if (saved === 'light' || saved === 'dark') theme = saved;
  } catch {
    // Private browsing or blocked storage must not prevent the system fallback.
  }

  if (!theme) {
    try {
      theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } catch {
      theme = 'light';
    }
  }

  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  // Cover the initial canvas while Vite's stylesheet/module is still loading.
  root.style.backgroundColor = colors[theme];
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', colors[theme]);
})();
