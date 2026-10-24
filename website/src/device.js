import { creatureMarkup } from './creature.js';

function deviceMarkup() {
  const control = (action, symbol, label) =>
    `<button type="button" data-assistant-action="${action}" aria-label="${label}" title="${label}">${symbol}</button>`;
  const mic = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><rect x="8.5" y="3" width="7" height="12" rx="3.5"/><path d="M5.5 11v1a6.5 6.5 0 0 0 13 0v-1M12 18.5V22m-3 0h6"/></svg>';
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
        <div class="device-screen" data-voice-phase="idle">
          <div class="screen-top"><span data-screen-agent>OPENAI (GPT)</span><span data-screen-phase>IDLE</span></div>
          <div class="screen-pet">${creatureMarkup}</div>
          <div class="screen-bottom" data-screen-message>Checking setup</div>
        </div>
        <div class="device-buttons">${control('stop', '■', 'Stop or go back')}${control('talk', mic, 'Talk to your AI')}${control('switch', '⇄', 'Switch agent')}</div>
        <div class="device-serial">M–01 / MADE TO BE YOURS</div>
      </div>
    </div>`;
}

export function mountDevices() {
  const mount = document.querySelector('[data-device="hero"]');
  if (!mount) return;
  mount.innerHTML = deviceMarkup();
  document.querySelectorAll('[data-assistant-action]').forEach((button) => {
    button.addEventListener('click', () => window.dispatchEvent(new CustomEvent('mori:assistant-action', {
      detail: { action: button.dataset.assistantAction },
    })));
  });
  window.addEventListener('mori:assistant-state', (event) => {
    const { provider, phase, readiness } = event.detail;
    const labels = { idle: 'IDLE', listening: 'LISTENING', thinking: 'THINKING', speaking: 'SPEAKING', stopped: 'STOPPED', error: 'CHECK' };
    document.querySelector('[data-screen-agent]').textContent = provider.toUpperCase();
    document.querySelector('[data-screen-phase]').textContent = labels[phase] || 'IDLE';
    document.querySelector('[data-screen-message]').textContent = ['listening', 'thinking', 'speaking'].includes(phase)
      ? { listening: 'one turn. your words.', thinking: 'waiting for your AI…', speaking: 'a little answer.' }[phase]
      : readiness;
    document.querySelector('.device-screen').dataset.voicePhase = phase;
  });
}
