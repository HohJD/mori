import test from 'node:test';
import assert from 'node:assert/strict';
import {
  adopt, advanceFocus, bondLevel, cancelFocus, confirmFocus, createState,
  decodeState, forgetWin, interact, normalizeState, pauseFocus, remainingTime,
  resumeFocus, startFocus, WIN_LIMIT,
} from '../website/src/state.js';

const NOW = 1_800_000_000_000;
const begin = (options = {}) => startFocus(createState(), {
  id: 'session-1', task: 'Write the first paragraph', minutes: 5, ...options,
}, NOW);
const reload = (state) => decodeState(JSON.stringify(state)).state;

test('a concrete task and a supported duration are required; starting never replaces a session', () => {
  const empty = createState();
  assert.equal(startFocus(empty, { id: 'a', task: ' \n ', minutes: 5 }, NOW), empty);
  assert.equal(startFocus(empty, { id: 'a', task: 'Write', minutes: 1 }, NOW), empty);
  const running = begin();
  assert.equal(startFocus(running, { id: 'b', task: 'Another thing', minutes: 25 }, NOW), running);
  assert.equal(running.focus.task, 'Write the first paragraph');
});

test('a running session preserves its absolute deadline across reload and background time', () => {
  const running = begin();
  const restored = reload(running);
  assert.equal(restored.focus.endAt, NOW + 300_000);
  assert.equal(remainingTime(restored.focus, NOW + 90_000), 210_000);
  assert.equal(advanceFocus(restored, NOW + 299_000), restored);
  const elapsed = advanceFocus(restored, NOW + 900_000);
  assert.equal(elapsed.focus.status, 'awaiting');
  assert.equal(remainingTime(elapsed.focus, NOW + 900_000), 0);
  assert.deepEqual(elapsed.wins, []);
  assert.equal(elapsed.bond, 0, 'an elapsed timer is not a completed task');
});

test('pause survives reload and resume uses the remaining time, not time spent paused', () => {
  const paused = pauseFocus(begin(), NOW + 120_000);
  assert.equal(paused.focus.status, 'paused');
  assert.equal(paused.focus.endAt, null);
  assert.equal(paused.focus.remainingMs, 180_000);
  const restored = reload(paused);
  assert.equal(remainingTime(restored.focus, NOW + 60 * 60_000), 180_000);
  const resumed = resumeFocus(restored, NOW + 60 * 60_000);
  assert.equal(resumed.focus.endAt, NOW + 60 * 60_000 + 180_000);
  assert.equal(remainingTime(resumed.focus, NOW + 60 * 60_000 + 80_000), 100_000);
});

test('a pause arriving after the deadline is a check-in, not a resumable zero timer', () => {
  const late = pauseFocus(begin(), NOW + 300_001);
  assert.equal(late.focus.status, 'awaiting');
  assert.equal(resumeFocus(late, NOW + 400_000), late);
  assert.equal(late.wins.length, 0);
});

test('cancelling a running or paused session gives no reward and cannot later be confirmed', () => {
  for (const state of [begin(), pauseFocus(begin(), NOW + 1000)]) {
    const cancelled = cancelFocus(state);
    assert.equal(cancelled.focus, null);
    assert.equal(cancelled.bond, 0);
    assert.deepEqual(cancelled.wins, []);
    const restored = reload(cancelled);
    assert.equal(confirmFocus(restored, 'session-1', true, NOW + 400_000), restored);
  }
});

test('only a matching, elapsed session and an explicit yes can become a real win', () => {
  const running = begin();
  assert.equal(confirmFocus(running, 'session-1', true, NOW + 1000), running);
  const elapsed = advanceFocus(running, NOW + 300_000);
  assert.equal(confirmFocus(elapsed, 'wrong-session', true, NOW + 300_000), elapsed);
  const declined = confirmFocus(elapsed, 'session-1', false, NOW + 300_000);
  assert.equal(declined.focus, null);
  assert.equal(declined.bond, 0);
  assert.equal(declined.wins.length, 0);
  const saved = confirmFocus(elapsed, 'session-1', true, NOW + 320_000);
  assert.equal(saved.focus, null);
  assert.equal(saved.bond, 5);
  assert.deepEqual(saved.wins, [{
    id: 'session-1', task: 'Write the first paragraph', minutes: 5, completedAt: NOW + 320_000,
  }]);
});

test('confirmation is idempotent even after reload, and awarded IDs cannot start again', () => {
  const elapsed = advanceFocus(begin(), NOW + 300_000);
  const saved = confirmFocus(elapsed, 'session-1', true, NOW + 300_000);
  const again = confirmFocus(saved, 'session-1', true, NOW + 300_001);
  assert.equal(again, saved);
  const restored = reload(saved);
  assert.equal(confirmFocus(restored, 'session-1', true, NOW + 900_000), restored);
  assert.equal(restored.wins.length, 1);
  assert.equal(restored.bond, 5);
  assert.equal(startFocus(restored, { id: 'session-1', task: 'Replay', minutes: 5 }, NOW), restored);
  const stale = { ...saved, focus: elapsed.focus };
  const reconciled = confirmFocus(stale, 'session-1', true, NOW + 500_000);
  assert.equal(reconciled.wins.length, 1);
  assert.equal(reconciled.bond, 5);
});

