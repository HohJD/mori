import { chromium } from 'playwright';
const [,, tag='after', theme='light'] = process.argv;
const b = await chromium.launch({ channel: 'chrome' });
for (const [name, vp] of [['d', { width: 1440, height: 900 }], ['m', { width: 390, height: 844 }], ['s', { width: 320, height: 568 }]]) {
  const p = await b.newPage({ viewport: vp, reducedMotion: 'reduce' });
  const errs=[]; p.on('pageerror', e=>errs.push(e.message));
  await p.addInitScript(t => localStorage.setItem('mori-theme', t), theme);
  await p.goto('http://127.0.0.1:4175/');
  await p.screenshot({ path: `../${tag}-${theme}-${name}-home.png` });
  if (name === 's') { console.log('320 scrollW', await p.evaluate(() => document.documentElement.scrollWidth)); continue; }
  for (const view of ['talk', 'play', 'inside']) {
    await p.evaluate((h) => { location.hash = h; }, '#' + view);
    await p.waitForTimeout(view === 'inside' ? 2500 : 400);
    await p.evaluate(() => window.scrollTo(0, 0));
    await p.waitForTimeout(200);
    await p.screenshot({ path: `../${tag}-${theme}-${name}-${view}.png`, fullPage: view === 'play' });
  }
  if (name === 'd') {
    await p.evaluate(() => { location.hash = '#talk'; });
    await p.waitForTimeout(300);
    await p.locator('.settings-button').click(); await p.waitForTimeout(300);
    await p.screenshot({ path: `../${tag}-${theme}-d-settings.png` });
  }
  console.log(name, errs);
}
await b.close();
