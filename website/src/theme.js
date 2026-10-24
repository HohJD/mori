import './theme.css';

const STORAGE_KEY = 'mori-theme';
// Match the pre-paint bootstrap and the CSS --background tokens.
const THEME_COLORS = { light: '#f6f5ee', dark: '#080b0a' };
const SUN = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
  <circle cx="12" cy="12" r="3.75"/>
  <path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/>
</svg>`;
const MOON = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
  <path d="M20.6 13.4A8.75 8.75 0 0 1 10.6 3.4a8.75 8.75 0 1 0 10 10Z"/>
</svg>`;

const isTheme = (value) => value === 'light' || value === 'dark';
let cleanupTheme;

function readPreference() {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return isTheme(saved) ? saved : null;
  } catch {
    return null;
  }
}

/**
 * Enhance the head bootstrap without touching companion storage.
 * Safe to call more than once; the returned function removes its listeners.
 */
export function initTheme() {
  if (cleanupTheme) return cleanupTheme;

  const root = document.documentElement;
  const buttons = [...document.querySelectorAll('[data-theme-toggle]')];
  let systemPreference;
  try {
    systemPreference = window.matchMedia('(prefers-color-scheme: dark)');
  } catch {
    // A missing media-query API has the same light default as the bootstrap.
  }

  let preference = readPreference();
  let currentTheme;
  const systemTheme = () => systemPreference?.matches ? 'dark' : 'light';

  function applyTheme(theme) {
    const changed = currentTheme !== theme;
    currentTheme = theme;
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    root.style.backgroundColor = THEME_COLORS[theme];
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', THEME_COLORS[theme]);

    const action = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
    buttons.forEach((button) => {
      button.type = 'button';
      button.setAttribute('aria-label', action);
      button.setAttribute('title', action);
      // Only application-owned SVG is inserted; no stored value becomes markup.
      button.innerHTML = theme === 'dark' ? SUN : MOON;
    });

    if (changed) {
      window.dispatchEvent(new CustomEvent('mori:theme-change', { detail: { theme } }));
    }
  }

  function toggleTheme() {
    preference = currentTheme === 'dark' ? 'light' : 'dark';
    try {
      window.localStorage.setItem(STORAGE_KEY, preference);
    } catch {
      // Still keep the explicit choice in memory for the rest of this page visit.
    }
    applyTheme(preference);
  }

  function followSystem(event) {
    if (preference === null) applyTheme(event.matches ? 'dark' : 'light');
  }

  function followStorage(event) {
    // A companion save/reset is deliberately irrelevant to the theme.
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    try {
      if (event.storageArea && event.storageArea !== window.localStorage) return;
    } catch {
      return;
    }
    // Removing/invalidating the preference in another tab restores system mode.
    preference = isTheme(event.newValue) ? event.newValue : null;
    applyTheme(preference || systemTheme());
  }

  buttons.forEach((button) => button.addEventListener('click', toggleTheme));
  if (systemPreference?.addEventListener) {
    systemPreference.addEventListener('change', followSystem);
  } else {
    systemPreference?.addListener?.(followSystem);
  }
  window.addEventListener('storage', followStorage);
  applyTheme(preference || systemTheme());

  cleanupTheme = () => {
    buttons.forEach((button) => button.removeEventListener('click', toggleTheme));
    if (systemPreference?.removeEventListener) {
      systemPreference.removeEventListener('change', followSystem);
    } else {
      systemPreference?.removeListener?.(followSystem);
    }
    window.removeEventListener('storage', followStorage);
    cleanupTheme = undefined;
  };
  return cleanupTheme;
}

export default initTheme;
