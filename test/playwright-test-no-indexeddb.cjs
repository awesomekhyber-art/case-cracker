// TEST-ONLY — verifies the app doesn't crash when IndexedDB is unavailable,
// falling back to in-memory storage instead.
const { chromium } = require('playwright');

(async () => {
  const results = [];
  function check(name, cond){ results.push({name, pass: !!cond}); console.log((cond?'✅ PASS':'❌ FAIL')+' — '+name); }

  const browser = await chromium.launch();
  const page = await browser.newPage();
  let uncaughtError = null;
  page.on('pageerror', err => { uncaughtError = err.message; });

  // Remove indexedDB entirely before any app script runs, simulating a
  // browser/environment where it's unavailable (e.g. some locked-down
  // embedded webviews, or disabled via browser settings).
  await page.addInitScript(() => {
    delete window.indexedDB;
  });

  let authed = false;
  await page.route('**/api/auth', async (route) => {
    const req = route.request();
    if(req.method() === 'GET'){ await route.fulfill({status: authed?200:401, contentType:'application/json', body: JSON.stringify({ok:authed})}); }
    else { authed = true; await route.fulfill({status:200, contentType:'application/json', body: JSON.stringify({ok:true})}); }
  });

  await page.goto('http://127.0.0.1:8792/index.html');
  await page.waitForTimeout(500);

  check('No uncaught error on load with IndexedDB unavailable', uncaughtError === null);
  check('PIN gate still renders normally', await page.isVisible('#pin-gate:not(.hidden)'));

  await page.fill('#pin-input', 'any-pin');
  await page.click('#pin-submit-btn');
  await page.waitForTimeout(500);

  check('Still no uncaught error after unlocking (stats/deck load attempted)', uncaughtError === null);
  const xpText = await page.textContent('#xp-val').catch(()=>null);
  check('Scoreboard still renders via in-memory fallback', xpText !== null && /^\d+$/.test((xpText||'').trim()));

  await browser.close();
  const failed = results.filter(r=>!r.pass);
  console.log('\n' + '='.repeat(50));
  console.log(`TOTAL: ${results.length} checks, ${results.length-failed.length} passed, ${failed.length} failed`);
  if(uncaughtError) console.log('Uncaught error was:', uncaughtError);
  if(failed.length){ console.log('FAILED:', failed.map(f=>f.name).join('; ')); process.exit(1); }
})();
