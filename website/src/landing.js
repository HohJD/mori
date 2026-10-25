import './landing.css';

// The landing page's pixel Mori. Same silhouette as creature.js, with authored
// faces per mood and an eye group the hero can steer toward the pointer.
const BODY = 'M24 13h9V5h9v10h15V7h9v15h9v9h7v27h-8v9H61v9H49V65H34v11H21V65H10V54H3V35h9V23h12z';
const FEET = 'M10 54h11v11h13v11H21V65H10zm51 4h13v9H61v9H49V65h12z';
const INK = '#213621';

const faces = {
  happy: `<g class="lp-eyes"><g class="lp-blink"><path fill="${INK}" d="M27 32h8v13h-8zm28 0h8v13h-8z"/><path fill="#ecffc7" d="M31 34h3v3h-3zm28 0h3v3h-3z"/></g></g>
    <path fill="${INK}" d="M39 49h3v3h8v-3h3v6H39z"/>`,
  curious: `<g class="lp-eyes"><g class="lp-blink"><path fill="${INK}" d="M27 30h9v14h-9zm28 0h9v14h-9z"/><path fill="#ecffc7" d="M31 32h3v3h-3zm28 0h3v3h-3z"/></g></g>
    <path fill="${INK}" d="M43 50h6v5h-6z"/><path fill="#365c3d" d="M78 4h8v3h3v6h-3v3h-3v4h-4v-6h3V7h-4zm3 18h4v4h-4z"/>`,
  sleepy: `<g class="lp-eyes"><path fill="${INK}" d="M25 40h12v4H25zm28 0h12v4H53z"/></g>
    <path fill="${INK}" d="M42 50h8v3h-8z"/><path fill="#7d6f9e" d="M74 6h9v3l-5 5h5v3h-9v-3l5-5h-5z"/>`,
  focus: `<g class="lp-eyes"><g class="lp-blink"><path fill="${INK}" d="M28 35h7v9h-7zm28 0h7v9h-7z"/></g></g>
    <path fill="${INK}" d="M23 31h16v2H23zm0 2h2v13h-2zm14 0h2v13h-2zm-14 13h16v2H23zm28-15h16v2H51zm0 2h2v13h-2zm14 0h2v13h-2zm-14 13h16v2H51zm-12-13h12v2H39z"/>
    <path fill="${INK}" d="M40 52h10v3H40z"/>`,
  party: `<g class="lp-eyes"><path fill="${INK}" d="M24 38h4v-4h8v4h4v4h-4v-4h-8v4h-4zm27 0h4v-4h8v4h4v4h-4v-4h-8v4h-4z"/></g>
    <path fill="${INK}" d="M38 47h16v4h-3v4H41v-4h-3z"/><path fill="#e8838f" d="M42 51h8v4h-8z"/>
    <path fill="#f2a65a" d="M2 6h4v4H2zm80 8h4v4h-4z"/><path fill="#8a7fd0" d="M12 2h4v4h-4zm72-2h4v4h-4z"/><path fill="#4fa3d9" d="M0 20h3v3H0z"/>`,
  listen: `<g class="lp-eyes"><g class="lp-blink"><path fill="${INK}" d="M27 32h8v13h-8zm28 0h8v13h-8z"/><path fill="#ecffc7" d="M31 34h3v3h-3zm28 0h3v3h-3z"/></g></g>
    <path fill="${INK}" d="M42 49h8v2h2v4h-2v2h-8v-2h-2v-4h2z"/><path fill="#4fa3d9" d="M80 30h3v18h-3zm6-5h3v28h-3z"/>`,
};

function creature(mood) {
  const face = faces[mood] || faces.happy;
  return `<svg class="lp-creature" viewBox="-2 -2 94 82" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
    <path fill="#d4f995" d="${BODY}"/><path fill="#a5ca72" d="${FEET}"/>
    <path fill="#ecffc7" d="M18 26h7v6h-7zm5-8h10v6H23z"/>
    <path fill="#f4a7a0" opacity=".75" d="M16 47h8v5h-8zm50 0h8v5h-8z"/>
    ${face}</svg>`;
}

const lines = {
  pat: ['hehe. again?', 'purrr…', 'best human, confirmed.', 'that was a 10/10 pat.', 'ok ok, one more.'],
  nap: ['five more minutes…', 'zzz (dreaming of tiny rocks)', 'wake me for snacks.'],
  play: ['wheee!', 'catch the seed!', 'again! again!', 'tiny dance unlocked.'],
};

