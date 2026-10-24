import { creatureMarkup } from './creature.js';

function deviceMarkup(interactive) {
  const control = (action, symbol, label) => interactive
    ? `<button type="button" data-action="${action}" aria-label="${label} Mori">${symbol}</button>`
    : `<span>${symbol}</span>`;
  return `
    <div class="assembly">
      <div class="device-loop"></div>
      <div class="device-layer device-back"></div>
      <div class="device-layer device-board">
        <div class="device-circuit"></div>
        <div class="device-chip">MORI<br><span>A LITTLE SOUL</span></div>
        <span class="board-detail detail-one"></span><span class="board-detail detail-two"></span>
      </div>
      <div class="device-layer device-glass"></div>
      <div class="device-layer device-shell">
        <div class="device-word">mori</div>
        <div class="device-screen">
          <div class="screen-top"><span>♥ ♥ ♥</span><span>A LITTLE LIFE ▰</span></div>
          <div class="screen-pet">${creatureMarkup}</div>
          <div class="screen-bottom" data-screen-message>oh, hi human.</div>
        </div>
        <div class="device-buttons">${control('feed', '✧', 'Feed')}${control('pet', '♡', 'Pet')}${control('play', '↗', 'Play with')}</div>
        <div class="device-serial">M–01 / MADE TO BE YOURS</div>
      </div>
    </div>`;
}

export function mountDevices(reducedMotion) {
  document.querySelectorAll('[data-device]').forEach((mount) => {
    mount.innerHTML = deviceMarkup(mount.dataset.device === 'hero');
  });
  const section = document.querySelector('#inside');
  const mount = document.querySelector('.inside-device');
  let frame = null;

  function render() {
    frame = null;
    const rect = section.getBoundingClientRect();
    // No content is faded or hidden. Reduced motion gets a static exploded study.
    const progress = reducedMotion.matches
      ? 0.62
      : Math.max(0, Math.min(1, (window.innerHeight - rect.top) / (window.innerHeight + rect.height * .25)));
    mount.style.setProperty('--explode', progress.toFixed(3));
  }
  function schedule() {
    if (frame === null) frame = requestAnimationFrame(render);
  }
  function motionPreference() {
    window.removeEventListener('scroll', schedule);
    if (!reducedMotion.matches) window.addEventListener('scroll', schedule, { passive: true });
    render();
  }
  window.addEventListener('resize', schedule, { passive: true });
  reducedMotion.addEventListener('change', motionPreference);
  motionPreference();
}