test('the labelled preview can expire and be confirmed without any real win or reward', () => {
  const preview = begin({ preview: true });
  assert.equal(remainingTime(preview.focus, NOW), 10_000);
  const restored = reload(preview);
  const elapsed = advanceFocus(restored, NOW + 10_000);
  assert.equal(elapsed.focus.status, 'awaiting');
  const finished = confirmFocus(elapsed, 'session-1', true, NOW + 10_001);
  assert.equal(finished.focus, null);
  assert.equal(finished.wins.length, 0);
  assert.equal(finished.bond, 0);
  assert.equal(finished.wins.reduce((sum, win) => sum + win.minutes, 0), 0);
});

test('long delays never inflate a real session’s focused minutes', () => {
  const elapsed = advanceFocus(begin({ minutes: 15 }), NOW + 8 * 60 * 60_000);
  const saved = confirmFocus(elapsed, 'session-1', true, NOW + 9 * 60 * 60_000);
  assert.equal(saved.wins[0].minutes, 15);
});

test('recent wins are bounded, and forgetting a task preserves the companion bond', () => {
  let state = createState();
  for (let i = 0; i < WIN_LIMIT + 3; i++) {
    state = startFocus(state, { id: `win-${i}`, task: `Small thing ${i}`, minutes: 5 }, NOW + i * 400_000);
    state = advanceFocus(state, NOW + i * 400_000 + 300_000);
    state = confirmFocus(state, `win-${i}`, true, NOW + i * 400_000 + 300_001);
  }
  assert.equal(state.wins.length, WIN_LIMIT);
  assert.equal(state.wins[0].task, 'Small thing 26');
  assert.equal(state.wins.at(-1).task, 'Small thing 3');
  const forgotten = forgetWin(state, state.wins[0].id);
  assert.equal(forgotten.wins.length, WIN_LIMIT - 1);
  assert.equal(forgotten.bond, state.bond);
  assert.equal(JSON.stringify(forgotten).includes('Small thing 26'), false);
});

test('name migration, trimming, shell choices, and positive interaction growth are persistent', () => {
  const migrated = decodeState(null, '  Miso  ');
  assert.equal(migrated.status, 'migrated');
  assert.equal(migrated.state.name, 'Miso');
  let state = adopt(migrated.state, '  Fern  ', 'lavender');
  assert.equal(state.name, 'Fern');
  assert.equal(state.shell, 'lavender');
  assert.equal(adopt(state, '   ', 'cream'), state);
  assert.equal(adopt(state, 'A'.repeat(25), 'cream').name.length, 20);
  for (let i = 0; i < 5; i++) state = interact(state, 'pet');
  assert.equal(reload(state).interactions.pet, 5);
  assert.equal(bondLevel(state.bond).name, 'Little sprout');
  assert.equal(interact(state, 'unknown'), state);
  assert.equal(advanceFocus(state, NOW + 365 * 24 * 60 * 60_000).bond, 5, 'no absence penalty');
});

test('corrupt, unsupported, and malformed nested storage fails closed', () => {
  for (const raw of ['{not json', 'null', '[]', '{"version":99}', '"oops"']) {
    const decoded = decodeState(raw);
    assert.equal(decoded.status, 'recovered');
    assert.deepEqual(decoded.state, createState());
  }
  const corrupt = normalizeState({
    ...createState(), shell: 'unknown', name: { markup: true }, bond: -100,
    focus: { ...begin().focus, endAt: 'tomorrow' },
    wins: [
      { id: 'fake', task: 'Preview', minutes: 0, completedAt: NOW },
      { id: 'fake2', task: 'Preview', minutes: 5, completedAt: NOW, preview: true },
      { id: 'fake3', task: 'Bad date', minutes: 5, completedAt: 1e30 },
      null,
    ],
    interactions: { feed: -2, pet: 'a lot', play: Infinity },
  });
  assert.deepEqual(corrupt, createState());
});

test('normalization retains text as text and strips duplicated wins and unknown fields', () => {
  const state = createState();
  state.name = '<img src=x>';
  state.wins = [
    { id: 'same', task: '<script>not markup</script>', minutes: 25, completedAt: NOW },
    { id: 'same', task: 'Duplicate', minutes: 25, completedAt: NOW },
  ];
  const normalized = normalizeState({ ...state, privateUnknownField: 'discard me' });
  assert.equal(normalized.wins.length, 1);
  assert.equal(normalized.name, '<img src=x>');
  assert.equal(normalized.wins[0].task, '<script>not markup</script>');
  assert.equal('privateUnknownField' in normalized, false);
});
