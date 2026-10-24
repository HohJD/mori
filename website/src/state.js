/**
 * Pure local companion model. No DOM, storage, timers, network, or random calls.
 * Callers supply the clock and unique session id so transitions are testable.
 */
export const STORAGE_KEY = 'mori-world-v1';
export const LEGACY_KEY = 'mori-name';
export const WIN_LIMIT = 24;
export const FOCUS_MINUTES = [5, 15, 25];
export const PREVIEW_MS = 10_000;
export const SHELLS = ['sage', 'cream', 'lavender'];
const ACTIONS = ['feed', 'pet', 'play'];
const STATUSES = ['running', 'paused', 'awaiting'];
const text = (value, limit) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const count = (value) => Number.isSafeInteger(value) && value >= 0 ? Math.min(value, 1_000_000) : 0;
const timestamp = (value) => Number.isSafeInteger(value) && value > 0 && value <= 8_640_000_000_000_000;

export function createState() {
  return {
    version: 1,
    name: '',
    shell: 'sage',
    bond: 0,
    interactions: { feed: 0, pet: 0, play: 0 },
    wins: [],
    focus: null,
  };
}

function normalizeFocus(value) {
  if (!value || typeof value !== 'object') return null;
  const preview = value.preview === true;
  const validDuration = preview
    ? value.durationMs === PREVIEW_MS
    : FOCUS_MINUTES.includes(value.durationMs / 60_000);
  const id = text(value.id, 100);
  const task = text(value.task, 160);
  if (!id || !task || !validDuration || !STATUSES.includes(value.status) ||
      !timestamp(value.startedAt) || !Number.isFinite(value.remainingMs) ||
      value.remainingMs < 0 || value.remainingMs > value.durationMs ||
      (value.status === 'running' && !timestamp(value.endAt))) return null;
  return {
    id,
    task,
    preview,
    durationMs: value.durationMs,
    status: value.status,
    remainingMs: value.status === 'awaiting' ? 0 : value.remainingMs,
    endAt: value.status === 'running' ? value.endAt : null,
    startedAt: value.startedAt,
  };
}

/** Discard unknown fields and invalid records; never turn corrupt data into a win. */
export function normalizeState(value) {
  const base = createState();
  if (!value || typeof value !== 'object' || value.version !== 1) return base;
  const seen = new Set();
  const wins = (Array.isArray(value.wins) ? value.wins : []).flatMap((win) => {
    if (!win || typeof win !== 'object') return [];
    const id = text(win.id, 100);
    const task = text(win.task, 160);
    if (!id || seen.has(id) || !task || !timestamp(win.completedAt) ||
        !FOCUS_MINUTES.includes(win.minutes) || win.preview === true) return [];
    seen.add(id);
    return [{ id, task, completedAt: win.completedAt, minutes: win.minutes }];
  }).slice(0, WIN_LIMIT);
  return {
    ...base,
    name: text(value.name, 20),
    shell: SHELLS.includes(value.shell) ? value.shell : 'sage',
    bond: count(value.bond),
    interactions: Object.fromEntries(ACTIONS.map((action) => [action, count(value.interactions?.[action])])),
    wins,
    focus: normalizeFocus(value.focus),
  };
}

export function decodeState(raw, legacyName = '') {
  if (!raw) {
    const state = createState();
    state.name = text(legacyName, 20);
    return { state, status: state.name ? 'migrated' : 'fresh' };
  }
  try {
    const parsed = JSON.parse(raw);
    const state = normalizeState(parsed);
    // Comparing normalized data also flags repaired nested fields, not just bad JSON.
    const status = JSON.stringify(state) === JSON.stringify(parsed) ? 'saved' : 'recovered';
    return { state, status };
  } catch {
    return { state: createState(), status: 'recovered' };
  }
}

export function adopt(state, name, shell) {
  const cleanName = text(name, 20);
  if (!cleanName) return state;
  return { ...state, name: cleanName, shell: SHELLS.includes(shell) ? shell : state.shell };
}

export function interact(state, action) {
  if (!ACTIONS.includes(action)) return state;
  return {
    ...state,
    bond: Math.min(1_000_000, state.bond + 1),
    interactions: { ...state.interactions, [action]: Math.min(1_000_000, state.interactions[action] + 1) },
  };
}

export function remainingTime(focus, now) {
  if (!focus || focus.status === 'awaiting') return 0;
  return focus.status === 'paused'
    ? focus.remainingMs
    : Math.max(0, Math.min(focus.durationMs, focus.endAt - now));
}

/** Reconciliation is safe on reload, visibility change, or an arbitrarily late tick. */
export function advanceFocus(state, now) {
  if (state.focus?.status !== 'running' || remainingTime(state.focus, now) > 0) return state;
  return {
    ...state,
    focus: { ...state.focus, status: 'awaiting', remainingMs: 0, endAt: null },
  };
}

export function startFocus(state, { id, task, minutes = 15, preview = false }, now) {
  const cleanTask = text(task, 160);
  const cleanId = text(id, 100);
  if (state.focus || !cleanTask || !cleanId || state.wins.some((win) => win.id === cleanId) ||
      !timestamp(now) || (!preview && !FOCUS_MINUTES.includes(minutes))) return state;
  const durationMs = preview ? PREVIEW_MS : minutes * 60_000;
  return {
    ...state,
    focus: {
      id: cleanId,
      task: cleanTask,
      preview,
      durationMs,
      status: 'running',
      remainingMs: durationMs,
      endAt: now + durationMs,
      startedAt: now,
    },
  };
}

export function pauseFocus(state, now) {
  const current = advanceFocus(state, now);
  if (current.focus?.status !== 'running') return current;
  return {
    ...current,
    focus: {
      ...current.focus,
      status: 'paused',
      remainingMs: remainingTime(current.focus, now),
      endAt: null,
    },
  };
}

export function resumeFocus(state, now) {
  if (state.focus?.status !== 'paused') return state;
  return {
    ...state,
    focus: { ...state.focus, status: 'running', endAt: now + state.focus.remainingMs },
  };
}

export function cancelFocus(state) {
  return state.focus ? { ...state, focus: null } : state;
}

/**
 * Clearing the session and recording its win happen in one state update.
 * Repeated/stale clicks cannot confirm a missing, running, or different session.
 * A preview, a cancellation, or "not finished" never earns progress.
 */
export function confirmFocus(state, id, completed, now) {
  const focus = state.focus;
  if (!focus || focus.id !== id || focus.status !== 'awaiting') return state;
  const next = { ...state, focus: null };
  if (completed !== true || focus.preview || state.wins.some((win) => win.id === id)) return next;
  return {
    ...next,
    bond: Math.min(1_000_000, state.bond + 5),
    wins: [{
      id,
      task: focus.task,
      completedAt: now,
      minutes: focus.durationMs / 60_000,
    }, ...state.wins].slice(0, WIN_LIMIT),
  };
}

export function forgetWin(state, id) {
  return { ...state, wins: state.wins.filter((win) => win.id !== id) };
}

export function bondLevel(bond) {
  const levels = [
    { minimum: 0, next: 5, name: 'New friends', room: 'A little space to call your own.' },
    { minimum: 5, next: 15, name: 'Little sprout', room: 'A new leaf. Your little corner is growing.' },
    { minimum: 15, next: 30, name: 'Cozy company', room: 'A lamp for all the little things you do together.' },
    { minimum: 30, next: 30, name: 'Right at home', room: 'A flowering corner. Good company, no rush.' },
  ];
  const index = levels.findLastIndex((level) => bond >= level.minimum);
  return { ...levels[Math.max(0, index)], number: Math.max(0, index) + 1 };
}
