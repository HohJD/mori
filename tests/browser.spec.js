import { test, expect } from '@playwright/test';

const STORAGE_KEY = 'mori-world-v1';
const consoleErrors = new WeakMap();
const expectedAPIFailures = new WeakMap();
test.use({ reducedMotion: 'reduce' });

test.beforeEach(async ({ page }) => {
  const errors = [];
  consoleErrors.set(page, errors);
  expectedAPIFailures.set(page, new Set());
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    // Deliberate HTTP/network error fixtures still emit Chromium resource errors.
    // Only those exact API paths are exempt, never script errors or other assets.
    let path;
    try { path = new URL(message.location().url).pathname; } catch { /* Not a URL. */ }
    if (message.text().startsWith('Failed to load resource:') && expectedAPIFailures.get(page).has(path)) return;
    errors.push(message.text());
  });
});

test.afterEach(async ({ page }) => {
  expect(consoleErrors.get(page), 'No browser or console errors').toEqual([]);
});

async function adoptCompanion(page, name = 'Miso', shell = 'Sage') {
  await page.locator('.customize-button').click();
  await page.getByLabel('Your Mori’s name', { exact: true }).fill(name);
  await page.getByRole('radio', { name: shell, exact: true }).check();
  await page.getByRole('button', { name: 'Say your first hello' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
}

async function startRealFocus(page, task = 'Write one honest paragraph') {
  await page.getByLabel('What’s one thing you’d like to do?').fill(task);
  await page.getByRole('radio', { name: '5 min', exact: true }).check();
  await page.getByRole('button', { name: 'Let’s do one thing' }).click();
}

async function freezeClock(page) {
  // install() alone still advances with wall time. Pause before the app starts
  // so GPU work or a busy CI worker cannot steal a second from timer assertions.
  await page.clock.install({ time: new Date('2026-01-01T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-01-01T12:00:01Z'));
}

async function enterHardware(page, renderer = 'webgl') {
  await page.locator('#inside').evaluate((element) => window.scrollTo({ top: element.offsetTop, behavior: 'instant' }));
  await expect(page.locator('#inside')).toHaveAttribute('data-renderer', renderer, { timeout: 15_000 });
  if (renderer === 'webgl') {
    await expect.poll(() => page.locator('.hardware-canvas canvas').getAttribute('data-draw-calls')).toMatch(/^[1-9]\d+$/);
  }
}

async function scrollHardware(page, progress) {
  await page.locator('#inside').evaluate((element, target) => {
    const start = Number(element.dataset.scrollStart), end = Number(element.dataset.scrollEnd);
    window.scrollTo({ top: start + (end - start) * target, behavior: 'instant' });
  }, progress);
  await expect.poll(async () => Number(await page.locator('#inside').getAttribute('data-progress'))).toBeCloseTo(progress, 2);
}

async function expectAnchorSettled(page, selector) {
  // Allow native padding plus a small first-load/font-layout shift, but still
  // reject navigation that stops at the preceding section.
  let previousY;
  let stableSamples = 0;
  await expect.poll(async () => {
    const { y, top } = await page.locator(selector).evaluate((element) => ({
      y: window.scrollY, top: element.getBoundingClientRect().top,
    }));
    stableSamples = previousY !== undefined && Math.abs(y - previousY) < 1 ? stableSamples + 1 : 0;
    previousY = y;
    // Observe native navigation only: never scroll the target into place here.
    return stableSamples >= 3 ? Math.abs(top) : Infinity;
  }, {
    message: `${selector} settles at its anchor, allowing the page's scroll padding`,
    timeout: 10_000,
    intervals: [100],
  }).toBeLessThanOrEqual(64);
}

async function captureScene(page) {
  // Let the completed WebGL draw reach the compositor, not merely its DOM data.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  return page.locator('.hardware-canvas canvas').screenshot();
}

async function imageDifference(page, first, second) {
  // Compare pixels, not PNG compression bytes; allow only tiny GPU edge variation.
  return page.evaluate(async ({ a, b }) => {
    const decode = async (data) => {
      const image = new Image();
      image.src = `data:image/png;base64,${data}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0);
      return context.getImageData(0, 0, canvas.width, canvas.height).data;
    };
    const left = await decode(a), right = await decode(b);
    if (left.length !== right.length) return 1;
    let changed = 0;
    for (let i = 0; i < left.length; i += 4) {
      if (Math.max(...[0, 1, 2].map((channel) => Math.abs(left[i + channel] - right[i + channel]))) > 8) changed++;
    }
    return changed / (left.length / 4);
  }, { a: first.toString('base64'), b: second.toString('base64') });
}

// Frontend API-contract fixtures, not evidence of a live provider connection.
const mockModels = { openai: 'test-gpt-model', claude: 'test-claude-model', gemini: 'test-gemini-model' };
const jsonReply = (provider = 'openai', overrides = {}) => ({
  provider, model: mockModels[provider], reply: 'A real response fixture, not a shipped demo.',
  usage: { inputTokens: 7, outputTokens: 11, totalTokens: 18 },
  durationMs: 50, requestId: 'test-request', finishReason: 'stop', partial: false, ...overrides,
});
const fulfillJSON = (route, body, status = 200) => route.fulfill({
  status, contentType: 'application/json', headers: { 'Cache-Control': 'no-store' }, body: JSON.stringify(body),
});

async function installSpeech(page, { listen = true, speak = true, autoEnd = true } = {}) {
  await page.addInitScript(({ listen, speak, autoEnd }) => {
    const state = {
      starts: 0, aborts: 0, stops: 0, cancels: 0, spoken: [], order: [], current: null, utterance: null,
      emit(text, final = true) {
        const result = [{ transcript: text }];
        result.isFinal = final;
        this.current?.onresult?.({ results: [result], resultIndex: 0 });
      },
      fail(error) { this.current?.onerror?.({ error }); },
      finishSpeaking() { this.utterance?.onend?.(); },
    };
    window.__speech = state;
    class FakeRecognition {
      start() {
        state.starts++; state.order.push('listen'); state.current = this;
        state.lateResult = this.onresult;
        this.onstart?.();
      }
      stop() { state.stops++; state.order.push('stop-listening'); this.onend?.(); }
      abort() { state.aborts++; state.order.push('abort-listening'); if (state.current === this) state.current = null; }
    }
    Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: listen ? FakeRecognition : undefined });
    Object.defineProperty(window, 'webkitSpeechRecognition', { configurable: true, value: undefined });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      configurable: true, value: speak ? class { constructor(text) { this.text = text; } } : undefined,
    });
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: speak ? {
        speak(utterance) {
          state.spoken.push(utterance.text); state.order.push('speak'); state.utterance = utterance;
          state.lateSpeechEnd = utterance.onend;
          utterance.onstart?.();
          if (autoEnd) setTimeout(() => utterance.onend?.(), 0);
        },
        cancel() { state.cancels++; state.order.push('cancel-speech'); state.utterance = null; },
      } : undefined,
    });
  }, { listen, speak, autoEnd });
}

async function mockAI(page, { authenticated = true, authConfigured = true, configured = ['openai', 'claude', 'gemini'], limits = {}, speech = {} } = {}) {
  await installSpeech(page, speech);
  const mock = {
    config: {
      auth: { required: true, configured: authConfigured, authenticated },
      providers: Object.entries(mockModels).map(([id, model]) => ({ id, name: id, model, configured: configured.includes(id) })),
      limits: { maxMessages: 20, maxMessageChars: 4000, maxTotalChars: 24000, ...limits },
    },
    requests: [], sessions: [], onChat: null, missingConfig: false,
  };
  await page.route('**/api/config', (route) => mock.missingConfig
    ? route.fulfill({ status: 404, contentType: 'text/html', body: '<h1>No API</h1>' })
    : fulfillJSON(route, mock.config));
  await page.route('**/api/session', async (route) => {
    const method = route.request().method();
    const data = method === 'POST' ? route.request().postDataJSON() : null;
    mock.sessions.push({ method, data });
    if (method === 'POST' && data.code !== 'test-access-code') {
      expectedAPIFailures.get(page).add('/api/session');
      return fulfillJSON(route, { error: { code: 'AUTH_REQUIRED', message: 'Incorrect test code' } }, 401);
    }
    mock.config.auth.authenticated = method === 'POST';
    return fulfillJSON(route, { authenticated: mock.config.auth.authenticated });
  });
  await page.route('**/api/chat', async (route) => {
    const payload = route.request().postDataJSON();
    mock.requests.push(payload);
    if (mock.onChat) return mock.onChat(route, payload);
    return fulfillJSON(route, jsonReply(payload.provider));
  });
  return mock;
}

async function sendDraft(page, text) {
  await page.locator('#chat-draft').fill(text);
  await page.locator('#send-message').click();
  await expect(page.locator('#assistant-console')).toHaveAttribute('data-phase', 'idle');
}

test('adopt, use all local habitat buttons, then preview across reload without a fake win', async ({ page }) => {
  await freezeClock(page);
  await page.goto('/');
  await adoptCompanion(page, '  Miso  ', 'Lavender');
  await expect(page.locator('#habitat-title')).toHaveText('Miso’s little corner');
  await expect(page.locator('#focus-title')).toContainText('Miso');
  await expect(page.locator('body')).toHaveAttribute('data-shell', 'lavender');

  await page.getByRole('button', { name: 'Feed', exact: true }).click();
  await expect(page.locator('#pet-message')).toContainText('crunch crunch');
  await expect(page.locator('body')).toHaveAttribute('data-reaction', 'feed');
  await page.getByRole('button', { name: 'Pet', exact: true }).click();
  await expect(page.locator('#pet-message')).toContainText('favorite kind of weather');
  await expect(page.locator('body')).toHaveAttribute('data-reaction', 'pet');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.locator('#pet-message')).toContainText('count to potato');
  await expect(page.locator('body')).toHaveAttribute('data-reaction', 'play');
  await page.getByRole('button', { name: 'Feed', exact: true }).click();
  await expect(page.locator('#pet-message')).toContainText('saving a crumb');
  await expect(page.locator('#bond-count')).toHaveText('4 bond points');
  await page.clock.fastForward(2000);
  await expect(page.locator('body')).not.toHaveAttribute('data-reaction');

  await page.getByRole('button', { name: 'Just looking? Try a 10-second preview' }).click();
  await expect(page.getByRole('timer')).toHaveText('00:10');
  await expect(page.locator('#session-context')).toContainText('no wins or minutes saved');
  await page.clock.fastForward(3000);
  await page.reload();
  await expect(page.locator('#habitat-title')).toHaveText('Miso’s little corner');
  await expect(page.locator('body')).toHaveAttribute('data-shell', 'lavender');
  await expect(page.getByRole('timer')).toHaveText('00:07');
  await page.clock.fastForward(8000);
  await expect(page.getByText('Did you finish your one thing?', { exact: true })).toBeVisible();
  await expect(page.locator('#win-total')).toHaveText('0');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Finish preview (no win)', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Finish preview (no win)', exact: true }).click();
  await expect(page.locator('#focus-status')).toContainText('No win, minutes, or bond points added');
  await expect(page.locator('#win-total')).toHaveText('0');
  await expect(page.locator('#minute-total')).toHaveText('0');
  await expect(page.locator('#bond-count')).toHaveText('4 bond points');
  await page.reload();
  await expect(page.locator('#focus-form')).toBeVisible();
  await expect(page.locator('#win-total')).toHaveText('0');
});

test('real focus pauses, resumes, awaits confirmation, saves once, and can be forgotten or reset', async ({ page }) => {
  await freezeClock(page);
  await page.goto('/');
  await adoptCompanion(page);
  await startRealFocus(page);
  await page.clock.fastForward(60_000);
  await expect(page.getByRole('timer')).toHaveText('04:00');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.clock.fastForward(120_000);
  await page.reload();
  await expect(page.getByRole('timer')).toHaveText('04:00');
  await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await page.clock.fastForward(240_001);
  await expect(page.getByText('Did you finish your one thing?', { exact: true })).toBeVisible();
  await expect(page.locator('#win-total')).toHaveText('0');
  await page.reload();
  await page.getByRole('button', { name: 'Yes, save my win' }).click();
  await expect(page.locator('#win-total')).toHaveText('1');
  await expect(page.locator('#minute-total')).toHaveText('5');
  await expect(page.locator('#bond-count')).toHaveText('5 bond points');
  await expect(page.locator('#room')).toHaveClass(/has-plant/);
  await expect(page.locator('#wins-list')).toContainText('Write one honest paragraph');
  await page.reload();
  await expect(page.locator('#win-total')).toHaveText('1');
  await expect(page.locator('#focus-form')).toBeVisible();
  await expect(page.locator('#bond-count')).toHaveText('5 bond points');
  await page.getByRole('button', { name: 'Forget win: Write one honest paragraph', exact: true }).click();
  await expect(page.locator('#wins-empty')).toBeVisible();
  await expect(page.locator('#minute-total')).toHaveText('0');
  await expect(page.locator('#bond-count')).toHaveText('5 bond points');

  await startRealFocus(page, 'A task to be reset');
  await page.getByRole('button', { name: 'Reset my local world' }).click();
  await expect(page.getByRole('button', { name: 'Keep my Mori', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Keep my Mori', exact: true }).click();
  await expect(page.locator('#focus-session')).toBeVisible();
  await page.getByRole('button', { name: 'Reset my local world' }).click();
  await page.getByRole('button', { name: 'Yes, reset this Mori', exact: true }).click();
  await expect(page.locator('#habitat-title')).toHaveText('Mori’s little corner');
  await expect(page.locator('#bond-count')).toHaveText('0 bond points');
  await expect(page.locator('#focus-form')).toBeVisible();
  await page.clock.fastForward(600_000);
  await page.reload();
  await expect(page.locator('#focus-form')).toBeVisible();
  await expect(page.locator('#win-total')).toHaveText('0');
});

test('cancel and not-finished never reward a real session', async ({ page }) => {
  await freezeClock(page);
  await page.goto('/');
  await startRealFocus(page);
  await page.getByRole('button', { name: 'Cancel session', exact: true }).click();
  await page.clock.fastForward(300_001);
  await expect(page.locator('#focus-form')).toBeVisible();
  await expect(page.locator('#win-total')).toHaveText('0');
  await startRealFocus(page);
  await page.clock.fastForward(300_001);
  await page.getByRole('button', { name: 'Not this time', exact: true }).click();
  await expect(page.locator('#win-total')).toHaveText('0');
  await expect(page.locator('#bond-count')).toHaveText('0 bond points');
  await expect(page.locator('#focus-status')).toContainText('No win saved');
});

test('names and tasks are text, whitespace is rejected, and dialogs and radios work with a keyboard', async ({ page }) => {
  await freezeClock(page);
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content', exact: true })).toBeFocused();
  await expect(page.locator('.skip-link')).toHaveCSS('opacity', '1');
  await page.keyboard.press('Enter');
  await expect(page.locator('#main')).toBeFocused();
  const trigger = page.locator('.customize-button');
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  const nameInput = page.getByLabel('Your Mori’s name', { exact: true });
  await expect(nameInput).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(trigger).toBeFocused();

  await trigger.click();
  await nameInput.fill('   ');
  await page.getByRole('button', { name: 'Say your first hello' }).click();
  await expect(page.locator('#name-error')).toContainText('Give your Mori a name');
  await nameInput.fill('<img src=x>');
  await page.getByRole('radio', { name: 'Sage', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('radio', { name: 'Cream', exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'Say your first hello' }).click();
  await expect(page.locator('#habitat-title')).toHaveText('<img src=x>’s little corner');
  await expect(page.locator('#habitat-title img')).toHaveCount(0);
  await expect(page.locator('body')).toHaveAttribute('data-shell', 'cream');
  await page.getByLabel('What’s one thing you’d like to do?').fill('  ');
  await page.getByRole('button', { name: 'Let’s do one thing' }).click();
  await expect(page.locator('#task-error')).toContainText('Choose one concrete thing');
  await startRealFocus(page, '<img src=x onerror=alert(1)>');
  await page.clock.fastForward(300_001);
  await page.getByRole('button', { name: 'Yes, save my win' }).click();
  await expect(page.locator('#wins-list h3')).toHaveText('<img src=x onerror=alert(1)>');
  await expect(page.locator('#wins-list img, #session-task img')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('#habitat-title')).toHaveText('<img src=x>’s little corner');
  const question = page.getByText('Is Mori using AI or listening to me?', { exact: false }).locator('..');
  await page.locator('#faq details').nth(1).locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#faq details').nth(1)).toHaveAttribute('open');
  await expect(question).toBeVisible();
});

test('legacy names migrate, corrupt data recovers, and unavailable storage is disclosed', async ({ page, context }) => {
  await page.addInitScript(() => localStorage.setItem('mori-name', 'Old friend'));
  await page.goto('/');
  await expect(page.locator('#habitat-title')).toHaveText('Old friend’s little corner');
  expect(await page.evaluate(() => localStorage.getItem('mori-name'))).toBeNull();
  await page.evaluate((key) => localStorage.setItem(key, '{broken json'), STORAGE_KEY);
  await page.reload();
  await expect(page.locator('#habitat-title')).toHaveText('Mori’s little corner');
  await expect(page.locator('#persistence-text')).toContainText('Unreadable data was repaired');
  await page.getByRole('button', { name: 'Feed', exact: true }).click();
  await expect(page.locator('#bond-count')).toHaveText('1 bond point');

  const blocked = await context.newPage();
  const errors = [];
  blocked.on('pageerror', (error) => errors.push(error.message));
  await blocked.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new Error('Storage disabled'); } });
  });
  await blocked.goto('/');
  await expect(blocked.locator('#persistence-text')).toContainText('Changes last only in this tab');
  await adoptCompanion(blocked, 'Temporary');
  await blocked.getByRole('button', { name: 'Feed', exact: true }).click();
  await expect(blocked.locator('#bond-count')).toHaveText('1 bond point');
  await expect(blocked.locator('#habitat-title')).toHaveText('Temporary’s little corner');
  expect(errors).toEqual([]);
  await blocked.close();
});

for (const width of [320, 390, 768, 1440]) {
  test(`layout, local assets, and reduced motion at ${width}px`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width, height: width > 1000 ? 1000 : 844 });
    const externalRequests = [];
    page.on('request', (request) => {
      if (!request.url().startsWith('data:') && new URL(request.url()).origin !== new URL(baseURL).origin) externalRequests.push(request.url());
    });
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator('h1')).toBeVisible();
    const layout = await page.evaluate(() => ({
      viewport: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      heroOpacity: getComputedStyle(document.querySelector('.hero-copy')).opacity,
      heroPosition: document.querySelector('.hero-copy').getBoundingClientRect().bottom,
      devicePosition: document.querySelector('.hero-art').getBoundingClientRect().top,
      smooth: getComputedStyle(document.documentElement).scrollBehavior,
      idle: getComputedStyle(document.querySelector('.creature')).animationName,
    }));
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.viewport);
    expect(layout.heroOpacity).toBe('1');
    expect(layout.smooth).toBe('auto');
    expect(layout.idle).toBe('none');
    if (width <= 900) expect(layout.heroPosition).toBeLessThanOrEqual(layout.devicePosition);
    const smallTargets = await page.locator('button, a, summary, label:has(input[type="radio"])').evaluateAll((elements) => (
      elements.filter((element) => element.getClientRects().length)
        .map((element) => ({
          name: element.getAttribute('aria-label') || element.textContent.trim(),
          width: element.getBoundingClientRect().width,
          height: element.getBoundingClientRect().height,
        }))
        .filter((target) => target.width < 43.9 || target.height < 43.9)
    ));
    expect(smallTargets, 'Visible controls have at least 44px targets').toEqual([]);
    await page.locator('#play').scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await adoptCompanion(page, 'Averylongcompanion123');
    await expect(page.locator('#habitat-title')).toContainText('Averylongcompanion12');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.getByRole('button', { name: 'Reset my local world' }).click();
    await page.getByRole('button', { name: 'Yes, reset this Mori', exact: true }).click();
    await page.reload();
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => window.scrollTo(0, 0));
    if (process.env.MORI_SCREENSHOTS && [390, 1440].includes(width)) {
      await page.screenshot({
        path: `/tmp/mori-voice-review/mori-${width === 1440 ? 'desktop' : 'mobile'}.png`,
        fullPage: true,
        animations: 'disabled',
      });
    }
    expect(externalRequests, 'All fonts and assets are self-hosted').toEqual([]);
  });
}

test.describe('first-load navigation', () => {
  test.use({ reducedMotion: 'no-preference' });

  // Each test gets a fresh browser context; the engine is still lazy when
  // genuine browser navigation begins. Do not use enterHardware() here.
  test('fresh mobile /#inside reaches and renders the studio', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    // The setup notice above the anchor arrives asynchronously. It must not
    // displace the initial hash navigation while the 3D engine also loads.
    await page.route('**/api/config', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 350));
      await route.continue();
    });
    await page.goto('/#inside');
    await expect(page.locator('#assistant-readiness')).not.toHaveText('Checking setup');
    await expect(page.locator('#inside')).toHaveAttribute('data-renderer', 'webgl', { timeout: 15_000 });
    await expect(page.locator('#inside')).toHaveAttribute('data-trigger-count', '1');
    await expectAnchorSettled(page, '#inside');
    await expect(page.locator('#inside-title')).toBeInViewport();
    await expect(page.locator('.hardware-canvas canvas')).toHaveAttribute('data-draw-calls', /^[1-9]\d*$/);
  });

  test('first desktop device link reaches and renders the studio', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/');
    await expect(page.locator('#inside')).toHaveAttribute('data-renderer', 'loading');
    await expect(page.locator('html')).toHaveCSS('scroll-behavior', 'smooth');
    await page.getByRole('navigation', { name: 'Main navigation' })
      .getByRole('link', { name: 'The little device', exact: true }).click();
    await expect(page.locator('#inside')).toHaveAttribute('data-renderer', 'webgl', { timeout: 15_000 });
    await expect(page.locator('#inside')).toHaveAttribute('data-trigger-count', '1');
    await expectAnchorSettled(page, '#inside');
    await expect(page.locator('#inside-title')).toBeInViewport();
    await expect(page.locator('.hardware-canvas canvas')).toHaveAttribute('data-draw-calls', /^[1-9]\d*$/);
  });

  test('first mobile little-world link passes the unloaded studio without stopping early', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.locator('#inside')).toHaveAttribute('data-renderer', 'loading');
    await expect(page.locator('html')).toHaveCSS('scroll-behavior', 'smooth');
    await page.getByRole('link', { name: 'Visit your little world', exact: true }).click();
    await expect(page.locator('#inside')).toHaveAttribute('data-renderer', 'webgl', { timeout: 15_000 });
    await expect(page.locator('#inside')).toHaveAttribute('data-trigger-count', '1');
    await expectAnchorSettled(page, '#play');
    await expect(page.locator('#play-title')).toBeInViewport();
  });

  test('resizing the live console keeps the lazy studio’s absolute scroll landmarks correct', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/');
    await enterHardware(page);
    const before = Number(await page.locator('#inside').getAttribute('data-scroll-start'));
    await page.locator('#chat-draft').evaluate((element) => { element.style.height = '300px'; });
    await expect.poll(async () => Number(await page.locator('#inside').getAttribute('data-scroll-start'))).toBeGreaterThan(before + 100);
    await expect.poll(() => page.locator('#inside').evaluate((element) => Math.abs(Number(element.dataset.scrollStart) - element.offsetTop))).toBeLessThan(2);
    await enterHardware(page);
    await scrollHardware(page, .50);
    await expect(page.locator('#inside')).toHaveAttribute('data-phase', 'exploded');
    await expect(page.locator('#inside')).toHaveAttribute('data-trigger-count', '1');
  });
});

test('normal-motion reactions clear; real 3D opens, rests, closes down-scroll, and reverses without changing the hero', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const heavyRequests = [];
  page.on('request', (request) => {
    if (/hardware-model|ScrollTrigger|gsap/.test(request.url())) heavyRequests.push(request.url());
  });
  await page.goto('/');
  expect(heavyRequests, 'The initial hero does not import the 3D/scroll engine').toEqual([]);
  await page.getByRole('button', { name: 'Feed', exact: true }).click();
  await page.getByRole('button', { name: 'Pet', exact: true }).click();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.locator('body')).toHaveAttribute('data-reaction', 'play');
  await expect(page.locator('body')).not.toHaveAttribute('data-reaction', { timeout: 4000 });
  await enterHardware(page);
  const canvas = page.locator('.hardware-canvas canvas');
  await scrollHardware(page, .02);
  await expect(page.locator('#inside')).toHaveAttribute('data-phase', 'assembled');
  const closedPose = await canvas.getAttribute('data-pose');
  const closedImage = await captureScene(page);
  expect(closedImage.byteLength, 'The real WebGL canvas is not a blank placeholder').toBeGreaterThan(20_000);
  expect(Number(await canvas.getAttribute('data-triangles'))).toBeGreaterThan(10_000);
  await scrollHardware(page, .50);
  await expect(page.locator('#inside')).toHaveAttribute('data-phase', 'exploded');
  await expect(canvas).not.toHaveAttribute('data-pose', closedPose);
  const openPose = await canvas.getAttribute('data-pose');
  const closedParts = JSON.parse(closedPose), openParts = JSON.parse(openPose);
  expect(openParts).toHaveLength(16);
  openParts.forEach((part, i) => {
    const distance = Math.hypot(...part.slice(1, 4).map((position, j) => position - closedParts[i][j + 1]));
    expect(distance, `${part[0]} is a genuinely independent, separated mesh group`).toBeGreaterThan(.5);
  });
  const openImage = await captureScene(page);
  expect(openImage.equals(closedImage), 'Completed WebGL draw changes, not just labels').toBe(false);
  await scrollHardware(page, .64);
  await expect(canvas).toHaveAttribute('data-pose', openPose);
  await scrollHardware(page, .99);
  await expect(page.locator('#inside')).toHaveAttribute('data-phase', 'assembled');
  await expect(canvas).toHaveAttribute('data-pose', closedPose);
  const reassembledImage = await captureScene(page);
  expect(await imageDifference(page, closedImage, reassembledImage), 'Closed renders match within 0.1% GPU edge variation; mesh transforms match exactly').toBeLessThan(.001);
  await scrollHardware(page, .50);
  await expect(canvas).toHaveAttribute('data-pose', openPose);
  await scrollHardware(page, .02);
  await expect(canvas).toHaveAttribute('data-pose', closedPose);
  await expect(page.locator('.hero-copy')).toHaveCSS('opacity', '1');
  await page.locator('.hardware-skip').click();
  await expect(page.locator('#habitat-title')).toBeInViewport();
  // Rendering is demand-driven and stops once the studio has left the viewport.
  await page.waitForTimeout(250);
  const frames = await canvas.getAttribute('data-render-count');
  await page.waitForTimeout(350);
  await expect(canvas).toHaveAttribute('data-render-count', frames);
});

test('all 16 numbered selectors highlight their mesh, explain proposed materials, and offer keyboard close-ups', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await enterHardware(page);
  const canvas = page.locator('.hardware-canvas canvas');
  const parts = await page.locator('#hardware-part-select option').evaluateAll((options) => options.map((option) => ({ id: option.value, name: option.textContent.slice(5) })));
  expect(parts).toHaveLength(16);
  for (const part of parts) {
    const button = page.locator(`[data-part="${part.id}"]`);
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-part-title]')).toHaveText(part.name);
    await expect(page.locator('[data-part-description]')).not.toBeEmpty();
    await expect(page.locator('[data-part-material]')).not.toBeEmpty();
    await expect(canvas).toHaveAttribute('data-selected', part.id);
  }
  await page.locator('[data-part="pcb"]').focus();
  await page.keyboard.press('Enter');
  const totalDraws = Number(await canvas.getAttribute('data-draw-calls'));
  await page.getByRole('button', { name: 'Look closer' }).click();
  await expect(canvas).toHaveAttribute('data-isolated', 'true');
  await expect.poll(async () => Number(await canvas.getAttribute('data-draw-calls'))).toBeLessThan(totalDraws);
  expect((await canvas.screenshot()).byteLength).toBeGreaterThan(20_000);
  await page.getByRole('button', { name: 'Assembled', exact: true }).click();
  await expect(page.locator('#inside')).toHaveAttribute('data-separation', '0.0000');
  await page.locator('[data-part="compute"]').click();
  await expect(page.locator('#inside')).toHaveAttribute('data-separation', '1.0000');
  await expect(canvas).toHaveAttribute('data-selected', 'compute');
  await expect(canvas).toHaveAttribute('data-isolated', 'false');
  await page.locator('#hardware-scrub').focus();
  await page.keyboard.press('End');
  await expect(page.locator('#inside')).toHaveAttribute('data-phase', 'assembled');
  await page.keyboard.press('Home');
  await expect(page.locator('#inside')).toHaveAttribute('data-progress', '0.0000');
});

test('live reduced motion removes the long pin and duplicate triggers; manual states remain instant', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await enterHardware(page);
  await expect(page.locator('#inside')).toHaveAttribute('data-trigger-count', '1');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterHardware(page);
  await expect(page.locator('#inside')).toHaveAttribute('data-motion', 'reduced');
  await expect(page.locator('#inside')).toHaveAttribute('data-trigger-count', '0');
  await expect(page.locator('#inside')).toHaveAttribute('data-phase', 'exploded');
  await expect(page.locator('.hardware-studio')).toHaveCSS('position', 'relative');
  expect(await page.locator('#inside').evaluate((element) => element.offsetHeight)).toBeLessThan(1100);
  const still = await page.locator('canvas').getAttribute('data-pose');
  await page.evaluate(() => window.scrollBy({ top: 150, behavior: 'instant' }));
  await expect(page.locator('canvas')).toHaveAttribute('data-pose', still);
  await page.getByRole('button', { name: 'Assembled', exact: true }).click();
  await expect(page.locator('#inside')).toHaveAttribute('data-phase', 'assembled');
  await page.getByRole('button', { name: 'Exploded', exact: false }).click();
  await expect(page.locator('canvas')).toHaveAttribute('data-pose', still);
  for (let i = 0; i < 2; i++) {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expect(page.locator('#inside')).toHaveAttribute('data-trigger-count', '1');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(page.locator('#inside')).toHaveAttribute('data-trigger-count', '0');
  }
});

test('light and dark persist independently of companion reset, and update the real scene and shell', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await enterHardware(page);
  const darkCanvas = await page.locator('canvas').screenshot();
  for (const theme of ['dark', 'light']) {
    if (theme === 'light') {
      await page.getByRole('button', { name: 'Switch to light mode' }).click();
      await enterHardware(page);
    }
    await expect(page.locator('canvas')).toHaveAttribute('data-theme', theme);
    // Read computed colors from the real controls and text, not a copied palette.
    const contrasts = await page.evaluate(() => {
      const luminance = (color) => {
        const rgb = color.match(/[\d.]+/g).slice(0, 3).map(Number).map((v) => {
          const s = v / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4;
        });
        return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
      };
      const ratio = (a, b) => (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
      const background = luminance(getComputedStyle(document.querySelector('#inside')).backgroundColor);
      return ['[data-part-description]', '[data-part-title]', '.hardware-chapter', '.hardware-part-index button[aria-pressed="true"]'].map((selector) => {
        const style = getComputedStyle(document.querySelector(selector));
        const surface = style.backgroundColor === 'rgba(0, 0, 0, 0)' ? background : luminance(style.backgroundColor);
        return { selector, ratio: ratio(luminance(style.color), surface) };
      });
    });
    contrasts.forEach(({ selector, ratio }) => expect(ratio, `${theme}: ${selector} meets AA text contrast`).toBeGreaterThanOrEqual(4.5));
  }
  expect((await page.locator('canvas').screenshot()).equals(darkCanvas)).toBe(false);
  expect(await page.evaluate(() => localStorage.getItem('mori-theme'))).toBe('light');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await adoptCompanion(page, 'Miso', 'Lavender');
  await enterHardware(page);
  await expect(page.locator('canvas')).toHaveAttribute('data-shell', 'lavender');
  await expect(page.locator('canvas')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Reset my local world' }).click();
  await page.getByRole('button', { name: 'Yes, reset this Mori', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await enterHardware(page);
  await expect(page.locator('canvas')).toHaveAttribute('data-shell', 'sage');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('theme follows the system until chosen and remains usable when storage is blocked', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Switch to light mode' }).click();
  await page.emulateMedia({ colorScheme: 'light' });
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new Error('Storage disabled'); } });
  });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('#persistence-text')).toContainText('Changes last only in this tab');
  await page.getByRole('button', { name: 'Switch to light mode' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Feed', exact: true }).click();
  await expect(page.locator('#bond-count')).toHaveText('1 bond point');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('unsupported WebGL uses detailed local vector parts with the same working inspector', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...options) {
      return type === 'webgl2' ? null : original.call(this, type, ...options);
    };
  });
  await page.goto('/');
  await enterHardware(page, 'fallback');
  await expect(page.locator('.hardware-canvas canvas')).toHaveCount(0);
  await expect(page.locator('[data-fallback-part]')).toHaveCount(16);
  await expect(page.locator('[data-render-label]')).toContainText('3D unavailable');
  const svg = page.locator('.hardware-fallback svg');
  expect((await svg.screenshot()).byteLength).toBeGreaterThan(20_000);
  const open = await page.locator('[data-fallback-part="microphone"]').getAttribute('transform');
  await page.getByRole('button', { name: 'Assembled', exact: true }).click();
  await expect(page.locator('[data-fallback-part="microphone"]')).not.toHaveAttribute('transform', open);
  await page.locator('[data-part="microphone"]').click();
  await expect(page.locator('[data-fallback-part="microphone"]')).toHaveAttribute('transform', open);
  await expect(page.locator('[data-fallback-part="microphone"]')).toHaveAttribute('data-highlight', 'true');
  await expect(page.locator('[data-part-description]')).toContainText('only when you choose Talk');
  await page.getByRole('button', { name: 'Look closer' }).click();
  await expect(svg).not.toHaveAttribute('viewBox', '0 0 920 620');
  await page.getByRole('button', { name: 'See all parts' }).click();
  await expect(svg).toHaveAttribute('viewBox', '0 0 920 620');
  await page.locator('.hardware-skip').click();
  await page.getByRole('button', { name: 'Pet', exact: true }).click();
  await expect(page.locator('#pet-message')).toContainText('favorite kind of weather');
});

test('losing a real WebGL context switches safely to the illustrated study', async ({ page }) => {
  await page.goto('/');
  await enterHardware(page);
  await page.locator('canvas').evaluate((canvas) => {
    const extension = canvas.getContext('webgl2').getExtension('WEBGL_lose_context');
    if (!extension) throw new Error('Test browser must support context-loss simulation');
    extension.loseContext();
  });
  await expect(page.locator('#inside')).toHaveAttribute('data-renderer', 'fallback');
  await page.locator('[data-part="battery"]').click();
  await expect(page.locator('[data-fallback-part="battery"]')).toHaveAttribute('data-highlight', 'true');
  await expect(page.locator('[data-part-title]')).toHaveText('Protected battery');
});

test('a failed lazy import leaves an inspectable static study and the companion intact', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.route('**/*hardware-model*', (route) => route.fulfill({
    status: 200, contentType: 'text/javascript', body: 'throw new Error("Simulated module failure");',
  }));
  await page.goto('/');
  await enterHardware(page, 'fallback');
  await expect(page.locator('#inside')).toHaveAttribute('data-motion', 'static');
  await expect(page.locator('#inside')).toHaveAttribute('data-phase', 'exploded');
  await page.locator('[data-part="power"]').click();
  await expect(page.locator('[data-part-title]')).toHaveText('USB-C & power');
  await page.getByRole('button', { name: 'Feed', exact: true }).click();
  await expect(page.locator('#pet-message')).toContainText('crunch crunch');
});

for (const width of [320, 390, 768]) {
  test(`mobile studio at ${width}px keeps every part reachable and never clips a short window`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/');
    await enterHardware(page);
    await scrollHardware(page, .50);
    await expect(page.locator('#inside')).toHaveAttribute('data-phase', 'exploded');
    const layout = await page.evaluate(() => {
      const rect = (selector) => document.querySelector(selector).getBoundingClientRect().toJSON();
      return { width: document.documentElement.scrollWidth, stage: rect('.hardware-studio'), model: rect('.hardware-viewport'), inspector: rect('.hardware-inspector'), transport: rect('.hardware-transport') };
    });
    expect(layout.width).toBeLessThanOrEqual(width);
    expect(layout.stage.top).toBeGreaterThanOrEqual(-1);
    expect(layout.stage.bottom).toBeLessThanOrEqual(845);
    expect(layout.model.height).toBeGreaterThanOrEqual(215);
    expect(layout.model.bottom).toBeLessThanOrEqual(layout.inspector.top + 1);
    expect(layout.inspector.bottom).toBeLessThanOrEqual(layout.transport.top + 1);
    const parts = await page.locator('#hardware-part-select option').evaluateAll((options) => options.map((option) => option.value));
    for (const part of parts) {
      await page.getByLabel('Choose a component', { exact: true }).selectOption(part);
      await expect(page.locator('canvas')).toHaveAttribute('data-selected', part);
      await expect(page.locator('[data-part-title]')).not.toBeEmpty();
    }
    await page.getByRole('button', { name: 'Look closer' }).click();
    await expect(page.locator('canvas')).toHaveAttribute('data-isolated', 'true');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.getByRole('button', { name: 'See all parts' }).click();
    await page.getByRole('button', { name: 'Next component', exact: true }).click();
    await expect(page.locator('#hardware-part-select')).toHaveValue('enclosure');
    await page.getByRole('button', { name: 'Previous component', exact: true }).click();
    await expect(page.locator('#hardware-part-select')).toHaveValue('fasteners');
    await scrollHardware(page, .99);
    await expect(page.locator('#inside')).toHaveAttribute('data-phase', 'assembled');
    await page.setViewportSize({ width, height: 568 });
    await expect(page.locator('#inside')).toHaveAttribute('data-motion', 'compact');
    await expect(page.locator('.hardware-studio')).toHaveCSS('position', 'relative');
    await expect(page.locator('#inside')).toHaveAttribute('data-trigger-count', '0');
    await page.getByLabel('Choose a component', { exact: true }).selectOption('display');
    await page.getByRole('button', { name: 'Look closer' }).click();
    await expect(page.locator('canvas')).toHaveAttribute('data-isolated', 'true');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    const targets = await page.locator('.hardware-part-nav button, .hardware-part-nav select, .hardware-view-controls button').evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().height));
    targets.forEach((height) => expect(height).toBeGreaterThanOrEqual(44));
    await page.locator('.hardware-skip').click();
    await expect(page.locator('#habitat-title')).toBeInViewport();
  });
}

test.describe('AI console · mocked API contracts and browser speech', () => {
  test('missing keys are truthful; physical Talk/Stop/Switch do not invent a connection or touch companion state', async ({ page }) => {
    const mock = await mockAI(page, { authenticated: false, authConfigured: false, configured: [] });
    await page.goto('/');
    await expect(page.locator('#assistant-readiness')).toHaveText('Needs setup');
    await expect(page.locator('[data-screen-message]')).toHaveText('Needs setup');
    await expect(page.locator('#metric-replies')).toHaveText('0');
    await expect(page.locator('#metric-time')).toHaveText('—');
    await expect(page.locator('#metric-tokens')).toHaveText('—');
    await expect(page.locator('.chat-message')).toHaveCount(0);
    await page.getByRole('button', { name: 'Switch agent', exact: true }).click();
    await expect(page.locator('[data-screen-agent]')).toHaveText('CLAUDE');
    await expect(page.locator('[data-provider="claude"]')).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Talk to your AI', exact: true }).click();
    await expect(page.locator('#connections-dialog')).toBeVisible();
    await expect(page.locator('#connections-summary')).toHaveText('This Mori is waiting for its AI connections.');
    await expect(page.locator('#connection-list .connection-badge')).toHaveText(['Needs setup', 'Needs setup', 'Needs setup']);
    await expect(page.locator('#unlock-form')).not.toBeVisible();
    expect(await page.evaluate(() => window.__speech.starts)).toBe(0);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Talk to your AI', exact: true })).toBeFocused();
    await page.getByRole('button', { name: 'Stop or go back', exact: true }).click();
    await expect(page.locator('[data-screen-phase]')).toHaveText('STOPPED');
    await adoptCompanion(page, 'Pip', 'Cream');
    await page.getByRole('button', { name: 'Feed', exact: true }).click();
    await expect(page.locator('#bond-count')).toHaveText('1 bond point');
    await expect(page.locator('[data-screen-agent]')).toHaveText('CLAUDE');
    await expect(page.locator('[data-screen-phase]')).toHaveText('STOPPED');
    await page.locator('#chat-draft').fill('Please do not send this without setup.');
    await page.locator('#send-message').click();
    await expect(page.locator('#connections-dialog')).toBeVisible();
    expect(mock.requests).toEqual([]);
    expect(mock.sessions).toEqual([]);
    expect(await page.evaluate(() => window.__speech.starts)).toBe(0);
  });

  test('a missing or malformed configuration falls back gracefully and can be refreshed without model calls', async ({ page }) => {
    const mock = await mockAI(page);
    mock.missingConfig = true;
    expectedAPIFailures.get(page).add('/api/config');
    await page.goto('/#talk');
    await expect(page.locator('#assistant-readiness')).toHaveText('Unavailable');
    await page.locator('#voice-talk').click();
    await expect(page.locator('#connections-summary')).toContainText('couldn’t reach');
    expect(await page.evaluate(() => window.__speech.starts)).toBe(0);
    mock.missingConfig = false;
    // Invalid API-shaped data must not turn a truthy string into a connection.
    mock.config.auth.authenticated = 'yes';
    await page.locator('#refresh-connections').click();
    await expect(page.locator('#assistant-readiness')).toHaveText('Unavailable');
    mock.config.auth.authenticated = true;
    await page.locator('#refresh-connections').click();
    await expect(page.locator('#assistant-readiness')).toHaveText('Ready to try');
    await expect(page.locator('#metric-replies')).toHaveText('0');
    expect(mock.requests).toEqual([]);
    expect(await page.evaluate(() => window.__speech.starts)).toBe(0);
  });

  test('unlock failure, success, expiry, and lock use session endpoints without storing or auto-sending the code', async ({ page }) => {
    const mock = await mockAI(page, { authenticated: false });
    await page.goto('/#talk');
    await expect(page.locator('#assistant-readiness')).toHaveText('Locked');
    await page.locator('#voice-talk').click();
    await expect(page.locator('#access-code')).toBeFocused();
    await page.locator('#access-code').fill('wrong-test-code');
    await page.locator('#unlock-submit').click();
    await expect(page.locator('#unlock-status')).toContainText('didn’t unlock');
    await expect(page.locator('#access-code')).toHaveValue('');
    await page.locator('#access-code').fill('test-access-code');
    await page.locator('#unlock-submit').click();
    await expect(page.locator('#unlock-status')).toContainText('Access unlocked');
    await expect(page.locator('#assistant-readiness')).toHaveText('Ready to try');
    await expect(page.locator('#unlock-form')).not.toBeVisible();
    expect(mock.requests).toEqual([]);
    expect(await page.evaluate(() => window.__speech.starts)).toBe(0);
    expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain('test-access-code');
    await page.keyboard.press('Escape');
    await expect(page.locator('#voice-talk')).toBeFocused();
    mock.onChat = (route) => {
      mock.config.auth.authenticated = false;
      return fulfillJSON(route, { error: { code: 'AUTH_REQUIRED', message: 'Expired' } }, 401);
    };
    expectedAPIFailures.get(page).add('/api/chat');
    await page.locator('#chat-draft').fill('A draft that should survive expiry.');
    await page.locator('#send-message').click();
    await expect(page.locator('#assistant-status')).toContainText('expired or is locked');
    await expect(page.locator('#assistant-readiness')).toHaveText('Locked');
    await expect(page.locator('#chat-draft')).toHaveValue('A draft that should survive expiry.');
    await expect(page.locator('#metric-replies')).toHaveText('0');
    await page.locator('#assistant-setup').click();
    await page.locator('#access-code').fill('test-access-code');
    await page.locator('#unlock-submit').click();
    await expect(page.locator('#unlock-status')).toContainText('Access unlocked');
    await page.keyboard.press('Escape');
    expect(mock.requests).toHaveLength(1);
    mock.onChat = null;
    await page.locator('#send-message').click();
    await expect(page.locator('#metric-replies')).toHaveText('1');
    await page.locator('.assistant-toolbar [data-connections]').click();
    await page.locator('#lock-access').click();
    await expect(page.locator('#unlock-status')).toContainText('AI access is locked');
    await expect(page.locator('#assistant-readiness')).toHaveText('Locked');
    expect(mock.sessions.map(({ method }) => method)).toEqual(['POST', 'POST', 'POST', 'DELETE']);
    await expect(page.locator('#metric-replies')).toHaveText('1');
    await expect(page.locator('#access-code')).toHaveValue('');
    expect(await page.evaluate(() => document.body.textContent)).not.toContain('test-access-code');
  });

  test('all quick actions choose a real mode and editable helper without sending until asked', async ({ page }) => {
    const mock = await mockAI(page);
    await page.goto('/#talk');
    await expect(page.locator('#assistant-readiness')).toHaveText('Ready to try');
    const modes = ['write', 'summarize', 'plan', 'translate', 'explain', 'chat'];
    for (const [index, mode] of modes.entries()) {
      await page.locator(`[data-mode="${mode}"]`).click();
      await expect(page.locator(`[data-mode="${mode}"]`)).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('#mode-helper')).not.toBeEmpty();
      await page.locator('#use-example').click();
      expect((await page.locator('#chat-draft').inputValue()).length).toBeGreaterThan(20);
      expect(mock.requests).toHaveLength(index);
      await sendDraft(page, `My own ${mode} request`);
      expect(mock.requests[index].mode).toBe(mode);
      expect(mock.requests[index].provider).toBe('openai');
      expect(mock.requests[index].messages.at(-1)).toEqual({ role: 'user', content: `My own ${mode} request` });
    }
    await expect(page.locator('#metric-replies')).toHaveText('6');
    await expect(page.locator('#metric-model')).toHaveText(mockModels.openai);
  });

  test('provider histories stay separate; new conversation clears only its chat; reload forgets chats, not the local world', async ({ page }) => {
    const mock = await mockAI(page);
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    await adoptCompanion(page, 'Miso', 'Lavender');
    await page.getByRole('button', { name: 'Switch to dark mode' }).click();
    await sendDraft(page, 'OpenAI first question');
    await page.locator('[data-provider="claude"]').click();
    await expect(page.locator('.chat-message')).toHaveCount(0);
    expect(mock.requests).toHaveLength(1);
    await sendDraft(page, 'Claude first question');
    expect(mock.requests[1].messages).toEqual([{ role: 'user', content: 'Claude first question' }]);
    await page.locator('[data-provider="openai"]').click();
    await expect(page.locator('#chat-transcript')).toContainText('OpenAI first question');
    await expect(page.locator('#chat-transcript')).not.toContainText('Claude first question');
    await sendDraft(page, 'OpenAI follow-up');
    expect(mock.requests[2].messages.map(({ content }) => content)).toEqual([
      'OpenAI first question', jsonReply().reply, 'OpenAI follow-up',
    ]);
    await page.locator('[data-provider="claude"]').click();
    await page.locator('#new-conversation').click();
    await expect(page.locator('.chat-message')).toHaveCount(0);
    await expect(page.locator('#chat-draft')).toBeFocused();
    await expect(page.locator('#metric-replies')).toHaveText('3');
    await expect(page.locator('#habitat-title')).toHaveText('Miso’s little corner');
    await expect(page.locator('body')).toHaveAttribute('data-shell', 'lavender');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.locator('[data-provider="openai"]').click();
    await expect(page.locator('.chat-message')).toHaveCount(4);
    const storage = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
    expect(storage).not.toContain('OpenAI first question');
    expect(storage).not.toContain('Claude first question');
    await page.reload();
    await expect(page.locator('.chat-message')).toHaveCount(0);
    await expect(page.locator('#metric-replies')).toHaveText('0');
    await expect(page.locator('#habitat-title')).toHaveText('Miso’s little corner');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('user and provider HTML remain plain text; time and usage reflect only received replies, including missing and partial usage', async ({ page }) => {
    const mock = await mockAI(page);
    const userText = '<img src=x onerror=alert(1)>\nA second line.';
    const replyText = '<script>window.bad = true</script>\n**Still plain text.**';
    mock.onChat = async (route, payload) => {
      await new Promise((resolve) => setTimeout(resolve, 150));
      return fulfillJSON(route, jsonReply(payload.provider, {
        reply: replyText, usage: { inputTokens: 2, outputTokens: 4, totalTokens: 6 }, durationMs: 999999,
      }));
    };
    await page.goto('/#talk');
    await sendDraft(page, userText);
    await expect(page.locator('.chat-message.user p')).toHaveText(userText);
    await expect(page.locator('.chat-message.assistant p')).toHaveText(replyText);
    await expect(page.locator('.chat-message.assistant p')).toHaveCSS('white-space', 'pre-wrap');
    await expect(page.locator('#chat-transcript img, #chat-transcript script, #chat-transcript strong')).toHaveCount(0);
    expect(await page.evaluate(() => window.bad)).toBeUndefined();
    await expect(page.locator('#metric-replies')).toHaveText('1');
    await expect(page.locator('#metric-tokens')).toHaveText('6');
    const time = await page.locator('#metric-time').textContent();
    expect(time).toMatch(/^\d+(\.\d)? (ms|s)$/);
    const ms = parseFloat(time) * (time.endsWith(' ms') ? 1 : 1000);
    expect(ms).toBeGreaterThanOrEqual(140);
    expect(ms).toBeLessThan(30_000); // Real measured round trip, not fake server duration.
    await expect(page.locator('#assistant-readiness')).toHaveText('Replied this visit');
    mock.onChat = (route, payload) => fulfillJSON(route, jsonReply(payload.provider, {
      reply: 'Usage was not reported.', usage: { inputTokens: null, outputTokens: null, totalTokens: null },
    }));
    await sendDraft(page, 'A follow-up');
    await expect(page.locator('#metric-tokens')).toHaveText('6+');
    await expect(page.locator('#metric-token-note')).toContainText('Incomplete reporting');
    await expect(page.locator('#metric-replies')).toHaveText('2');
    mock.onChat = (route, payload) => fulfillJSON(route, jsonReply(payload.provider, {
      reply: 'This is only part of an answer…', usage: { inputTokens: 3, outputTokens: null, totalTokens: null }, partial: true,
    }));
    await sendDraft(page, 'One more');
    await expect(page.locator('#metric-replies')).toHaveText('2');
    await expect(page.locator('#metric-reply-note')).toHaveText('1 partial reply not counted');
    await expect(page.locator('#metric-tokens')).toHaveText('9+');
    await expect(page.locator('.chat-message.assistant').last()).toContainText('Partial reply');
    await expect(page.locator('#metric-token-note')).toHaveText('Incomplete reporting · 2 replies');
    expect(mock.requests).toHaveLength(3);
  });

  test('Stop, provider switch, and new chat abort once and reject late responses even if a transport ignores abort', async ({ page }) => {
    await mockAI(page);
    await page.addInitScript(() => {
      const original = window.fetch.bind(window);
      window.__pendingChats = [];
      window.fetch = (url, options) => {
        if (url !== '/api/chat') return original(url, options);
        return new Promise((resolve) => window.__pendingChats.push({
          resolve, signal: options.signal, payload: JSON.parse(options.body),
        }));
      };
      window.__finishChat = (index) => {
        const job = window.__pendingChats[index];
        job.resolve(new Response(JSON.stringify({
          provider: job.payload.provider, model: 'stale-model', reply: 'A stale answer must never appear.',
          usage: { totalTokens: 999 }, durationMs: 100, partial: false,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      };
    });
    await page.goto('/#talk');
    await expect(page.locator('#assistant-readiness')).toHaveText('Ready to try');
    await page.locator('#chat-draft').fill('First pending request');
    await page.locator('#send-message').click();
    await expect(page.locator('#assistant-console')).toHaveAttribute('data-phase', 'thinking');
    await expect(page.locator('#send-message')).toBeDisabled();
    await page.locator('#chat-form').evaluate((form) => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(await page.evaluate(() => window.__pendingChats.length)).toBe(1);
    await page.locator('#assistant-stop').click();
    expect(await page.evaluate(() => window.__pendingChats[0].signal.aborted)).toBe(true);
    await expect(page.locator('#chat-draft')).toHaveValue('First pending request');
    await page.evaluate(() => window.__finishChat(0));
    await expect(page.locator('#assistant-console')).toHaveAttribute('data-phase', 'stopped');
    await expect(page.locator('.chat-message.assistant')).toHaveCount(0);
    await page.locator('#send-message').click();
    await expect(page.locator('#assistant-console')).toHaveAttribute('data-phase', 'thinking');
    await page.locator('[data-provider="claude"]').click();
    expect(await page.evaluate(() => window.__pendingChats[1].signal.aborted)).toBe(true);
    await page.evaluate(() => window.__finishChat(1));
    await expect(page.locator('#chat-draft')).toHaveValue('');
    await expect(page.locator('.chat-message')).toHaveCount(0);
    await page.locator('[data-provider="openai"]').click();
    await expect(page.locator('#chat-draft')).toHaveValue('First pending request');
    await page.locator('#send-message').click();
    await page.locator('#new-conversation').click();
    expect(await page.evaluate(() => window.__pendingChats[2].signal.aborted)).toBe(true);
    await page.evaluate(() => window.__finishChat(2));
    await expect(page.locator('#chat-draft')).toHaveValue('');
    await expect(page.locator('.chat-message')).toHaveCount(0);
    await expect(page.locator('#metric-replies')).toHaveText('0');
    await expect(page.locator('#metric-time')).toHaveText('—');
    await expect(page.locator('#metric-tokens')).toHaveText('—');
    await expect(page.locator('#metric-model')).toHaveText(mockModels.openai);
  });

  test('API and network errors keep the draft and metrics honest; retries never choose another provider', async ({ page, context }) => {
    const mock = await mockAI(page);
    expectedAPIFailures.get(page).add('/api/chat');
    mock.onChat = (route) => fulfillJSON(route, { error: { code: 'UPSTREAM_ERROR', message: 'Fixture failure' } }, 502);
    await page.goto('/#talk');
    await page.locator('[data-provider="gemini"]').click();
    await page.locator('#chat-draft').fill('Please explain this.');
    await page.locator('#send-message').click();
    await expect(page.locator('#assistant-console')).toHaveAttribute('data-phase', 'error');
    await expect(page.locator('#assistant-status')).toContainText('couldn’t complete a reply');
    await expect(page.locator('#chat-draft')).toHaveValue('Please explain this.');
    await expect(page.locator('#metric-replies')).toHaveText('0');
    await expect(page.locator('#metric-tokens')).toHaveText('—');
    mock.onChat = (route, payload) => fulfillJSON(route, jsonReply(payload.provider, { usage: null }));
    await page.locator('#assistant-retry').click();
    await expect(page.locator('#metric-replies')).toHaveText('1');
    await expect(page.locator('#metric-tokens')).toHaveText('Unknown');
    await expect(page.locator('#metric-token-note')).toContainText('Incomplete reporting');
    expect(mock.requests.map(({ provider }) => provider)).toEqual(['gemini', 'gemini']);
    expect(mock.requests[0]).toEqual(mock.requests[1]);
    mock.onChat = (route) => route.abort('internetdisconnected');
    await page.locator('#chat-draft').fill('Keep this if the connection drops.');
    await page.locator('#send-message').click();
    await expect(page.locator('#assistant-status')).toContainText('connection dropped');
    await context.setOffline(true);
    await expect(page.locator('#assistant-readiness')).toHaveText('Offline');
    await page.locator('#voice-talk').click();
    expect(await page.evaluate(() => window.__speech.starts)).toBe(0);
    expect(mock.requests).toHaveLength(3);
    await page.keyboard.press('Escape');
    mock.onChat = null;
    await context.setOffline(false);
    await expect(page.locator('#assistant-status')).toContainText('online again');
    expect(mock.requests).toHaveLength(3);
    await page.locator('#send-message').click();
    await expect(page.locator('#metric-replies')).toHaveText('2');
    expect(mock.requests.at(-1).provider).toBe('gemini');
  });

  test('config limits are enforced before sending, without truncating or sharing conversation history', async ({ page }) => {
    const mock = await mockAI(page, { limits: { maxMessageChars: 80, maxMessages: 3, maxTotalChars: 500 } });
    mock.onChat = (route, payload) => fulfillJSON(route, jsonReply(payload.provider, { reply: 'A short answer.' }));
    await page.goto('/#talk');
    await expect(page.locator('#chat-draft')).toHaveAttribute('maxlength', '80');
    await page.locator('#chat-draft').evaluate((element) => {
      element.value = 'x'.repeat(81);
      element.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.locator('#send-message').click();
    await expect(page.locator('#assistant-status')).toContainText('within 80 characters');
    expect(mock.requests).toHaveLength(0);
    await sendDraft(page, 'First question');
    await sendDraft(page, 'Second question');
    await page.locator('#chat-draft').fill('Third question');
    await page.locator('#send-message').click();
    await expect(page.locator('#assistant-status')).toContainText('message limit');
    expect(mock.requests).toHaveLength(2);
    await page.locator('#new-conversation').click();
    await sendDraft(page, 'A fresh question');
    expect(mock.requests[2].messages).toEqual([{ role: 'user', content: 'A fresh question' }]);
    mock.config.limits.maxMessages = 20;
    mock.config.limits.maxTotalChars = 25;
    await page.reload();
    await sendDraft(page, 'Hello');
    await page.locator('#chat-draft').fill('Another question');
    await page.locator('#send-message').click();
    await expect(page.locator('#assistant-status')).toContainText('too long');
    expect(mock.requests).toHaveLength(4);
  });

  test('voice starts only by gesture, sends one final turn to the chosen AI/mode, speaks with mic off, and stops cleanly', async ({ page }) => {
    const mock = await mockAI(page, { speech: { autoEnd: false } });
    await page.goto('/#talk');
    await expect(page.locator('#assistant-readiness')).toHaveText('Ready to try');
    expect(await page.evaluate(() => window.__speech.starts)).toBe(0);
    await page.locator('[data-provider="claude"]').click();
    await page.locator('[data-mode="translate"]').click();
    await page.locator('#voice-talk').click();
    await expect(page.locator('#assistant-console')).toHaveAttribute('data-phase', 'listening');
    await expect(page.locator('[data-screen-agent]')).toHaveText('CLAUDE');
    await expect(page.locator('[data-screen-phase]')).toHaveText('LISTENING');
    await page.evaluate(() => window.__speech.emit('Translate hello', false));
    await expect(page.locator('#chat-draft')).toHaveValue('Translate hello');
    expect(mock.requests).toHaveLength(0);
    await page.evaluate(() => window.__speech.emit('Translate hello into French.', true));
    await expect(page.locator('#assistant-console')).toHaveAttribute('data-phase', 'speaking');
    expect(mock.requests).toEqual([{
      provider: 'claude', mode: 'translate', messages: [{ role: 'user', content: 'Translate hello into French.' }],
    }]);
    const speech = await page.evaluate(() => ({
      starts: window.__speech.starts, spoken: window.__speech.spoken, order: window.__speech.order, active: !!window.__speech.current,
    }));
    expect(speech.starts).toBe(1);
    expect(speech.spoken).toEqual([jsonReply().reply]);
    expect(speech.active).toBe(false);
    expect(speech.order.indexOf('abort-listening')).toBeLessThan(speech.order.indexOf('speak'));
    await page.evaluate(() => window.__speech.finishSpeaking());
    await expect(page.locator('#assistant-console')).toHaveAttribute('data-phase', 'idle');
    expect(await page.evaluate(() => window.__speech.starts)).toBe(1);
    // Another explicit turn, followed by Stop during playback.
    await page.locator('#voice-talk').click();
    await page.evaluate(() => window.__speech.emit('And thank you?', true));
    await expect(page.locator('#assistant-console')).toHaveAttribute('data-phase', 'speaking');
    await page.locator('#assistant-stop').click();
    await expect(page.locator('#assistant-console')).toHaveAttribute('data-phase', 'stopped');
    await page.evaluate(() => window.__speech.lateSpeechEnd?.());
    await expect(page.locator('#assistant-console')).toHaveAttribute('data-phase', 'stopped');
    expect(await page.evaluate(() => window.__speech.utterance)).toBeNull();
    await page.locator('#voice-talk').click();
    await page.evaluate(() => window.__speech.emit('An unfinished draft', false));
    await page.locator('[data-provider="gemini"]').click();
    await page.evaluate(() => {
      const result = [{ transcript: 'A stale final transcript' }]; result.isFinal = true;
      window.__speech.lateResult?.({ results: [result] });
    });
    await expect(page.locator('#chat-draft')).toHaveValue('');
    expect(mock.requests).toHaveLength(2);
    await page.locator('#speak-replies').uncheck();
    await page.locator('#voice-talk').click();
    await page.evaluate(() => window.__speech.emit('A quiet question', true));
    await expect(page.locator('#assistant-console')).toHaveAttribute('data-phase', 'idle');
    expect(mock.requests.at(-1).provider).toBe('gemini');
    expect(await page.evaluate(() => window.__speech.spoken.length)).toBe(2);
  });

  test('unsupported speech falls back to typing without touching native microphone or speech services', async ({ page }) => {
    const mock = await mockAI(page, { speech: { listen: false, speak: false } });
    await page.goto('/#talk');
    await expect(page.locator('#voice-talk')).toBeDisabled();
    await expect(page.locator('#voice-help')).toContainText('isn’t supported');
    await expect(page.locator('#speak-replies')).toBeDisabled();
    await expect(page.locator('#speak-replies')).not.toBeChecked();
    await sendDraft(page, 'Typing still works.');
    expect(mock.requests).toHaveLength(1);
    expect(await page.evaluate(() => window.__speech.starts)).toBe(0);
    await page.getByRole('button', { name: 'Talk to your AI', exact: true }).click();
    await expect(page.locator('#chat-draft')).toBeFocused();
  });

  test('permission, no-speech and speech-network errors are recoverable; pagehide cancels listening', async ({ page }) => {
    const mock = await mockAI(page);
    await page.goto('/#talk');
    await expect(page.locator('#assistant-readiness')).toHaveText('Ready to try');
    for (const [code, text] of [['not-allowed', 'permission was denied'], ['no-speech', 'No words were heard'], ['network', 'speech service could not connect']]) {
      await page.locator('#voice-talk').click();
      await page.evaluate((error) => window.__speech.fail(error), code);
      await expect(page.locator('#assistant-console')).toHaveAttribute('data-phase', 'error');
      await expect(page.locator('#assistant-status')).toContainText(text);
    }
    expect(mock.requests).toHaveLength(0);
    await sendDraft(page, 'A typed fallback after permission was denied.');
    await page.locator('#voice-talk').click();
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
    expect(await page.evaluate(() => window.__speech.current)).toBeNull();
    await page.evaluate(() => {
      const result = [{ transcript: 'Do not send on a hidden page' }]; result.isFinal = true;
      window.__speech.lateResult?.({ results: [result] });
    });
    expect(mock.requests).toHaveLength(1);
  });

  test('a 30-second client timeout keeps the draft and no metrics; keyboard retry sends one multiline message', async ({ page }) => {
    const mock = await mockAI(page);
    await freezeClock(page);
    await page.addInitScript(() => {
      const original = window.fetch.bind(window);
      window.__hangChat = true;
      window.fetch = (url, options) => {
        if (url !== '/api/chat' || !window.__hangChat) return original(url, options);
        window.__timeoutSignal = options.signal;
        return new Promise((resolve, reject) => {
          options.signal.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')));
        });
      };
    });
    await page.goto('/#talk');
    await expect(page.locator('#assistant-readiness')).toHaveText('Ready to try');
    await page.locator('#speak-replies').uncheck();
    await page.locator('#chat-draft').fill('First line');
    await page.locator('#chat-draft').press('Shift+Enter');
    await page.locator('#chat-draft').pressSequentially('Second line');
    await expect(page.locator('#chat-draft')).toHaveValue('First line\nSecond line');
    expect(mock.requests).toHaveLength(0);
    await page.locator('#chat-draft').press('Enter');
    await expect(page.locator('#assistant-console')).toHaveAttribute('data-phase', 'thinking');
    await page.clock.fastForward(30_001);
    await expect(page.locator('#assistant-status')).toContainText('too long');
    expect(await page.evaluate(() => window.__timeoutSignal.aborted)).toBe(true);
    await expect(page.locator('#chat-draft')).toHaveValue('First line\nSecond line');
    await expect(page.locator('#metric-replies')).toHaveText('0');
    await expect(page.locator('#metric-time')).toHaveText('—');
    await expect(page.locator('#metric-tokens')).toHaveText('—');
    await page.evaluate(() => { window.__hangChat = false; });
    await page.locator('#assistant-retry').click();
    await expect(page.locator('#metric-replies')).toHaveText('1');
    expect(mock.requests).toHaveLength(1);
    expect(mock.requests[0].messages).toEqual([{ role: 'user', content: 'First line\nSecond line' }]);
  });

  test('console and connection controls retain readable theme contrast and fit small screens', async ({ page }) => {
    await mockAI(page, { authenticated: false });
    await page.goto('/#talk');
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const theme of ['light', 'dark']) {
        await page.emulateMedia({ colorScheme: theme });
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await page.locator('.assistant-toolbar [data-connections]').click();
        await expect(page.locator('#unlock-form')).toBeVisible();
        expect(await page.locator('#connections-dialog').evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
        await page.keyboard.press('Escape');
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
        const contrasts = await page.evaluate(() => {
          const luminance = (color) => {
            const rgb = color.match(/[\d.]+/g).slice(0, 3).map(Number).map((v) => {
              const s = v / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4;
            });
            return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
          };
          return ['#assistant-status', '#voice-help', '#draft-count', '#mode-helper', '#chat-draft', '.quick-actions button[aria-pressed="true"]'].map((selector) => {
            const element = document.querySelector(selector), style = getComputedStyle(element);
            let background = style.backgroundColor, ancestor = element;
            while (background === 'rgba(0, 0, 0, 0)' && ancestor.parentElement) {
              ancestor = ancestor.parentElement; background = getComputedStyle(ancestor).backgroundColor;
            }
            const foreground = luminance(style.color), surface = luminance(background);
            return { selector, ratio: (Math.max(foreground, surface) + .05) / (Math.min(foreground, surface) + .05) };
          });
        });
        contrasts.forEach(({ selector, ratio }) => expect(ratio, `${theme} at ${width}px: ${selector}`).toBeGreaterThanOrEqual(4.5));
      }
    }
  });
});
