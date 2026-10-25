// Small same-document views. The DOM stays mounted so drafts and local state do.
const destinations = {
  '': ['home', 'home'],
  '#home': ['home', 'home'],
  '#moods': ['home', 'moods'],
  '#lineup': ['home', 'lineup'],
  '#top': ['talk', 'talk'],
  '#talk': ['talk', 'talk'],
  '#main': ['talk', 'talk'],
  '#inside': ['device', 'inside'],
  '#device-controls': ['device', 'device-controls'],
  '#play': ['world', 'play'],
  '#wins': ['world', 'wins'],
};

export function initNavigation({ beforeChange, onChange, onLayout }) {
  const views = [...document.querySelectorAll('[data-app-view]')];
  let current;
  let handledHash;
  // The view, not the outgoing page's height, determines the scroll destination.
  history.scrollRestoration = 'manual';

  function show(hash, { focus = true } = {}) {
    const [next, id] = destinations[hash] || destinations[''];
    const changed = current !== next;
    if (changed) {
      beforeChange?.(next, current);
      document.querySelectorAll('dialog[open]').forEach((dialog) => dialog.close());
      document.querySelectorAll('[data-escape-close][open]').forEach((details) => { details.open = false; });
      views.forEach((view) => {
        view.hidden = view.dataset.appView !== next;
        view.inert = view.hidden;
      });
      document.body.dataset.view = next;
      document.querySelectorAll('[data-view-link]').forEach((link) => {
        if (link.dataset.viewLink === next) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
      });
      current = next;
      onChange?.(next);
    }
    handledHash = hash;
    const target = document.getElementById(id);
    if (id === 'device-controls') target.open = true;
    // Reading the rect flushes the newly visible layout. No font/import timers
    // can later hijack a user's scroll, and rapid back/forward has no stale job.
    const top = id === 'talk' || id === 'home' ? 0 : target.getBoundingClientRect().top + window.scrollY
      - document.querySelector('.site-header').getBoundingClientRect().height;
    window.scrollTo({ top: Math.max(0, top), behavior: 'instant' });
    if (focus) {
      const heading = target.querySelector('[data-view-heading], h2[tabindex], summary') || target;
      heading.focus({ preventScroll: true });
    }
    onLayout?.(next);
  }

  function navigate(hash, options) {
    if (!Object.hasOwn(destinations, hash)) return;
    if (location.hash !== hash) history.pushState(null, '', hash);
    show(hash, options);
  }

  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[href^="#"]');
    if (!link || event.defaultPrevented || event.button !== 0
      || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const hash = link.getAttribute('href');
    if (!Object.hasOwn(destinations, hash)) return;
    event.preventDefault();
    if (hash === '#main') {
      document.querySelector('#main').focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: 'instant' });
    } else navigate(hash);
  });

  const fromHistory = () => {
    // A browser history traversal may emit both events. Handle it once.
    if (handledHash !== location.hash) show(location.hash);
  };
  window.addEventListener('popstate', fromHistory);
  window.addEventListener('hashchange', fromHistory);
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) show(location.hash, { focus: false });
  });
  // A full load always opens the landing page at the top; the hash only steers in-session
  // navigation. Stripping it keeps handledHash honest for the next popstate.
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  show('', { focus: false });
  return { navigate };
}

export function initDisclosures() {
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    const details = event.target.closest('[data-escape-close][open]')
      || document.querySelector('[data-popover][open]');
    if (!details) return; // Let native dialog Escape/cancel do its own work.
    event.preventDefault();
    details.open = false;
    details.querySelector('summary').focus({ preventScroll: true });
  });
  document.addEventListener('click', (event) => {
    document.querySelectorAll('[data-popover][open]').forEach((details) => {
      if (details.contains(event.target)) return;
      details.open = false;
      if (details.contains(document.activeElement)) details.querySelector('summary').focus({ preventScroll: true });
    });
  });
}
