const { chromium } = require('./node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('console', msg => console.log('console:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('pageerror:', err.message));
  page.on('requestfailed', req => console.log('requestfailed:', req.url(), req.failure()?.errorText));
  await page.goto('http://127.0.0.1:8000/docs/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  console.log('title=', await page.title());
  console.log('button-visible=', await page.locator('#lean-btn').isVisible());
  await page.click('#lean-btn');
  await page.waitForTimeout(2000);
  console.log('intro-hidden=', await page.locator('#intro-screen').evaluate(el => el.classList.contains('hidden')));
  console.log('cutscene-hidden=', await page.locator('#cutscene-screen').evaluate(el => el.classList.contains('hidden')));
  console.log('menu-hidden=', await page.locator('#menu-screen').evaluate(el => el.classList.contains('hidden')));
  await browser.close();
})();
