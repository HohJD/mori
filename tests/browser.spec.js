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

test('adopt, use physical and playground buttons, then preview across reload without a fake win', async ({ page }) => {
  await page.clock.install();
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
  await page.clock.install();
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
  await page.clock.install();
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
  await page.clock.install();
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

test('normal-motion reactions clear and scrolling changes only the device study', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Feed Mori', exact: true }).click();
  await page.getByRole('button', { name: 'Pet Mori', exact: true }).click();
  await page.getByRole('button', { name: 'Play with Mori', exact: true }).click();
  await expect(page.locator('body')).toHaveAttribute('data-reaction', 'play');
  await expect(page.locator('body')).not.toHaveAttribute('data-reaction', { timeout: 4000 });
  const before = await page.locator('.inside-device').evaluate((element) => element.style.getPropertyValue('--explode'));
  await page.locator('#inside').scrollIntoViewIfNeeded();
  await expect.poll(() => page.locator('.inside-device').evaluate((element) => element.style.getPropertyValue('--explode'))).not.toBe(before);
  await expect(page.locator('.hero-copy')).toHaveCSS('opacity', '1');
});
