import './styles.css';
import './hardware.css';
import { initTheme } from './theme.js';
import {
  adopt, advanceFocus, bondLevel, cancelFocus, confirmFocus, createState,
  decodeState, forgetWin, interact, pauseFocus, remainingTime, resumeFocus,
  startFocus, STORAGE_KEY,
} from './state.js';
import { createPersistence } from './storage.js';
import { createReactions, mountCreatures } from './creature.js';
import { mountDevices } from './device.js';
import { initHardware } from './hardware.js';
import { initAssistant } from './assistant.js';
import { initDisclosures, initNavigation } from './navigation.js';
import { initLanding } from './landing.js';

const $ = (selector) => document.querySelector(selector);
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
initTheme();
mountDevices();
mountCreatures();
const landing = initLanding(reducedMotion);
const assistant = initAssistant({ showTalk: () => navigation.navigate('#talk', { focus: false }) });
initDisclosures();
let hardware;
let navigation;
const reactions = createReactions(reducedMotion);

const persistence = createPersistence((status, message) => {
  $('#persistence-status').dataset.status = status;
  $('#persistence-text').textContent = message;
});
let state = advanceFocus(persistence.load(), Date.now());
let ticker = null;
let winsSignature = '';
let focusFeedback = 'No pressure. Begin when you’re ready.';
const companionName = () => state.name || 'Mori';
let petMessage = `${companionName()} says: oh, hi human. got a little time?`;

const lines = {
  feed: [
    'crunch crunch. excellent snack.',
    'saving a crumb for later. important research.',
    'a tiny feast! you get me.',
    'five-star snack. zero-star table manners.',
  ],
  pet: [
    'oh. this is my favorite kind of weather.',
    'warm fuzzy feelings: activated.',
    'right back at you, favorite human. ♡',
    'just going to lean here for a little bit.',
  ],
  play: [
    'you hide. I’ll count to potato.',
    'new personal best: maximum tiny chaos.',
    'race you to absolutely nowhere.',
    'a very small adventure. a very big yes.',
  ],
};

function renderIdentity() {
  document.body.dataset.shell = state.shell;
  document.body.dataset.focus = state.focus?.status || 'idle';
  document.querySelectorAll('[data-name]').forEach((element) => {
    element.textContent = companionName();
  });
  document.querySelectorAll('[data-shell-label]').forEach((element) => {
    element.textContent = state.shell[0].toUpperCase() + state.shell.slice(1);
  });
  $('.customize-button').setAttribute('aria-label', `Name ${companionName()} and choose a shell`);
  $('#pet-message').textContent = petMessage;
}

function renderBond() {
  const level = bondLevel(state.bond);
  $('#bond-level').textContent = `Level ${String(level.number).padStart(2, '0')} · ${level.name}`;
  $('#bond-count').textContent = `${state.bond} bond ${state.bond === 1 ? 'point' : 'points'}`;
  const progress = $('#bond-progress');
  progress.max = Math.max(1, level.next - level.minimum);
  progress.value = level.number === 4 ? 1 : state.bond - level.minimum;
  progress.setAttribute('aria-valuetext', level.number === 4
    ? `Level 4, ${level.name}. Your room is in bloom.`
    : `${state.bond - level.minimum} of ${level.next - level.minimum} bond points toward the next room detail`);
  $('#room-caption').textContent = level.room;
  $('#room').classList.toggle('has-plant', level.number >= 2);
  $('#room').classList.toggle('has-lamp', level.number >= 3);
  $('#room').classList.toggle('has-flower', level.number >= 4);
}

function renderClock() {
  const seconds = Math.ceil(remainingTime(state.focus, Date.now()) / 1000);
  const minutesPart = Math.floor(seconds / 60);
  const secondsPart = seconds % 60;
  $('#clock').textContent = `${String(minutesPart).padStart(2, '0')}:${String(secondsPart).padStart(2, '0')}`;
  $('#clock').setAttribute('aria-label', `${minutesPart} minutes and ${secondsPart} seconds remaining`);
}

function renderFocus() {
  const focus = state.focus;
  $('#focus-form').hidden = Boolean(focus);
  $('#focus-session').hidden = !focus;
  if (!focus) {
    $('#focus-status').textContent = focusFeedback;
    return;
  }
  const awaiting = focus.status === 'awaiting';
  const moveToCheckin = awaiting && $('#timer-controls').contains(document.activeElement);
  $('#session-context').textContent = focus.preview
    ? '10-second preview · no wins or minutes saved'
    : `${focus.durationMs / 60_000} minutes · just this one thing`;
  $('#session-task').textContent = focus.task;
  $('#timer-controls').hidden = awaiting;
  $('#completion-panel').hidden = !awaiting;
  $('#pause-focus').textContent = focus.status === 'paused' ? 'Resume' : 'Pause';
  $('#timer-note').textContent = awaiting
    ? 'A little time, well spent.'
    : focus.status === 'paused'
      ? 'A breather. Take the time you need.'
      : `${companionName()} is keeping you company.`;
  $('#completion-note').textContent = focus.preview
    ? 'This was only a preview. Finishing it won’t save a win, add minutes, or change your bond.'
    : 'Only your yes saves this win. If it needs another go, that’s okay too.';
  $('#confirm-focus').textContent = focus.preview ? 'Finish preview (no win)' : 'Yes, save my win ↗';
  $('#decline-focus').textContent = focus.preview ? 'Back to the playground' : 'Not this time';
  $('#focus-status').textContent = awaiting
    ? `${companionName()}’s timer is done. Did you finish? Nothing is saved until you choose.`
    : focus.status === 'paused'
      ? `Paused with ${companionName()}. Your remaining time is kept.`
      : `A little focus with ${companionName()}. You can pause or cancel whenever you need.`;
  renderClock();
  if (moveToCheckin) $('#confirm-focus').focus({ preventScroll: true });
}