export function initLanding(reducedMotion) {
  const root = document.querySelector('[data-app-view="home"]');
  if (!root) return { setActive() {} };

  root.querySelectorAll('[data-lp-creature]').forEach((mount) => {
    mount.innerHTML = creature(mount.dataset.mood);
  });

  const hero = root.querySelector('[data-lp-creature="hero"]');
  const pebble = root.querySelector('[data-lp-pebble]');
  const bubble = root.querySelector('[data-lp-bubble]');
  const hearts = root.querySelector('[data-lp-hearts]');
  const counts = { pat: 0, nap: 0, play: 0 };
  let moodTimer;

  function setMood(mood) {
    hero.dataset.mood = mood;
    hero.innerHTML = creature(mood);
    pebble.dataset.state = mood;
  }

  function burst(symbol) {
    if (reducedMotion.matches) return;
    for (let i = 0; i < 5; i += 1) {
      const heart = document.createElement('span');
      heart.textContent = symbol;
      heart.style.setProperty('--x', `${Math.round((Math.random() - 0.5) * 140)}px`);
      heart.style.setProperty('--r', `${Math.round((Math.random() - 0.5) * 50)}deg`);
      heart.style.animationDelay = `${i * 60}ms`;
      heart.addEventListener('animationend', () => heart.remove(), { once: true });
      hearts.append(heart);
    }
  }

  function act(action) {
    clearTimeout(moodTimer);
    const pool = lines[action];
    bubble.textContent = pool[counts[action] % pool.length];
    counts[action] += 1;
    pebble.classList.remove('is-pat', 'is-play');
    void pebble.offsetWidth; // Restart the squish animation on repeat taps.
    if (action === 'nap') {
      setMood('sleepy');
      return;
    }
    setMood(action === 'play' ? 'party' : 'happy');
    pebble.classList.add(action === 'play' ? 'is-play' : 'is-pat');
    burst(action === 'play' ? '✦' : '♥');
    moodTimer = setTimeout(() => setMood('happy'), 2600);
  }

  root.addEventListener('click', (event) => {
    const button = event.target.closest('[data-lp-action]');
    if (button) act(button.dataset.lpAction);
  });

  // Every visible Mori glances toward the pointer. One rAF per frame, at most.
  let frame = 0;
  let pointer = null;
  function look() {
    frame = 0;
    root.querySelectorAll('.lp-creature .lp-eyes').forEach((eyes) => {
      const box = eyes.ownerSVGElement.getBoundingClientRect();
      if (!box.width || box.bottom < 0 || box.top > innerHeight) return;
      const dx = pointer.x - (box.left + box.width / 2);
      const dy = pointer.y - (box.top + box.height / 2);
      const length = Math.hypot(dx, dy) || 1;
      const reach = Math.min(1, length / 300) * 3;
      eyes.setAttribute('transform', `translate(${((dx / length) * reach).toFixed(2)} ${((dy / length) * reach).toFixed(2)})`);
    });
  }
  function onPointer(event) {
    pointer = { x: event.clientX, y: event.clientY };
    if (!frame) frame = requestAnimationFrame(look);
  }

  // Sections float in once. Without observers or with reduced motion, show all.
  const reveals = root.querySelectorAll('.lp-reveal');
  let observer;
  if (!('IntersectionObserver' in window) || reducedMotion.matches) {
    reveals.forEach((element) => element.classList.add('is-in'));
  } else {
    observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        observer.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px' });
    reveals.forEach((element) => observer.observe(element));
  }

  initWaitlist(root);

  return {
    setActive(active) {
      if (active && !reducedMotion.matches) window.addEventListener('pointermove', onPointer, { passive: true });
      else window.removeEventListener('pointermove', onPointer);
    },
  };
}

// The signup posts to /api/waitlist; the server keeps it private. Errors keep
// the typed address so a retry is one click.
function initWaitlist(root) {
  const form = root.querySelector('#waitlist-form');
  if (!form) return;
  const email = form.querySelector('#waitlist-email');
  const submit = form.querySelector('#waitlist-submit');
  const status = form.querySelector('#waitlist-status');
  const joined = root.querySelector('#waitlist-joined');
  const say = (message, tone = '') => {
    status.textContent = message;
    status.dataset.tone = tone;
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submit.disabled) return;
    const address = email.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(address)) {
      email.setAttribute('aria-invalid', 'true');
      say('That email address doesn’t look quite right.', 'error');
      email.focus();
      return;
    }
    email.removeAttribute('aria-invalid');
    submit.disabled = true;
    say('Saving your spot…');
    try {
      const response = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: address,
          interest: form.elements.interest.value,
          website: form.elements.website.value,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || 'We couldn’t save that just now. Please try again.');
      form.hidden = true;
      joined.hidden = false;
      root.querySelector('[data-lp-waitlist]').classList.add('is-joined');
      joined.querySelector('.lp-joined-title').focus?.();
    } catch (error) {
      say(error instanceof TypeError ? 'You seem to be offline. Please try again.' : error.message, 'error');
    } finally {
      submit.disabled = false;
    }
  });
  email.addEventListener('input', () => {
    if (email.hasAttribute('aria-invalid')) {
      email.removeAttribute('aria-invalid');
      say('');
    }
  });
}
