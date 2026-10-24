import { creatureMarkup } from './creature.js';

function deviceMarkup() {
  const control = (action, symbol, label) =>
    `<button type="button" data-action="${action}" aria-label="${label} Mori">${symbol}</button>`;
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

export function mountDevices() {
  document.querySelector('[data-device="hero"]').innerHTML = deviceMarkup();
}