function renderWins() {
  $('#win-total').textContent = String(state.wins.length);
  $('#minute-total').textContent = String(state.wins.reduce((sum, win) => sum + win.minutes, 0));
  const signature = JSON.stringify(state.wins);
  if (signature === winsSignature) return;
  winsSignature = signature;
  $('#wins-empty').hidden = state.wins.length > 0;
  $('#wins-list').hidden = state.wins.length === 0;
  const fragment = document.createDocumentFragment();
  state.wins.forEach((win) => {
    const item = document.createElement('li');
    item.className = 'win';
    const icon = document.createElement('span');
    icon.className = 'win-icon';
    icon.textContent = '✳';
    icon.setAttribute('aria-hidden', 'true');
    const copy = document.createElement('div');
    const title = document.createElement('h3');
    title.textContent = win.task;
    const metadata = document.createElement('p');
    const time = document.createElement('time');
    const date = new Date(win.completedAt);
    time.dateTime = date.toISOString();
    time.textContent = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
    metadata.append(time, ` · ${win.minutes} focused minutes · finished by you`);
    copy.append(title, metadata);
    const forget = document.createElement('button');
    forget.type = 'button';
    forget.className = 'forget-win';
    forget.dataset.winId = win.id;
    forget.textContent = 'Forget';
    forget.setAttribute('aria-label', `Forget win: ${win.task}`);
    item.append(icon, copy, forget);
    fragment.append(item);
  });
  $('#wins-list').replaceChildren(fragment);
}

function syncTicker() {
  if (state.focus?.status === 'running') {
    if (ticker === null) ticker = window.setInterval(tick, 500);
  } else if (ticker !== null) {
    clearInterval(ticker);
    ticker = null;
  }
}

function render() {
  renderIdentity();
  renderBond();
  renderFocus();
  renderWins();
  syncTicker();
}

function commit(next) {
  if (next === state) return;
  state = next;
  // The entire session/reward transition is saved atomically, never per tick.
  persistence.save(state);
  render();
}

function tick() {
  const next = advanceFocus(state, Date.now());
  if (next !== state) {
    petMessage = `${companionName()} says: time’s up. how did your little thing go?`;
    commit(next);
  } else if (state.focus) {
    renderClock();
  }
}

function clearFieldError(input, error) {
  input.setCustomValidity('');
  input.removeAttribute('aria-invalid');
  error.textContent = '';
}

function requireMeaningfulText(input, error, message) {
  if (input.value.trim()) return true;
  input.setCustomValidity(message);
  input.setAttribute('aria-invalid', 'true');
  error.textContent = message;
  input.focus();
  return false;
}

function showPlayground() {
  navigation.navigate('#play', { focus: false });
  $('#habitat-title').focus({ preventScroll: true });
}

// Local habitat actions stay independent of AI, voice, and the device screen.
document.querySelectorAll('[data-action]').forEach((button) => {
  button.addEventListener('click', () => {
    const action = button.dataset.action;
    const line = lines[action][state.interactions[action] % lines[action].length];
    petMessage = `${companionName()} says: ${line}`;
    commit(interact(state, action));
    reactions.play(action);
  });
});

const adoptionDialog = $('#adoption-dialog');
const nameInput = $('#mori-name');
document.querySelectorAll('[data-adopt]').forEach((button) => {
  button.addEventListener('click', () => {
    nameInput.value = state.name;
    clearFieldError(nameInput, $('#name-error'));
    $(`#adoption-form input[name="shell"][value="${state.shell}"]`).checked = true;
    if (!adoptionDialog.open) adoptionDialog.showModal();
    nameInput.focus();
    nameInput.select();
  });
});
nameInput.addEventListener('input', () => clearFieldError(nameInput, $('#name-error')));
$('#adoption-form').addEventListener('submit', (event) => {
  event.preventDefault();
  if (!requireMeaningfulText(nameInput, $('#name-error'), 'Give your Mori a name, not just a little space.')) return;
  const shell = $('#adoption-form input[name="shell"]:checked').value;
  const next = adopt(state, nameInput.value, shell);
  petMessage = `${next.name} says: hi, my favorite human. let’s start small.`;
  commit(next);
  adoptionDialog.close();
  showPlayground();
});

