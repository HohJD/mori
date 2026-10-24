import { test, expect } from '@playwright/test';

const STORAGE_KEY = 'mori-world-v1';
const consoleErrors = new WeakMap();
test.use({ reducedMotion: 'reduce' });

test.beforeEach(async ({ page }) => {
  const errors = [];
  consoleErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
});

test.afterEach(async ({ page }) => {
  expect(consoleErrors.get(page), 'No browser or console errors').toEqual([]);
});

async function adoptCompanion(page, name = 'Miso', shell = 'Sage') {
  await page.getByRole('button', { name: 'Adopt your Mori', exact: true }).first().click();
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

test('adopt, use physical and playground buttons, then preview across reload without a fake win', async ({ page }) => {
  await freezeClock(page);
  await page.goto('/');
  await adoptCompanion(page, '  Miso  ', 'Lavender');
  await expect(page.locator('#habitat-title')).toHaveText('Miso’s little corner');
  await expect(page.locator('#focus-title')).toContainText('Miso');
  await expect(page.locator('body')).toHaveAttribute('data-shell', 'lavender');

  await page.getByRole('button', { name: 'Feed Miso', exact: true }).click();
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
  const trigger = page.getByRole('button', { name: 'Adopt your Mori', exact: true }).first();
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
  test(`layout, local assets, and reduced motion at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width > 1000 ? 1000 : 844 });
    const externalRequests = [];
    page.on('request', (request) => {
      if (!request.url().startsWith('http://127.0.0.1:4173') && !request.url().startsWith('data:')) externalRequests.push(request.url());
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
        path: `/tmp/mori-review/mori-${width === 1440 ? 'desktop' : 'mobile'}.png`,
        fullPage: true,
        animations: 'disabled',
      });
    }
    expect(externalRequests, 'All fonts and assets are self-hosted').toEqual([]);
  });
}

test('normal-motion reactions clear; real 3D opens, rests, closes down-scroll, and reverses without changing the hero', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const heavyRequests = [];
  page.on('request', (request) => {
    if (/hardware-model|ScrollTrigger|gsap/.test(request.url())) heavyRequests.push(request.url());
  });
  await page.goto('/');
  expect(heavyRequests, 'The initial hero does not import the 3D/scroll engine').toEqual([]);
  await page.getByRole('button', { name: 'Feed Mori', exact: true }).click();
  await page.getByRole('button', { name: 'Pet Mori', exact: true }).click();
  await page.getByRole('button', { name: 'Play with Mori', exact: true }).click();
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
  await expect(page.locator('[data-part-description]')).toContainText('never accesses a microphone');
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
  await page.getByRole('button', { name: 'Feed Mori', exact: true }).click();
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