document.querySelectorAll('[data-close-dialog]').forEach((button) => {
  button.addEventListener('click', () => button.closest('dialog').close());
});
document.querySelectorAll('dialog').forEach((dialog) => {
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) {
      dialog.close();
    }
  });
});

const taskInput = $('#focus-task');
taskInput.addEventListener('input', () => clearFieldError(taskInput, $('#task-error')));

function beginFocus(preview) {
  if (!preview && !requireMeaningfulText(taskInput, $('#task-error'), 'Choose one concrete thing before you begin.')) return;
  const task = taskInput.value.trim() || 'Explore a tiny focus ritual';
  const minutes = Number($('#focus-form input[name="minutes"]:checked').value);
  const next = startFocus(state, { id: crypto.randomUUID(), task, minutes, preview }, Date.now());
  if (next === state) return;
  clearFieldError(taskInput, $('#task-error'));
  reactions.clear();
  petMessage = `${companionName()} says: you do your thing. I’ll be right here.`;
  commit(next);
  $('#pause-focus').focus({ preventScroll: true });
}

$('#focus-form').addEventListener('submit', (event) => {
  event.preventDefault();
  beginFocus(false);
});
$('#start-preview').addEventListener('click', () => beginFocus(true));
$('#pause-focus').addEventListener('click', () => {
  commit(state.focus?.status === 'paused' ? resumeFocus(state, Date.now()) : pauseFocus(state, Date.now()));
});
$('#cancel-focus').addEventListener('click', () => {
  focusFeedback = 'Session cancelled. No win or minutes saved. There’s always another little beginning.';
  petMessage = `${companionName()} says: a change of plan. still good company.`;
  commit(cancelFocus(state));
  taskInput.focus({ preventScroll: true });
});

function finishFocus(completed) {
  const session = state.focus;
  if (!session || session.status !== 'awaiting') return;
  const next = confirmFocus(state, session.id, completed, Date.now());
  const earnedWin = completed && !session.preview && next.wins.length > 0 && next.wins[0].id === session.id;
  focusFeedback = session.preview
    ? 'Preview complete. No win, minutes, or bond points added. Ready for your own one-small-thing?'
    : earnedWin
      ? `A little win, saved. ${session.durationMs / 60_000} real focus minutes with ${companionName()}.`
      : 'No win saved. An honest check-in counts for something, too. Try again whenever you like.';
  petMessage = earnedWin
    ? `${companionName()} says: you did your little thing. that’s a big deal.`
    : `${companionName()} says: one little beginning at a time.`;
  commit(next);
  if (earnedWin) {
    taskInput.value = '';
    reactions.play('win');
  }
  taskInput.focus({ preventScroll: true });
}
$('#confirm-focus').addEventListener('click', () => finishFocus(true));
$('#decline-focus').addEventListener('click', () => finishFocus(false));

$('#wins-list').addEventListener('click', (event) => {
  const button = event.target.closest('[data-win-id]');
  if (!button) return;
  const index = [...$('#wins-list').querySelectorAll('button')].indexOf(button);
  petMessage = `${companionName()} says: a little less to keep. our bond stays.`;
  commit(forgetWin(state, button.dataset.winId));
  const buttons = $('#wins-list').querySelectorAll('button');
  (buttons[Math.min(index, buttons.length - 1)] || $('#open-reset')).focus({ preventScroll: true });
});

$('#open-reset').addEventListener('click', () => $('#reset-dialog').showModal());
$('#confirm-reset').addEventListener('click', () => {
  $('#reset-dialog').close();
  reactions.clear();
  state = createState();
  petMessage = 'Mori says: a fresh little world. oh, hi human.';
  focusFeedback = 'A fresh start. Your old local world and current session have been cleared.';
  $('#focus-form').reset();
  $('#adoption-form').reset();
  clearFieldError(taskInput, $('#task-error'));
  clearFieldError(nameInput, $('#name-error'));
  persistence.reset(state);
  render();
  showPlayground();
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') tick();
});
window.addEventListener('pageshow', tick);
window.addEventListener('storage', (event) => {
  if (event.key !== STORAGE_KEY && event.key !== null) return;
  state = advanceFocus(decodeState(event.newValue).state, Date.now());
  petMessage = `${companionName()} says: our little world is up to date.`;
  render();
});

// One startup write handles name migration, repair, and an elapsed restored timer.
persistence.save(state);
render();
// Restore local layout before resolving deep links (especially #wins).
// No inspector, WebGL imports, or timeline until Device is actually open.
navigation = initNavigation({
  beforeChange(next, previous) {
    if (previous === 'device') hardware?.setActive(false);
  },
  onChange(view) {
    assistant.setActive(view === 'talk');
    landing.setActive(view === 'home');
    if (view === 'device') {
      hardware ||= initHardware(reducedMotion);
      hardware.setActive(true);
    }
  },
  onLayout(view) {
    if (view === 'device') hardware.refresh();
  },
});
